import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { CostCenter, CostCenterRequest } from '../models/cost-center.model';

@Injectable({ providedIn: 'root' })
export class CostCenterService {
  private api = inject(ApiHttpClient);

  list(): Observable<CostCenter[]> {
    return this.api.get<CostCenter[]>(ENDPOINTS.costCenters.list);
  }

  create(body: CostCenterRequest): Observable<CostCenter> {
    return this.api.post<CostCenter>(ENDPOINTS.costCenters.create, body);
  }

  update(id: string, body: CostCenterRequest): Observable<CostCenter> {
    return this.api.put<CostCenter>(ENDPOINTS.costCenters.update(id), body);
  }

  deactivate(id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.costCenters.deactivate(id));
  }
}
