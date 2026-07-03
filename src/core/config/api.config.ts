import { environment } from '../../environments/environment';

// ─── Para cambiar el host del backend, edita src/environments/environment.ts (local) ───
// ─── o src/environments/environment.prod.ts (producción) ───
export const API_BASE_URL = environment.apiBaseUrl;

export const API_VERSION = 'v1';
export const API_URL     = `${API_BASE_URL}/api/${API_VERSION}`;