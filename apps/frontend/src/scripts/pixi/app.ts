import { Application, Container } from 'pixi.js';
import { StarryBackground } from './background';
import { GlowFilter } from 'pixi-filters';

export async function init(element: Element) {
  // Inicializar aplicación PIXI
  const app = new Application();
  const initializing = app.init({ resizeTo: window });

  // Esperar a que se inicialice
  await initializing;

  // Crear contenedor principal
  const mainScreen = new Container();

  // Agregar fondo estrellado
  const background = new StarryBackground(app);

  // Aplicar filtro Glow al fondo de estrellas
  background.filters = [
    new GlowFilter({
      distance: 15,
      outerStrength: 2,
      innerStrength: 0.5,
      quality: 0.5,
    }),
  ];

  mainScreen.addChild(background);

  // Agregar lógica de actualización
  app.ticker.add(() => {
    background.update();
  });

  // Agregar mainScreen al escenario
  app.stage.addChild(mainScreen);

  // Adjuntar el canvas al DOM
  app.canvas.classList.add('pixi');
  element.appendChild(app.canvas);
}
