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
        if (this.worlds.has(worldId)) throw new Error(`World with ID ${worldId} already exists.`);
        worldData.isOrigin = this.worlds.size === 0;
        if (worldData.isOrigin) this.originWorldId = worldId;
        worldData.pendingDestroy = false;
        worldData.iaBorn = false;
        this.worlds.set(worldId, worldData);
    }

    deleteWorld(worldId: string): void {
        if (!this.worlds.has(worldId)) throw new Error(`World with ID ${worldId} does not exist.`);
        this.worlds.delete(worldId);
    }

    getWorld(worldId: string): World | undefined {
        return this.worlds.get(worldId);
    }

    addSession(sessionId: string, sessionData: Session): void {
        if (this.sessions.has(sessionId)) throw new Error(`Session with ID ${sessionId} already exists.`);
        this.sessions.set(sessionId, sessionData);
        const worldId = sessionData.worldId;
        if (this.worldDeleteTimeouts.has(worldId)) {
            clearTimeout(this.worldDeleteTimeouts.get(worldId));
            this.worldDeleteTimeouts.delete(worldId);
            const world = this.worlds.get(worldId);
            if (world) world.pendingDestroy = false;
        }
    }

    removeSession(sessionId: string): void {
        if (!this.sessions.has(sessionId)) throw new Error(`Session with ID ${sessionId} does not exist.`);
        const session = this.sessions.get(sessionId);
        this.sessions.delete(sessionId);
        if (!session) return;
        const worldId = session.worldId;
        const stillActive = Array.from(this.sessions.values()).some(s => s.worldId === worldId);
        const world = this.worlds.get(worldId);
        if (!stillActive && world) {
            world.pendingDestroy = true;
            if (!this.worldDeleteTimeouts.has(worldId)) {
                const timeout = setTimeout(() => {
                    this.deleteWorld(worldId);
                    this.worldDeleteTimeouts.delete(worldId);
                    try {
                        const { stopIAIntervalsIfNoWorlds } = require('../../socket/index');
                        if (typeof stopIAIntervalsIfNoWorlds === 'function') stopIAIntervalsIfNoWorlds();
                    } catch (e) { }
                }, DELAY_TO_DELETE_WORLD);
                this.worldDeleteTimeouts.set(worldId, timeout);
            }
        } else if (world) {
            if (this.worldDeleteTimeouts.has(worldId)) {
                clearTimeout(this.worldDeleteTimeouts.get(worldId));
                this.worldDeleteTimeouts.delete(worldId);
            }
            world.pendingDestroy = false;
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