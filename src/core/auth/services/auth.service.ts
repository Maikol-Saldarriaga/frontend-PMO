import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { AuthStore } from '../store/auth.store';
import { LoginRequest, LoginResponse, RefreshResponse, UserProfile } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http      = inject(ApiHttpClient);
  private authStore = inject(AuthStore);
  private router    = inject(Router);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(ENDPOINTS.auth.login, credentials).pipe(
      tap(res => {
        const user: UserProfile = {
          id:        res.user_id,
          name:      res.name,
          email:     res.email,
          role:      res.role,
          image_url: res.image_url,
        };
        this.authStore.setSession(res.access_token, res.refresh_token, user);
        this.router.navigate(['/dashboard']);
      })
    );
  }

  refresh(): Observable<RefreshResponse> {
    const refreshToken = this.authStore.refreshToken();
    return this.http.post<RefreshResponse>(ENDPOINTS.auth.refresh, { refresh_token: refreshToken }).pipe(
      tap(res => this.authStore.setAccessToken(res.access_token))
    );
  }

  logout(): void {
    this.http.post(ENDPOINTS.auth.logout, {}).pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      this.authStore.clearSession();
      this.router.navigate(['/login']);
    });
  }

  isLoggedIn(): boolean {
    return this.authStore.isLoggedIn();
  }
}
