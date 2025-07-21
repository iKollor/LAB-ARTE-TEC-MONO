// --- Endpoint de prueba Gemini Live texto ---

import 'dotenv/config';
import express from 'express';
import { createAudioUploadRouter } from './routes/audioUpload';
import { createServer } from 'http';
import { SocketManager, registerIaCurrentWorldEndpoint } from './socket';
import { WorldsManager } from './services/worldsManager';
import { AIManager } from './services/aiManager';
import { GeminiService } from './services/geminiService';
import { AIState } from './types';
import cors from 'cors';


const app = express();
app.use(cors({
    origin: ["http://localhost:4321", "http://192.168.100.130:4321"],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-world-id"]
}));

const httpServer = createServer(app);


// --- Inicialización de servicios globales ---
const worldsManager = new WorldsManager();

// Estado global de la IA (IAState)
const initialAIState: AIState = {
    currentAction: '',
    currentWorld: worldsManager.getOriginWorldId() || '',
    iaBorn: false, // Estado global, no por mundo
    lastUpdated: new Date(),
};
const aiManager = new AIManager(initialAIState);

// SocketManager y servicios conectados al estado global
const socketManager = new SocketManager(httpServer, worldsManager, aiManager);
const geminiServiceWithSocket = new GeminiService(worldsManager, socketManager);
const audioUploadRouter = createAudioUploadRouter({ worldsManager, geminiService: geminiServiceWithSocket, aiManager, socketManager });

// Endpoint REST para exponer el estado global de la IA
registerIaCurrentWorldEndpoint(app, aiManager);

app.get('/', (req, res) => {
    res.send('Servidor en funcionamiento');
});


app.use('/api', audioUploadRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});