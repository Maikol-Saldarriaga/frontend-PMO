import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map } from 'rxjs';

export interface ColombiaDepartment {
  id:          number;
  name:        string;
  description: string | null;
}

export interface ColombiaCity {
  id:           number;
  name:         string;
  description:  string | null;
  departmentId: number;
}

const API = 'https://api-colombia.com/api/v1';

@Injectable({ providedIn: 'root' })
export class ColombiaApiService {
  private http = inject(HttpClient);

  private departments$?: Observable<ColombiaDepartment[]>;

  getDepartments(): Observable<ColombiaDepartment[]> {
    if (!this.departments$) {
      this.departments$ = this.http
        .get<ColombiaDepartment[]>(`${API}/Department`)
        .pipe(
          map(list => list.sort((a, b) => a.name.localeCompare(b.name))),
          shareReplay(1),
        );
    }
    return this.departments$;
  }

  getCities(departmentId: number): Observable<ColombiaCity[]> {
    return this.http
      .get<ColombiaCity[]>(`${API}/Department/${departmentId}/cities`)
      .pipe(map(list => list.sort((a, b) => a.name.localeCompare(b.name))));
  }
}
