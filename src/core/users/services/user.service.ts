import { inject, Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { AuthStore } from '../../auth/store/auth.store';
import { UserDetail, UpdateUserRequest, UpdateUserResponse } from '../models/user.model';
import { API_BASE_URL } from '../../config/api.config';
import { UserRole } from '../../auth/models/role.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http      = inject(ApiHttpClient);
  private authStore = inject(AuthStore);

  /**
   * La imagen de perfil se guarda en MinIO con URL firmada temporal; el backend la devuelve apuntando a "localhost" y aquí se reemplaza por el host real de la API.
   * Se agrega un fragmento `#` con timestamp (no viaja al servidor, no rompe la firma) para forzar al navegador a no servir la imagen vieja desde caché tras subir una nueva.
   */
  resolveImageUrl(raw: string | null): string | null {
    if (!raw) return null;
    const host = new URL(API_BASE_URL).hostname;
    return raw.replace('localhost', host) + `#${Date.now()}`;
  }

  /**
   * La URL firmada de la imagen de perfil expira (MINIO_PRESIGN_TTL) y el refresh de token no la renueva.
   * Se llama desde el (error) del <img> del usuario logueado para pedir una URL fresca sin tener que reautenticar.
   */
  refreshMyAvatarUrl(): Observable<string | null> {
    return this.http.get<{ image_url: string }>(ENDPOINTS.users.myAvatarUrl).pipe(
      map(res => this.resolveImageUrl(res.image_url)),
      tap(image_url => this.authStore.updateUser({ image_url })),
    );
  }

  /** Igual que refreshMyAvatarUrl pero para el avatar de OTRO usuario (ej. responsable de un proyecto en un listado); no toca el authStore. */
  refreshAvatarUrlById(userId: string): Observable<string | null> {
    return this.http.get<{ image_url: string }>(ENDPOINTS.users.avatarUrlById(userId)).pipe(
      map(res => this.resolveImageUrl(res.image_url)),
    );
  }

  getProfile(): Observable<UserDetail> {
    return this.http.get<UserDetail>(ENDPOINTS.users.me).pipe(
      tap(res => {
        this.authStore.updateUser({
          name:      `${res.first_name} ${res.first_surname}`,
          role:      res.role as UserRole,
          image_url: this.resolveImageUrl(res.image_url),
        });
      })
    );
  }

  updateProfile(data: UpdateUserRequest): Observable<UpdateUserResponse> {
    const form = new FormData();
    form.append('first_name',               data.first_name);
    if (data.middle_name)    form.append('middle_name',    data.middle_name);
    form.append('first_surname',            data.first_surname);
    if (data.second_surname) form.append('second_surname', data.second_surname);
    form.append('phone',                    data.phone);
    form.append('document_type',            data.document_type);
    form.append('identity_document_number', data.identity_document_number);
    if (data.image_url) {
      form.append('image_url', data.image_url, data.image_url.name);
    }

    return this.http.put<UpdateUserResponse>(ENDPOINTS.users.updateMe, form);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.patch<void>(ENDPOINTS.users.changeMyPassword, {
      current_password: currentPassword,
      new_password:      newPassword,
    });
  }
}
