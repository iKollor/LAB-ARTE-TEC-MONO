import { io, Socket } from "socket.io-client";

export class SocketController {
    private socket!: Socket;
    // Detecta el host actual (localhost o IPv4) y el protocolo
    private BACKEND_URL: string;

    constructor(worldId: string | null) {
        // Detecta el protocolo y host del frontend para conectar al backend
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const port = 3000; // Cambia si tu backend usa otro puerto
        this.BACKEND_URL = `${protocol}://${host}:${port}`;
        this.connect(worldId);
    }



    public connect(worldId: string | null) {
        this.socket = io(this.BACKEND_URL, {
            auth: { worldId: worldId ?? undefined },
        });
    }

    public getSocket(): Socket {
        return this.socket;
    }

    // Suscripción a world-assigned con callback tipado
    public onWorldAssigned(callback: (data: any) => void) {
        this.socket.on('world-assigned', callback);
    }

    public offWorldAssigned(callback: (data: any) => void) {
        this.socket.off('world-assigned', callback);
    }

    // Emisión de ia-born
    public emitIABorn() {
        this.socket.emit('ia-born');
    }

    // Suscripción a worlds-count-changed con callback tipado
    public onWorldsCountChanged(callback: (data: { count: number }) => void) {
        this.socket.on('worlds-count-changed', callback);
    }
    public offWorldsCountChanged(callback: (data: { count: number }) => void) {
        this.socket.off('worlds-count-changed', callback);
    }
}
