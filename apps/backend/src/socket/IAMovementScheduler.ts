import type { Server } from "socket.io";
import type { WorldsManager } from "../services/worldsManager";
import type { AIManager } from "../services/aiManager";
import { Logger } from "./handlers/Logger";

/**
 * Encapsula la lógica de intervalos de movimiento y cambio de mundo de la IA.
 */
export class IAMovementScheduler {
    private io: Server;
    private worldsManager: WorldsManager;
    private aiManager: AIManager;
    private iaMoveInterval: NodeJS.Timeout | null = null;
    private iaWorldInterval: NodeJS.Timeout | null = null;

    constructor(io: Server, worldsManager: WorldsManager, aiManager: AIManager) {
        this.io = io;
        this.worldsManager = worldsManager;
        this.aiManager = aiManager;
    }

    public startRandomIAMovement() {
        this.clearIntervalIfExists(this.iaMoveInterval, 'movimiento');
        // Usar el WorldsManager para contar sesiones activas
        let numSessions = 0;
        // Acceso directo al Map de sesiones del WorldsManager
        if ((this.worldsManager as any).sessions && typeof (this.worldsManager as any).sessions.size === 'number') {
            numSessions = (this.worldsManager as any).sessions.size;
        }
        if (numSessions === 0) {
            console.warn('[IA-BACKEND] No hay sesiones activas, no se iniciará el movimiento aleatorio de IA 2');
            return;
        }
        console.log('[IA-BACKEND] Iniciando intervalo de movimiento aleatorio');
        this.iaMoveInterval = setInterval(() => {
            if (this.worldsManager.getAllWorlds().length === 0) {
                console.warn('[IA-BACKEND] No hay mundos disponibles, no se realizará el movimiento aleatorio de IA');
                return;
            };
            const x = Math.floor(Math.random() * 800) + 100;
            const y = Math.floor(Math.random() * 400) + 100;
            const position = { x, y };

            // Log de movimiento IA dentro del mundo
            const currentWorld = this.aiManager.getState().currentWorld;
            Logger.logIAMoveInWorld(currentWorld, position);
            this.io?.emit('ia-move', { position });
        }, 3000);
    }

    public stopIAIntervalsIfNoSessions() {
        this.clearIntervalIfExists(this.iaMoveInterval, 'movimiento (sin sesiones activas)');
        this.clearIntervalIfExists(this.iaWorldInterval, 'cambio de mundo (sin sesiones activas)');
    }

    public clearIntervalIfExists(interval: NodeJS.Timeout | null, label: string): null {
        if (interval) {
            clearInterval(interval);
            console.log(`[IA-BACKEND] Intervalo de ${label} limpiado`);
        }
        return null;
    }

    // Métodos para exponer el control de los intervalos
    public getMoveInterval() { return this.iaMoveInterval; }
    public getWorldInterval() { return this.iaWorldInterval; }
    public setMoveInterval(val: NodeJS.Timeout | null) { this.iaMoveInterval = val; }
    public setWorldInterval(val: NodeJS.Timeout | null) { this.iaWorldInterval = val; }
}
