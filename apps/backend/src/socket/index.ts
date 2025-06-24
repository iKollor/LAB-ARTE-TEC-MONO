import { Server } from "socket.io";
import { WorldManager } from '../services/worldManager';
import { v4 as uuidv4 } from 'uuid';
import aiManager from '../services/aiManagerInstance';

let io: Server;
let worldManager: WorldManager;

let iaHasBorn = false;
let iaIntervalsStarted = false;
let iaMoveInterval: NodeJS.Timeout | null = null;
let iaWorldInterval: NodeJS.Timeout | null = null;

function startRandomIAMovement() {
    if (iaMoveInterval) {
        clearInterval(iaMoveInterval);
        console.log('[IA-BACKEND] Intervalo anterior de movimiento limpiado');
    }
    console.log('[IA-BACKEND] Iniciando intervalo de movimiento aleatorio');
    iaMoveInterval = setInterval(() => {
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
    console.log('[IA-BACKEND] Iniciando intervalo de cambio de mundo aleatorio');
    iaWorldInterval = setInterval(() => {
        const allWorlds = worldManager.getAllWorlds();
        if (allWorlds.length === 0) return;
        // Elegir un mundo al azar
        const randomWorld = allWorlds[Math.floor(Math.random() * allWorlds.length)];
        if (!randomWorld) return;
        aiManager.changeWorld(randomWorld.id);
        console.log('[IA-BACKEND] Emitiendo ia-change-world:', { worldId: randomWorld.id, allWorlds: allWorlds.map(w => w.id) });
        io.emit('ia-change-world', { worldId: randomWorld.id });
    }, 3000);
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

        // Asignar mundo único por usuario/sesión
        let worldId = socket.handshake.auth.worldId;
        // Si el worldId no existe en el backend, crea un nuevo mundo
        let world = worldManager.getWorld(worldId);
        if (!world) {
            worldId = uuidv4();
            worldManager.createWorld(worldId, {
                id: worldId,
                createdAt: new Date(),
            });
            world = worldManager.getWorld(worldId); // Solo una vez aquí
            if (worldManager.getOriginWorldId() === worldId) {
                console.log(`¡Primer mundo creado! ID: ${worldId}`);
                iaHasBorn = true;
                // Emitir el nacimiento de la IA en el mundo de origen
                io.emit('ia-change-world', { worldId });
            }
        }
        const isOrigin = !!world?.isOrigin;
        worldManager.addSession(socket.id, {
            id: socket.id,
            worldId,
            joinedAt: new Date(),
        });
        console.log(`[SOCKET] Emitiendo world-assigned:`, { worldId, isOrigin });
        socket.emit('world-assigned', { worldId, isOrigin });

        // Mostrar todos los worldId actuales en cada conexión
        const allWorlds = worldManager.getAllWorlds().map(w => ({ id: w.id, isOrigin: w.isOrigin }));
        console.log("Worlds actuales:", allWorlds);

        // Escuchar comandos de IA desde el frontend o panel de control
        socket.on('ia-move', (data) => {
            console.log('[IA-BACKEND] Recibido ia-move desde frontend:', data);
            aiManager.moveTo(data.position);
            io.emit('ia-move', data); // Reenvía a todos los clientes
        });
        socket.on('ia-speak', (data) => {
            console.log('[IA-BACKEND] Recibido ia-speak desde frontend:', data);
            aiManager.speak(data.text);
            io.emit('ia-speak', data);
        });
        socket.on('ia-listen', () => {
            console.log('[IA-BACKEND] Recibido ia-listen desde frontend');
            aiManager.listen();
            io.emit('ia-listen');
        });
        socket.on('ia-change-world', (data) => {
            console.log('[IA-BACKEND] Recibido ia-change-world desde frontend:', data);
            aiManager.changeWorld(data.worldId);
            io.emit('ia-change-world', data);
        });
        socket.on('ia-interact', (data) => {
            console.log('[IA-BACKEND] Recibido ia-interact desde frontend:', data);
            aiManager.interact(data.target);
            io.emit('ia-interact', data);
        });
        socket.on('ia-born', () => {
            console.log('[IA-BACKEND] Recibido ia-born desde frontend');
            setTimeout(() => {
                startRandomIAMovement();
                startRandomIAWorldChange();
                console.log('[IA-BACKEND] ¡IA ha nacido! Comenzando a emitir acciones.');
            }, 2000); // Espera 2 segundos tras el nacimiento
        });

        socket.on("disconnect", () => {
            worldManager.removeSession(socket.id);
            console.log("User disconnected: " + socket.id);
        });
    });
};

export const emitEvent = (event: string, data: any) => {
    if (io) {
        io.emit(event, data);
    }
};