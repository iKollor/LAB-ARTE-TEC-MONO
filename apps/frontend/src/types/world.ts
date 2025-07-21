export interface World {
    id: string;
    createdAt: string; // ISO string para compatibilidad frontend-backend
    name?: string;
    isOrigin?: boolean;
    pendingDestroy?: boolean;
}
