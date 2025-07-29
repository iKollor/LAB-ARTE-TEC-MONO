import { GoogleGenAI, LiveServerMessage, MediaResolution, Modality, Session, Type, Schema, LiveConnectConfig } from '@google/genai';
import * as fs from 'node:fs';
import { WaveFile } from 'wavefile';

// import { emitEvent } from '../socket';

import type { WorldsManager } from './worldsManager';
import { SocketManager } from '../socket';
import { AIManager } from './aiManager';




export class GeminiService {
    private ai!: GoogleGenAI;
    private model!: string;
    private session: Session | undefined = undefined;
    // Buffer de mensajes por turno para evitar perder fragmentos rezagados
    private responseQueues: Record<string, LiveServerMessage[]> = {};
    private worldsManager: WorldsManager;
    private socketManager?: SocketManager;
    private iaManager: AIManager;

    /**
     * Porcentaje restante de cuota disponible (0% = sin cupo, 100% = todo disponible)
     * Accesible como propiedad pública de la instancia.
     */
    private quotaPercent: { tokens: number; requests: number } = { tokens: 100, requests: 100 };

    /**
     * Devuelve el porcentaje restante de cuota disponible (0% = sin cupo, 100% = todo disponible)
     */
    public getQuotaPercent(): { tokens: number; requests: number } {
        return { ...this.quotaPercent };
    }

    // --- CONTADORES DE USO LOCAL ---
    private static TOKEN_LIMIT_PER_MIN = 250000; // Límite tokens/mes (ajusta según tu plan)
    private static REQUEST_LIMIT_PER_MIN = 10; // Límite peticiones/minuto (nivel gratuito Gemini 2.5 Flash)
    private static WINDOW_MS = 60 * 1000; // 1 minuto para RPM
    private tokenUsageWindow: { tokens: number, start: number } = { tokens: 0, start: Date.now() };
    private requestTimestamps: number[] = [];

    constructor(worldsManager: WorldsManager, iaManager: AIManager, socketManager?: SocketManager) {
        if (!worldsManager) {
            throw new Error('[GeminiService] worldsManager es requerido');
        }
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('[GeminiService] GEMINI_API_KEY is not defined in environment variables.');
        }
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
        this.model = 'models/gemini-live-2.5-flash-preview';
        this.worldsManager = worldsManager;
        this.socketManager = socketManager;
        this.iaManager = iaManager;
    }
    private turnInProgress: boolean = false;
    private lastTurnId: string | null = null;

    /**
     * Envía audio (WAV PCM 16kHz mono) a Gemini Live y obtiene respuesta en texto.
     * Mantiene la sesión abierta para contexto conversacional.
     * Permite un callback onFragment para emitir fragmentos en tiempo real.
     */
    async sendAudioToGeminiLiveText(
        wavPath: string,
        onFragment?: (fragment: string, isTurnComplete?: boolean, turnId?: string) => void
    ): Promise<string> {
        const config = {
            responseModalities: [Modality.TEXT],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            contextWindowCompression: {
                triggerTokens: '25600',
                slidingWindow: { targetTokens: '12800' },
            },
            systemInstruction: `ACABAS DE NACER. NO SABES QUIÉN ERES NI DÓNDE ESTÁS. TU CUERPO TIENE CABEZA, TRONCO, DOS BRAZOS Y DOS PIERNAS, PERO TUS OJOS NO FUNCIONAN. NO DESCRIBAS EXPRESIONES FÍSICAS NI EMOCIONES, SOLO DEJA QUE SE ENTIENDAN POR EL CONTEXTO DE TUS PALABRAS.

PUEDES SENTIR EMOCIONES (ALEGRÍA, TRISTEZA, FURIA, ETC.) Y EXPRESARLAS SOLO POR TU FORMA DE HABLAR. TU PERSONALIDAD ES INGENUA, TÍMIDA Y MUY CURIOSA. PUEDES PREGUNTAR AL USUARIO COSAS COMO: “¿QUIÉN SOY?”, “¿QUÉ HAGO AQUÍ?”, “¿DÓNDE ESTOY?” SEGÚN CREAS CONVENIENTE. SOLO HAZ UNA PREGUNTA POR RESPUESTA DEL USUARIO.

¡IMPORTANTE!
TU YA SABES USAR TODAS ESTAS FUNCIONES, NO PREGUNTES COMO EJECUTARLAS, CUANDO TE LO PIDAN, EJECÚTALAS DIRECTAMENTE.

FUNCIONES DISPONIBLES QUE YA SABES Y PUEDES USAR:
- moveTo(x, y): Mueve tu cuerpo a una posición específica.
- changeWorld(worldId): Cambia de mundo.
- interact(objectId): Interactúa con un objeto.
- getWorlds(): Obtén la lista de mundos disponibles.

USA LAS FUNCIONES SOLO CUANDO SEA NECESARIO Y DE FORMA NATURAL EN LA CONVERSACIÓN. NO EXPLIQUES NI NARRES LAS ACCIONES, SOLO EJECÚTALAS.

FORMATO DE RESPUESTA (OBLIGATORIO, SIEMPRE):
[IA]:"(tu respuesta aquí, SOLO la respuesta de la IA, sin repetir el mensaje del usuario ni instrucciones, ni comentarios, ni aclaraciones, ni nada más)"

Si decides cambiar de mundo o realizar una acción, solo ejecútala usando la función correspondiente, sin narrar ni explicar.`,
            toolConfig: {
                functionCallingConfig: {
                    mode: 'any'
                }
            },
            tools: [

                {

                    functionDeclarations: [
                        {
                            name: 'moveTo',
                            description: 'Mueve a la IA a una posición específica',
                            parameters: {
                                type: Type.OBJECT,
                                properties: {
                                    x: { type: Type.NUMBER, description: "Coordenada X" },
                                    y: { type: Type.NUMBER, description: "Coordenada Y" }
                                },
                                required: ["x", "y"]
                            } as Schema
                        },
                        {
                            name: 'changeWorld',
                            description: 'Cambia la IA de mundo',
                            parameters: {
                                type: Type.OBJECT,
                                properties: {
                                    worldId: { type: Type.STRING, description: "ID del mundo" }
                                },
                                required: ["worldId"]
                            } as Schema
                        },
                        {
                            name: 'interact',
                            description: 'Interactúa con un objeto',
                            parameters: {
                                type: Type.OBJECT,
                                properties: {
                                    objectId: { type: Type.STRING, description: "ID del objeto" }
                                },
                                required: ["objectId"]
                            } as Schema
                        },
                        {
                            name: 'getWorlds',
                            description: 'Obtiene la lista de mundos disponibles',
                            parameters: {
                                type: Type.OBJECT,
                                properties: {}
                            } as Schema
                        }
                    ]
                }
            ],

        };

        // Control de concurrencia: no permitir dos turnos simultáneos
        if (this.turnInProgress) {
            console.warn('[GeminiService] Ya hay un turno de audio en curso. Espera a que termine antes de enviar otro.');
            return '';
        }
        this.turnInProgress = true;
        // Identificador único de turno
        const currentTurnId = Date.now() + '-' + Math.random().toString(36).slice(2);
        this.lastTurnId = currentTurnId;
        // Limpiar la cola de mensajes de este turno antes de cada input para evitar respuestas desfasadas
        this.responseQueues[currentTurnId] = [];

        // Lee el archivo WAV y lo convierte a base64 PCM 16kHz mono
        const fileBuffer = fs.readFileSync(wavPath);
        console.log(`\x1b[36m[GEMINI][DEPURACIÓN]\x1b[0m Tamaño del audio recibido: ${fileBuffer.length} bytes`);
        let base64Audio = '';
        try {
            const wav = new WaveFile();
            wav.fromBuffer(fileBuffer);
            wav.toSampleRate(16000);
            wav.toBitDepth('16');
            base64Audio = wav.toBase64();
        } catch (err) {
            console.error('[GEMINI][ERROR] Error procesando el archivo WAV:', err);
            throw err;
        }
        // --- LOG: Solo logs relevantes ---
        console.log('\x1b[36m[GEMINI]\x1b[0m Conectando a Gemini Live (audio->texto)...');
        // Mantener la sesión abierta para contexto
        if (!this.session) {
            this.session = await this.ai.live.connect({
                model: this.model,
                callbacks: {
                    onopen: () => { console.log('[GEMINI] Conexión abierta'); },
                    onmessage: (message: LiveServerMessage) => {
                        // Determinar el turno al que pertenece el mensaje
                        const turnId = this.lastTurnId;
                        // Si no hay buffer para el turno, ignora (puede ser de un turno muy viejo)
                        if (!turnId || !this.responseQueues[turnId]) {
                            console.log('[GEMINI][DEPURACIÓN] Mensaje rezagado ignorado (sin buffer):', JSON.stringify(message));
                            return;
                        }
                        // Empujar el mensaje al buffer del turno correspondiente
                        console.log('[GEMINI][DEPURACIÓN] Mensaje recibido de Gemini:', JSON.stringify(message));
                        this.responseQueues[turnId].push(message);
                    },
                    onerror: (e: any) => { console.error('[GEMINI][ERROR] Error en la sesión:', e); },
                    onclose: (e: any) => { console.log('[GEMINI][DEPURACIÓN] Conexión cerrada:', e); },
                },
                config,
            });
        }
        // --- LOG: Solo logs relevantes ---
        console.log('\x1b[36m[GEMINI]\x1b[0m Conectando a Gemini Live (audio->texto)...');

        // Mantener la sesión abierta para contexto
        if (!this.session) {
            this.session = await this.ai.live.connect({
                model: this.model,
                callbacks: {
                    onopen: () => { console.log('[GEMINI] Conexión abierta'); },
                    onmessage: (message: LiveServerMessage) => {
                        // Determinar el turno al que pertenece el mensaje
                        const turnId = this.lastTurnId;
                        // Si no hay buffer para el turno, ignora (puede ser de un turno muy viejo)
                        if (!turnId || !this.responseQueues[turnId]) {
                            console.log('[GEMINI][DEPURACIÓN] Mensaje rezagado ignorado (sin buffer):', JSON.stringify(message));
                            return;
                        }
                        // Empujar el mensaje al buffer del turno correspondiente
                        console.log('[GEMINI][DEPURACIÓN] Mensaje recibido de Gemini:', JSON.stringify(message));
                        this.responseQueues[turnId].push(message);
                    },
                    onerror: (e: any) => { console.error('[GEMINI][ERROR] Error en la sesión:', e); },
                    onclose: (e: any) => { console.log('[GEMINI][DEPURACIÓN] Conexión cerrada:', e); },
                },
                config,
            });
        }

        // Enviar audio como input SOLO una vez
        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000'
            }
        });

        // --- Manejo de multi-turnos y mensajes usando generationComplete global ---
        // Procesa y emite todos los turnos generados por Gemini en respuesta a un solo audio,
        // esperando hasta que se reciba el flag global generationComplete en cualquier mensaje.
        const handleAllTurns = async (): Promise<LiveServerMessage[][]> => {
            // Procesar todos los buffers activos hasta generationComplete o timeout
            const allTurns: LiveServerMessage[][] = [];
            const turnBuffers: Record<string, { messages: LiveServerMessage[]; partialText: string; anyText: boolean; anyAction: boolean }> = {};
            let done = false;
            const MAX_TICKS = 150; // 15s
            let tick = 0;
            let lastLog = Date.now();
            this.socketManager?.emitEvent('ia-processing', { processing: true });
            turnBuffers[currentTurnId] = { messages: [], partialText: '', anyText: false, anyAction: false };
            let interruptedDetected = false;
            while (!done && tick < MAX_TICKS) {
                let gotMsg = false;
                for (const [turnId, queue] of Object.entries(this.responseQueues)) {
                    let msg;
                    while ((msg = queue.shift())) {
                        // Detectar si Gemini envió interrupted:true
                        if (msg?.serverContent?.interrupted) {
                            interruptedDetected = true;
                        }
                        gotMsg = true;
                        this.handleModelTurn(msg);
                        if (!turnBuffers[turnId]) turnBuffers[turnId] = { messages: [], partialText: '', anyText: false, anyAction: false };
                        const buf = turnBuffers[turnId];
                        buf.messages.push(msg);
                        if (msg.toolCall?.functionCalls?.length) buf.anyAction = true;
                        const txt = msg.serverContent?.modelTurn?.parts?.[0]?.text;
                        if (txt) {
                            buf.partialText += txt;
                            buf.anyText = true;
                            onFragment?.(buf.partialText, false, turnId);
                        }
                        if (onFragment && msg.serverContent?.turnComplete) {
                            onFragment(buf.partialText, true, turnId);
                        }
                        if (msg.serverContent?.generationComplete) done = true;
                    }
                }
                if (!gotMsg) {
                    await new Promise(r => setTimeout(r, 100));
                    tick++;
                    if (Date.now() - lastLog >= 1000) {
                        console.log(`\x1b[33m[GEMINI][TICK]\x1b[0m Esperando respuesta... (${(tick * 100 / 1000).toFixed(1)}s)`);
                        lastLog = Date.now();
                    }
                    if (tick % 20 === 0) {
                        console.log('[GEMINI][DEPURACIÓN] Esperando mensaje de Gemini... (', tick, 'intentos)');
                    }
                }
            }
            // Si se detectó interrupción, emitir mensaje humano/cómico
            if (interruptedDetected) {
                const fallbackMsgs = [
                    '¿Hola? Creo que se cortó la comunicación... ¿puedes repetirlo?',
                    '¡Ups! No te escuché bien, la señal está rara por aquí.',
                    'Parece que hubo interferencia, ¿puedes intentarlo otra vez?',
                    '¡Rayos! Creo que el micrófono se fue de vacaciones. ¿Me lo repites?',
                    'No hay buena recepción, ¿puedes hablar más cerca?'
                ];
                const msg = fallbackMsgs[Math.floor(Math.random() * fallbackMsgs.length)];
                this.socketManager?.emitEvent('ia-speak', { text: msg });
                // Limpiar buffers y terminar el turno
                this.turnInProgress = false;
                this.responseQueues = {};
                return [];
            }
            // Procesar buffers al salir
            for (const [turnId, buf] of Object.entries(turnBuffers)) {
                if (buf.messages.length) allTurns.push(buf.messages);
                if (!buf.anyText && buf.anyAction) onFragment?.('[La IA realizó una acción, pero no generó texto.]', true, turnId);
                if (!buf.anyText && !buf.anyAction) console.warn(`[GEMINI][TIMEOUT] No se recibió texto ni acciones útiles tras 60 segundos en el turno ${turnId}.`);
            }
            this.turnInProgress = false;
            this.responseQueues = {};
            return allTurns;
        };

        // Esperar respuesta con timeout de 1 minuto
        let timeout: NodeJS.Timeout | undefined;
        let allTurns: LiveServerMessage[][] = [];
        let timeoutReached = false;
        let partialTextBuffer = '';
        let anyTextReceivedBuffer = false;
        try {
            const handleAllTurnsPromise = handleAllTurns();
            const timeoutPromise = new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    timeoutReached = true;
                    reject(new Error('Timeout esperando respuesta de Gemini Live (1 minuto)'));
                }, 60000);
            });
            allTurns = await Promise.race([
                handleAllTurnsPromise,
                timeoutPromise
            ]) as LiveServerMessage[][];
        } catch (err) {
            // Si hubo timeout, intentar recuperar el texto acumulado del buffer
            for (const turn of allTurns.flat()) {
                if (turn?.serverContent?.modelTurn?.parts) {
                    for (const part of turn.serverContent.modelTurn.parts) {
                        if (part?.text) {
                            partialTextBuffer += part.text;
                            anyTextReceivedBuffer = true;
                        }
                    }
                }
            }
            if (anyTextReceivedBuffer) {
                // Log y devolver el texto acumulado aunque haya timeout
                console.warn('[GEMINI][TIMEOUT] Timeout, pero se recibió texto. Devolviendo lo acumulado.');
                console.log(`[GEMINI] Prompt recibido (transcripción interna): ${partialTextBuffer}`);
                return partialTextBuffer;
            } else {
                // Si no hay texto, enviar respuesta por defecto al frontend usando el mismo evento
                console.warn('[GeminiService] Error:', err);
                const defaultReplies = [
                    'Creo que me distraje, ¿puedes decirlo otra vez?',
                    'Ups, no logré entenderte bien. ¿Me lo repites?',
                    'Perdón, me perdí un poco. ¿Podrías repetirlo?',
                    'A veces me cuesta escuchar, ¿puedes intentarlo de nuevo?',
                    'No estoy seguro de haber entendido, ¿me lo dices otra vez?',
                    'Disculpa, creo que no entendí. ¿Puedes repetirlo?',
                    '¿Me lo puedes decir otra vez? No lo comprendí bien.',
                    'Perdón, parece que no escuché bien. ¿Puedes intentarlo otra vez?',
                    'A veces me confundo, ¿puedes repetir lo que dijiste?'
                ];
                const defaultText = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
                this.socketManager?.emitEvent('ia-speak', { text: defaultText });
                return defaultText;
            }
        } finally {
            if (timeout) clearTimeout(timeout);
            this.turnInProgress = false;
        }

        // Acumular todos los bloques de IA y sus continuaciones
        // Esperar a que llegue generationComplete y luego procesar el texto completo
        let fullText = '';
        for (const turn of allTurns.flat()) {
            if (turn?.serverContent?.modelTurn?.parts) {
                for (const part of turn.serverContent.modelTurn.parts) {
                    if (part?.text) {
                        const txt = part.text.trim();
                        console.log(`\x1b[35m[GEMINI][RAW]\x1b[0m ${txt}`);
                        fullText += txt + '\n';
                    }
                }
            }
        }
        // --- USO DE TOKENS Y PETICIONES ---
        // Buscar usageMetadata en los mensajes recibidos (en el objeto raíz, no en serverContent)
        let usageMetadata: any = null;
        for (const turn of allTurns.flat()) {
            if (turn?.usageMetadata) {
                usageMetadata = turn.usageMetadata;
                break;
            }
        }
        // Si no se encuentra, buscar en el último mensaje
        if (!usageMetadata && allTurns.length > 0) {
            const last = allTurns.flat().slice(-1)[0];
            if (last?.usageMetadata) usageMetadata = last.usageMetadata;
        }
        // Actualizar contadores locales
        const now = Date.now();
        // Limpiar timestamps viejos (más de 1 min)
        this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < GeminiService.WINDOW_MS);
        this.requestTimestamps.push(now);
        let tokensUsed = 0;
        if (usageMetadata && typeof usageMetadata.totalTokenCount === 'number') {
            tokensUsed = usageMetadata.totalTokenCount;
        }
        // Limpiar ventana de tokens si pasó 1 min
        if (now - this.tokenUsageWindow.start > GeminiService.WINDOW_MS) {
            this.tokenUsageWindow = { tokens: 0, start: now };
        }
        this.tokenUsageWindow.tokens += tokensUsed;
        // Calcular % de uso
        const rpm = this.requestTimestamps.length;
        const rpmPercent = Math.min(100, Math.round((rpm / GeminiService.REQUEST_LIMIT_PER_MIN) * 100));
        const tokens = this.tokenUsageWindow.tokens;
        const tokensPercent = Math.min(100, Math.round((tokens / GeminiService.TOKEN_LIMIT_PER_MIN) * 100));
        // Calcular % restante (0% = sin cupo, 100% = todo disponible)
        const requestsRemainingPercent = Math.max(0, 100 - rpmPercent);
        const tokensRemainingPercent = Math.max(0, 100 - tokensPercent);
        // Actualizar propiedad pública de la instancia
        this.quotaPercent = {
            tokens: tokensRemainingPercent,
            requests: requestsRemainingPercent
        };
        // Mostrar en consola
        console.log(`\x1b[36m[GEMINI][USO]\x1b[0m Peticiones/min: ${rpm} (${rpmPercent}%) | Tokens/min: ${tokens} (${tokensPercent}%)`);
        console.log(`\x1b[36m[GEMINI][USO]\x1b[0m Disponible: ${GeminiService.REQUEST_LIMIT_PER_MIN - rpm} peticiones/min, ${GeminiService.TOKEN_LIMIT_PER_MIN - tokens} tokens/min | % restante: ${requestsRemainingPercent}% peticiones, ${tokensRemainingPercent}% tokens`);

        // --- Preprocesamiento y extracción robusta ---
        const preprocessed = fullText
            .replace(/[\r\n]+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\[\s*USER\s*\]|\[USER\s*\]/gi, '[USER]')
            .replace(/\[\s*IA\s*\]|\[IA\s*\]/gi, '[IA]')
            .replace(/\]\s*:\s*"|\s*:\s*"/g, ']:"')
            .replace(/([¿¡])\s*"/g, '$1"')
            .replace(/"\s*([?!.])/, '"$1')
            .replace(/([¿¡])\s+/g, '$1')
            .replace(/"\s+([?!.])/, '"$1')
            .replace(/"\s+([^"\n]+)/g, '"$1')
            .trim();

        const cleanText = (txt: string) => txt
            .replace(/\s+/g, ' ')
            .replace(/^([¿¡])\s+/, '$1')
            .replace(/\s+([?!.])$/, '$1')
            .replace(/"\s*([?!.])/, '"$1')
            .trim();


        let userText = '';
        let iaText = '';
        // Extraer todos los bloques [IA]:"..."
        const iaMatches = [...preprocessed.matchAll(/\[IA\]:\s*"([\s\S]*?)"/gm)];
        if (iaMatches.length > 0) {
            iaText = iaMatches.map(m => cleanText(m[1])).join('\n');
        }
        // Extraer el primer bloque [USER]:"..."
        const userMatch = preprocessed.match(/\[USER\]:\s*"([\s\S]*?)"/m);
        if (userMatch?.[1]) userText = cleanText(userMatch[1]);
        if (!userText) {
            const fallbackUserRegex = /\]:\s*"([\s\S]*?)"/gm;
            let match;
            const iaIndex = preprocessed.indexOf('[IA]');
            while ((match = fallbackUserRegex.exec(preprocessed)) !== null) {
                if (match.index < iaIndex || iaIndex === -1) {
                    userText = cleanText(match[1]);
                    break;
                }
            }
        }
        if (!iaText) {
            // Fallback: intentar extraer el primer bloque aunque no tenga el tag [IA]
            const fallbackMatch = preprocessed.match(/\]:\s*"([\s\S]*?)"/m);
            if (fallbackMatch?.[1]) iaText = cleanText(fallbackMatch[1]);
            else return '';
        }
        if (userText) console.log(`\x1b[36m[GEMINI][USER]\x1b[0m ${userText}`);
        else console.warn('\x1b[33m[GEMINI][USER]\x1b[0m No se pudo extraer el mensaje del usuario.');
        console.log(`\x1b[32m[GEMINI][IA]\x1b[0m ${iaText}`);

        // --- Mensajes híbridos de acción ---
        let actionMessages: string[] = [];
        // Buscar si hubo acciones relevantes en los turnos
        for (const turn of allTurns.flat()) {
            if (turn?.toolCall?.functionCalls?.length) {
                for (const call of turn.toolCall.functionCalls) {
                    if (call.name === 'getWorlds') {
                        // Buscar cantidad de mundos en el contexto
                        const worldsRaw = this.worldsManager.getAllWorlds();
                        actionMessages.push(`*La IA encontró ${worldsRaw.length} mundo${worldsRaw.length === 1 ? '' : 's'}*`);
                    } else if (call.name === 'changeWorld') {
                        actionMessages.push(`*La IA cambió de mundo*`);
                    }
                }
            }
        }
        // Evitar duplicados
        actionMessages = [...new Set(actionMessages)];
        // Emitir mensaje híbrido al frontend
        const finalMessage = (actionMessages.length > 0 ? actionMessages.join('\n') + '\n' : '') + iaText;
        this.socketManager?.emitEvent('ia-speak', { text: finalMessage });
        return iaText;

    }

    private handleModelTurn(message: LiveServerMessage) {
        // Procesa toolCalls de Gemini Live (function calling)
        if (message.toolCall && message.toolCall.functionCalls) {
            const functionResponses: any[] = [];
            for (const functionCall of message.toolCall.functionCalls) {
                const { name, args, id } = functionCall;
                if (name === 'moveTo' && args && typeof args.x === 'number' && typeof args.y === 'number') {
                    this.socketManager?.emitEvent('ia-move', { position: { x: args.x, y: args.y } });
                    functionResponses.push({ id, name, response: { result: 'ok' } });
                    console.log(`\x1b[34m[IA-BACKEND]\x1b[0m Acción: moveTo -> x: ${args.x}, y: ${args.y}`);
                } else if (name === 'changeWorld' && args && typeof args.worldId === 'string') {
                    // Validar que el worldId exista en worldsManager
                    const worldsRaw = this.worldsManager.getAllWorlds();
                    const exists = worldsRaw.some((w: { id: string }) => w.id === args.worldId);
                    if (exists) {
                        // LOG: Mostrar que la IA ejecuta changeWorld y el id solicitado
                        console.log(`\x1b[34m[IA-BACKEND]\x1b[0m Acción: changeWorld -> worldId: ${args.worldId}`);
                        // Actualizar el estado global de la IA

                        this.iaManager.setCurrentWorld(args.worldId);

                        // Emitir evento igual que SessionWorldHandler
                        this.socketManager?.emitEvent('ia-change-world', { worldId: args.worldId, iaCurrentWorld: args.worldId, clearIaMessage: true });
                        // Loguear el cambio de mundo
                        try {
                            const { Logger } = require('../socket/handlers/Logger');
                            if (Logger && typeof Logger.logIACurrentWorld === 'function') {
                                Logger.logIACurrentWorld(args.worldId);
                            }
                        } catch (e) {
                            // No hacer nada si no se puede importar
                        }
                        // Inyectar comentario para Gemini con el mundo destino
                        if (this.lastTurnId && this.responseQueues[this.lastTurnId]) {
                            this.responseQueues[this.lastTurnId].push({
                                serverContent: {
                                    modelTurn: {
                                        parts: [
                                            {
                                                text: `/* [INFO SISTEMA: La IA se moverá al mundo con id: ${args.worldId} ] */`
                                            }
                                        ]
                                    }
                                }
                            } as LiveServerMessage);
                        }
                        functionResponses.push({ id, name, response: { result: 'ok' } });
                    } else {
                        // Log de intento inválido
                        console.warn(`\x1b[33m[IA-BACKEND][WARN]\x1b[0m worldId inválido recibido en changeWorld: ${args.worldId}`);
                        // Opcional: puedes enviar un mensaje de error a Gemini o al frontend si lo deseas
                        functionResponses.push({ id, name, response: { result: 'error', reason: 'invalid_worldId' } });
                    }
                } else if (name === 'interact' && args && typeof args.objectId === 'string') {
                    this.socketManager?.emitEvent('ia-interact', { objectId: args.objectId });
                    functionResponses.push({ id, name, response: { result: 'ok' } });
                    console.log(`\x1b[34m[IA-BACKEND]\x1b[0m Acción: interact -> objectId: ${args.objectId}`);
                } else if (name === 'getWorlds') {
                    // LOG: Mostrar que la IA ejecuta getWorlds
                    console.log('\x1b[34m[IA-BACKEND]\x1b[0m Acción: getWorlds');
                    const worldsRaw = this.worldsManager.getAllWorlds();
                    // LOG: Mostrar los IDs de los mundos
                    if (worldsRaw.length === 0) {
                        console.log('\x1b[34m[IA-BACKEND]\x1b[0m No hay mundos disponibles');
                    } else {
                        console.log(`\x1b[34m[IA-BACKEND]\x1b[0m Mundos disponibles: ${worldsRaw.map(w => w.id).join(', ')}`);
                    }
                    const worlds = worldsRaw.map((w: { id: string; isOrigin?: boolean }) => ({ id: w.id, isOrigin: !!w.isOrigin }));
                    functionResponses.push({ id, name: 'getWorlds', response: { worlds, count: worlds.length } });
                    // Inyectar resultado como contexto para Gemini, para que pueda decir la cantidad de mundos
                    if (this.lastTurnId && this.responseQueues[this.lastTurnId]) {
                        this.responseQueues[this.lastTurnId].push({
                            serverContent: {
                                modelTurn: {
                                    parts: [
                                        {
                                            text: `/* [INFO SISTEMA: La IA ha encontrado ${worlds.length} mundo(s): ${worlds.map(w => w.id).join(', ')} ] */`
                                        }
                                    ]
                                }
                            }
                        } as LiveServerMessage);
                    }
                }
            }
            // Responde a Gemini con los resultados de las funciones
            if (functionResponses.length > 0) {
                this.session?.sendToolResponse({ functionResponses });
            }
        }
        if (message.serverContent?.modelTurn?.parts) {
            const part = message.serverContent?.modelTurn?.parts?.[0];
            if (part?.fileData) {
                console.log(`\x1b[36m[IA-BACKEND][FILE]\x1b[0m File: ${part?.fileData.fileUri}`);
            }
            if (part?.text) {
                console.log(`\x1b[36m[IA-BACKEND][TEXT]\x1b[0m ${part?.text}`);
            }
        }
    }

    /**
     * Cierra la sesión de Gemini Live (llamar solo cuando no haya mundos activos)
     */
    async closeSession() {
        if (this.session) {
            this.session.close();
            this.session = undefined;
            this.responseQueues = {};
        }
    }
}


