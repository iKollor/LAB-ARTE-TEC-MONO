// create ia character class
// esta ia solo puede moverse y estar idle
// IACharacter ahora extiende MultiAnimatedSprite y soporta animaciones por dirección

import * as PIXI from 'pixi.js';
import { MultiAnimatedSprite } from './ParseAsepriteAnimationSheet';

// Variable para controlar el tamaño del personaje IA
export const CHARACTER_SCALE = 3; // Cambia este valor para ajustar el tamaño

export class IACharacter extends MultiAnimatedSprite {
    name: string;
    hp: number;
    speed: number;
    lastDirection: string = 'South';

    private patrolPoints: { x: number, y: number }[] = [];
    private currentPatrolIndex: number = 0;

    constructor(x: number, y: number, spritesheet: PIXI.Spritesheet, name: string, hp: number, speed: number, debugFreezeFrame?: number) {
        super(spritesheet, debugFreezeFrame);
        this.x = x;
        this.y = y;
        this.name = name;
        this.hp = hp;
        this.speed = speed;
        this.setAnimation('slice:Idle_South');
        this.scale.set(CHARACTER_SCALE); // Aplica el escalado definido
        this.sprite?.anchor.set(0.5, 0.5); // Centra el sprite en su posición
    }

    moveTo(targetX: number, targetY: number) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 1) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;

            let dir = '';
            if (Math.abs(dx) > Math.abs(dy)) {
                dir = dx > 0 ? 'East' : 'West';
            } else {
                dir = dy > 0 ? 'South' : 'North';
            }
            // Animación de caminar horizontal (flip para izquierda)
            if (dir === 'East' || dir === 'West') {
                if (this.spritesheet.animations['slice:Walk']) {
                    this.setAnimation('slice:Walk');
                    if (this.sprite) {
                        this.sprite.scale.x = dir === 'West' ? -1 : 1;
                        this.sprite.anchor.x = 0.5;
                    }
                }
            } else {
                // Para vertical, usa Idle o Walk si existe
                if (this.spritesheet.animations[`slice:Walk_${dir}`]) {
                    this.setAnimation(`slice:Walk_${dir}`);
                    if (this.sprite) {
                        this.sprite.scale.x = 1;
                        this.sprite.anchor.x = 0.5;
                    }
                } else if (this.spritesheet.animations[`slice:Idle_${dir}`]) {
                    this.setAnimation(`slice:Idle_${dir}`);
                    if (this.sprite) {
                        this.sprite.scale.x = 1;
                        this.sprite.anchor.x = 0.5;
                    }
                }
            }
            this.lastDirection = dir;
        } else {
            // Idle en la última dirección
            if (this.lastDirection === 'East' || this.lastDirection === 'West') {
                if (this.spritesheet.animations['slice:Idle']) {
                    this.setAnimation('slice:Idle');
                    if (this.sprite) {
                        this.sprite.scale.x = this.lastDirection === 'West' ? -1 : 1;
                        this.sprite.anchor.x = 0.5;
                    }
                }
            } else {
                if (this.spritesheet.animations[`slice:Idle_${this.lastDirection}`]) {
                    this.setAnimation(`slice:Idle_${this.lastDirection}`);
                    if (this.sprite) {
                        this.sprite.scale.x = 1;
                        this.sprite.anchor.x = 0.5;
                    }
                }
            }
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
}
