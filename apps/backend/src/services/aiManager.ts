import { AIState } from '../types';

export class AIManager {
    private state: AIState;

    constructor(initialState: AIState) {
        this.state = initialState;
    }

    public processDecision(): void {
        // Implementar la lógica para procesar decisiones de la IA
        // Basado en el estado actual del juego
    }

    public performAction(): void {
        // Implementar la lógica para realizar acciones de la IA
        // Dependiendo de las decisiones tomadas
    }

    public updateState(newState: AIState): void {
        this.state = newState;
    }

    public getState(): AIState {
        return this.state;
    }

    // Métodos para controlar la IA desde el backend
    public moveTo(position: { x: number, y: number }) {
        this.state.currentAction = `moveTo (${position.x}, ${position.y})`;
        this.state.lastUpdated = new Date();
    }

    public speak(text: string) {
        this.state.currentAction = `speak: ${text}`;
        this.state.lastUpdated = new Date();
    }

    public listen() {
        this.state.currentAction = 'listen';
        this.state.lastUpdated = new Date();
    }

    public changeWorld(worldId: string) {
        this.state.currentWorld = worldId;
        this.state.currentAction = `changeWorld: ${worldId}`;
        this.state.lastUpdated = new Date();
    }

    public interact(target: string) {
        this.state.currentAction = `interact with ${target}`;
        this.state.lastUpdated = new Date();
    }
    public getCurrentWorldId(): string {
        return this.state.currentWorld || '';
    }
}