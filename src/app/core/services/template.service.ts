import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiHttpClient } from '../../../core/api/http-client';
import { ENDPOINTS } from '../../../core/api/endpoints';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private http = inject(ApiHttpClient);

  download(name: string): Observable<Blob> {
    return this.http.getBlob(ENDPOINTS.templates.download(name));
  }
}
