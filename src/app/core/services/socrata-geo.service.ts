import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

export interface SocrataDept      { cod_dpto: string; nom_dpto: string; }
export interface SocrataMunicipio { cod_mpio: string; nom_mpio: string; }
export interface SocrataVereda    { cod_vere: string; nom_vere: string; }

// SODA v2 endpoint — supports $select, $where, $group, $order, $limit
const BASE  = 'https://www.datos.gov.co/resource/ijj8-hnqp.json';
const TOKEN = 'c3lGkEH9p9QVmsDy9PWfb7hGS';

@Injectable({ providedIn: 'root' })
export class SocrataGeoService {
  private http = inject(HttpClient);

  private depts$?: Observable<SocrataDept[]>;
  private mpiosCache   = new Map<string, Observable<SocrataMunicipio[]>>();
  private veredasCache = new Map<string, Observable<SocrataVereda[]>>();

  getDepartamentos(): Observable<SocrataDept[]> {
    if (!this.depts$) {
      this.depts$ = this.http.get<SocrataDept[]>(BASE, {
        params: {
          '$$app_token': TOKEN,
          '$select': 'cod_dpto, nom_dpto',
          '$group':  'cod_dpto, nom_dpto',
          '$order':  'nom_dpto',
          '$limit':  '100',
        },
      }).pipe(shareReplay(1));
    }
    return this.depts$;
  }

  getMunicipios(codDpto: string): Observable<SocrataMunicipio[]> {
    if (!this.mpiosCache.has(codDpto)) {
      const obs$ = this.http.get<SocrataMunicipio[]>(BASE, {
        params: {
          '$$app_token': TOKEN,
          '$select': 'cod_mpio, nom_mpio',
          '$where':  `cod_dpto='${codDpto}'`,
          '$group':  'cod_mpio, nom_mpio',
          '$order':  'nom_mpio',
          '$limit':  '300',
        },
      }).pipe(shareReplay(1));
      this.mpiosCache.set(codDpto, obs$);
    }
    return this.mpiosCache.get(codDpto)!;
  }

  getVeredas(codMpio: string): Observable<SocrataVereda[]> {
    if (!this.veredasCache.has(codMpio)) {
      const obs$ = this.http.get<SocrataVereda[]>(BASE, {
        params: {
          '$$app_token': TOKEN,
          '$select': 'cod_vere, nom_vere',
          '$where':  `cod_mpio='${codMpio}' AND estado='ACTIVO'`,
          '$group':  'cod_vere, nom_vere',
          '$order':  'nom_vere',
          '$limit':  '1000',
        },
      }).pipe(shareReplay(1));
      this.veredasCache.set(codMpio, obs$);
    }
    return this.veredasCache.get(codMpio)!;
  }
}
