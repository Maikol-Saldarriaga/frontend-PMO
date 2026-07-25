import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { PROJECT_CREATOR_ROLES } from '../models/role.model';

export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  if (authStore.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

// Solo ADMIN, COORDINADOR y DILIGENCIADOR pueden crear proyectos.
export const canCreateProjectGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  const role = authStore.user()?.role;
  if (role && PROJECT_CREATOR_ROLES.includes(role)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};

// Solo ADMIN — secciones de administración (ej. Alianzas).
export const adminGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  if (authStore.user()?.role === 'ADMIN') {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};

// Enruta '/' y cualquier ruta no encontrada según haya o no sesión persistida,
// en vez de mandar siempre a /login sin mirar el token guardado.
export const rootRedirectGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router    = inject(Router);

  return router.createUrlTree([authStore.isLoggedIn() ? '/dashboard' : '/login']);
};
