import { AIManager } from '../services/aiManager';

// Instancia global de AIManager (puedes mejorar esto según tu arquitectura)
const aiManager = new AIManager({
    currentAction: '',
    decisionPoints: [],
    currentWorld: '',
    lastUpdated: new Date(),
});

export default aiManager;
