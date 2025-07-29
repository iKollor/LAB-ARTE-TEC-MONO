


import { Server } from "socket.io";
import type { WorldsManager } from '../services/worldsManager';
import type { AIManager } from '../services/aiManager';
import { IAMovementScheduler } from './IAMovementScheduler';
import { SessionWorldHandler } from './handlers/SessionWorldHandler';
import { IAHandler } from './handlers/IAHandler';
import { MicHandler } from './handlers/MicHandler';


import type { Session } from '../types';

export class SocketManager {
    private io: Server;
    private worldsManager: WorldsManager;
    private aiManager: AIManager;
    private iaHasBorn = false;
    private iaMovementScheduler: IAMovementScheduler;
    private sessionWorldHandler: SessionWorldHandler;
    iaHandler: IAHandler;
    micHandler: MicHandler;


    constructor(httpServer: any, worldsManager: WorldsManager, aiManager: AIManager) {
        this.io = new Server(httpServer, { cors: { origin: '*' } });
        this.worldsManager = worldsManager;
        // Suscribirse al evento de worlds eliminados para emitir ia-destroyed y detener intervalos
        this.worldsManager.on('allWorldsDeleted', () => {
            this.io.emit('ia-destroyed');
            this.iaMovementScheduler.stopIAIntervalsIfNoSessions();
            this.aiManager.setState({
                currentAction: '',
                currentWorld: '',
                lastUpdated: new Date(),
                iaBorn: false
            });
            this.iaHasBorn = false;
            console.log('[IA] Todos los mundos eliminados, la IA ha sido destruida');
        });
        // Suscribirse al evento worldsCountChanged para emitirlo por socket
        this.worldsManager.on('worldsCountChanged', (count: number) => {
            this.io.emit('worlds-count-changed', { count });
            console.log(`[SOCKET] worlds-count-changed emitido: ${count}`);
        });
        // Eliminado: el nacimiento de la IA se maneja solo tras world-assigned en SessionWorldHandler
        this.aiManager = aiManager;
        // Usar el tamaño del Map para determinar sesiones activas
        this.iaMovementScheduler = new IAMovementScheduler(
            this.io,
            this.worldsManager,
            this.aiManager,
        );
        // Referencia mutable para iaHasBorn
        const iaHasBornRef = { value: this.iaHasBorn };
        this.sessionWorldHandler = new SessionWorldHandler(
            this.io,
            this.worldsManager,
            iaHasBornRef,
            this.iaMovementScheduler,
            this.aiManager
        );
        this.iaHandler = new IAHandler(
            this.io,
            this.worldsManager,
            this.aiManager,
        );
        this.micHandler = new MicHandler(
            this.io,
            this.iaMovementScheduler
        );
        this.setupSocketEvents();
    }

    emitEvent(event: string, data: any) {
        this.io.emit(event, data);
    }

    private setupSocketEvents() {
        this.io.on("connection", (socket) => {
            const uuid = require('uuid');
            let requestedWorldId = socket.handshake.auth.worldId;
            let useWorldId = null;
            // ¿El cliente pide reconexión a un mundo existente y vacío?
            if (
                requestedWorldId &&
                this.worldsManager.getWorld(requestedWorldId) &&
                !Array.from((this.worldsManager as any).sessions.values()).some((s: any) => s.worldId === requestedWorldId)
            ) {
                useWorldId = requestedWorldId;
            } else {
                useWorldId = uuid.v4();
                // Crear el mundo en el WorldsManager si no existe
                if (!this.worldsManager.getWorld(useWorldId)) {
                    this.worldsManager.createWorld(useWorldId, {
                        id: useWorldId,
                        createdAt: new Date().toISOString(),
                        pendingDestroy: false
                    });
                }
            }
            // Crear y registrar la sesión usando la interfaz Session
            const session: Session = {
                id: socket.id,
                worldId: useWorldId,
                joinedAt: new Date(),
            };
            if (typeof this.worldsManager.addSession === 'function') {
                this.worldsManager.addSession(socket.id, session);
            }
            // Sobrescribir el worldId en el handshake para el resto de handlers
            socket.handshake.auth.worldId = useWorldId;
            // Delegar conexión y asignación de mundo
            this.sessionWorldHandler.handleConnection(socket);
            // Delegar eventos de IA
            this.iaHandler.handleIAEvents(socket, useWorldId);
            // Delegar eventos de micrófono
            this.micHandler.handleMicState(socket);
            // Delegar desconexión
            socket.on("disconnect", () => {
                this.sessionWorldHandler.handleDisconnect(socket);
            });
        });
    }
}

export function registerIaCurrentWorldEndpoint(expressApp: any, aiManager: AIManager) {
    if (!expressApp || typeof expressApp.get !== 'function') {
        console.warn('[SOCKET] No se pudo registrar /api/ia-current-world: expressApp no válido');
        return;
    }
    expressApp.get('/api/ia-current-world', (req: any, res: any) => {
        const clientWorldId = req.header('x-world-id');
        if (!aiManager) {
            return res.status(503).json({ error: 'AIManager no disponible' });
        }
        const iaWorldId = aiManager.getState().currentWorld;
        if (!iaWorldId) {
            return res.status(404).json({ error: 'La IA no está presente en ningún mundo' });
        }
        const iaInThisWorld = clientWorldId && iaWorldId === clientWorldId;
        res.json({ iaWorldId, iaInThisWorld });
    });
}
