// apps/backend/src/micState.ts
// Estado global único para el micrófono, compartido por todos los módulos

let isMicActive = false;

export function setMicActiveState(state: boolean) {
    isMicActive = state;
}

export function getMicActiveState() {
    return isMicActive;
}
