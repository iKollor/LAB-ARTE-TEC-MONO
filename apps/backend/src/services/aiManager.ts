
import { AIState } from '../types';

export class AIManager {
    private state: AIState;

    constructor(initialState: AIState) {
        this.state = initialState;
    }

    /**
     * Obtiene el estado completo de la IA
     */
    public getState(): AIState {
        return { ...this.state };
    }

    /**
     * Actualiza el estado completo de la IA
     */
    public setState(newState: AIState): void {
        this.state = { ...newState };
    }

    /**
     * Actualiza solo la posición/mundo actual de la IA
     */
    public setCurrentWorld(worldId: string): void {
        this.state.currentWorld = worldId;
        this.state.lastUpdated = new Date();
    }

    /**
     * Obtiene el mundo actual de la IA
     */
    public getCurrentWorldId(): string {
        return this.state.currentWorld;
    }

    /**
     * Actualiza la acción actual de la IA
     */
    public setCurrentAction(action: string): void {
        this.state.currentAction = action;
        this.state.lastUpdated = new Date();
    }

}