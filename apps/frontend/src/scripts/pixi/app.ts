import { IAState } from '../../controller/IAState';
import { Application, Container } from 'pixi.js';
import { StarryBackground } from './background';
import { IACharacter } from './ia';
import { loadAsepriteSheet } from './ParseAsepriteAnimationSheet';
import { SocketController } from '../../controller/SocketController';
import { WorldController } from '../../controller/WorldController';
import { MicrophoneController } from '../../controller/MicrophoneController';

/**
 * Gestor principal de la app Pixi. Orquesta la escena, IA y controladores.
 */
export class PixiAppManager {
  public iaState: IAState;
  private pixiApp: Application | null = null;
  private iaCharacter: IACharacter | null = null;
  private iaTargetPosition: { x: number, y: number } | null = null;
  private mainScreen!: Container;
  private options: { element: Element };

  // Controladores públicos para acceso externo (readonly para evitar reasignación accidental)
  public readonly socketController: SocketController;
  public worldController: WorldController;
  public readonly microphoneController: MicrophoneController;

  // Evita múltiples animaciones de nacimiento
  private _iaBornHandled = false;

  constructor(
    options: { element: Element },
    socketController: SocketController,
    worldController: WorldController,
    microphoneController: MicrophoneController,
    iaState: IAState
  ) {
    this.options = options;
    this.socketController = socketController;
    this.worldController = worldController;
    this.microphoneController = microphoneController;
    this.iaState = iaState;
    // Eventos de socket
    this._setupSocketEvents();
  }

  /**
   * Configura los listeners de socket para la IA y el mundo.
   */
  private _setupSocketEvents() {
    const socket = this.socketController.getSocket();
    socket.on('ia-born', this._updateIAVisibility.bind(this));
    socket.on('ia-born-request', () => this._handleIABornRequest());
    socket.on('ia-change-world', (payload: { iaCurrentWorld?: string }) => {
      if (this.microphoneController.isMicActive()) {
        console.warn('[PixiAppManager] Ignorado ia-change-world porque el micrófono está activo');
        return;
      }
      if (payload?.iaCurrentWorld) {
        this.iaState.currentWorld = payload.iaCurrentWorld;
        console.log(`[IAState] currentWorld actualizado: ${payload.iaCurrentWorld}`);
      }
      this._updateIAVisibility();
    });
  }

  /**
   * Actualiza la visibilidad de la IA usando solo currentWorld
   */
  _updateIAVisibility() {
    if (!this.iaCharacter) return;
    const userWorldId = this.worldController.getCurrentWorldId();
    const iaWorldId = this.iaState.currentWorld;
    const visible = !!iaWorldId && userWorldId === iaWorldId;
    this.iaCharacter[visible ? 'show' : 'hide'](this.mainScreen);
    this.microphoneController.setMicState({ canUse: visible });
    console.log(`[PixiAppManager] IA ${visible ? 'mostrada' : 'oculta'} (currentWorld=${iaWorldId}, userWorldId=${userWorldId})`);
  }

  /**
   * Handler robusto para el nacimiento de la IA, solo ejecuta una vez.
   */
  private async _handleIABornRequest() {
    if (this._iaBornHandled) return;
    this._iaBornHandled = true;
    if (!this.iaCharacter || !this.mainScreen) return;
    try {
      const background = this.mainScreen.children.find(c => c instanceof StarryBackground) as StarryBackground | undefined;
      if (background) {
        await background.waitForBigBang();
        this.socketController.getSocket().emit('client-ready');
        await background.triggerImplosion();
      }
      this.iaCharacter.show(this.mainScreen);
      this._updateIAVisibility();
      this.iaState.born = true;
      this.socketController.emitIABorn();
      console.log('[PixiAppManager] [SOCKET] Animación de nacimiento terminada, emitido ia-born al backend');
    } catch (err) {
      console.error('[PixiAppManager] [SOCKET] Error en animación de nacimiento IA:', err);
    }
  }

  // Ya no se necesita setupSocketEvents, el worldController se pasa desde fuera y está sincronizado

  public async init() {
    // ...existing code...
    // Tras la animación, si la IA ya nació en el backend, mostrarla y habilitar el micrófono si corresponde
    if (this.iaCharacter) {
      const userWorldId = this.worldController.getCurrentWorldId();
      const iaWorldId = this.iaState.currentWorld;
      const iaPresente = !!iaWorldId && userWorldId === iaWorldId && this.iaState.born;
      if (iaPresente) {
        this.iaCharacter.show(this.mainScreen);
        this.microphoneController.setMicState({ canUse: true });
      } else {
        this.microphoneController.setMicState({ canUse: false });
      }
    }
    this.destroy();
    const app = new Application();
    await app.init({
      resolution: 1,
      antialias: false,
      backgroundColor: 0x000000,
      powerPreference: 'low-power',
      resizeTo: window,
    });
    this.pixiApp = app;
    app.canvas.classList.add('pixi');
    this.options.element.appendChild(app.canvas);
    this.mainScreen = new Container();
    const background = new StarryBackground(app);
    background.filters = [];
    this.mainScreen.addChild(background);
    app.ticker.add(() => {
      if (!document.hidden) {
        background.update();
      }
    });
    app.stage.addChild(this.mainScreen);
    app.ticker.maxFPS = 60;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        app.ticker.stop();
      } else {
        app.ticker.start();
      }
    });
    window.addEventListener('beforeunload', () => this.destroy());
    // (isOrigin solo para debug, no afecta la lógica principal)
    // Instanciar la IA antes de emitir client-ready
    const spritesheet = await loadAsepriteSheet('IA', '/prototype_character.json');
    this.iaCharacter = new IACharacter(
      app.renderer.width / 2,
      app.renderer.height / 2,
      spritesheet,
      'IACharacter',
      100,
      2
    );
    // Siempre ocultar la IA al iniciar
    if (this.iaCharacter) this.iaCharacter.hide(this.mainScreen);

    // Esperar a que termine el Big Bang y emitir client-ready
    await background.waitForBigBang();

    // Tras la animación, si la IA ya nació en el backend, mostrarla directamente
    if (this.iaCharacter) {
      const userWorldId = this.worldController.getCurrentWorldId();
      const iaWorldId = this.iaState.currentWorld;
      if (!!iaWorldId && userWorldId === iaWorldId && this.iaState.born) {
        this.iaCharacter.show(this.mainScreen);
      }
    }

    this.socketController.getSocket().emit('client-ready');
    console.log('[PixiAppManager] [SOCKET] Emitido client-ready tras Big Bang (init)');
    // Lógica limpia: solo preparar escena, la animación de nacimiento y el aviso al backend se hacen SOLO en el handler de 'ia-born-request'.
    if (!this.worldController) return;
    app.ticker.add(() => {
      if (this.iaCharacter && this.mainScreen.children.includes(this.iaCharacter)) {
        if (this.iaTargetPosition) {
          const arrived = this.iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, this.iaTargetPosition);
          if (arrived) this.iaTargetPosition = null;
        } else {
          this.iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, null);
        }
      }
    });
  }
  public setIATargetPosition(pos: { x: number, y: number } | null) {
    this.iaTargetPosition = pos;
  }
  public getPixiApp() {
    return this.pixiApp;
  }
  public getMainScreen() {
    return this.mainScreen;
  }
  public getIACharacter() {
    return this.iaCharacter;
  }

  /**
   * Limpia la aplicación Pixi y elimina el canvas del DOM.
   */
  public destroy() {
    if (this.pixiApp) {
      this.pixiApp.destroy(true, { children: true, texture: true });
      if (this.pixiApp.canvas && this.pixiApp.canvas.parentNode) {
        this.pixiApp.canvas.parentNode.removeChild(this.pixiApp.canvas);
      }
      this.pixiApp = null;
    }
    this.iaCharacter = null;
    this.iaTargetPosition = null;
  }
}

