import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

export interface SocrataDept      { cod_dpto: string; nom_dpto: string; }
export interface SocrataMunicipio { cod_mpio: string; nom_mpio: string; }
export interface SocrataVereda    { cod_vere: string; nom_vere: string; }

// ArcGIS REST — Prosperidad Social (cubre los 33 departamentos de Colombia)
const BASE = 'https://gis.prosperidadsocial.gov.co/arcgis/rest/services/Migracion/Veredas/FeatureServer/0/query';

@Injectable({ providedIn: 'root' })
export class SocrataGeoService {
  private http = inject(HttpClient);

  private depts$?: Observable<SocrataDept[]>;
  private mpiosCache   = new Map<string, Observable<SocrataMunicipio[]>>();
  private veredasCache = new Map<string, Observable<SocrataVereda[]>>();

  getDepartamentos(): Observable<SocrataDept[]> {
    if (!this.depts$) {
      this.depts$ = this.http.get<any>(BASE, {
        params: {
          where:                 '1=1',
          returnDistinctValues:  'true',
          returnGeometry:        'false',
          outFields:             'COD_DPTO,NOM_DEP',
          orderByFields:         'NOM_DEP',
          resultRecordCount:     '100',
          f:                     'json',
        },
      }).pipe(
        map(res => (res.features as any[]).map(f => ({
          cod_dpto: f.attributes.COD_DPTO,
          nom_dpto: f.attributes.NOM_DEP,
        }))),
        shareReplay(1),
      );
    }
    return this.depts$;
  }

  getMunicipios(codDpto: string): Observable<SocrataMunicipio[]> {
    if (!this.mpiosCache.has(codDpto)) {
      const obs$ = this.http.get<any>(BASE, {
        params: {
          where:                `COD_DPTO='${codDpto}'`,
          returnDistinctValues: 'true',
          returnGeometry:       'false',
          outFields:            'DPTOMPIO,NOMB_MPIO',
          orderByFields:        'NOMB_MPIO',
          resultRecordCount:    '500',
          f:                    'json',
        },
      }).pipe(
        map(res => (res.features as any[]).map(f => ({
          cod_mpio: f.attributes.DPTOMPIO,
          nom_mpio: f.attributes.NOMB_MPIO,
        }))),
        shareReplay(1),
      );
      this.mpiosCache.set(codDpto, obs$);
    }
    return this.mpiosCache.get(codDpto)!;
  }

  getVeredas(codMpio: string): Observable<SocrataVereda[]> {
    if (!this.veredasCache.has(codMpio)) {
      const obs$ = this.http.get<any>(BASE, {
        params: {
          where:          `DPTOMPIO='${codMpio}'`,
          returnGeometry: 'false',
          outFields:         'CODIGO_VER,NOMBRE_VER',
          orderByFields:     'NOMBRE_VER',
          resultRecordCount: '2000',
          f:                 'json',
        },
      }).pipe(
        map(res => (res.features as any[]).map(f => ({
          cod_vere: f.attributes.CODIGO_VER,
          nom_vere: f.attributes.NOMBRE_VER,
        }))),
        shareReplay(1),
      );
      this.veredasCache.set(codMpio, obs$);
    }
    return this.veredasCache.get(codMpio)!;
  }
}
