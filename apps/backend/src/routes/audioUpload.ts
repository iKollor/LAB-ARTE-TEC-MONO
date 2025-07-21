
import express from "express";
import multer from "multer";
import { setMicActiveState, getMicActiveState } from '../micState';
import type { WorldsManager } from "../services/worldsManager";
import type { GeminiService } from '../services/geminiService';
import type { AIManager } from '../services/aiManager';
import path from "path";
import fs from "fs";

// Tipado para dependencias inyectadas
interface AudioUploadRouterDeps {
    worldsManager: WorldsManager;
    geminiService: GeminiService;
    aiManager: AIManager;
    socketManager: { emitEvent: (event: string, data: any) => void };
}

export function createAudioUploadRouter({ worldsManager, geminiService, aiManager, socketManager }: AudioUploadRouterDeps) {
    const router = express.Router();
    const upload = multer();
    // Estado global del micrófono (cooldown y control de mundo)
    let globalMicCooldownUntil = 0;

    router.post("/audio-upload", upload.single("file"), async (req, res) => {
        try {
            // --- Validaciones y estado global ---
            const worldId = req.headers["x-world-id"]?.toString() || "";
            if (!worldId) return res.status(400).json({ error: "Falta worldId" });
            const now = Date.now();
            if (getMicActiveState()) return res.status(429).json({ error: "El micrófono global ya está en uso por otro cliente" });
            if (globalMicCooldownUntil > now) {
                const wait = Math.ceil((globalMicCooldownUntil - now) / 1000);
                return res.status(429).json({ error: `Debes esperar ${wait} segundos para volver a grabar (cooldown global)` });
            }
            if (!worldsManager) return res.status(500).json({ error: "WorldsManager no disponible" });
            const world = worldsManager.getWorld(worldId);
            if (!world) return res.status(403).json({ error: "Mundo no válido" });
            if (!aiManager) return res.status(500).json({ error: "AIManager no disponible" });
            const iaEnEsteMundo = aiManager.getState().currentWorld === worldId;
            if (!iaEnEsteMundo) return res.status(403).json({ error: "La IA no está presente en este mundo" });

            setMicActiveState(true);
            socketManager.emitEvent('mic-global-state', { active: true, worldId });

            // --- Validar audio ---
            if (!req.file) {
                setMicActiveState(false);
                socketManager.emitEvent('mic-global-state', { active: false, worldId: null });
                return res.status(400).json({ error: "No se recibió archivo de audio" });
            }
            const tempPath = path.join(__dirname, "../../tmp", `audio_${worldId}_${now}.webm`);
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
            fs.writeFileSync(tempPath, req.file.buffer);
            let duration = 0;
            try {
                const { execSync } = require("child_process");
                const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString();
                duration = parseFloat(output.trim());
            } catch { }
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { }
            if (duration > 5.5) {
                setMicActiveState(false);
                socketManager.emitEvent('mic-global-state', { active: false, worldId: null });
                return res.status(413).json({ error: "El audio excede la duración máxima permitida (5s)" });
            }

            // --- Convertir a WAV ---
            const wavPath = path.join(__dirname, '../../tmp', `audio_${worldId}_${now}.wav`);
            try {
                const { execSync } = require('child_process');
                fs.writeFileSync(tempPath, req.file.buffer);
                execSync(`ffmpeg -loglevel error -y -i "${tempPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`);
            } catch {
                setMicActiveState(false);
                socketManager.emitEvent('mic-global-state', { active: false, worldId: null });
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { }
                try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { }
                return res.status(500).json({ error: 'Error al convertir audio a WAV' });
            }

            // --- Procesar con Gemini ---
            try {
                const t0 = Date.now();
                const text = await geminiService.sendAudioToGeminiLiveText(wavPath);
                const t1 = Date.now();
                setMicActiveState(false);
                globalMicCooldownUntil = Date.now() + 5000;
                socketManager.emitEvent('mic-global-state', { active: false, worldId: null, cooldown: 5 });
                try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { }
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { }
                // Cerrar sesión Gemini si no hay mundos activos
                if (worldsManager.getAllWorlds().filter(w => !w.pendingDestroy).length === 0) {
                    await geminiService.closeSession();
                }
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.json({ text });
            } catch (err) {
                setMicActiveState(false);
                socketManager.emitEvent('mic-global-state', { active: false, worldId: null });
                try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch { }
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { }
                return res.status(500).json({ error: 'Error al procesar audio con Gemini Live', details: (err && (err as any).message) || String(err) });
            }
        } catch (err) {
            return res.status(500).json({ error: "Error interno en el backend", details: (err && (err as any).message) || String(err) });
        }
    });

    return router;
}
