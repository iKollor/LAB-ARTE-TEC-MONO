import { PixiAppManager } from "../scripts/pixi/app";
import { SocketHandlers } from "../scripts/socketHandlers";
import { SocketController } from "../controller/SocketController";
import { WorldController } from "../controller/WorldController";
import { MicrophoneController } from "../controller/MicrophoneController";
import { IAState } from "../controller/IAState";
import { showWelcomePopup } from "./welcomePopup";
import { audioLayersManager } from "./AudioLayersManager";

console.log("Inicializando Pixi y SocketHandlers...");

showWelcomePopup(() => {
    console.log('[POPUP] Usuario hizo clic en Comenzar');
    audioLayersManager.setLayers(1);
});

window.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("canvas-container");
    if (!container) {
        console.error("No se encontró el contenedor #canvas-container para inicializar Pixi.");
        return;
    }

    // Lee el worldId de localStorage (si existe)
    const storedWorldId = localStorage.getItem("worldId");
    const socketController = new SocketController(storedWorldId || null);

    // Espera a que el backend asigne el mundo
    socketController.onWorldAssigned(async (worldData: any) => {
        if (!worldData || !worldData.id) {
            console.error("No se recibió worldData válido desde el backend");
            return;
        }
        // Guarda el worldId y worldData asignados por el backend
        localStorage.setItem("worldId", worldData.id);
        localStorage.setItem("worldData", JSON.stringify(worldData));

        // Inicializa los controllers con el mundo asignado
        const worldController = new WorldController(worldData);
        const micBtn = document.getElementById("mic-btn") as HTMLButtonElement;
        const micIcon = document.getElementById("mic-icon") as HTMLImageElement;
        if (!micBtn || !micIcon) {
            console.error("No se encontró el botón o ícono del micrófono");
            return;
        }
        // Leer el estado completo de la IA del backend
        let iaState: IAState;
        if (worldData.aiState) {
            iaState = new IAState(worldData.aiState.iaBorn, worldData.aiState.currentWorld || '');
        } else {
            iaState = new IAState();
        }

        const microphoneController = new MicrophoneController(socketController.getSocket(), micIcon, micBtn);
        micBtn.addEventListener("click", () => microphoneController.toggleMic());
        // Registrar en window para acceso global desde iaPopup
        (window as any).microphoneController = microphoneController;

        const manager = new PixiAppManager({ element: container }, socketController, worldController, microphoneController, iaState);
        await manager.init();
        const socketHandlers = new SocketHandlers(manager.socketController, manager.microphoneController, manager.worldController, iaState);
        socketHandlers.setPixiManager(manager);
        socketHandlers.register();
        // Sincroniza el micrófono tras la animación y aparición de la IA
        socketHandlers.updateMicState();
    });
});