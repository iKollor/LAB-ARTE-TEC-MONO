import { Application, Container } from 'pixi.js';
import { StarryBackground } from './background';
import { IACharacter } from './ia';
import { loadAsepriteSheet } from './ParseAsepriteAnimationSheet';
import socket from '../socket';

let pixiApp: Application | null = null;
let showNacimiento = false;

socket.on('world-assigned', (data) => {
  showNacimiento = !!data.isOrigin;
});

export async function init(element: Element) {
  // Si ya existe una instancia previa, destrúyela
  if (pixiApp) {
    pixiApp.destroy(true, { children: true, texture: true });
    if (pixiApp.canvas.parentNode) {
      pixiApp.canvas.parentNode.removeChild(pixiApp.canvas);
    }
    pixiApp = null;
  }

  // Inicializar aplicación PIXI con configuración optimizada
  const app = new Application();
  await app.init({
    resolution: 1, // Reducir resolución para mejorar rendimiento
    antialias: false, // Desactivar antialias para dispositivos lentos
    backgroundColor: 0x000000, // Color de fondo
    powerPreference: 'low-power', // Optimizar para dispositivos de bajo rendimiento
    resizeTo: window, // Ajustar tamaño automáticamente
  });
  pixiApp = app;

  // Adjuntar el canvas al DOM ANTES de cualquier animación
  app.canvas.classList.add('pixi');
  element.appendChild(app.canvas);

  // Crear contenedor principal
  const mainScreen = new Container();

  // Agregar fondo estrellado
  const background = new StarryBackground(app);

  // Eliminar filtro Glow del fondo de estrellas
  background.filters = [];

  mainScreen.addChild(background);

  // Optimizar lógica de actualización
  app.ticker.add(() => {
    if (!document.hidden) {
      background.update();
    }
  });

  // Agregar mainScreen al escenario
  app.stage.addChild(mainScreen);

  // Limitar la tasa de fotogramas
  app.ticker.maxFPS = 60;

  // Pausar el ticker si la pestaña está inactiva
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.ticker.stop();
    } else {
      app.ticker.start();
    }
  });

  // Limpiar Pixi al descargar la página
  window.addEventListener('beforeunload', () => {
    if (pixiApp) {
      pixiApp.destroy(true, { children: true, texture: true });
      if (pixiApp.canvas.parentNode) {
        pixiApp.canvas.parentNode.removeChild(pixiApp.canvas);
      }
      pixiApp = null;
    }
  });

  // Esperar a que termine el Big Bang y activar la implosión si es origen
  if (showNacimiento) {
    // Generar el personaje de la IA después de la implosión
    background.waitForBigBang().then(() => {
      background.triggerImplosion().then(async () => {
        const spritesheet = await loadAsepriteSheet('IA', '/prototype_character.json');
        console.log('Spritesheet cargado:', spritesheet);

        const iaCharacter = new IACharacter(
          app.renderer.width / 2, // Posición inicial X (centro)
          app.renderer.height / 2, // Posición inicial Y (centro)
          spritesheet,
          'IACharacter', // Nombre del personaje
          100, // HP
          2 // Velocidad
        );

        // Generar puntos aleatorios para patrullaje, comenzando desde el centro
        const randomPatrolPoints = [
          { x: app.renderer.width / 2, y: app.renderer.height / 2 }, // Centro
          ...Array.from({ length: 5 }, () => ({
            x: Math.random() * app.renderer.width,
            y: Math.random() * app.renderer.height,
          }))
        ];

        iaCharacter.setAutonomousPatrol(randomPatrolPoints);
        mainScreen.addChild(iaCharacter);

        // Actualizar el movimiento de la IA en cada frame
        app.ticker.add(() => {
          iaCharacter.updateAI(app.ticker.deltaMS);
        });
      }).catch((error) => {
        console.error('Error durante la implosión:', error);
      });
    }).catch((error) => {
      console.error('Error durante el Big Bang:', error);
    });
  }
}
