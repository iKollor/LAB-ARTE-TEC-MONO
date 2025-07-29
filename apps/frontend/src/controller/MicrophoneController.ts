import type { Socket } from 'socket.io-client';

export interface MicrophoneState {
    micOn: boolean;
    canUseMic: boolean;
    globalMicActive: boolean;
    iaInThisWorld: boolean;
}

export class MicrophoneController {
    // Deshabilita el micrófono y actualiza la UI
    public disableMic() {
        this.canUseMic = false;
        this.iaInThisWorld = false;
        this.stopRecording();
        this.setMicTimer('BUSY', 'orange');
        if (this.btn) {
            this.btn.disabled = true;
            this.btn.style.opacity = "0.5";
            this.btn.style.cursor = "default";
        }
        this.updateMicIcon();
        console.log('[MIC][UI] Micrófono deshabilitado (disableMic)');
    }

    // Habilita el micrófono y actualiza la UI
    public enableMic() {
        this.canUseMic = true;
        this.iaInThisWorld = true;
        if (this.btn) {
            this.btn.disabled = false;
            this.btn.style.opacity = "1";
            this.btn.style.cursor = "pointer";
        }
        this.setMicTimer(null);
        this.updateMicIcon();
        console.log('[MIC][UI] Micrófono habilitado (enableMic)');
    }
    /**
     * Indica si el micrófono está actualmente activo (grabando).
     */
    public isMicActive(): boolean {
        return this.micOn;
    }
    private micOn = false;
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private timerInterval: any = null;

    private canUseMic = false;
    private globalMicActive = false;
    private iaInThisWorld = false;
    private socket: Socket;

    private icon: HTMLImageElement;
    private btn: HTMLButtonElement;

    constructor(socket: Socket, icon: HTMLImageElement, btn: HTMLButtonElement) {
        this.socket = socket;
        this.icon = icon;
        this.btn = btn;
        this.updateMicIcon();
    }

    public setMicState({ canUse }: { canUse: boolean }) {
        this.canUseMic = canUse;
        this.iaInThisWorld = canUse;
        if (!canUse) {
            this.stopRecording();
            this.setMicTimer('BUSY', 'orange');
            if (this.btn) {
                this.btn.disabled = true;
                this.btn.style.opacity = "0.5";
                this.btn.style.cursor = "default";
                console.log('[MIC][UI] Botón de micrófono deshabilitado por procesamiento IA');
            }
        } else {
            if (this.btn) {
                this.btn.disabled = false;
                this.btn.style.opacity = "1";
                this.btn.style.cursor = "pointer";
                console.log('[MIC][UI] Botón de micrófono habilitado');
            }
        }
        this.updateMicIcon();
    }
    public getState(): MicrophoneState {
        return {
            micOn: this.micOn,
            canUseMic: this.canUseMic,
            globalMicActive: this.globalMicActive,
            iaInThisWorld: this.iaInThisWorld,
        };
    }

    public updateMicIcon() {
        if (this.icon) this.icon.src = this.micOn ? "/SVG/mic_on.svg" : "/SVG/mic_off.svg";
        if (this.btn) {
            this.btn.disabled = !this.canUseMic;
            this.btn.style.opacity = this.canUseMic ? "1" : "0.5";
            this.btn.style.cursor = this.canUseMic ? "pointer" : "default";
        }
    }

    public setMicTimer(value: number | "BUSY" | null, color = "red") {
        const timerSpan = document.getElementById("mic-timer") as HTMLSpanElement | null;
        if (!timerSpan) return;
        if (value === "BUSY") timerSpan.textContent = "BUSY";
        else if (typeof value === "number" && value > 0) timerSpan.textContent = value.toString();
        else timerSpan.textContent = "";
        timerSpan.style.color = color;
    }

    public async toggleMic() {
        if (!this.canUseMic || this.globalMicActive) return;
        if (!this.micOn) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new window.MediaRecorder(stream);
                this.audioChunks = [];
                if (this.mediaRecorder) {
                    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
                    };
                    this.mediaRecorder.onstop = async () => {
                        await this.handleRecordingStop();
                    };
                    const worldId = localStorage.getItem("worldId") || "";
                    this.socket.emit("mic-state", { active: true, worldId });
                    this.mediaRecorder.start();
                    this.micOn = true;
                    this.updateMicIcon();
                    this.startTimer('recording', 5, '#00ff00');
                }
            } catch (err) {
                this.handleError("No se pudo acceder al micrófono.", err);
            }
        } else {
            if (!this.globalMicActive && this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
            this.resetMicUI();
        }
    }

    private startTimer(type: 'cooldown' | 'recording', seconds: number, color: string) {
        if (this.timerInterval !== undefined) clearInterval(this.timerInterval);
        let time = seconds;
        this.setMicTimer(time, color);
        this.timerInterval = window.setInterval(() => {
            time--;
            this.setMicTimer(time, color);
            if (time <= 0) {
                if (this.timerInterval !== undefined) clearInterval(this.timerInterval);
                this.setMicTimer(null);
                if (type === 'cooldown') {
                    this.canUseMic = this.iaInThisWorld;
                    this.updateMicIcon();
                } else if (type === 'recording') {
                    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
                    this.updateMicIcon();
                }

            }
        }, 1000);
    }

    private iniciarCooldownLocal() {
        this.canUseMic = false;
        this.updateMicIcon();
        this.startTimer('cooldown', 5, 'red');
    }

    // Detiene la grabación si está activa
    public stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
            this.resetMicUI();
        }
    }

    // Maneja el fin de la grabación y el flujo de subida de audio
    private async handleRecordingStop() {
        const worldId = localStorage.getItem("worldId") || "";
        this.socket.emit("mic-state", { active: false, worldId });
        this.resetMicUI();
        this.disableMic();
        if (!this.audioChunks.length || new Blob(this.audioChunks, { type: "audio/webm" }).size === 0) {
            this.handleError("No se grabó audio válido. Intenta de nuevo.");
            return;
        }
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio/webm");
        try {
            // Detecta el protocolo y host actual para la URL del backend
            const protocol = window.location.protocol;
            const host = window.location.hostname;
            const port = 3000; // Cambia si tu backend usa otro puerto
            const url = `${protocol}//${host}:${port}/api/audio-upload`;
            const response = await fetch(url, {
                method: "POST",
                body: formData,
                headers: { "x-world-id": worldId },
            });
            if (!response.ok) {
                let errorMsg = "[MIC] Error al enviar audio al backend";
                try {
                    const errData = await response.json();
                    if (errData && errData.error) errorMsg += `: ${errData.error}`;
                    if (errData && errData.details) errorMsg += ` (${errData.details})`;
                } catch {
                    errorMsg += `: ${response.statusText}`;
                }
                finally {
                    this.handleError(errorMsg);
                }
            }
        } catch (err: any) {
            this.handleError("[MIC] Error de red al subir audio", err);
        }
        if (!this.globalMicActive) this.iniciarCooldownLocal();
    }

    // Centraliza el reseteo de UI y timers
    private resetMicUI() {
        this.micOn = false;
        if (this.timerInterval !== undefined) clearInterval(this.timerInterval);
        this.setMicTimer(null);
        this.updateMicIcon();

    }

    // Centraliza el manejo de errores
    private handleError(msg: string, err?: any) {
        // Aquí puedes mejorar para mostrar en la UI
        alert(msg);
        if (err) console.error(msg, err);
        else console.warn(msg);
    }
}
