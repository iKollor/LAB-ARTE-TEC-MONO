
import { mostrarMensajeIA, isIaPopupVisible } from "./iaPopup";
import { SocketController } from "../controller/SocketController";
import { MicrophoneController } from "../controller/MicrophoneController";
// Nueva integración para movimiento de IA
import { PixiAppManager } from "./pixi/app";

import { WorldController } from "../controller/WorldController";



import { IAState } from "../controller/IAState";

export class SocketHandlers {
    private iaCurrentTurnId: string | null = null;
    private pixiManager: PixiAppManager | null = null;
    private iaState: IAState;

    constructor(
        private socketController: SocketController,
        private microphoneController: MicrophoneController,
        private worldController: WorldController,
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
        // Unifica el manejo de ia-processing: deshabilita micrófono y muestra mensaje solo si la IA está en este mundo
        socket.on("ia-processing", () => {
            this.microphoneController.setMicState({ canUse: false });
            console.log('[FRONT][MIC] Micrófono deshabilitado por procesamiento IA');
            if (this.iaState.currentWorld !== this.worldController.getCurrentWorldId()) return;
            mostrarMensajeIA("Procesando...", false);
        });
        if (typeof socket.off === "function") {
            ["ia-speak", "ia-turn", "ia-move", "world-assigned", "ia-processing"].forEach(event => socket.off(event));
        }
        socket.on("world-assigned", (worldData: any) => {
            if (worldData && worldData.id) {
                this.worldController.setWorld(worldData);
            }
            // Actualizar IAState si viene del backend
            if (worldData && worldData.aiState) {
                this.iaState.born = worldData.aiState.iaBorn;
                this.iaState.currentWorld = worldData.aiState.currentWorld || '';
            }
            // Log de depuración para verificar sincronización IA
            console.log('[FRONT][SYNC] IAState:', {
                born: this.iaState.born,
                currentWorld: this.iaState.currentWorld,
                frontendWorld: this.worldController.getCurrentWorldId()
            });
            this.updateMicState();
        });
        socket.on("ia-change-world", () => {
            this.updateMicState();
        });
        socket.on("ia-speak", (payload: { text: string; worldId?: string; turnId?: string }) => {
            const currentWorldId = this.worldController.getCurrentWorldId();
            console.log('[FRONT][EVENT] ia-speak recibido:', payload, 'iaState.currentWorld:', this.iaState.currentWorld, 'frontendWorld:', currentWorldId);
            // Mostrar SIEMPRE el mensaje para depuración, aunque el mundo no coincida
            if (this.iaState.currentWorld !== currentWorldId) {
                console.warn('[FRONT][EVENT] ia-speak ignorado por mundo:', this.iaState.currentWorld, currentWorldId);
                mostrarMensajeIA(`[DEBUG][MUNDO NO COINCIDE] ${payload.text}`, true);
                this.microphoneController.enableMic();
                return;
            }
            mostrarMensajeIA(payload.text, true);
            this.microphoneController.enableMic();
        });
        socket.on("ia-turn", (payload: { worldId?: string; turnId?: string }) => {
            const currentWorldId = this.worldController.getCurrentWorldId();
            if (this.iaState.currentWorld !== currentWorldId) return;
            if (payload.turnId && this.iaCurrentTurnId && payload.turnId !== this.iaCurrentTurnId) return;
        });
        socket.on("mic-global-state", (data) => {
            if (isIaPopupVisible()) return;
            // Solo permitir micrófono si la IA está en este mundo
            const canUse = this.iaState.currentWorld === this.worldController.getCurrentWorldId();
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

    public updateMicState() {
        // Solo permitir micrófono si la IA está en este mundo
        const canUse = this.iaState.currentWorld === this.worldController.getCurrentWorldId();
        this.microphoneController.setMicState({ canUse });
        this.microphoneController.updateMicIcon();
        this.microphoneController.setMicTimer(null);
    }
}
