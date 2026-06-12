import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { AuthStore } from '../../auth/store/auth.store';
import { UserDetail, UpdateUserRequest, UpdateUserResponse } from '../models/user.model';
import { API_BASE_URL } from '../../config/api.config';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http      = inject(ApiHttpClient);
  private authStore = inject(AuthStore);

  private resolveImageUrl(raw: string | null): string | null {
    if (!raw) return null;
    const host = new URL(API_BASE_URL).hostname;
    return raw.replace('localhost', host);
  }

  getProfile(userId: string): Observable<UserDetail> {
    return this.http.get<UserDetail>(ENDPOINTS.users.get(userId)).pipe(
      tap(res => {
        this.authStore.updateUser({
          name:      `${res.first_name} ${res.first_surname}`,
          role:      res.role,
          image_url: this.resolveImageUrl(res.image_url),
        });
      })
    );
  }

  updateProfile(userId: string, data: UpdateUserRequest): Observable<UpdateUserResponse> {
    const form = new FormData();
    form.append('first_name',               data.first_name);
    form.append('first_surname',            data.first_surname);
    form.append('role',                     data.role);
    form.append('phone',                    data.phone);
    form.append('birthdate',                data.birthdate);
    form.append('document_type',            data.document_type);
    form.append('identity_document_number', data.identity_document_number);
    if (data.image_url) {
      form.append('image_url', data.image_url, data.image_url.name);
    }

    return this.http.put<UpdateUserResponse>(ENDPOINTS.users.update(userId), form).pipe(
      tap(res => {
        this.authStore.updateUser({
          name:      res.name,
          role:      res.role,
          image_url: this.resolveImageUrl(res.image_url),
        });
      })
    );
  }
}
