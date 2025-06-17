import { Application, Container, Graphics } from 'pixi.js';
import { ZoomBlurFilter } from 'pixi-filters';

// Configuración de animaciones
export const BIGBANG_WAIT = 2.0; // Tiempo de espera antes de la explosión
export const BIGBANG_DURATION = 1.5; // Duración de la animación de expansión
const STAR_SIZE = 3; // Tamaño base de las estrellas
const STAR_COLORS = ["#f0f4ff", "#a9c9e5", "#d7c2f5", "#fff2b3", "#f5a3a3"]; // Paleta de colores de estrellas

// Tipos para las estrellas y estrellas fugaces
interface Star {
  gfx: Graphics; // Objeto gráfico de la estrella
  pulse: boolean; // Si parpadea
  pulseSpeed: number; // Velocidad de parpadeo
  pulsePhase: number; // Fase de parpadeo
  baseAlpha: number; // Opacidad base
}
interface ShootingStar {
  gfx: Graphics; // Objeto gráfico de la estrella fugaz
  life: number; // Vida restante
  vx: number; // Velocidad en x
  vy: number; // Velocidad en y
}

// Clase principal del fondo estrellado animado
export class StarryBackground extends Container {
  // Arreglo de estrellas normales
  private stars: Star[] = [];
  // Arreglo de estrellas fugaces
  private shootingStars: ShootingStar[] = [];
  // Temporizador para generar estrellas fugaces
  private spawnTimer = 0;
  // Estado de la animación Big Bang
  private bigBangState: 'waiting' | 'exploding' | 'done' = 'waiting';
  // Tiempo transcurrido en la animación Big Bang
  private bigBangElapsed = 0;
  // Configuración de tiempos
  private bigBangWait = BIGBANG_WAIT;
  private bigBangDuration = BIGBANG_DURATION;
  // Estrellas involucradas en la animación Big Bang
  private bigBangStars: Array<{
    gfx: Graphics;
    tx: number; // Posición objetivo x
    ty: number; // Posición objetivo y
    baseAlpha: number;
    expandDelay: number; // Retardo individual
    expandSpeed: number; // Velocidad individual
  }> = [];
  // Filtro de desenfoque para el efecto de explosión
  private zoomBlur: ZoomBlurFilter;
  // Punto central visible antes de la explosión
  private centerDot?: Graphics;

  // Constructor: inicializa el fondo y las estrellas
  constructor(private app: Application, numStars?: number) {
    super();
    this.eventMode = 'none'; // Desactiva eventos
    this.scale.set(1 / window.devicePixelRatio); // Escala para pantallas retina
    this.sortableChildren = true;
    // Filtro de desenfoque
    this.zoomBlur = new ZoomBlurFilter({
      strength: 0,
      center: [this.app.screen.width / 2, this.app.screen.height / 2],
      innerRadius: 0
    });
    this.filters = [this.zoomBlur];
    // Genera las estrellas iniciales
    this.generateStars(numStars);
    // Dibuja el punto central
    this.addCenterDot();
    // Ajusta al cambiar el tamaño de pantalla
    window.addEventListener('resize', this.onResize);
  }

  // Dibuja el punto central blanco antes de la explosión
  private addCenterDot() {
    this.centerDot = new Graphics();
    this.centerDot.rect(0, 0, STAR_SIZE, STAR_SIZE).fill({ color: 0xffffff, alpha: 1 });
    this.centerDot.x = this.app.screen.width / 2;
    this.centerDot.y = this.app.screen.height / 2;
    this.centerDot.scale.set(1 / this.app.renderer.resolution);
    this.addChild(this.centerDot);
  }

  // Easing para la animación de expansión
  private easeOutCirc(t: number): number {
    return Math.sqrt(1 - Math.pow(t - 1, 2));
  }

  // Crea una estrella con parámetros aleatorios
  private randomStar(x?: number, y?: number): Star {
    const gfx = new Graphics();
    const posX = x ?? Math.random() * this.app.screen.width;
    const posY = y ?? Math.random() * this.app.screen.height;
    const size = Math.random() < 0.03 ? STAR_SIZE * 2 : STAR_SIZE;
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const alpha = 0.7 + Math.random() * 0.3;
    const pulseSpeed = 0.5 + Math.random();
    const pulsePhase = Math.random() * Math.PI * 2;
    gfx.rect(0, 0, size, size).fill({ color, alpha });
    gfx.x = posX;
    gfx.y = posY;
    gfx.scale.set(1 / this.app.renderer.resolution);
    return { gfx, pulse: true, pulseSpeed, pulsePhase, baseAlpha: alpha };
  }

  // Genera o ajusta la cantidad de estrellas según el tamaño de pantalla
  private generateStars(numStars?: number) {
    const area = this.app.screen.width * this.app.screen.height;
    const target = numStars ?? Math.floor(area / 2500);
    // Agrega estrellas si faltan
    while (this.stars.length < target) {
      const star = this.randomStar();
      star.gfx.alpha = this.bigBangState !== 'done' ? 0 : star.baseAlpha;
      this.stars.push(star);
      this.addChild(star.gfx);
    }
    // Quita estrellas si sobran
    while (this.stars.length > target) {
      const star = this.stars.pop();
      if (star) this.removeChild(star.gfx);
    }
    // Reubica estrellas fuera de pantalla
    for (const star of this.stars) {
      if (star.gfx.x > this.app.screen.width || star.gfx.x < 0) star.gfx.x = Math.random() * this.app.screen.width;
      if (star.gfx.y > this.app.screen.height || star.gfx.y < 0) star.gfx.y = Math.random() * this.app.screen.height;
    }
    // Asegura que las estrellas fugaces estén en el contenedor
    for (const shooting of this.shootingStars) {
      if (!this.children.includes(shooting.gfx)) this.addChild(shooting.gfx);
    }
    // Prepara la animación Big Bang si corresponde
    if (this.bigBangState !== 'done') {
      this.bigBangStars = this.stars.map(star => ({
        gfx: star.gfx,
        tx: star.gfx.x,
        ty: star.gfx.y,
        baseAlpha: star.baseAlpha,
        expandDelay: Math.random() * 0.3, // Retardo aleatorio
        expandSpeed: 0.9 + Math.random() * 0.2 // Velocidad aleatoria
      }));
      for (const s of this.bigBangStars) {
        s.gfx.x = this.app.screen.width / 2;
        s.gfx.y = this.app.screen.height / 2;
      }
    }
    // Centra el filtro de desenfoque
    this.zoomBlur.center = [this.app.screen.width / 2, this.app.screen.height / 2];
  }

  // Genera una estrella fugaz con trayectoria aleatoria
  private spawnShootingStar() {
    const gfx = new Graphics();
    const size = Math.random() < 0.03 ? STAR_SIZE * 2 : STAR_SIZE;
    const color = Math.random() < 0.3 ? 0x88ccff : 0xffffff;
    gfx.rect(0, 0, size, size).fill({ color, alpha: 1 });
    gfx.scale.set(1 / this.app.renderer.resolution);
    gfx.x = Math.random() * this.app.screen.width;
    gfx.y = Math.random() * this.app.screen.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this.shootingStars.push({ gfx, life: 1.5, vx, vy });
    this.addChild(gfx);
  }

  // Evento de resize: regenera las estrellas
  private onResize = () => {
    this.generateStars();
  };

  // Bucle principal de animación
  public update(delta = 1 / 60) {
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    // --- Animación Big Bang ---
    if (this.bigBangState !== 'done') {
      if (this.bigBangState === 'waiting') {
        this.bigBangElapsed += delta;
        if (this.bigBangElapsed >= this.bigBangWait) {
          this.bigBangState = 'exploding';
          this.bigBangElapsed = 0;
          if (this.centerDot) this.removeChild(this.centerDot);
        }
        return;
      }
      if (this.bigBangState === 'exploding') {
        this.bigBangElapsed += delta;
        for (const s of this.bigBangStars) {
          // Progreso individual con delay y velocidad
          const localTime = Math.max(0, this.bigBangElapsed - s.expandDelay);
          const localProgress = Math.min(localTime / (this.bigBangDuration * s.expandSpeed), 1);
          const eased = this.easeOutCirc(localProgress);
          const fadeProgress = localProgress;
          // Interpolación de posición y opacidad
          s.gfx.x = centerX + (s.tx - centerX) * eased;
          s.gfx.y = centerY + (s.ty - centerY) * eased;
          const star = this.stars.find(star => star.gfx === s.gfx);
          const pulseSpeed = star?.pulseSpeed ?? 1;
          const pulsePhase = star?.pulsePhase ?? 0;
          const t = performance.now() * 0.001 * pulseSpeed + pulsePhase;
          const flicker = 0.5 + 0.5 * Math.sin(t);
          const flickerAlpha = Math.max(0.1, Math.min(1, s.baseAlpha * flicker));
          s.gfx.alpha = s.baseAlpha * (1 - fadeProgress) + flickerAlpha * fadeProgress;
        }
        // Termina la animación cuando todas las estrellas han llegado
        const allDone = this.bigBangStars.every(s => (this.bigBangElapsed - s.expandDelay) / (this.bigBangDuration * s.expandSpeed) >= 1);
        if (allDone) {
          this.bigBangState = 'done';
          this.bigBangStars = [];
          this.zoomBlur.strength = 0;
          this.spawnTimer = 1 + Math.random() * 2;
        }
        return;
      }
    }
    // Parpadeo normal de las estrellas
    for (const star of this.stars) {
      if (star.pulse) {
        const t = performance.now() * 0.001 * star.pulseSpeed + star.pulsePhase;
        const flicker = 0.5 + 0.5 * Math.sin(t);
        star.gfx.alpha = Math.max(0.1, Math.min(1, star.baseAlpha * flicker));
      }
    }
    // Generación de estrellas fugaces
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawnShootingStar();
      this.spawnTimer = 1 + Math.random() * 2;
    }
    // Movimiento y rastro de estrellas fugaces
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const star = this.shootingStars[i];
      star.gfx.x += star.vx;
      star.gfx.y += star.vy;
      star.life -= delta;
      // Elimina si sale de pantalla o termina su vida
      if (
        star.gfx.x < 0 || star.gfx.x > this.app.screen.width ||
        star.gfx.y < 0 || star.gfx.y > this.app.screen.height ||
        star.life <= 0
      ) {
        this.removeChild(star.gfx);
        this.shootingStars.splice(i, 1);
        continue;
      }
      // Dibuja el rastro de la estrella fugaz
      const trailSteps = 10;
      for (let t = 1; t <= trailSteps; t++) {
        const trailAlpha = Math.max(0, (star.life / 1.5) * (1 - t / (trailSteps + 1)));
        const trailX = star.gfx.x - star.vx * t * 0.2;
        const trailY = star.gfx.y - star.vy * t * 0.2;
        const size = star.gfx.width || STAR_SIZE;
        const color = 0xffffff;
        const trailGfx = new Graphics();
        trailGfx.rect(0, 0, size, size).fill({ color, alpha: trailAlpha });
        trailGfx.x = trailX;
        trailGfx.y = trailY;
        trailGfx.scale.set(1 / this.app.renderer.resolution);
        this.addChild(trailGfx);
        setTimeout(() => this.removeChild(trailGfx), 16);
      }
      // Desvanece la estrella fugaz
      star.gfx.alpha = Math.max(0, star.life / 1.5);
    }
  }

  // Limpieza de eventos y recursos
  destroy(options?: boolean | { children?: boolean; texture?: boolean; baseTexture?: boolean }) {
    window.removeEventListener('resize', this.onResize);
    super.destroy(options);
  }
}
