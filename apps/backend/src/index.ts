import express from 'express';
import { createServer } from 'http';
import { initializeSocket } from './socket';
import { WorldManager } from './services/worldManager';
import { AIManager } from './services/aiManager';
import { AIState } from './types';

const app = express();
const httpServer = createServer(app);

const worldManager = new WorldManager();
initializeSocket(httpServer, worldManager);

const initialAIState: AIState = {
    currentAction: '',
    decisionPoints: [],
    currentWorld: worldManager.getOriginWorldId() || '',
    lastUpdated: new Date(),
};
const aiManager = new AIManager(initialAIState);

app.get('/', (req, res) => {
    res.send('Servidor en funcionamiento');
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});