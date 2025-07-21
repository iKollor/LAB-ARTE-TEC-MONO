
import { mostrarMensajeIA, isIaPopupVisible } from "./iaPopup";
import { SocketController } from "../controller/SocketController";
import { MicrophoneController } from "../controller/MicrophoneController";
// Nueva integración para movimiento de IA
import { PixiAppManager } from "./pixi/app";

import { WorldsController } from "../controller/WorldsController";



import { IAState } from "../controller/IAState";

export class SocketHandlers {
    private iaCurrentTurnId: string | null = null;
    private pixiManager: PixiAppManager | null = null;
    private iaState: IAState;

    constructor(
        private socketController: SocketController,
        private microphoneController: MicrophoneController,
        private worldsController: WorldsController,
        iaState: IAState
    ) {
        this.iaState = iaState;
        // No llamar a updateMicState aquí, solo cuando el mundo esté listo
    }

    public setPixiManager(manager: PixiAppManager) {
        this.pixiManager = manager;
    }

    public register() {
        const socket = this.socketController.getSocket();
        // Mostrar mensaje de procesamiento IA solo cuando corresponde
        socket.on("ia-processing", () => {
            if (this.iaState.currentWorld !== this.worldsController.getCurrentWorldId()) return;
            mostrarMensajeIA("Procesando...", false);
        });
        if (typeof socket.off === "function") {
            ["ia-speak", "ia-turn", "ia-move", "world-assigned", "ia-processing"].forEach(event => socket.off(event));
        }
        socket.on("world-assigned", (worldData: any) => {
            if (worldData && worldData.id) {
                this.worldsController.setWorld(worldData);
            }
            // Actualizar IAState si viene del backend
            if (worldData && worldData.aiState) {
                this.iaState.currentWorld = worldData.aiState.currentWorld || '';
            }
            this.updateMicState();
        });
        socket.on("ia-change-world", () => {
            this.updateMicState();
        });
        socket.on("ia-speak", (payload: { text: string; worldId?: string; turnId?: string }) => {
            const currentWorldId = this.worldsController.getCurrentWorldId();
            // Solo mostrar mensaje si la IA está en este mundo
            if (this.iaState.currentWorld !== currentWorldId) return;
            mostrarMensajeIA(payload.text, true);
        });
        socket.on("ia-turn", (payload: { worldId?: string; turnId?: string }) => {
            const currentWorldId = this.worldsController.getCurrentWorldId();
            if (this.iaState.currentWorld !== currentWorldId) return;
            if (payload.turnId && this.iaCurrentTurnId && payload.turnId !== this.iaCurrentTurnId) return;
        });
        socket.on("mic-global-state", (data) => {
            if (isIaPopupVisible()) return;
            // Solo permitir micrófono si la IA está en este mundo
            const canUse = this.iaState.currentWorld === this.worldsController.getCurrentWorldId();
            this.microphoneController.setMicState({ canUse });
            this.microphoneController.getState().globalMicActive = !!data.active;
            if (this.microphoneController.getState().globalMicActive && this.microphoneController.getState().micOn) {
                this.microphoneController.stopRecording();
            }
        });
        socket.on("mic-busy", () => {
            this.microphoneController.setMicState({ canUse: false });
        });
        socket.on("ia-move", (payload: { position: { x: number, y: number } }) => {
            if (this.pixiManager && payload && payload.position) {
                this.pixiManager.setIATargetPosition(payload.position);
            }
        });
    }

    private updateMicState() {
        // Solo permitir micrófono si la IA está en este mundo
        const canUse = this.iaState.currentWorld === this.worldsController.getCurrentWorldId();
        this.microphoneController.setMicState({ canUse });
        this.microphoneController.updateMicIcon();
        this.microphoneController.setMicTimer(null);
    }
}
