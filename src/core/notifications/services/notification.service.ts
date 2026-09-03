import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { Notification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiHttpClient);

  list(): Observable<Notification[]> {
    return this.api.get<Notification[]>(ENDPOINTS.notifications.list);
  }

  markRead(id: string): Observable<void> {
    return this.api.patch<void>(ENDPOINTS.notifications.markRead(id), {});
  }

  markAllRead(): Observable<void> {
    return this.api.patch<void>(ENDPOINTS.notifications.markAllRead, {});
  }
}
