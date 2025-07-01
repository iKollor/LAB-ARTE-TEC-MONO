export interface World {
    id: string;
    createdAt: Date;
    name?: string;
    isOrigin?: boolean; // Indica si es el mundo original
    iaBorn?: boolean; // Indica si la IA ya nació en este mundo
    pendingDestroy?: boolean; // Indica si el mundo está pendiente de destrucción
}

export interface Session {
    id: string;
    worldId: string;
    joinedAt: Date;
}

export interface AIState {
    currentAction: string;
    decisionPoints: string[];
    currentWorld: string;
    lastUpdated: Date;
}