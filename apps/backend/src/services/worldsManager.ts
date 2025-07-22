const DELAY_TO_DELETE_WORLD = 20000; // 20 segundos

import { World, Session } from '../types';
import { EventEmitter } from 'events';

export class WorldsManager extends EventEmitter {
    private worlds: Map<string, World>;
    private sessions: Map<string, Session>;
    private originWorldId: string | null = null;
    // Ahora almacenamos { timeout, token } para cada mundo
    private worldDeleteTimeouts: Map<string, { timeout: NodeJS.Timeout, token: string }> = new Map();

    constructor() {
        super();
        this.worlds = new Map();
        this.sessions = new Map();

        console.log('[WORLD-MANAGER] WorldsManager initialized');
        // listar todos los mundos existentes
        this.getAllWorlds().forEach(world => {
            console.log(`[WORLD-MANAGER] Mundo existente: ${world.id}, isOrigin=${world.isOrigin}`);
        });
    }

    createWorld(worldId: string, worldData: World): void {
        if (this.worlds.has(worldId)) {
            console.warn(`[WorldsManager] World with ID ${worldId} already exists.`);
            return;
        }
        // Si no hay ningún mundo, este será origin
        if (this.worlds.size === 0) {
            worldData.isOrigin = true;
            this.originWorldId = worldId;
            console.log(`[WORLD-MANAGER] Primer mundo creado: ${worldId} (origin)`);
        } else {
            worldData.isOrigin = false;
        }
        worldData.pendingDestroy = false;
        this.worlds.set(worldId, worldData);
        console.log(`[WORLD-MANAGER] createWorld: worldId=${worldId}, isOrigin=${worldData.isOrigin}`);
        // Emitir evento personalizado con el número de mundos activos
        this.emit('worldsCountChanged', this.worlds.size);
    }
    // Utilidad para desarrollo: limpiar todos los mundos y sesiones
    resetAll() {
        this.worlds.clear();
        this.sessions.clear();
        this.originWorldId = null;
        this.worldDeleteTimeouts.forEach(({ timeout }) => clearTimeout(timeout));
        this.worldDeleteTimeouts.clear();
        console.log('[WORLD-MANAGER] Todos los mundos y sesiones han sido reseteados');
    }

    deleteWorld(worldId: string): void {
        if (!this.worlds.has(worldId)) {
            console.warn(`[WorldsManager] World with ID ${worldId} does not exist.`);
            return;
        }
        this.worlds.delete(worldId);
        // Si ya no quedan mundos, emitir evento propio
        if (this.worlds.size === 0) {
            this.emit('allWorldsDeleted');
        }
    }

    getWorld(worldId: string): World | undefined {
        return this.worlds.get(worldId);
    }

    addSession(sessionId: string, sessionData: Session): void {
        if (this.sessions.has(sessionId)) {
            console.warn(`[WorldsManager] Session with ID ${sessionId} already exists.`);
            return;
        }
        this.sessions.set(sessionId, sessionData);
        const worldId = sessionData.worldId;
        console.log(`[WORLD-MANAGER] addSession: sessionId=${sessionId}, worldId=${worldId}`);
        // Siempre cancelar cualquier timeout pendiente para este mundo
        if (this.worldDeleteTimeouts.has(worldId)) {
            const { timeout } = this.worldDeleteTimeouts.get(worldId)!;
            clearTimeout(timeout);
            this.worldDeleteTimeouts.delete(worldId);
            const world = this.worlds.get(worldId);
            if (world) world.pendingDestroy = false;
            console.log(`[WORLD-MANAGER] Timeout de destrucción cancelado al agregar sesión a mundo ${worldId}`);
        }
    }

    removeSession(sessionId: string): void {
        if (!this.sessions.has(sessionId)) {
            console.warn(`[WorldsManager] Session with ID ${sessionId} does not exist.`);
            return;
        }
        const session = this.sessions.get(sessionId);
        this.sessions.delete(sessionId);
        if (!session) return;
        const worldId = session.worldId;
        console.log(`[WORLD-MANAGER] removeSession: sessionId=${sessionId}, worldId=${worldId}`);
        const stillActive = Array.from(this.sessions.values()).some(s => s.worldId === worldId);
        const world = this.worlds.get(worldId);
        if (!stillActive && world) {
            world.pendingDestroy = true;
            if (!this.worldDeleteTimeouts.has(worldId)) {
                // Generar un identificador único para este timeout
                const timeoutToken = Date.now() + '-' + Math.random();
                const timeoutId = timeoutToken; // Para logs
                const timeout = setTimeout(() => {
                    const entry = this.worldDeleteTimeouts.get(worldId);
                    if (!entry || entry.token !== timeoutToken) {
                        return;
                    }
                    const currentWorld = this.worlds.get(worldId);
                    const activeSessions = Array.from(this.sessions.values()).some(s => s.worldId === worldId);
                    if (activeSessions) {
                        if (currentWorld) currentWorld.pendingDestroy = false;
                        this.worldDeleteTimeouts.delete(worldId);
                        return;
                    }
                    console.log(`[WORLD-MANAGER] [Timeout ${timeoutId}] Eliminando mundo por inactividad: ${worldId}`);
                    this.deleteWorld(worldId);
                    this.worldDeleteTimeouts.delete(worldId);
                }, DELAY_TO_DELETE_WORLD);
                this.worldDeleteTimeouts.set(worldId, { timeout, token: timeoutToken });
                console.log(`[WORLD-MANAGER] Timeout de destrucción programado para mundo ${worldId} [Timeout ${timeoutId}]`);
                // Emitir worlds-count-changed inmediatamente al desconectarse la sesión
                const activeWorlds = Array.from(this.worlds.values()).filter(w => !w.pendingDestroy).length;
                this.emit('worldsCountChanged', activeWorlds);
            }
        } else if (world) {
            if (this.worldDeleteTimeouts.has(worldId)) {
                const { timeout } = this.worldDeleteTimeouts.get(worldId)!;
                clearTimeout(timeout);
                this.worldDeleteTimeouts.delete(worldId);
            }
            world.pendingDestroy = false;
            // Emitir worlds-count-changed si el mundo sigue activo
            const activeWorlds = Array.from(this.worlds.values()).filter(w => !w.pendingDestroy).length;
            this.emit('worldsCountChanged', activeWorlds);
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

// Exporta una instancia singleton global de WorldManager
export const worldManager = new WorldsManager();