import { io, Socket } from "socket.io-client";


const BACKEND_URL = "http://192.168.100.130:3000"; // Cambia si usas otro puerto

let worldId = localStorage.getItem("worldId");

const socket: Socket = io(BACKEND_URL, {
    auth: { worldId },
});

socket.on("world-assigned", (data: { worldId: string; isOrigin?: boolean }) => {
    worldId = data.worldId;
    localStorage.setItem("worldId", worldId);
    if (data.isOrigin) {
        console.log("¡Eres el primer mundo creado! La IA nacerá aquí. ID:", data.worldId);
    } else {
        console.log("Mundo asignado:", worldId);
    }
});

socket.on("disconnect", () => {
    console.log("Desconectado del servidor");
});

export default socket;