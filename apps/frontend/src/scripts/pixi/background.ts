import { Application, Container, Graphics } from 'pixi.js';
import { ZoomBlurFilter, ShockwaveFilter } from 'pixi-filters';

// Configuración de animaciones
export const BIGBANG_WAIT = 2.0; // Tiempo de espera antes de la explosión
export const BIGBANG_DURATION = 1.5; // Duración de la animación de expansión
const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(navigator.userAgent); // Determinar si el dispositivo es móvil
const STAR_SIZE = isMobile ? 8 : 5; // Tamaño base de las estrellas según el dispositivo
const STAR_DENSITY = isMobile ? 0.0002 : 0.0004; // Densidad de estrellas según el dispositivo
const STAR_COLORS = ["#f0f4ff", "#a9c9e5", "#d7c2f5", "#fff2b3", "#f5a3a3"]; // Paleta de colores de estrellas


// Tipos para las estrellas y estrellas fugaces
interface Star {
  gfx: Graphics;
  pulse: boolean;
  pulseSpeed: number;
  pulsePhase: number;
  baseAlpha: number;
}

interface ShootingStar {
  gfx: Graphics;
  life: number;
  vx: number;
  vy: number;
}

export class StarryBackground extends Container {
  private stars: Star[] = [];
  private shootingStars: ShootingStar[] = [];
  private spawnTimer = 0;
  private bigBangState: 'waiting' | 'exploding' | 'done' = 'waiting';
  private bigBangElapsed = 0;
  private bigBangStars: Array<{
    gfx: Graphics;
    tx: number;
    ty: number;
    baseAlpha: number;
    expandDelay: number;
    expandSpeed: number;
  }> = [];
  private zoomBlur: ZoomBlurFilter;
  private centerDot?: Graphics;
  private lastArea = 0;

  constructor(private app: Application, numStars?: number) {
    super();
    this.eventMode = 'none';
    this.sortableChildren = true;
    this.zoomBlur = new ZoomBlurFilter({
      strength: 0,
      center: [this.app.renderer.width / 2, this.app.renderer.height / 2],
      innerRadius: 0,
    });
    this.filters = [this.zoomBlur];
    this.generateStars(numStars);
    this.addCenterDot();
    this.lastArea = this.app.renderer.width * this.app.renderer.height;
    window.addEventListener('resize', this.onResize);
  }

  private addCenterDot() {
    this.centerDot = new Graphics();
    this.centerDot.rect(0, 0, STAR_SIZE, STAR_SIZE).fill({ color: 0xffffff, alpha: 1 });
    this.centerDot.x = this.app.renderer.width / 2 - STAR_SIZE / 2;
    this.centerDot.y = this.app.renderer.height / 2 - STAR_SIZE / 2;
    this.addChild(this.centerDot);
  }

  private easeOutCirc(t: number): number {
    return Math.sqrt(1 - Math.pow(t - 1, 2));
  }

  private randomStar(x?: number, y?: number): Star {
    const gfx = new Graphics();
    const posX = x ?? Math.random() * this.app.renderer.width;
    const posY = y ?? Math.random() * this.app.renderer.height;
    const size = Math.random() < 0.03 ? STAR_SIZE * 2 : STAR_SIZE;
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const alpha = 0.7 + Math.random() * 0.3;
    const pulseSpeed = 0.5 + Math.random();
    const pulsePhase = Math.random() * Math.PI * 2;
    gfx.rect(0, 0, size, size).fill({ color, alpha });
    gfx.x = posX;
    gfx.y = posY;
    return { gfx, pulse: true, pulseSpeed, pulsePhase, baseAlpha: alpha };
  }

  private generateStars(numStars?: number) {
    const area = this.app.renderer.width * this.app.renderer.height;
    const target = numStars ?? Math.floor(area * STAR_DENSITY);
    while (this.stars.length < target) {
      const star = this.randomStar();
      star.gfx.alpha = this.bigBangState !== 'done' ? 0 : star.baseAlpha;
      this.stars.push(star);
      this.addChild(star.gfx);
    }
    for (const shooting of this.shootingStars) {
      if (!this.children.includes(shooting.gfx)) this.addChild(shooting.gfx);
    }
    if (this.bigBangState !== 'done') {
      this.bigBangStars = this.stars.map(star => ({
        gfx: star.gfx,
        tx: star.gfx.x,
        ty: star.gfx.y,
        baseAlpha: star.baseAlpha,
        expandDelay: Math.random() * 0.3,
        expandSpeed: 0.9 + Math.random() * 0.2,
      }));
      for (const s of this.bigBangStars) {
        s.gfx.x = this.app.renderer.width / 2 - s.gfx.width / 2;
        s.gfx.y = this.app.renderer.height / 2 - s.gfx.height / 2;
      }
    }
    this.zoomBlur.center = [this.app.renderer.width / 2, this.app.renderer.height / 2];
  }

  private spawnShootingStar() {
    const gfx = new Graphics();
    const size = Math.random() < 0.03 ? STAR_SIZE * 2 : STAR_SIZE;
    const color = Math.random() < 0.3 ? 0x88ccff : 0xffffff;
    gfx.rect(0, 0, size, size).fill({ color, alpha: 1 });
    gfx.x = Math.random() * this.app.renderer.width;
    gfx.y = Math.random() * this.app.renderer.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this.shootingStars.push({ gfx, life: 1.5, vx, vy });
    this.addChild(gfx);
  }

  private onResize = () => {
    const newArea = this.app.renderer.width * this.app.renderer.height;
    if (newArea > this.lastArea * 1.2) {
      for (const star of this.stars) {
        star.gfx.x = Math.random() * this.app.renderer.width;
        star.gfx.y = Math.random() * this.app.renderer.height;
      }
      this.lastArea = newArea;
    }
    this.generateStars();
    if (this.centerDot) {
      this.centerDot.x = this.app.renderer.width / 2 - STAR_SIZE / 2;
      this.centerDot.y = this.app.renderer.height / 2 - STAR_SIZE / 2;
    }
    this.zoomBlur.center = [this.app.renderer.width / 2, this.app.renderer.height / 2];
  };

  public update(delta = 1 / 60) {
    if (document.hidden) return; // Evitar actualizaciones innecesarias

    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    if (this.bigBangState !== 'done') {
      if (this.bigBangState === 'waiting') {
        this.bigBangElapsed += delta;
        if (this.bigBangElapsed >= BIGBANG_WAIT) {
          this.bigBangState = 'exploding';
          this.bigBangElapsed = 0;
          if (this.centerDot) this.removeChild(this.centerDot);
        }
        return;
      }
      if (this.bigBangState === 'exploding') {
        this.bigBangElapsed += delta;
        for (const s of this.bigBangStars) {
          const localTime = Math.max(0, this.bigBangElapsed - s.expandDelay);
          const localProgress = Math.min(localTime / (BIGBANG_DURATION * s.expandSpeed), 1);
          const eased = this.easeOutCirc(localProgress);
          const fadeProgress = localProgress;
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
        const allDone = this.bigBangStars.every(s => (this.bigBangElapsed - s.expandDelay) / (BIGBANG_DURATION * s.expandSpeed) >= 1);
        if (allDone) {
          this.bigBangState = 'done';
          this.bigBangStars = [];
          this.zoomBlur.strength = 0;
          this.spawnTimer = 1 + Math.random() * 2;
        }
        return;
      }
    }
    for (const star of this.stars) {
      if (star.pulse) {
        const t = performance.now() * 0.001 * star.pulseSpeed + star.pulsePhase;
        const flicker = 0.5 + 0.5 * Math.sin(t);
        star.gfx.alpha = Math.max(0.1, Math.min(1, star.baseAlpha * flicker));
      }
    }
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawnShootingStar();
      this.spawnTimer = 1 + Math.random() * 2;
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const star = this.shootingStars[i];
      star.gfx.x += star.vx;
      star.gfx.y += star.vy;
      star.life -= delta;
      if (
        star.gfx.x < 0 || star.gfx.x > this.app.screen.width ||
        star.gfx.y < 0 || star.gfx.y > this.app.screen.height ||
        star.life <= 0
      ) {
        this.removeChild(star.gfx);
        this.shootingStars.splice(i, 1);
        continue;
      }
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
      star.gfx.alpha = Math.max(0, star.life / 1.5);
    }
  }

  public async waitForBigBang(): Promise<void> {
    if (this.bigBangState === 'done') return;
    return new Promise(resolve => {
      const check = () => {
        if (this.bigBangState === 'done') {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  // Constante para el porcentaje de estrellas a recoger
  public async triggerImplosion(): Promise<void> {
    const centerX = this.app.renderer.width / 2;
    const centerY = this.app.renderer.height / 2;

    // Seleccionar estrellas al azar hasta el porcentaje especificado
    const numStarsToImplode = Math.floor(this.stars.length * 0.2);
    const starsToImplode = this.stars.slice(0, numStarsToImplode);

    // Animar las estrellas hacia el centro
    await Promise.all(
      starsToImplode.map(star => {
        return new Promise<void>(resolve => {
          const duration = 1; // Duración de la animación
          const startX = star.gfx.x;
          const startY = star.gfx.y;
          const startTime = performance.now();

          const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = Math.pow(progress, 3); // Easing cúbico

            star.gfx.x = startX + (centerX - startX) * easedProgress;
            star.gfx.y = startY + (centerY - startY) * easedProgress;

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              resolve();
            }
          };

          animate();
        });
      })
    );

    // Eliminar las estrellas del fondo
    for (const star of starsToImplode) {
      this.removeChild(star.gfx);
      this.stars.splice(this.stars.indexOf(star), 1);
    }

    // Aplicar el filtro Shockwave correctamente
    const shockwave = new ShockwaveFilter({
      center: { x: centerX, y: centerY },
      amplitude: 100,
      wavelength: 302,
      brightness: 1,
      radius: -1,
      time: 0,
    });

    this.filters = [shockwave];

    // Animar el tiempo del filtro para que se propague correctamente y solo una vez
    // Ajustar la velocidad de propagación del filtro Shockwave
    const SHOCKWAVE_SPEED_FACTOR = 4; // Factor de velocidad para ajustar la rapidez

    const screenDiagonal = Math.sqrt(Math.pow(this.app.renderer.width, 2) + Math.pow(this.app.renderer.height, 2));
    const shockwaveDuration = screenDiagonal / 500; // Mantener la duración establecida
    const startTime = performance.now();

    const animateShockwave = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      shockwave.time = elapsed * SHOCKWAVE_SPEED_FACTOR; // Escalar el tiempo para aumentar la velocidad de propagación

      if (elapsed < shockwaveDuration) {
        requestAnimationFrame(animateShockwave);
      } else {
        this.filters = []; // Desactivar el filtro después de la animación
      }
    };

    requestAnimationFrame(animateShockwave);
  }

  /**
   * Hace visibles todas las estrellas dispersas inmediatamente (sin animación).
   * Útil cuando no se ejecuta el Big Bang pero se quiere mostrar el fondo estrellado.
   */
  public showAllStarsInstantly() {
    this.bigBangState = 'done';
    // Reposicionar todas las estrellas de forma aleatoria y restaurar alpha
    for (const star of this.stars) {
      star.gfx.x = Math.random() * this.app.renderer.width;
      star.gfx.y = Math.random() * this.app.renderer.height;
      star.gfx.alpha = star.baseAlpha;
    }
    this.zoomBlur.strength = 0;
    this.bigBangStars = [];
    if (this.centerDot && this.children.includes(this.centerDot)) {
      this.removeChild(this.centerDot);
    }
  }

  destroy(options?: boolean | { children?: boolean; texture?: boolean; baseTexture?: boolean }) {
    window.removeEventListener('resize', this.onResize);
    super.destroy(options);
  }
}
