import * as PIXI from 'pixi.js';

// Variable global para activar/desactivar logs de depuración
const DEBUG_LOGS = false;

// Mapa global para asociar duraciones de frames de slices por animación
const sliceFrameDurationsByAnim = new Map<string, number[]>();

export class MultiAnimatedSprite extends PIXI.Container {
    protected currentAnimation: string | null = null;
    protected spritesheet: PIXI.Spritesheet;
    protected sprite: PIXI.AnimatedSprite | null = null;
    private _sliceFrameElapsed = 0;
    private _sliceFrameIndex = 0;
    private _isSlice = false;
    private _debugFreezeFrame: number | null = null;

    constructor(spritesheet: PIXI.Spritesheet, debugFreezeFrame?: number) {
        super();
        this.spritesheet = spritesheet;
        this.scale.set(2);
        if (typeof debugFreezeFrame === 'number') {
            this._debugFreezeFrame = debugFreezeFrame;
        }
        const defaultAnimation = Object.keys(spritesheet.animations)[0];
        this.setAnimation(defaultAnimation);
    }

    setAnimation(name: string) {
        if (this.currentAnimation === name) return;
        // Filtra solo texturas válidas
        const textures = (this.spritesheet.animations[name] || []).filter(t => t instanceof PIXI.Texture) as PIXI.Texture[];
        if (!textures.length) return;
        if (!this.sprite) {
            this.sprite = new PIXI.AnimatedSprite(textures);
            this.addChild(this.sprite);
        } else {
            this.sprite.textures = textures;
        }
        this._isSlice = name.startsWith('slice:');
        this._sliceFrameIndex = 0;
        this._sliceFrameElapsed = 0;
        if (this._isSlice) {
            this.sprite.animationSpeed = 0;
            this.sprite.gotoAndStop(0);
        } else {
            this.sprite.animationSpeed = 0.15;
            this.sprite.play();
        }
        this.currentAnimation = name;
        // Si está en modo debug, congelar el frame y mostrar en consola
        if (this._debugFreezeFrame !== null && this.sprite) {
            const idx = Math.max(0, Math.min(this._debugFreezeFrame, this.sprite.textures.length - 1));
            this.sprite.gotoAndStop(idx);
            if (DEBUG_LOGS) console.log(`[DEBUG] Animación '${name}' congelada en frame ${idx}`);
        }
    }

    // Método para avanzar animación de slice, debe llamarse desde el ticker global
    updateSliceAnimation(deltaMS: number) {
        if (!this._isSlice || !this.sprite || !this.currentAnimation) return;
        // Si está en modo debug, congelar el frame
        if (this._debugFreezeFrame !== null) {
            const idx = Math.max(0, Math.min(this._debugFreezeFrame, this.sprite.textures.length - 1));
            this.sprite.gotoAndStop(idx);
            return;
        }
        const textures = this.sprite.textures.filter(t => t instanceof PIXI.Texture) as PIXI.Texture[];
        if (!textures.length) return;
        const durations = sliceFrameDurationsByAnim.get(this.currentAnimation);
        if (!durations || durations.length === 0) return;
        const currentDuration = durations[this._sliceFrameIndex] || 100;
        this._sliceFrameElapsed += deltaMS;
        if (this._sliceFrameElapsed >= currentDuration) {
            this._sliceFrameElapsed = 0;
            this._sliceFrameIndex = (this._sliceFrameIndex + 1) % textures.length;
            this.sprite.texture = textures[this._sliceFrameIndex];
            // Debug: mostrar información del frame
            if (DEBUG_LOGS) {
                const debugInfo: any = {
                    anim: this.currentAnimation,
                    frameIndex: this._sliceFrameIndex,
                    duration: durations[this._sliceFrameIndex],
                    width: this.sprite.texture.width,
                    height: this.sprite.texture.height
                };
                // Si el frame tiene info de origen, mostrarla (sin usar baseTexture)
                const resource = (this.sprite.texture as any).source?.resource;
                if (resource && resource.url) {
                    debugInfo.resourceUrl = resource.url;
                }
                console.log('[SliceAnim] Frame actualizado:', debugInfo);
            }
        }
    }
}

const state: { keys: Record<string, boolean>; maid: MultiAnimatedSprite | null } = {
    keys: {},
    maid: null,
};

document.body.onkeydown = (e) => {
    state.keys[e.code] = true;
};
document.body.onkeyup = (e) => {
    delete state.keys[e.code];
};

export function tick() {
    if (!state.maid) return;
    if (state.keys['Space']) {
        state.maid.setAnimation('Attack');
    } else {
        state.maid.setAnimation('Idle');
    }
}

export async function loadAsepriteSheet(name: string, url: string, options?: { debugFrame?: number }): Promise<PIXI.Spritesheet> {
    // Configuración manual de cantidad de frames por estado
    const framesPorEstado: Record<string, number> = {
        "Idle_South": 2,
        "Idle": 2,
        "Idle_North": 2,
        "Walk_South": 4,
        "Walk": 4,
        "Walk_North": 4,
        // Agrega más estados según necesites
    };
    // Configuración manual de nombres de animaciones por fila (para fallback de cuadrícula)
    const defaultRowAnimations = [
        'Idle_South',
        'Idle',
        'Idle_North',
        'Walk_South',
        'Walk',
        'Walk_North',
        // Agrega más si tu spritesheet tiene más filas
    ];
    const debugFrame = options?.debugFrame;
    // Forzar la carga como JSON para evitar que Pixi devuelva una textura si ya está en caché
    const data = await (await fetch(url)).json();
    if (DEBUG_LOGS) console.log('JSON cargado en loadAsepriteSheet:', data);
    if (!data.meta || !data.meta.image) {
        throw new Error('No se encontró el campo meta.image en el JSON de Aseprite');
    }
    const imageUrl = '/' + data.meta.image;
    if (DEBUG_LOGS) console.log('Cargando imagen para spritesheet:', imageUrl);
    const image = await PIXI.Assets.load(imageUrl);
    if (!image || !image.source) {
        throw new Error(`No se pudo cargar la imagen del spritesheet: ${imageUrl}`);
    }
    image.source.scaleMode = 'nearest';
    const spritesheet = new PIXI.Spritesheet(image.source, data);
    await spritesheet.parse();

    if (data.meta?.app?.includes('aseprite') && Array.isArray(data.frames)) {
        const animations = spritesheet.animations;
        const textureNames = Object.keys(spritesheet.textures);
        const frames = data.frames;

        // FrameTags
        if (data.meta.frameTags?.length) {
            for (const tag of data.meta.frameTags) {
                const anim: PIXI.Texture[] = [];
                for (let i = tag.from; i <= tag.to; i++) {
                    anim.push(spritesheet.textures[textureNames[i]]);
                }
                if (tag.direction === 'pingpong') {
                    for (let i = tag.to - 1; i > tag.from; i--) {
                        anim.push(spritesheet.textures[textureNames[i]]);
                    }
                }
                animations[tag.name] = anim;
            }
        }

        // Slices (usados solo como referencia de fila/estado)
        let usedSlicesAsGuide = false;
        if (data.meta.slices?.length) {
            const baseImage = image.source.resource;
            for (const slice of data.meta.slices) {
                // Usar el primer key como referencia de la fila y tamaño
                const refKey = slice.keys[0];
                if (!refKey || !refKey.bounds) continue;
                const bounds = refKey.bounds;
                const anim: PIXI.Texture[] = [];
                const durations: number[] = [];
                // Recorrer horizontalmente la imagen, usando el mismo bounds.y y bounds.h
                const cols = Math.floor(image.source.width / bounds.w);
                // Usar la cantidad de frames definida manualmente, o todas las columnas si no está definido
                const numFrames = framesPorEstado[slice.name] || cols;
                for (let col = 0; col < numFrames; col++) {
                    const x = col * bounds.w;
                    const canvas = document.createElement('canvas');
                    canvas.width = bounds.w;
                    canvas.height = bounds.h;
                    const ctx = canvas.getContext('2d');
                    if (ctx && baseImage) {
                        ctx.drawImage(
                            baseImage,
                            x, bounds.y, bounds.w, bounds.h,
                            0, 0, bounds.w, bounds.h
                        );
                        // Si está activado el modo debug y es el frame solicitado, mostrar info y canvas
                        if (typeof debugFrame === 'number' && col === debugFrame && DEBUG_LOGS) {
                            console.log(`[DEBUG] Estado '${slice.name}', frame ${col}, x=${x}, y=${bounds.y}, w=${bounds.w}, h=${bounds.h}`);
                            document.body.appendChild(canvas);
                        }
                        const tex = PIXI.Texture.from(canvas);
                        tex.source.scaleMode = 'nearest';
                        anim.push(tex);
                        // Buscar duración del frame correspondiente si existe, si no, 100ms
                        const frameIdx = col; // asume que los frames están en orden horizontal
                        const frameData = frames[frameIdx] || {};
                        durations.push(frameData.duration || 100);
                    }
                }
                if (anim.length > 0) {
                    animations[slice.name] = anim;
                    animations[`slice:${slice.name}`] = anim;
                    sliceFrameDurationsByAnim.set(slice.name, durations);
                    sliceFrameDurationsByAnim.set(`slice:${slice.name}`, durations);
                    usedSlicesAsGuide = true;
                }
            }
        }
        // Si no hay slices válidos, usar cuadrícula completa
        if (!usedSlicesAsGuide && !data.meta.frameTags?.length) {
            const frameWidth = 32;
            const frameHeight = 32;
            const cols = Math.floor(image.source.width / frameWidth);
            const rows = Math.floor(image.source.height / frameHeight);
            let frameIdx = 0;
            for (let row = 0; row < rows; row++) {
                const anim: PIXI.Texture[] = [];
                const durations: number[] = [];
                for (let col = 0; col < cols; col++) {
                    if (frameIdx >= textureNames.length) break;
                    const tex = spritesheet.textures[textureNames[frameIdx]];
                    anim.push(tex);
                    const frameData = frames[textureNames[frameIdx]];
                    durations.push(frameData?.duration || 100);
                    // Depuración para cuadrícula
                    if (typeof debugFrame === 'number' && col === debugFrame && DEBUG_LOGS) {
                        const canvas = document.createElement('canvas');
                        canvas.width = frameWidth;
                        canvas.height = frameHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx && image.source.resource) {
                            ctx.drawImage(
                                image.source.resource,
                                col * frameWidth, row * frameHeight, frameWidth, frameHeight,
                                0, 0, frameWidth, frameHeight
                            );
                            console.log(`[DEBUG] Cuadrícula fila ${row}, frame ${col}, x=${col * frameWidth}, y=${row * frameHeight}, w=${frameWidth}, h=${frameHeight}`);
                            document.body.appendChild(canvas);
                        }
                    }
                    frameIdx++;
                }
                if (anim.length > 0) {
                    const animName = defaultRowAnimations[row] || `Anim${row}`;
                    animations[animName] = anim;
                    animations[`slice:${animName}`] = anim;
                    sliceFrameDurationsByAnim.set(animName, durations);
                    sliceFrameDurationsByAnim.set(`slice:${animName}`, durations);
                }
            }
        }
    }
    return spritesheet;
}