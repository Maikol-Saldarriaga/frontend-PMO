import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { CursorPage } from '../../api/paginate';
import { ENDPOINTS } from '../../api/endpoints';
import { Notification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiHttpClient);

  list(params?: { cursor?: string | number; limit?: number }): Observable<CursorPage<Notification>> {
    const query: Record<string, string> = { limit: String(params?.limit ?? 20) };
    if (params?.cursor) query['cursor'] = String(params.cursor);
    return this.api.get<CursorPage<Notification>>(ENDPOINTS.notifications.list, { params: query });
  }

  markRead(id: string): Observable<void> {
    return this.api.patch<void>(ENDPOINTS.notifications.markRead(id), {});
  }

  markAllRead(): Observable<void> {
    return this.api.patch<void>(ENDPOINTS.notifications.markAllRead, {});
  }
}
