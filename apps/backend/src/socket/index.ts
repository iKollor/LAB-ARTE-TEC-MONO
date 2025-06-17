import { Server } from "socket.io";
import { WorldManager } from '../services/worldManager';
import { v4 as uuidv4 } from 'uuid';

let io: Server;
let worldManager: WorldManager;

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