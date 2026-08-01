import { Observable, expand, reduce, map, EMPTY } from 'rxjs';
import { ApiHttpClient } from './http-client';

export interface CursorPage<T> {
  data: T[];
  next_cursor: string | number | null;
}

/**
 * Recorre todas las páginas de un endpoint con paginación cursor (data, next_cursor)
 * y devuelve el array completo. Usado en selects/dropdowns que necesitan el
 * set completo de una vez (no tienen UI de "cargar más").
 */
export function fetchAllPages<T>(
  http: ApiHttpClient,
  url: string,
  baseParams: Record<string, string> = {},
  limit = 100,
): Observable<T[]> {
  return http.get<any>(url, { params: { ...baseParams, limit: String(limit) } }).pipe(
    expand(res => {
      const cursor = res?.next_cursor;
      if (!cursor && cursor !== 0) return EMPTY;
      return http.get<any>(url, { params: { ...baseParams, limit: String(limit), cursor: String(cursor) } });
    }),
    map(res => Array.isArray(res) ? res : (res?.data ?? [])),
    reduce((acc: T[], page: T[]) => acc.concat(page), []),
  );
}
