import type { Socket } from 'socket.io-client';

export type IAControlEvents = {
  onMove?: (position: { x: number, y: number }) => void;
  onSpeak?: (text: string) => void;
  onListen?: () => void;
  onChangeWorld?: (worldId: string) => void;
  onInteract?: (target: string) => void;
};

export class IAControl {
  private events: IAControlEvents;
  private socket: Socket;

  constructor(events: IAControlEvents, socket: Socket) {
    this.events = events;
    this.socket = socket;
    this.registerSocketEvents();
  }

  private registerSocketEvents() {
    this.socket.on('ia-move', (data) => {
      console.log('[IA-FRONT] Recibido ia-move:', data);
      if (data.position && this.events.onMove) {
        this.events.onMove(data.position);
      }
    });
    this.socket.on('ia-speak', (data) => {
      console.log('[IA-FRONT] Recibido ia-speak:', data);
      if (data.text && this.events.onSpeak) {
        this.events.onSpeak(data.text);
      }
    });
    this.socket.on('ia-listen', () => {
      console.log('[IA-FRONT] Recibido ia-listen');
      if (this.events.onListen) {
        this.events.onListen();
      }
    });
    this.socket.on('ia-change-world', (data) => {
      console.log('[IA-FRONT] Recibido ia-change-world:', data);
      if (data.worldId && this.events.onChangeWorld) {
        this.events.onChangeWorld(data.worldId);
      }
    });
    this.socket.on('ia-interact', (data) => {
      console.log('[IA-FRONT] Recibido ia-interact:', data);
      if (data.target && this.events.onInteract) {
        this.events.onInteract(data.target);
      }
    });
  }
}
