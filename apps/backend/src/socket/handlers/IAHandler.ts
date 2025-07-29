import { Server, Socket } from "socket.io";
// Tipos para los datos de eventos IA
type IAMoveData = { position: { x: number; y: number } };
type IAInteractData = { objectId: string };
type IAChangeWorldData = { worldId: string };
import type { WorldsManager } from '../../services/worldsManager';
import type { AIManager } from '../../services/aiManager';
import { getMicActiveState } from '../../micState';
import { Logger } from './Logger';

import type { AIState } from '../../types';

export class IAHandler {

    private IAState: AIState | null = null
    private IACurrentWorld: string;
    private socket: Socket | null = null;

    constructor(
        private io: Server,
        private worldsManager: WorldsManager,
        private aiManager: AIManager,
    ) {

        this.IAState = this.aiManager.getState();
        if (!this.IAState) {
            console.error('[IAHandler] IAState is null, ensure AIManager is initialized correctly');
        }
        this.IACurrentWorld = this.IAState.currentWorld;
        if (!this.IACurrentWorld) {
            console.error('[IAHandler] IACurrentWorld is null, ensure AIManager is initialized correctly');
        }

        if (!this.socket) {
            console.error('[IAHandler] Socket is null, ensure it is initialized correctly');
        }
    }

    handleIAEvents(socket: Socket, worldId: string) {
        this.socket = socket;
        socket.on('ia-move', (data: IAMoveData) => this.handleIAMove(worldId, data));
        socket.on('ia-interact', (data: IAInteractData) => this.handleIAInteract(worldId, data));
        socket.on('ia-change-world', (data: IAChangeWorldData) => this.handleIAChangeWorld(data));
        // El evento ia-born y la lógica de ciclo de vida de la IA se maneja solo en SessionWorldHandler
    }

    private handleIAMove(worldId: string, data: IAMoveData) {
        this.IAState = this.aiManager.getState();
        this.IACurrentWorld = this.IAState.currentWorld;
        if (!this.aiManager || !this.IACurrentWorld || this.IACurrentWorld !== worldId) {
            this.socket?.emit('ia-error', { error: 'La IA no está presente en este mundo' });
            return;
        }
        this.io.emit('ia-move', data);
        Logger.logIAMove(this.IACurrentWorld, data.position);
    }

    private handleIAInteract(worldId: string, data: IAInteractData) {
        this.IAState = this.aiManager.getState();
        this.IACurrentWorld = this.IAState.currentWorld;
        if (!this.aiManager || !this.IACurrentWorld || this.IACurrentWorld !== worldId) {
            this.socket?.emit('ia-error', { error: 'La IA no está presente en este mundo' });
            return;
        }
        this.io.emit('ia-interact', data);
    }

    private handleIAChangeWorld(data: IAChangeWorldData) {
        this.IAState = this.aiManager.getState();
        this.IACurrentWorld = this.IAState.currentWorld;
        if (getMicActiveState()) {
            this.socket?.emit('mic-busy', { reason: 'El micrófono global está activo, espera a que termine la grabación.' });
            return;
        }
        const targetWorld = this.worldsManager.getWorld(data.worldId);
        if (targetWorld && !targetWorld.pendingDestroy) {
            if (this.IACurrentWorld !== data.worldId) {
                // Para cambio de mundo, logIAMove espera (fromWorld: string, toWorld: string)
                Logger.logIAChangeWorld(this.IACurrentWorld, data.worldId);
            }
            this.io.emit('ia-change-world', { worldId: data.worldId, IACurrentWorld: data.worldId, clearIaMessage: true });
            Logger.logIACurrentWorld(data.worldId);
        }
    }


    private handleIASpeak(text: string) {
        this.IAState = this.aiManager.getState();
        this.IACurrentWorld = this.IAState.currentWorld;
        if (!this.aiManager || !this.IACurrentWorld) {
            this.socket?.emit('ia-error', { error: 'La IA no está presente en este mundo' });
            return;
        }
        this.io.emit('ia-speak', { text });
        Logger.logIASpeak(this.IACurrentWorld, text);
    }
}
