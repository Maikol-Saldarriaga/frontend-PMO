import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map } from 'rxjs';
import { ENDPOINTS } from '../../../core/api/endpoints';

export interface DivipolaDept {
  cod_dpto: string;
  nom_dpto: string;
}

export interface DivipolaMunicipio {
  cod_mpio: string;
  nom_mpio: string;
}

export interface DivipolaVereda {
  cod_vere: string;
  nom_vere: string;
  latitud?:  number | null;
  longitud?: number | null;
}

export interface CreateVeredaPayload {
  cod_mpio: string;
  nom_vere: string;
  latitud?:  number;
  longitud?: number;
}

export interface LocationResult {
  type:         'municipio' | 'vereda';
  name:         string;
  municipality: string;
  department:   string;
  cod:          string;
  cod_mpio:     string;
}

interface SearchApiItem {
  type:     'municipio' | 'vereda';
  cod_mpio: string;
  nom_mpio: string;
  cod_dpto: string;
  nom_dpto: string;
  cod_vere?: string;
  nom_vere?: string;
}

/** Fuente propia (DIVIPOLA) para departamentos/municipios/veredas. Reemplaza a SocrataGeoService y ColombiaApiService. */
@Injectable({ providedIn: 'root' })
export class DivipolaGeoService {
  private http = inject(HttpClient);

  private departamentos$?: Observable<DivipolaDept[]>;
  private municipiosCache = new Map<string, Observable<DivipolaMunicipio[]>>();
  private veredasCache    = new Map<string, Observable<DivipolaVereda[]>>();

  getDepartamentos(): Observable<DivipolaDept[]> {
    if (!this.departamentos$) {
      this.departamentos$ = this.http
        .get<DivipolaDept[]>(ENDPOINTS.divipola.departamentos)
        .pipe(shareReplay(1));
    }
    return this.departamentos$;
  }

  getMunicipios(codDpto: string): Observable<DivipolaMunicipio[]> {
    if (!this.municipiosCache.has(codDpto)) {
      const obs$ = this.http
        .get<DivipolaMunicipio[]>(ENDPOINTS.divipola.municipios(codDpto))
        .pipe(shareReplay(1));
      this.municipiosCache.set(codDpto, obs$);
    }
    return this.municipiosCache.get(codDpto)!;
  }

  getVeredas(codMpio: string): Observable<DivipolaVereda[]> {
    if (!this.veredasCache.has(codMpio)) {
      const obs$ = this.http
        .get<DivipolaVereda[]>(ENDPOINTS.divipola.veredas(codMpio))
        .pipe(shareReplay(1));
      this.veredasCache.set(codMpio, obs$);
    }
    return this.veredasCache.get(codMpio)!;
  }

  createVereda(payload: CreateVeredaPayload): Observable<DivipolaVereda> {
    this.veredasCache.delete(payload.cod_mpio);
    return this.http.post<DivipolaVereda>(ENDPOINTS.divipola.createVereda, payload);
  }

  searchAll(term: string): Observable<LocationResult[]> {
    return this.http
      .get<SearchApiItem[]>(ENDPOINTS.divipola.search, { params: { q: term } })
      .pipe(map(items => items.map(i => ({
        type:         i.type,
        name:         i.type === 'vereda' ? (i.nom_vere ?? '') : i.nom_mpio,
        municipality: i.nom_mpio,
        department:   i.nom_dpto,
        cod:          i.type === 'vereda' ? (i.cod_vere ?? '') : i.cod_mpio,
        cod_mpio:     i.cod_mpio,
      }))));
  }
}
