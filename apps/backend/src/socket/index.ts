import { Server } from "socket.io";
import { WorldManager } from '../services/worldManager';
import { v4 as uuidv4 } from 'uuid';
import { getAIManager, destroyAIManager, recreateAIManager } from '../services/aiManagerInstance';

let io: Server;
let worldManager: WorldManager;

let iaHasBorn = false;
let iaIntervalsStarted = false;
let iaMoveInterval: NodeJS.Timeout | null = null;
let iaWorldInterval: NodeJS.Timeout | null = null;

let activeSessions = 0;

function startRandomIAMovement() {
    if (iaMoveInterval) {
        clearInterval(iaMoveInterval);
        console.log('[IA-BACKEND] Intervalo anterior de movimiento limpiado');
    }
    if (activeSessions === 0) return;
    console.log('[IA-BACKEND] Iniciando intervalo de movimiento aleatorio');
    iaMoveInterval = setInterval(() => {
        if (activeSessions === 0) {
            stopIAIntervalsIfNoSessions();
            return;
        }
        // No emitir si no hay mundos activos
        if (worldManager.getAllWorlds().length === 0) {
            // Ya no se debe llamar a stopIAIntervalsIfNoWorlds, solo salir
            return;
        }
        // Generar posición aleatoria dentro de un rango (ajusta según tu mundo)
        const x = Math.floor(Math.random() * 800) + 100; // ejemplo: entre 100 y 900
        const y = Math.floor(Math.random() * 400) + 100; // ejemplo: entre 100 y 500
        const position = { x, y };
        if (io) {
            io.emit('ia-move', { position });
            console.log('[IA-BACKEND] Emitiendo ia-move:', { position });
        } else {
            console.log('[IA-BACKEND] io no está definido, no se emite ia-move');
        }
    }, 3000); // cada 3 segundos
}

function startRandomIAWorldChange() {
    if (iaWorldInterval) {
        clearInterval(iaWorldInterval);
        console.log('[IA-BACKEND] Intervalo anterior de cambio de mundo limpiado');
    }
    if (activeSessions === 0) return;
    console.log('[IA-BACKEND] Iniciando intervalo de cambio de mundo aleatorio');
    iaWorldInterval = setInterval(() => {
        if (activeSessions === 0) {
            stopIAIntervalsIfNoSessions();
            return;
        }
        // No emitir si no hay mundos activos
        if (worldManager.getAllWorlds().length < 2) {
            // Solo emitir ia-change-world si hay 2 o más mundos activos
            return;
        }
        // Filtrar mundos que NO estén pendientes de destrucción
        const allWorlds = worldManager.getAllWorlds().filter(w => !w.pendingDestroy);
        if (allWorlds.length < 2) return;
        // Elegir un mundo al azar
        const randomWorld = allWorlds[Math.floor(Math.random() * allWorlds.length)];
        if (!randomWorld) return;
        const aiManager = getAIManager();
        if (aiManager) aiManager.changeWorld(randomWorld.id);
        console.log('[IA-BACKEND] Emitiendo ia-change-world:', { worldId: randomWorld.id, allWorlds: allWorlds.map(w => w.id) });
        io.emit('ia-change-world', { worldId: randomWorld.id });
    }, 3000);
}

function stopIAIntervalsIfNoSessions() {
    if (iaMoveInterval) {
        clearInterval(iaMoveInterval);
        iaMoveInterval = null;
        console.log('[IA-BACKEND] Intervalo de movimiento detenido (sin sesiones activas)');
    }
    if (iaWorldInterval) {
        clearInterval(iaWorldInterval);
        iaWorldInterval = null;
        console.log('[IA-BACKEND] Intervalo de cambio de mundo detenido (sin sesiones activas)');
    }
}

// Elimina el mundo y detiene intervalos IA si no quedan mundos activos
function deleteWorldAndCheckIA(worldId: string) {
    worldManager.deleteWorld(worldId);
    console.log(`Mundo eliminado tras 20s de inactividad: ${worldId}`);
    // Solo destruir la IA si ya no quedan mundos activos
    if (worldManager.getAllWorlds().length === 0) {
        destroyAIManager();
        console.log('[IA-BACKEND] Instancia global de IA destruida (sin mundos activos)');
        if (io) io.emit('ia-destroyed');
    }
}

// Manejador de timeouts de eliminación de mundos
const worldDeleteTimeouts: Map<string, NodeJS.Timeout> = new Map();

function scheduleWorldDeletion(worldId: string) {
    if (!worldDeleteTimeouts.has(worldId)) {
        const timeout = setTimeout(() => {
            deleteWorldAndCheckIA(worldId);
            worldDeleteTimeouts.delete(worldId);
        }, 20000); // 20 segundos
        worldDeleteTimeouts.set(worldId, timeout);
    }
}

function cancelWorldDeletion(worldId: string) {
    if (worldDeleteTimeouts.has(worldId)) {
        clearTimeout(worldDeleteTimeouts.get(worldId));
        worldDeleteTimeouts.delete(worldId);
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

        // Asignar mundo único por usuario/sesión

        let worldId = socket.handshake.auth.worldId;
        let worldExist = false;
        let world = worldManager.getWorld(worldId);
        if (!world) {
            worldId = uuidv4();
            worldManager.createWorld(worldId, {
                id: worldId,
                createdAt: new Date(),
                iaBorn: false, // Por defecto, ningún mundo nuevo tiene iaBorn
            });
            world = worldManager.getWorld(worldId);
            worldExist = false;
            // Si es el primer mundo, recrear la IA
            if (worldManager.getOriginWorldId() === worldId) {
                recreateAIManager();
                console.log(`[BACKEND] IA recreada para el nuevo mundo de origen: ${worldId}`);
                iaHasBorn = false; // Solo se marca true cuando nazca realmente
                // No emitir ia-change-world aquí, solo cuando nazca la IA
            }
        } else {
            worldExist = true;
        }
        const isOrigin = !!world?.isOrigin;
        // iaBorn ahora es global, no por mundo
        let iaBorn = iaHasBorn;
        worldManager.addSession(socket.id, {
            id: socket.id,
            worldId,
            joinedAt: new Date(),
        });
        console.log(`[SOCKET] Emitiendo world-assigned:`, { worldId, isOrigin, worldExist, iaBorn });
        socket.emit('world-assigned', { worldId, isOrigin, worldExist, iaBorn });

        // Mostrar todos los worldId actuales en cada conexión
        const allWorlds = worldManager.getAllWorlds().map(w => ({ id: w.id, isOrigin: w.isOrigin }));
        console.log("Worlds actuales:", allWorlds);

        // Al conectar, si la IA ya había nacido globalmente y el mundo vuelve a estar activo, asegurar que la IA esté asignada a algún mundo y emitir ia-change-world si es necesario
        if (iaBorn && activeSessions > 0) {
            const allWorlds = worldManager.getAllWorlds().filter(w => !w.pendingDestroy);
            // Si solo hay un mundo y estaba pendiente de destrucción, reanudar intervalos y reasignar IA
            if (allWorlds.length === 1 && allWorlds[0].id === worldId && allWorlds[0].pendingDestroy) {
                startRandomIAMovement();
                startRandomIAWorldChange();
                allWorlds[0].pendingDestroy = false;
                // Reasignar IA explícitamente al mundo reactivado
                worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                allWorlds[0].iaBorn = true;
                io.emit('ia-change-world', { worldId });
                console.log('[IA-BACKEND] IA reanudada y reasignada tras reconexión al único mundo pendiente de destrucción:', worldId);
            } else {
                // Si tras la reconexión ahora hay 2 o más mundos activos, SIEMPRE reanudar el intervalo y forzar un cambio de mundo inmediato
                if (allWorlds.length >= 2) {
                    // Siempre reanudar el intervalo si no está activo
                    if (!iaWorldInterval) {
                        startRandomIAWorldChange();
                        console.log('[IA-BACKEND] Intervalo de cambio de mundo reanudado tras reconexión, hay', allWorlds.length, 'mundos activos.');
                    }
                    // No forzar más cambios de mundo aquí, dejar que el intervalo se encargue
                }
            }
        }

        // Escuchar comandos de IA desde el frontend o panel de control
        socket.on('ia-move', (data) => {
            console.log('[IA-BACKEND] Recibido ia-move desde frontend:', data);
            const aiManager = getAIManager();
            if (aiManager) aiManager.moveTo(data.position);
            io.emit('ia-move', data); // Reenvía a todos los clientes
        });
        socket.on('ia-speak', (data) => {
            console.log('[IA-BACKEND] Recibido ia-speak desde frontend:', data);
            const aiManager = getAIManager();
            if (aiManager) aiManager.speak(data.text);
            io.emit('ia-speak', data);
        });
        socket.on('ia-listen', () => {
            console.log('[IA-BACKEND] Recibido ia-listen desde frontend');
            const aiManager = getAIManager();
            if (aiManager) aiManager.listen();
            io.emit('ia-listen');
        });
        socket.on('ia-change-world', (data) => {
            console.log('[IA-BACKEND] Recibido ia-change-world desde frontend:', data);
            // Solo permitir cambio de mundo si el destino existe y no está pendiente de destrucción
            const targetWorld = worldManager.getWorld(data.worldId);
            if (targetWorld && !targetWorld.pendingDestroy) {
                const aiManager = getAIManager();
                if (aiManager) aiManager.changeWorld(data.worldId);
                io.emit('ia-change-world', data);
            } else {
                console.log('[IA-BACKEND] Cambio de mundo ignorado: mundo no existe o está pendiente de destrucción', data.worldId);
            }
        });
        socket.on('ia-interact', (data) => {
            console.log('[IA-BACKEND] Recibido ia-interact desde frontend:', data);
            const aiManager = getAIManager();
            if (aiManager) aiManager.interact(data.target);
            io.emit('ia-interact', data);
        });
        socket.on('ia-born', () => {
            console.log('[IA-BACKEND] Recibido ia-born desde frontend');
            // Solo permitir el nacimiento si la IA global NO ha nacido
            if (!iaHasBorn) {
                iaHasBorn = true;
                // Marcar solo un mundo con iaBorn: el actual
                worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                const w = worldManager.getWorld(worldId);
                if (w) w.iaBorn = true;
                // Solo iniciar intervalos si hay sesiones activas
                if (activeSessions > 0) {
                    startRandomIAMovement();
                    startRandomIAWorldChange();
                    console.log('[IA-BACKEND] ¡IA ha nacido! Comenzando a emitir acciones.');
                }
                // Emitir ia-change-world para que todos los clientes sepan dónde está la IA
                io.emit('ia-change-world', { worldId });
            } else {
                // Si ya había nacido globalmente, ignorar el evento
                console.log('[IA-BACKEND] Evento ia-born ignorado: la IA ya había nacido globalmente.');
            }
        });

        socket.on("disconnect", () => {
            const session = worldManager.getSession(socket.id);
            worldManager.removeSession(socket.id);
            console.log("User disconnected: " + socket.id);
            activeSessions = Math.max(0, activeSessions - 1);
            if (activeSessions === 0) {
                stopIAIntervalsIfNoSessions();
            }
            // Lógica IA: si el mundo se queda sin sesiones y hay otro mundo disponible, mover la IA inmediatamente
            if (session) {
                const worldId = session.worldId;
                const stillActive = Array.from(worldManager.getAllWorlds()).some(w => w.id === worldId && !w.pendingDestroy);
                if (!stillActive) {
                    // Buscar otro mundo disponible (no pendiente de destrucción)
                    const otherWorlds = worldManager.getAllWorlds().filter(w => w.id !== worldId && !w.pendingDestroy);
                    if (otherWorlds.length > 0) {
                        // Marcar iaBorn solo en el target y actualizar global
                        worldManager.getAllWorlds().forEach(w => { w.iaBorn = false; });
                        const targetWorld = otherWorlds[0];
                        targetWorld.iaBorn = true;
                        iaHasBorn = true;
                        const aiManager = getAIManager();
                        if (aiManager) aiManager.changeWorld(targetWorld.id);
                        io.emit('ia-change-world', { worldId: targetWorld.id });
                        console.log('[IA-BACKEND] IA movida automáticamente al mundo disponible tras desconexión (solo un mundo con iaBorn):', targetWorld.id);
                    } else {
                        // No hay más mundos disponibles, programa la eliminación con delay y marca iaBorn global en false
                        iaHasBorn = false;
                        scheduleWorldDeletion(worldId);
                    }
                } else {
                    cancelWorldDeletion(worldId);
                }
            }
        });
    });
};

export const emitEvent = (event: string, data: any) => {
    if (io) {
        io.emit(event, data);
    }
};