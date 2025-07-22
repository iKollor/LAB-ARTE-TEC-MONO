// AudioLayersManager.ts
// Gestiona la reproducción de capas de audio según la cantidad de mundos activos

const musicFolder = '/audio/music/';
const musicFiles = [
    'LABTEC PIANO MAIN.wav',
    'LABTEC PIANO MELODY L.wav',
    'LABTEC PIANO MELODY R.wav',
    'LABTEC STRINGS.wav',
    'LABTEC BASS.wav',
    'LABTEC PAD.wav',
    'LABTEC PAD R.wav',
    'LABTEC FLUTE.wav',
    'LABTEC FLUTE R.wav',
    'LABTEC BRASS.wav',
    'LABTEC BRASS L.wav',
    'LABTEC MUSIC BOX.wav',
    'LABTEC ARP.wav',
    'LABTEC 20-Tamb 12bit 120 bpm.wav',
    'LABTEC 21-Bell Brush 70 bpm.wav',
    'LABTEC 22-Break 90s Vinyl 88 bpm.wav',
    'LABTEC SYNTH 2.wav',
    'LABTEC SYNTH.wav',
];

class AudioLayersManager {
    private audios: HTMLAudioElement[] = [];
    private currentLayers = 0;


    setLayers(num: number) {
        // Limitar al máximo de pistas disponibles
        const layers = Math.min(num, musicFiles.length);
        // Si hay menos capas, detener las sobrantes
        while (this.audios.length > layers) {
            const audio = this.audios.pop();
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        }
        // Sincronizar el nuevo layer con el tiempo actual del primer audio
        const syncTime = this.audios.length > 0 ? this.audios[0].currentTime : 0;
        for (let i = this.audios.length; i < layers; i++) {
            const audio = new Audio(musicFolder + musicFiles[i]);
            audio.loop = true;
            audio.volume = 0.5; // Puedes ajustar el volumen
            audio.currentTime = syncTime;
            audio.addEventListener('error', () => {
                console.error(`[AUDIO] Error al cargar: ${musicFiles[i]}`);
            });
            audio.addEventListener('play', () => {
                console.log(`[AUDIO] Reproduciendo: ${musicFiles[i]}`);
            });
            audio.play().catch(err => {
                console.error(`[AUDIO] No se pudo reproducir: ${musicFiles[i]}`, err);
            });
            this.audios.push(audio);
        }
        this.currentLayers = layers;
    }

    stopAll() {
        this.audios.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        this.audios = [];
        this.currentLayers = 0;
    }
}

export const audioLayersManager = new AudioLayersManager();
