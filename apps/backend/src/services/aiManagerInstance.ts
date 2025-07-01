import { AIManager } from '../services/aiManager';

// Instancia global de AIManager (puedes mejorar esto según tu arquitectura)
let aiManager: AIManager | null = new AIManager({
    currentAction: '',
    decisionPoints: [],
    currentWorld: '',
    lastUpdated: new Date(),
});

export function destroyAIManager() {
    aiManager = null;
}

export function recreateAIManager() {
    aiManager = new AIManager({
        currentAction: '',
        decisionPoints: [],
        currentWorld: '',
        lastUpdated: new Date(),
    });
}

export function getAIManager() {
    return aiManager;
}
