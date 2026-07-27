export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  // Espejo de ALLOW_PAST_EDITS del backend (.env). true = admin puede seguir editando
  // entregables, seguimiento y proyectos con fecha (final o extendida) ya vencida.
  // false = solo lectura para todos, admin incluido. El backend es la autoridad real;
  // esto solo evita mostrar botones que el servidor rechazaría con 403.
  allowPastEdits: true,
};
