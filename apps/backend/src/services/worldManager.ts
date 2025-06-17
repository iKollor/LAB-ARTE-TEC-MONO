import { World, Session } from '../types';

const DELAY_TO_DELETE_WORLD = 20000; // 20 segundos

export class WorldManager {
    private worlds: Map<string, World>;
    private sessions: Map<string, Session>;
    private originWorldId: string | null = null;
    private worldDeleteTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        this.worlds = new Map();
        this.sessions = new Map();
    }

    createWorld(worldId: string, worldData: World): void {
        if (this.worlds.has(worldId)) {
            throw new Error(`World with ID ${worldId} already exists.`);
        }
        // Si no hay mundos, este es el mundo original
        if (this.worlds.size === 0) {
            worldData.isOrigin = true;
            this.originWorldId = worldId;
        } else {
            worldData.isOrigin = false;
        }
        this.worlds.set(worldId, worldData);
    }

    deleteWorld(worldId: string): void {
        if (!this.worlds.has(worldId)) {
            throw new Error(`World with ID ${worldId} does not exist.`);
        }
        this.worlds.delete(worldId);
    }

    getWorld(worldId: string): World | undefined {
        return this.worlds.get(worldId);
    }

    addSession(sessionId: string, sessionData: Session): void {
        if (this.sessions.has(sessionId)) {
            throw new Error(`Session with ID ${sessionId} already exists.`);
        }
        this.sessions.set(sessionId, sessionData);
        // Si hay un timeout de eliminación pendiente para este mundo, cancelarlo
        const worldId = sessionData.worldId;
        if (this.worldDeleteTimeouts.has(worldId)) {
            clearTimeout(this.worldDeleteTimeouts.get(worldId));
            this.worldDeleteTimeouts.delete(worldId);
            console.log(`Cancelada la eliminación del mundo por reconexión: ${worldId}`);
        }
    }

    removeSession(sessionId: string): void {
        if (!this.sessions.has(sessionId)) {
            throw new Error(`Session with ID ${sessionId} does not exist.`);
        }
        const session = this.sessions.get(sessionId);
        this.sessions.delete(sessionId);
        // Si no quedan sesiones para el mundo, programa la eliminación con delay
        if (session) {
            const worldId = session.worldId;
            const stillActive = Array.from(this.sessions.values()).some(s => s.worldId === worldId);
            if (!stillActive) {
                // Si ya hay un timeout, no lo dupliques
                if (!this.worldDeleteTimeouts.has(worldId)) {
                    const timeout = setTimeout(() => {
                        this.deleteWorld(worldId);
                        this.worldDeleteTimeouts.delete(worldId);
                        console.log(`Mundo eliminado tras 20s de inactividad: ${worldId}`);
                    }, DELAY_TO_DELETE_WORLD); // 20 segundos de gracia
                    this.worldDeleteTimeouts.set(worldId, timeout);
                }
            } else {
                // Si alguien se reconecta antes de eliminar, limpia el timeout
                if (this.worldDeleteTimeouts.has(worldId)) {
                    clearTimeout(this.worldDeleteTimeouts.get(worldId));
                    this.worldDeleteTimeouts.delete(worldId);
                }
            }
        }
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId);
    }

    getAllWorlds(): World[] {
        return Array.from(this.worlds.values());
    }

    getOriginWorldId(): string | null {
        return this.originWorldId;
    }
}