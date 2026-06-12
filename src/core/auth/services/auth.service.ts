import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { ApiHttpClient } from '../../api/http-client';
import { ENDPOINTS } from '../../api/endpoints';
import { AuthStore } from '../store/auth.store';
import { LoginRequest, LoginResponse } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http      = inject(ApiHttpClient);
  private authStore = inject(AuthStore);
  private router    = inject(Router);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(ENDPOINTS.auth.login, credentials).pipe(
      tap(res => {
        const user: import('../models/auth.model').UserProfile = {
          id:        res.user_id,
          name:      res.name,
          email:     res.email,
          role:      res.role,
          image_url: res.image_url,
        };
        this.authStore.setSession(res.access_token, user);
        this.router.navigate(['/dashboard']);
      })
    );
  }

  logout(): void {
    this.authStore.clearSession();
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return this.authStore.isLoggedIn();
  }
}
