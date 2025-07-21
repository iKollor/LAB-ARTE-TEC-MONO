export class Logger {
    static logConnection(socketId: string) {
        console.log(`[SOCKET] Nueva conexión: ${socketId}`);
    }

    static logWorldCreated(worldId: string) {
        console.log(`[WORLD] Mundo creado: ${worldId}`);
    }

    static logWorldScheduledForDeletion(worldId: string) {
        console.log(`[WORLD] Mundo programado para eliminarse en 20s: ${worldId}`);
    }

    static logWorldDestroyed(worldId: string) {
        console.log(`[WORLD] Mundo destruido: ${worldId}`);
    }

    static logIANace(worldId: string) {
        console.log(`[IA] La IA ha nacido en el mundo: ${worldId}`);
    }

    static logIANacerPrimerMundo(worldId: string) {
        console.log(`[IA] Primer mundo creado (${worldId}), la IA nacerá aquí.`);
    }


    /**
     * Log de movimiento de la IA entre mundos
     * @param fromWorldId ID del mundo de origen
     * @param toWorldId ID del mundo destino
     */
    static logIAMove(fromWorldId: string, toWorldId: string) {
        console.log(`[IA] La IA se mueve de ${fromWorldId} a ${toWorldId}`);
    }

    /**
     * Log de movimiento de la IA dentro de un mundo
     * @param worldId ID del mundo
     * @param position Posición destino {x, y}
     */
    static logIAMoveInWorld(worldId: string, position: { x: number, y: number }) {
        console.log(`[IA] La IA se mueve en el mundo ${worldId} a la posición (${position.x}, ${position.y})`);
    }

    /**
     * Log de la posición actual de la IA
     * @param worldId ID del mundo actual de la IA
     */
    static logIACurrentWorld(worldId: string) {
        console.log(`[IA] Mundo actual de la IA: ${worldId}`);
    }
}
