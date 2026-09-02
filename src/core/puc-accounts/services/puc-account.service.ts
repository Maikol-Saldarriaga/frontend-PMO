import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { PUCAccount, PUCAccountRequest } from '../models/puc-account.model';

@Injectable({ providedIn: 'root' })
export class PUCAccountService {
  private api = inject(ApiHttpClient);

  list(): Observable<PUCAccount[]> {
    return this.api.get<PUCAccount[]>(ENDPOINTS.pucAccounts.list);
  }

  create(body: PUCAccountRequest): Observable<PUCAccount> {
    return this.api.post<PUCAccount>(ENDPOINTS.pucAccounts.create, body);
  }

  update(id: string, body: PUCAccountRequest): Observable<PUCAccount> {
    return this.api.put<PUCAccount>(ENDPOINTS.pucAccounts.update(id), body);
  }

  deactivate(id: string): Observable<void> {
    return this.api.delete<void>(ENDPOINTS.pucAccounts.deactivate(id));
  }
}
