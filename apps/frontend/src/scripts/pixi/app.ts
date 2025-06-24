import { Application, Container } from 'pixi.js';
import { StarryBackground } from './background';
import { IACharacter } from './ia';
import { loadAsepriteSheet } from './ParseAsepriteAnimationSheet';
import socket from '../socket';

let pixiApp: Application | null = null;
let showNacimiento = false;
let iaCharacter: IACharacter | null = null;
let iaTargetPosition: { x: number, y: number } | null = null;
let mainScreen: Container;

// Escuchar eventos de control de IA desde el backend
socket.on('ia-move', (data) => {
  if (iaCharacter && data.position) {
    iaTargetPosition = { ...data.position };
    if (showNacimiento) {
      console.log('[FRONT] Recibido ia-move:', data);
    }
  }
});
socket.on('ia-speak', (data) => {
  if (iaCharacter && data.text && showNacimiento) {
    console.log('IA dice:', data.text);
  }
});
socket.on('ia-listen', () => {
  if (iaCharacter && showNacimiento) {
    console.log('IA está escuchando...');
  }
});
socket.on('ia-change-world', (data) => {
  if (!iaCharacter || !mainScreen) return;
  const myWorldId = localStorage.getItem('worldId');
  // En todos los mundos: si el backend asigna la IA a este mundo, agregarla; si no, quitarla
  if (data.worldId === myWorldId) {
    if (!mainScreen.children.includes(iaCharacter)) {
      mainScreen.addChild(iaCharacter);
      console.log('[FRONT] IA agregada al mainScreen (cambio de mundo):', data.worldId);
    }
  } else {
    if (mainScreen.children.includes(iaCharacter)) {
      mainScreen.removeChild(iaCharacter);
      console.log('[FRONT] IA eliminada del mainScreen (cambio de mundo):', data.worldId);
    }
  }
});
socket.on('ia-interact', (data) => {
  if (iaCharacter && data.target && showNacimiento) {
    console.log('IA interactúa con:', data.target);
  }
});
socket.on('world-assigned', (data) => {
  showNacimiento = !!data.isOrigin;
  localStorage.setItem('worldId', data.worldId);
  // Puedes agregar un log para depuración
  console.log('[FRONT] world-assigned:', data, 'showNacimiento:', showNacimiento);
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
  mainScreen = new Container();

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

  console.log(showNacimiento, 'showNacimiento');

  // Cargar el spritesheet y crear la IA en todos los mundos, pero solo agregarla tras la animación (origen) o cuando el backend la asigne (otros)
  const spritesheet = await loadAsepriteSheet('IA', '/prototype_character.json');
  console.log('Spritesheet cargado:', spritesheet);

  iaCharacter = new IACharacter(
    app.renderer.width / 2, // Posición inicial X (centro)
    app.renderer.height / 2, // Posición inicial Y (centro)
    spritesheet,
    'IACharacter', // Nombre del personaje
    100, // HP
    2 // Velocidad
  );

  // Nacimiento con animación solo en el mundo de origen
  if (showNacimiento) {
    background.waitForBigBang().then(() => {
      background.triggerImplosion().then(async () => {
        socket.emit('ia-born');
        console.log('[APP] Evento ia-born emitido al backend');
        if (iaCharacter && !mainScreen.children.includes(iaCharacter)) {
          mainScreen.addChild(iaCharacter);
        }
        // Actualizar el movimiento de la IA en cada frame
        app.ticker.add(() => {
          if (iaCharacter && iaTargetPosition) {
            const arrived = iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, iaTargetPosition);
            if (arrived) iaTargetPosition = null;
          }
        });
      }).catch((error) => {
        console.error('Error durante la implosión:', error);
      });
    }).catch((error) => {
      console.error('Error durante el Big Bang:', error);
    });
  } else {
    // En otros mundos, solo mover la IA si está en el escenario
    app.ticker.add(() => {
      if (iaCharacter && iaTargetPosition && mainScreen.children.includes(iaCharacter)) {
        const arrived = iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, iaTargetPosition);
        if (arrived) iaTargetPosition = null;
      }
    });
  }
}
