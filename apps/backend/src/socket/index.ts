
import { Server } from "socket.io";
import { WorldManager } from '../services/worldManager';
import { v4 as uuidv4 } from 'uuid';
import { getAIManager, destroyAIManager, recreateAIManager } from '../services/aiManagerInstance';

let io: Server;
let worldManager: WorldManager;

let iaHasBorn = false;

let iaMoveInterval: NodeJS.Timeout | null = null;
let iaWorldInterval: NodeJS.Timeout | null = null;

let activeSessions = 0;


function clearIntervalIfExists(interval: NodeJS.Timeout | null, label: string): null {
    if (interval) {
        clearInterval(interval);
        console.log(`[IA-BACKEND] Intervalo de ${label} limpiado`);
    }
    return null;
}

function startRandomIAMovement() {
    iaMoveInterval = clearIntervalIfExists(iaMoveInterval, 'movimiento');
    if (activeSessions === 0) return;
    console.log('[IA-BACKEND] Iniciando intervalo de movimiento aleatorio');
    iaMoveInterval = setInterval(() => {
        if (activeSessions === 0) return stopIAIntervalsIfNoSessions();
        if (worldManager.getAllWorlds().length === 0) return;
        const x = Math.floor(Math.random() * 800) + 100;
        const y = Math.floor(Math.random() * 400) + 100;
        const position = { x, y };
        io?.emit('ia-move', { position });
        console.log('[IA-BACKEND] Emitiendo ia-move:', { position });
    }, 3000);
}

function startRandomIAWorldChange() {
    iaWorldInterval = clearIntervalIfExists(iaWorldInterval, 'cambio de mundo');
    if (activeSessions === 0) return;
    console.log('[IA-BACKEND] Iniciando intervalo de cambio de mundo aleatorio');
    iaWorldInterval = setInterval(() => {
        if (activeSessions === 0) return stopIAIntervalsIfNoSessions();
        const allWorlds = worldManager.getAllWorlds().filter(w => !w.pendingDestroy);
        const allWorldsFull = worldManager.getAllWorlds();
        if (allWorlds.length < 2) return;
        const randomWorld = allWorlds[Math.floor(Math.random() * allWorlds.length)];
        if (!randomWorld) return;
        const aiManager = getAIManager();
        aiManager?.changeWorld(randomWorld.id);
        io?.emit('ia-change-world', { worldId: randomWorld.id });
        console.log('[IA-BACKEND] Emitiendo ia-change-world:', {
            worldId: randomWorld.id,
            allWorlds: allWorlds.map(w => w.id),
            allWorldsFull: allWorldsFull.map(w => ({ id: w.id, pendingDestroy: w.pendingDestroy }))
        });
    }, 3000);
}

function stopIAIntervalsIfNoSessions() {
    iaMoveInterval = clearIntervalIfExists(iaMoveInterval, 'movimiento (sin sesiones activas)');
    iaWorldInterval = clearIntervalIfExists(iaWorldInterval, 'cambio de mundo (sin sesiones activas)');
}


function deleteWorldAndCheckIA(worldId: string) {
    const world = worldManager.getWorld(worldId);
    if (!world) {
        console.warn(`[IA-BACKEND] Intento de eliminar mundo inexistente: ${worldId}`);
        return;
    }
    worldManager.deleteWorld(worldId);
    console.log(`Mundo eliminado tras 20s de inactividad: ${worldId}`);
    if (worldManager.getAllWorlds().length === 0) {
        destroyAIManager();
        console.log('[IA-BACKEND] Instancia global de IA destruida (sin mundos activos)');
        io?.emit('ia-destroyed');
    }
}


const worldDeleteTimeouts: Map<string, NodeJS.Timeout> = new Map();

function scheduleWorldDeletion(worldId: string) {
    if (worldDeleteTimeouts.has(worldId)) return;
    const timeout = setTimeout(() => {
        deleteWorldAndCheckIA(worldId);
        worldDeleteTimeouts.delete(worldId);
    }, 20000);
    worldDeleteTimeouts.set(worldId, timeout);
}

function cancelWorldDeletion(worldId: string) {
    const timeout = worldDeleteTimeouts.get(worldId);
    if (timeout) {
        clearTimeout(timeout);
        worldDeleteTimeouts.delete(worldId);
        // Limpia pendingDestroy SIEMPRE si el mundo existe y fuerza ciclo IA si corresponde
        const world = worldManager.getWorld(worldId);
        if (world) {
            world.pendingDestroy = false;
            if (iaWorldInterval) {
                const allWorldsNoPending = worldManager.getAllWorlds().filter(w => !w.pendingDestroy);
                if (allWorldsNoPending.length >= 2) {
                    const randomWorld = allWorldsNoPending[Math.floor(Math.random() * allWorldsNoPending.length)];
                    if (randomWorld) {
                        getAIManager()?.changeWorld(randomWorld.id);
                        io?.emit('ia-change-world', { worldId: randomWorld.id });
                    }
                }
            }
        }
    }
}

export const initializeSocket = (httpServer: any, wm: WorldManager) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
        },
    });
    worldManager = wm;

    io.on("connection", (socket) => {
        console.log("A user connected: " + socket.id);

        activeSessions++;
        // Ya NO se inician los intervalos aquí


        // --- Asignación de mundo único por usuario/sesión ---
        // Asignación de mundo único por usuario/sesión
        let worldId = socket.handshake.auth.worldId;
        let world = worldManager.getWorld(worldId);
        const worldExist = !!world;
        if (!world) {
            worldId = uuidv4();
            worldManager.createWorld(worldId, {
                id: worldId,
                createdAt: new Date(),
                iaBorn: false,
                pendingDestroy: false
            });
            world = worldManager.getWorld(worldId);
            if (worldManager.getOriginWorldId() === worldId) {
                recreateAIManager();
                iaHasBorn = false;
            }
        }
        const isOrigin = !!world?.isOrigin;
        worldManager.addSession(socket.id, {
            id: socket.id,
            worldId,
            joinedAt: new Date(),
        });
        socket.emit('world-assigned', { worldId, isOrigin, worldExist, iaBorn: iaHasBorn });
        // Log de mundos actuales
        console.log(`[SOCKET] world-assigned:`, { worldId, isOrigin, worldExist, iaBorn: iaHasBorn });
        console.log("Worlds actuales:", worldManager.getAllWorlds().map(w => ({ id: w.id, isOrigin: w.isOrigin })));


        // Lógica de reconexión y reactivación de intervalos IA
        if (iaHasBorn && activeSessions > 0) {
            const allWorlds = worldManager.getAllWorlds().filter(w => !w.pendingDestroy);
            if (allWorlds.length === 1 && allWorlds[0].id === worldId && allWorlds[0].pendingDestroy) {
                startRandomIAMovement();
                startRandomIAWorldChange();
                allWorlds[0].pendingDestroy = false;
                worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                allWorlds[0].iaBorn = true;
                io.emit('ia-change-world', { worldId });
                console.log('[IA-BACKEND] IA reanudada y reasignada tras reconexión al único mundo pendiente de destrucción:', worldId);
            } else if (allWorlds.length >= 2 && !iaWorldInterval) {
                startRandomIAWorldChange();
                console.log('[IA-BACKEND] Intervalo de cambio de mundo reanudado tras reconexión, hay', allWorlds.length, 'mundos activos.');
            }
        }


        // --- Escuchar comandos de IA desde el frontend o panel de control ---
        const aiEvents = [
            {
                name: 'ia-move',
                handler: (data: any) => getAIManager()?.moveTo(data.position)
            },
            {
                name: 'ia-speak',
                handler: (data: any) => getAIManager()?.speak(data.text)
            },
            {
                name: 'ia-listen',
                handler: () => getAIManager()?.listen()
            },
            {
                name: 'ia-interact',
                handler: (data: any) => getAIManager()?.interact(data.target)
            },
        ];
        aiEvents.forEach(({ name, handler }) => {
            socket.on(name, (data: any) => {
                console.log(`[IA-BACKEND] Recibido ${name} desde frontend:`, data);
                handler(data);
                io.emit(name, data);
            });
        });

        socket.on('ia-change-world', (data) => {
            console.log('[IA-BACKEND] Recibido ia-change-world desde frontend:', data);
            const targetWorld = worldManager.getWorld(data.worldId);
            if (targetWorld && !targetWorld.pendingDestroy) {
                getAIManager()?.changeWorld(data.worldId);
                io.emit('ia-change-world', data);
            } else {
                console.log('[IA-BACKEND] Cambio de mundo ignorado: mundo no existe o está pendiente de destrucción', data.worldId);
            }
        });

        socket.on('ia-born', () => {
            console.log('[IA-BACKEND] Recibido ia-born desde frontend');
            if (!iaHasBorn) {
                iaHasBorn = true;
                worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                const w = worldManager.getWorld(worldId);
                if (w) w.iaBorn = true;
                if (activeSessions > 0) {
                    startRandomIAMovement();
                    startRandomIAWorldChange();
                    console.log('[IA-BACKEND] ¡IA ha nacido! Comenzando a emitir acciones.');
                }
                io.emit('ia-change-world', { worldId });
            } else {
                console.log('[IA-BACKEND] Evento ia-born ignorado: la IA ya había nacido globalmente.');
            }
        });


        socket.on("disconnect", () => {
            const session = worldManager.getSession(socket.id);
            worldManager.removeSession(socket.id);
            console.log("User disconnected: " + socket.id);
            activeSessions = Math.max(0, activeSessions - 1);
            if (activeSessions === 0) stopIAIntervalsIfNoSessions();
            if (!session) return;
            const worldId = session.worldId;
            // Solo mover la IA si está en el mundo que se desconectó
            const iaWorld = worldManager.getAllWorlds().find(w => w.iaBorn);
            const iaEstaEnEsteMundo = iaWorld && iaWorld.id === worldId;
            const stillActive = worldManager.getAllWorlds().some(w => w.id === worldId && !w.pendingDestroy);
            if (!stillActive && iaEstaEnEsteMundo) {
                const otherWorlds = worldManager.getAllWorlds().filter(w => w.id !== worldId && !w.pendingDestroy);
                if (otherWorlds.length > 0) {
                    worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                    const targetWorld = otherWorlds[0];
                    targetWorld.iaBorn = true;
                    iaHasBorn = true;
                    getAIManager()?.changeWorld(targetWorld.id);
                    io.emit('ia-change-world', { worldId: targetWorld.id });
                    console.log('[IA-BACKEND] IA movida automáticamente al mundo disponible tras desconexión (solo un mundo con iaBorn):', targetWorld.id);
                } else {
                    iaHasBorn = false;
                    scheduleWorldDeletion(worldId);
                }
            } else {
                // Si la IA no estaba en ese mundo, solo cancelar el borrado si corresponde
                cancelWorldDeletion(worldId);
            }
        });
    });
};


export const emitEvent = (event: string, data: any) => {
    io?.emit(event, data);
};