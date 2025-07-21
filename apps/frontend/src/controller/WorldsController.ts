import { type World } from '../types/world';



export class WorldsController {
    private currentWorld: World | null = null;

    constructor(initialWorld: World) {
        this.setWorld(initialWorld);
    }

    /**
     * Establece el mundo actual recibido del backend y lo persiste.
     */
    public setWorld(world: World) {
        this.currentWorld = {
            id: world.id,
            createdAt: world.createdAt || new Date().toISOString(),
            name: world.name,
            isOrigin: world.isOrigin,
            pendingDestroy: world.pendingDestroy
        };
        localStorage.setItem('worldData', JSON.stringify(this.currentWorld));
        localStorage.setItem('worldId', this.currentWorld.id);
    }

    public getCurrentWorld(): World | null {
        return this.currentWorld;
    }

    public getCurrentWorldId(): string {
        return this.currentWorld?.id ?? '';
    }

    public isOrigin(): boolean {
        return !!this.currentWorld?.isOrigin;
    }

    public isPendingDestroy(): boolean {
        return !!this.currentWorld?.pendingDestroy;
    }

    public worldExists(): boolean {
        return !!this.currentWorld;
    }
}
