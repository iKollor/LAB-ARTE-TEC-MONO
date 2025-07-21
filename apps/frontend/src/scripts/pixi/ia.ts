// create ia character class
// esta ia solo puede moverse y estar idle
// IACharacter ahora extiende MultiAnimatedSprite y soporta animaciones por dirección

import * as PIXI from 'pixi.js';
import { MultiAnimatedSprite } from './ParseAsepriteAnimationSheet';

// Variable para controlar el tamaño del personaje IA
export const CHARACTER_SCALE = 3; // Cambia este valor para ajustar el tamaño

// Métodos para encapsular aparición/desaparición en el escenario
import type { Container } from 'pixi.js';

export class IACharacter extends MultiAnimatedSprite {
    name: string;
    hp: number;
    speed: number;
    lastDirection: string = 'South';
    /**
     * Añade la IA al contenedor si no está ya presente
     */
    show(container: Container) {
        if (!container.children.includes(this)) {
            container.addChild(this);
        }
    }

    /**
     * Elimina la IA del contenedor si está presente
     */
    hide(container: Container) {
        if (container.children.includes(this)) {
            container.removeChild(this);
        }
    }

    private patrolPoints: { x: number, y: number }[] = [];
    private currentPatrolIndex: number = 0;

    constructor(x: number, y: number, spritesheet: PIXI.Spritesheet, name: string, hp: number, speed: number, debugFreezeFrame?: number) {
        super(spritesheet, debugFreezeFrame);
        this.x = x;
        this.y = y;
        this.name = name;
        this.hp = hp;
        // Ajuste de velocidad y escala según dispositivo
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.speed = isMobile ? speed * 2 : speed;
        const scale = isMobile ? CHARACTER_SCALE * 2 : CHARACTER_SCALE;
        this.setAnimation('slice:Idle_South');
        this.scale.set(scale);
        this.sprite?.anchor.set(0.5, 0.5);
    }

    moveTo(targetX: number, targetY: number) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let dir = this.lastDirection;
        if (distance > 1) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
            dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'South' : 'North');
            // Animación de caminar por dirección
            if (this.spritesheet.animations[`slice:Walk_${dir}`]) {
                this.setAnimation(`slice:Walk_${dir}`);
                this.sprite && (this.sprite.scale.x = 1, this.sprite.anchor.x = 0.5);
            } else if ((dir === 'East' || dir === 'West') && this.spritesheet.animations['slice:Walk']) {
                this.setAnimation('slice:Walk');
                this.sprite && (this.sprite.scale.x = dir === 'West' ? -1 : 1, this.sprite.anchor.x = 0.5);
            }
            this.lastDirection = dir;
        } else {
            this.setIdleByDirection(this.lastDirection);
        }
    }

    /**
     * Lógica para mostrar idle mirando a la izquierda/derecha aunque solo exista un slice:Idle lateral.
     */
    setIdleByDirection(direction: string) {
        if (this.spritesheet.animations[`slice:Idle_${direction}`]) {
            this.setAnimation(`slice:Idle_${direction}`);
            this.sprite && (this.sprite.scale.x = 1, this.sprite.anchor.x = 0.5);
        } else if ((direction === 'West' || direction === 'East') && this.spritesheet.animations['slice:Idle']) {
            this.setAnimation('slice:Idle');
            this.sprite && (this.sprite.scale.x = direction === 'West' ? -1 : 1, this.sprite.anchor.x = 0.5);
        } else if (this.spritesheet.animations['slice:Idle_South']) {
            this.setAnimation('slice:Idle_South');
            this.sprite && (this.sprite.scale.x = 1, this.sprite.anchor.x = 0.5);
        }
    }

    setAutonomousPatrol(points: { x: number, y: number }[]) {
        this.patrolPoints = points;
        this.currentPatrolIndex = 0;
        if (points.length > 0) {
            this.x = points[0].x;
            this.y = points[0].y;
        }
    }

    updateAI(deltaMS: number) {
        if (this.patrolPoints.length < 2) return;
        const target = this.patrolPoints[this.currentPatrolIndex];
        this.moveTo(target.x, target.y);
        this.updateSliceAnimation(deltaMS);
        if (Math.abs(this.x - target.x) < 2 && Math.abs(this.y - target.y) < 2) {
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
        }
    }

    /**
     * Llama este método en cada frame para que la IA esté siempre idle en la última dirección si no está caminando.
     * Si le pasas un destino, caminará hacia él y luego quedará idle automáticamente.
     */
    updateMovementOrIdle(deltaMS: number, targetPosition?: { x: number, y: number } | null) {
        if (targetPosition) {
            const dx = targetPosition.x - this.x;
            const dy = targetPosition.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 2) {
                this.moveTo(targetPosition.x, targetPosition.y);
                this.updateSliceAnimation(deltaMS);
                return false;
            } else {
                this.setIdleByDirection(this.lastDirection || 'South');
                this.updateSliceAnimation(deltaMS);
                return true;
            }
        } else {
            this.setIdleByDirection(this.lastDirection || 'South');
            this.updateSliceAnimation(deltaMS);
            return true;
        }
    }
}
