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
let worldExist = false;
let iaBorn = false;
let worldAssignedData: any = null;

// Escuchar eventos de control de IA desde el backend
socket.on('ia-move', (data) => {
  if (iaCharacter && data.position) {
    iaTargetPosition = { ...data.position };
    if (showNacimiento) console.log('[FRONT] Recibido ia-move:', data);
  }
});
socket.on('ia-speak', (data) => {
  if (iaCharacter && data.text && showNacimiento) console.log('IA dice:', data.text);
});
socket.on('ia-listen', () => {
  if (iaCharacter && showNacimiento) console.log('IA está escuchando...');
});
socket.on('ia-change-world', (data) => {
  if (!iaCharacter || !mainScreen) return;
  const myWorldId = localStorage.getItem('worldId');
  const iaInStage = mainScreen.children.includes(iaCharacter);
  if (data.worldId === myWorldId && iaBorn) {
    if (!iaInStage) {
      mainScreen.addChild(iaCharacter);
      console.log('[FRONT] IA agregada al mainScreen (cambio de mundo):', data.worldId);
    }
  } else if (iaInStage) {
    mainScreen.removeChild(iaCharacter);
    console.log('[FRONT] IA eliminada del mainScreen (cambio de mundo):', data.worldId);
  }
  if (!iaBorn && iaInStage) {
    mainScreen.removeChild(iaCharacter);
    console.log('[FRONT] IA eliminada del mainScreen porque iaBorn es false');
  }
});
socket.on('ia-interact', (data) => {
  if (iaCharacter && data.target && showNacimiento) console.log('IA interactúa con:', data.target);
});
socket.on('world-assigned', (data) => {
  showNacimiento = !!data.isOrigin;
  worldExist = !!data.worldExist;
  iaBorn = !!data.iaBorn;
  localStorage.setItem('worldId', data.worldId);
  worldAssignedData = data;
  if (!iaBorn && iaCharacter && mainScreen && mainScreen.children.includes(iaCharacter)) {
    mainScreen.removeChild(iaCharacter);
    console.log('[FRONT] IA eliminada del mainScreen por world-assigned: iaBorn es false');
  }
  console.log('[FRONT] world-assigned:', data, 'showNacimiento:', showNacimiento, 'worldExist:', worldExist, 'iaBorn:', iaBorn);
});

export async function init(element: Element) {
  // Esperar a que world-assigned esté listo
  if (!worldAssignedData) {
    await new Promise(resolve => {
      const handler = (data: any) => {
        worldAssignedData = data;
        socket.off('world-assigned', handler);
        resolve(null);
      };
      socket.on('world-assigned', handler);
    });
    showNacimiento = !!worldAssignedData.isOrigin;
    worldExist = !!worldAssignedData.worldExist;
    iaBorn = !!worldAssignedData.iaBorn;
  }

  // Si ya existe una instancia previa, destrúyela
  if (pixiApp) {
    pixiApp.destroy(true, { children: true, texture: true });
    pixiApp.canvas.parentNode?.removeChild(pixiApp.canvas);
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
      pixiApp.canvas.parentNode?.removeChild(pixiApp.canvas);
      pixiApp = null;
    }
  });

  console.log(showNacimiento, 'showNacimiento');

  // Cargar el spritesheet y crear la IA
  const spritesheet = await loadAsepriteSheet('IA', '/prototype_character.json');
  iaCharacter = new IACharacter(
    app.renderer.width / 2,
    app.renderer.height / 2,
    spritesheet,
    'IACharacter',
    100,
    2
  );

  // Mostrar animación o solo estrellas según flags del backend
  if (!worldExist) {
    // Mundo nuevo: mostrar Big Bang
    background.waitForBigBang().then(() => {
      if (showNacimiento && !iaBorn) {
        // Mundo nuevo y de origen: implosión + nacimiento IA
        background.triggerImplosion().then(() => {
          if (iaCharacter && !mainScreen.children.includes(iaCharacter)) mainScreen.addChild(iaCharacter);
          if (!iaBorn) {
            socket.emit('ia-born');
            iaBorn = true;
            console.log('[APP] Evento ia-born emitido al backend (origen)');
          }
        }).catch(console.error);
      } else if (!iaBorn) {
        socket.emit('ia-born');
        iaBorn = true;
        console.log('[APP] Big Bang en mundo nuevo NO origen, solo se avisa al backend');
      }
    }).catch(console.error);
  } else {
    background.showAllStarsInstantly();
    if (!iaBorn) {
      socket.emit('ia-born');
      iaBorn = true;
      console.log('[APP] Solo se muestra fondo disperso y se avisa al backend');
    }
    if (iaCharacter && mainScreen.children.includes(iaCharacter)) mainScreen.removeChild(iaCharacter);
  }

  // Ticker global para actualizar el movimiento de la IA si está en el escenario
  app.ticker.add(() => {
    if (iaCharacter && mainScreen.children.includes(iaCharacter)) {
      if (iaTargetPosition) {
        const arrived = iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, iaTargetPosition);
        if (arrived) iaTargetPosition = null;
      } else {
        iaCharacter.updateMovementOrIdle(app.ticker.deltaMS, null);
      }
    }
  });
}
