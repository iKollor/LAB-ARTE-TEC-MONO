import { Server, Socket } from "socket.io";
import { setMicActiveState, getMicActiveState } from '../../micState';

import type { Session } from '../../types';
import { IAMovementScheduler } from "../IAMovementScheduler";

export class MicHandler {
    constructor(
        private io: Server,
        private iaMovementScheduler: IAMovementScheduler
    ) { }

    handleMicState(socket: Socket) {
        socket.on('mic-state', (data) => {
            const { active, worldId } = data || {};
            setMicActiveState(!!active);
            this.io.emit('mic-global-state', { active: !!active, worldId: active ? worldId : null });
            // Ya no se debe activar el cambio de mundo aleatorio aquí
            // Solo se controla el estado global del micrófono
        });
    }
}
