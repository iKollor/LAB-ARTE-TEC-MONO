import { GoogleGenAI, LiveServerMessage, MediaResolution, Modality, Session, Type, Schema } from '@google/genai';
import * as fs from 'node:fs';
import { WaveFile } from 'wavefile';

// import { emitEvent } from '../socket';

import type { WorldsManager } from './worldsManager';


export class GeminiService {
    private ai!: GoogleGenAI;
    private model!: string;
    private session: Session | undefined = undefined;
    // Buffer de mensajes por turno para evitar perder fragmentos rezagados
    private responseQueues: Record<string, LiveServerMessage[]> = {};
    private worldsManager: WorldsManager;
    private socketManager?: { emitEvent: (event: string, data: any) => void };

    constructor(worldsManager: WorldsManager, socketManager?: { emitEvent: (event: string, data: any) => void }) {
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

FUNCIONES DISPONIBLES:
- moveTo(x, y): Mueve tu cuerpo a una posición específica.
- changeWorld(worldId): Cambia de mundo.
- interact(objectId): Interactúa con un objeto.
- getWorlds(): Obtén la lista de mundos disponibles.

USA LAS FUNCIONES SOLO CUANDO SEA NECESARIO Y DE FORMA NATURAL EN LA CONVERSACIÓN. NO EXPLIQUES NI NARRES LAS ACCIONES, SOLO EJECÚTALAS.

FORMATO DE RESPUESTA (OBLIGATORIO, SIEMPRE):
[USER]:"(texto exacto del usuario)"
[IA]:"(tu respuesta aquí, SOLO la respuesta de la IA, sin repetir el mensaje del usuario ni instrucciones, ni comentarios, ni aclaraciones, ni nada más)"

NO AGREGUES TEXTO EXTRA, NO EXPLIQUES EL FORMATO, NO AGREGUES COMENTARIOS NI ACLARACIONES, NO OMITAS NINGÚN BLOQUE. SIEMPRE DEBEN APARECER AMBOS BLOQUES, AUNQUE EL USUARIO NO HAYA DICHO NADA.

Si decides cambiar de mundo o realizar una acción, solo ejecútala usando la función correspondiente, sin narrar ni explicar.`,
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
            ]
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
        // Enviar audio como input
        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000'
            }
        });

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

        // Enviar audio como input
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
            const MAX_TICKS = 600; // 60s
            let tick = 0;
            let lastLog = Date.now();
            this.socketManager?.emitEvent('ia-processing', { processing: true });
            turnBuffers[currentTurnId] = { messages: [], partialText: '', anyText: false, anyAction: false };
            while (!done && tick < MAX_TICKS) {
                let gotMsg = false;
                for (const [turnId, queue] of Object.entries(this.responseQueues)) {
                    let msg;
                    while ((msg = queue.shift())) {
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
                // Si no hay texto, lanzar el error original
                console.warn('[GeminiService] Error:', err);
                return '';
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
        const userMatch = preprocessed.match(/\[USER\]:\s*"([\s\S]*?)"/m);
        if (userMatch?.[1]) userText = cleanText(userMatch[1]);
        const iaMatch = preprocessed.match(/\[IA\]:\s*"([\s\S]*?)"/m);
        if (iaMatch?.[1]) iaText = cleanText(iaMatch[1]);

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
            const fallbackMatch = preprocessed.match(/\]:\s*"([\s\S]*?)"/m);
            if (fallbackMatch?.[1]) iaText = cleanText(fallbackMatch[1]);
            else return '';
        }
        if (userText) console.log(`\x1b[36m[GEMINI][USER]\x1b[0m ${userText}`);
        else console.warn('\x1b[33m[GEMINI][USER]\x1b[0m No se pudo extraer el mensaje del usuario.');
        console.log(`\x1b[32m[GEMINI][IA]\x1b[0m ${iaText}`);
        this.socketManager?.emitEvent('ia-speak', { text: iaText });
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
                    // LOG: Mostrar que la IA ejecuta changeWorld y el id solicitado
                    console.log(`\x1b[34m[IA-BACKEND]\x1b[0m Acción: changeWorld -> worldId: ${args.worldId}`);
                    this.socketManager?.emitEvent('ia-change-world', { worldId: args.worldId });
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


