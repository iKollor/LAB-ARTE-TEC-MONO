import { io, Socket } from "socket.io-client";

export class SocketController {
    private socket!: Socket;
    private BACKEND_URL = "localhost:3000"; // Cambia si usas otro puerto

    constructor(worldId: string | null) {
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
