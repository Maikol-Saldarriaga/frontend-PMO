import { HttpInterceptorFn, HttpHandlerFn, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthStore } from '../../auth/store/auth.store';
import { AuthService } from '../../auth/services/auth.service';
import { ENDPOINTS } from '../endpoints';

// Estado compartido entre todas las invocaciones del interceptor (singleton de módulo)
// para encolar peticiones 401 concurrentes mientras se refresca el token una sola vez.
let isRefreshing = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

function addAuthHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authStore   = inject(AuthStore);
  const authService = inject(AuthService);
  const router      = inject(Router);

  const forceLogout = () => {
    authStore.clearSession();
    router.navigate(['/login']);
  };

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthEndpoint = req.url === ENDPOINTS.auth.refresh || req.url === ENDPOINTS.auth.login;

      if (err.status !== 401 || isAuthEndpoint) {
        return throwError(() => err);
      }

      if (!authStore.refreshToken()) {
        forceLogout();
        return throwError(() => err);
      }

      if (isRefreshing) {
        return refreshedToken$.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap(token => next(addAuthHeader(req, token)))
        );
      }

      isRefreshing = true;
      refreshedToken$.next(null);

      return authService.refresh().pipe(
        switchMap(res => {
          isRefreshing = false;
          refreshedToken$.next(res.access_token);
          return next(addAuthHeader(req, res.access_token));
        }),
        catchError(refreshErr => {
          isRefreshing = false;
          forceLogout();
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
