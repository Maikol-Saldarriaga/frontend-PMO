import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../store/auth.store';

export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  if (authStore.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

// Enruta '/' y cualquier ruta no encontrada según haya o no sesión persistida,
// en vez de mandar siempre a /login sin mirar el token guardado.
export const rootRedirectGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  return router.createUrlTree([authStore.isLoggedIn() ? '/dashboard' : '/login']);
};
