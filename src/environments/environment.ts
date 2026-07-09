export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  // Bloquea crear/editar entregables y seguimiento cuando la fecha fin ya pasó.
  // Poner en `false` SOLO temporalmente para pruebas locales; no lo dejes así en producción.
  enforceDeliveryDateLocks: false,
};
