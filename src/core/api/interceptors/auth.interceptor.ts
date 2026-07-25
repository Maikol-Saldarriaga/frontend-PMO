import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../../auth/store/auth.store';
import { ENDPOINTS } from '../endpoints';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authStore = inject(AuthStore);
  const token     = authStore.token();

  const isExternal = req.url.includes('datos.gov.co') || req.url.includes('prosperidadsocial.gov.co') || req.url.includes('worldtimeapi.org');
  // El refresh va con el refresh_token en el body; si mandamos el access token vencido
  // en el header, algunos backends lo rechazan en el middleware antes de validar el body.
  const isRefresh  = req.url === ENDPOINTS.auth.refresh;
  if (!token || isExternal || isRefresh) return next(req);

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  return next(authReq);
};
