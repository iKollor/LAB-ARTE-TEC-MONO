// --- Endpoint de prueba Gemini Live texto ---

import 'dotenv/config';
import express from 'express';
import { createAudioUploadRouter } from './routes/audioUpload';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { SocketManager, registerIaCurrentWorldEndpoint } from './socket';
import { WorldsManager } from './services/worldsManager';
import { AIManager } from './services/aiManager';
import { GeminiService } from './services/geminiService';
import { AIState } from './types';
import cors from 'cors';



import os from 'os';
const interfaces = os.networkInterfaces();
let localIp = 'localhost'; // Valor por defecto
for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
        }
    }
}

const allowedOrigins = [
    `http://localhost:4321`,
    `https://localhost:4321`,
    `http://${localIp}:4321`,
    `https://${localIp}:4321`,
];

const app = express();
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-world-id"]
}));

import path from 'path';
let server: http.Server | https.Server;
let usingHttps = false;
const certPath = path.resolve(__dirname, '../../../cert.pem');
const keyPath = path.resolve(__dirname, '../../../key.pem');
console.log('[HTTPS] Buscando certificados en:', certPath, keyPath);
try {
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    server = https.createServer({ key, cert }, app);
    usingHttps = true;
    console.log('[HTTPS] Servidor iniciado en modo seguro');
} catch (e) {
    console.warn('[HTTPS] Certificados no encontrados o inválidos, usando HTTP');
    if (e instanceof Error) {
        console.error('[HTTPS] Error:', e.message);
    }
    server = http.createServer(app);
}


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
const socketManager = new SocketManager(server, worldsManager, aiManager);
const geminiServiceWithSocket = new GeminiService(worldsManager, aiManager, socketManager);
const audioUploadRouter = createAudioUploadRouter({ worldsManager, geminiService: geminiServiceWithSocket, aiManager, socketManager });

// Endpoint REST para exponer el estado global de la IA
registerIaCurrentWorldEndpoint(app, aiManager);

app.get('/', (req, res) => {
    res.send('Servidor en funcionamiento');
});


app.use('/api', audioUploadRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
    if (usingHttps) {
        console.log(`Servidor escuchando en https://localhost:${PORT}`);
        console.log(`Servidor escuchando en https://${localIp}:${PORT}`);
    } else {
        console.log(`Servidor escuchando en http://localhost:${PORT}`);
        console.log(`Servidor escuchando en http://${localIp}:${PORT}`);
    }
});