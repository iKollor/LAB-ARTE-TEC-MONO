import { Server, Socket } from "socket.io";
import type { WorldsManager } from '../../services/worldsManager';

import { Logger } from './Logger';
import { IAMovementScheduler } from "../IAMovementScheduler";

import type { AIManager } from '../../services/aiManager';
export class SessionWorldHandler {
    constructor(
        private io: Server,
        private worldsManager: WorldsManager,
        private iaHasBornRef: { value: boolean },
        private iaMovementScheduler: IAMovementScheduler,
        private aiManager: AIManager
    ) { }

    handleConnection(socket: Socket) {
        Logger.logConnection(socket.id);
        let worldId = socket.handshake.auth.worldId;
        let world = this.worldsManager.getWorld(worldId);
        let worldExist = !!world;
        // Si no existe el mundo, créalo
        if (!world) {
            worldId = require('uuid').v4();
            this.worldsManager.createWorld(worldId, {
                id: worldId,
                createdAt: new Date().toISOString(),
                pendingDestroy: false
            });
            Logger.logWorldCreated(worldId);
            world = this.worldsManager.getWorld(worldId);
            worldExist = !!world;
        }
        // Solo inicializar la IA si no ha nacido
        if (world && world.isOrigin) {
            const aiState = this.aiManager.getState();
            if (!aiState.iaBorn) {
                this.iaHasBornRef.value = false;
                this.aiManager.setCurrentWorld(worldId);
                this.aiManager.setState({
                    currentAction: '',
                    currentWorld: worldId,
                    lastUpdated: new Date(),
                    iaBorn: false
                });
                console.log(`[SessionWorldHandler] AIManager inicializado y sincronizado con currentWorld = ${worldId}`);
                console.log(`[SessionWorldHandler] Primer mundo creado: ${worldId} (origin)`);
            }
        }
        if (!world) {
            console.warn(`[WORLD] No se pudo crear o recuperar el mundo: ${worldId}`);
            console.warn(`[SessionWorldHandler] No se pudo crear o recuperar el mundo: ${worldId}`);
            return;
        }
        const isOrigin = !!world.isOrigin;
        // Enviar el estado completo de la IA junto con el mundo asignado
        const aiState = this.aiManager ? this.aiManager.getState() : undefined;
        console.log('[BACKEND] Emitiendo world-assigned:', { id: worldId, isOrigin, worldExist, aiState });
        socket.emit('world-assigned', { id: worldId, isOrigin, worldExist, aiState });
        // Esperar a que el cliente indique que está listo (tras bigbang) para emitir ia-born-request
        socket.on('client-ready', () => {
            // Solo emitir ia-born-request si la IA no ha nacido
            const aiState = this.aiManager.getState();
            if (!socket.data.iaBornRequestSent && isOrigin && !aiState.iaBorn) {
                socket.data.iaBornRequestSent = true;
                socket.emit('ia-born-request');
                console.log('[SessionWorldHandler] ia-born-request emitido al cliente tras client-ready');
            }
        });

        // Marcar la IA como nacida cuando el frontend lo notifica y arrancar movimiento aleatorio
        socket.on('ia-born', () => {
            const aiState = this.aiManager.getState();
            if (!aiState.iaBorn) {
                this.aiManager.setState({
                    ...aiState,
                    iaBorn: true,
                    lastUpdated: new Date()
                });
                console.log('[BACKEND] Evento ia-born recibido desde frontend, iaBorn actualizado a true');
                // Iniciar movimiento aleatorio si hay sesiones activas
                const numSessions = (this.worldsManager as any).sessions?.size || 0;
                if (numSessions > 0) {
                    this.iaMovementScheduler.startRandomIAMovement();
                } else {
                    console.warn('[IA-BACKEND] No hay sesiones activas, no se iniciará el movimiento aleatorio de IA', numSessions);
                }
            }
        });
        const numSessions = (this.worldsManager as any).sessions?.size || 0;
        if (this.iaHasBornRef.value && numSessions > 0) {
            const allWorlds = this.worldsManager.getAllWorlds().filter((w: any) => !w.pendingDestroy);
            const originWorldId = this.worldsManager.getOriginWorldId();
            if (allWorlds.length === 1 && allWorlds[0].id === originWorldId && allWorlds[0].pendingDestroy) {
                this.iaMovementScheduler.startRandomIAMovement();
                allWorlds[0].pendingDestroy = false;
                // La lógica de nacimiento de la IA ahora solo se refleja en AIState
                this.aiManager.setState({
                    ...this.aiManager.getState(),
                    iaBorn: true,
                    currentWorld: originWorldId,
                    lastUpdated: new Date()
                });
                this.io.emit('ia-change-world', { worldId: originWorldId, iaCurrentWorld: originWorldId });
                Logger.logIANace(originWorldId);
                Logger.logIACurrentWorld(originWorldId);
            }
        }
    }

    handleDisconnect(socket: Socket) {
        // Buscar la sesión y el mundo asociado
        const session = (this.worldsManager as any).sessions?.get(socket.id);
        const aiCurrentWorld = this.aiManager?.getCurrentWorldId ? this.aiManager.getCurrentWorldId() : undefined;
        if (session && aiCurrentWorld && session.worldId === aiCurrentWorld) {
            // El mundo que se va a quedar vacío es donde está la IA
            // Eliminar la sesión primero
            this.worldsManager.removeSession(socket.id);
            // Buscar mundos disponibles (no pendientes de destrucción y distintos al actual)
            const availableWorlds = this.worldsManager.getAllWorlds().filter(w => !w.pendingDestroy && w.id !== session.worldId);
            if (availableWorlds.length > 0) {
                // Mover la IA a un mundo aleatorio
                const randomWorld = availableWorlds[Math.floor(Math.random() * availableWorlds.length)];
                this.aiManager.setCurrentWorld(randomWorld.id);
                this.io.emit('ia-change-world', { worldId: randomWorld.id, iaCurrentWorld: randomWorld.id, clearIaMessage: true });
                Logger.logIACurrentWorld(randomWorld.id);
                console.log(`[IA] Cambio de mundo por desconexión: la IA se movió a ${randomWorld.id}`);
            } else {
                // Solo destruir la IA si ya no existen mundos en absoluto (ni activos ni pendientes de destrucción)
                const allWorlds = this.worldsManager.getAllWorlds();
                if (allWorlds.length === 0) {
                    this.aiManager.setState({
                        currentAction: '',
                        currentWorld: '',
                        lastUpdated: new Date(),
                        iaBorn: false
                    });
                    this.iaHasBornRef.value = false;
                    this.io.emit('ia-destroyed');
                    console.log('[IA] Todos los mundos eliminados, la IA ha sido destruida');
                } else {
                    // Hay mundos pendientes de destrucción, esperar a que realmente se eliminen
                    console.log('[IA] Hay mundos pendientes de destrucción, la IA NO se destruye aún');
                }
            }
        } else {
            // Solo eliminar la sesión
            this.worldsManager.removeSession(socket.id);
        }
    }
}
