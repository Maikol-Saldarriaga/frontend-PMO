import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { FodcConfigItem, UpdateTotalMoneyRequest } from '../models/fodc-config.model';

@Injectable({ providedIn: 'root' })
export class FodcConfigService {
  private api = inject(ApiHttpClient);

  getTotalMoney(): Observable<FodcConfigItem> {
    return this.api.get<FodcConfigItem>(ENDPOINTS.fodcConfig.totalMoney);
  }

  updateTotalMoney(body: UpdateTotalMoneyRequest): Observable<FodcConfigItem> {
    return this.api.put<FodcConfigItem>(ENDPOINTS.fodcConfig.totalMoney, body);
  }

  list(): Observable<FodcConfigItem[]> {
    return this.api.get<FodcConfigItem[]>(ENDPOINTS.fodcConfig.list);
  }
}
