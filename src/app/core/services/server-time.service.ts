import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of, shareReplay } from 'rxjs';

interface WorldTimeApiResponse {
  utc_datetime: string;
}

const TIME_API = 'https://worldtimeapi.org/api/timezone/Etc/UTC';

/**
 * Calcula el desfase entre el reloj local del navegador y la hora real de internet,
 * para que las validaciones de fecha (ej. vencimiento de entregables) no dependan
 * del reloj del equipo del usuario, que puede estar mal configurado.
 */
@Injectable({ providedIn: 'root' })
export class ServerTimeService {
  private http = inject(HttpClient);

  private offsetMs$?: Observable<number>;

  private fetchOffset(): Observable<number> {
    const localBefore = Date.now();
    return this.http.get<WorldTimeApiResponse>(TIME_API).pipe(
      map(res => {
        const serverNow = new Date(res.utc_datetime).getTime();
        return serverNow - localBefore;
      }),
      catchError(() => of(0)),
      shareReplay(1),
    );
  }

  private getOffset(): Observable<number> {
    if (!this.offsetMs$) this.offsetMs$ = this.fetchOffset();
    return this.offsetMs$;
  }

  /** Hora actual real (internet), con fallback silencioso al reloj local si la API externa falla. */
  getNow(): Observable<Date> {
    return this.getOffset().pipe(map(offset => new Date(Date.now() + offset)));
  }
}
