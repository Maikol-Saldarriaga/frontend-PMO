import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStore } from '../../auth/store/auth.store';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authStore = inject(AuthStore);
  const token     = authStore.token();

  const isExternal = req.url.includes('datos.gov.co') || req.url.includes('prosperidadsocial.gov.co') || req.url.includes('worldtimeapi.org');
  if (!token || isExternal) return next(req);

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  return next(authReq);
};
