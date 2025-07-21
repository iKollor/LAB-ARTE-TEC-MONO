export interface World {
    id: string;
    createdAt: string; // ISO string para compatibilidad frontend-backend
    name?: string;
    isOrigin?: boolean; // Indica si es el mundo original
    pendingDestroy?: boolean; // Indica si el mundo está pendiente de destrucción
}

export interface Session {
    id: string;
    worldId: string;
    joinedAt: Date;
}

export interface AIState {
    currentAction: string;
    currentWorld: string;
    lastUpdated: Date;
    iaBorn: boolean; // Indica si la IA ya nació en algún mundo
}