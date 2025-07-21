export class IAState {
    private bornValue: boolean;
    private currentWorldValue: string;

    constructor(born: boolean = false, currentWorld: string = '') {
        this.bornValue = born;
        this.currentWorldValue = currentWorld;
    }


    get born() {
        return this.bornValue;
    }
    set born(value: boolean) {
        this.bornValue = value;
    }


    get currentWorld() {
        return this.currentWorldValue;
    }
    set currentWorld(worldId: string) {
        this.currentWorldValue = worldId || '';
    }

    public reset() {
        this.bornValue = false;
        this.currentWorldValue = '';
    }
}
