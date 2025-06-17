export interface World {
    id: string;
    createdAt: Date;
    name?: string;
    isOrigin?: boolean; // Indica si es el mundo original
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