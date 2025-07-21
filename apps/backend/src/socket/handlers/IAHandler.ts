import { Server, Socket } from "socket.io";
import type { WorldsManager } from '../../services/worldsManager';
import type { AIManager } from '../../services/aiManager';
import { getMicActiveState } from '../../micState';
import { Logger } from './Logger';
import { IAMovementScheduler } from "../IAMovementScheduler";

import type { AIState } from '../../types';

export class IAHandler {

    private IAState: AIState | null = null
    private IACurrentWorld: string;

    constructor(
        private io: Server,
        private worldsManager: WorldsManager,
        private aiManager: AIManager,
        private iaHasBornRef: { value: boolean },
        private iaMovementScheduler: IAMovementScheduler
    ) {

        this.IAState = this.aiManager.getState();
        if (!this.IAState) {
            console.error('[IAHandler] IAState is null, ensure AIManager is initialized correctly');
        }
        this.IACurrentWorld = this.IAState.currentWorld;
        if (!this.IACurrentWorld) {
            console.error('[IAHandler] IACurrentWorld is null, ensure AIManager is initialized correctly');
        }
    }

    handleIAEvents(socket: Socket, worldId: string) {
        // ia-move
        socket.on('ia-move', (data: any) => {
            if (!this.aiManager || !this.IACurrentWorld || this.IACurrentWorld !== worldId) {
                socket.emit('ia-error', { error: 'La IA no está presente en este mundo' });
                return;
            }
            this.io.emit('ia-move', data);
            // Usar el worldId actual de la IA para el log
            const currentWorldId = this.IACurrentWorld;
            Logger.logIAMove(currentWorldId, data.position);
        });
        // ia-interact
        socket.on('ia-interact', (data: any) => {
            if (!this.aiManager || !this.IACurrentWorld || this.IACurrentWorld !== worldId) {
                socket.emit('ia-error', { error: 'La IA no está presente en este mundo' });
                return;
            }
            this.io.emit('ia-interact', data);
        });
        // ia-change-world
        socket.on('ia-change-world', (data: any) => {
            if (getMicActiveState()) {
                socket.emit('mic-busy', { reason: 'El micrófono global está activo, espera a que termine la grabación.' });
                return;
            }
            const targetWorld = this.worldsManager.getWorld(data.worldId);
            if (targetWorld && !targetWorld.pendingDestroy) {
                if (this.IACurrentWorld !== data.worldId) {
                    Logger.logIAMove(this.IACurrentWorld, data.worldId);
                }
                this.io.emit('ia-change-world', { worldId: data.worldId, IACurrentWorld: data.worldId, clearIaMessage: true });;
                Logger.logIACurrentWorld(data.worldId);
            }
        });
        // El evento ia-born y la lógica de ciclo de vida de la IA se maneja solo en SessionWorldHandler
    }
}
