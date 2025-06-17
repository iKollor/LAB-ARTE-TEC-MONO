# Proyecto de Gestión de Mundos y IA

Este proyecto es una aplicación que gestiona mundos virtuales y la inteligencia artificial (IA) asociada a ellos. Utiliza un servidor HTTP junto con Socket.io para permitir la comunicación en tiempo real entre el servidor y los clientes.

## Estructura del Proyecto

- **src/index.ts**: Punto de entrada principal que inicializa el servidor y configura las rutas necesarias.
- **src/server.ts**: Configuración del servidor HTTP y la integración con Socket.io.
- **src/socket/index.ts**: Lógica de eventos de Socket.io para manejar la comunicación con los clientes.
- **src/services/worldManager.ts**: Gestión de mundos y sesiones de usuario.
- **src/services/aiManager.ts**: Lógica y estado de la IA, incluyendo decisiones y acciones basadas en el estado del juego.
- **src/types/index.ts**: Definición de tipos e interfaces en TypeScript utilizados en el proyecto.

## Instalación

1. Clona el repositorio:
   ```
   git clone <URL_DEL_REPOSITORIO>
   ```
2. Navega al directorio del proyecto:
   ```
   cd backend
   ```
3. Instala las dependencias:
   ```
   npm install
   ```

## Uso

Para iniciar el servidor, ejecuta el siguiente comando:
```
npm start
```

Esto iniciará el servidor y permitirá la conexión de los clientes a través de Socket.io.

## Contribuciones

Las contribuciones son bienvenidas. Si deseas contribuir, por favor abre un issue o envía un pull request.

## Licencia

Este proyecto está bajo la licencia MIT.