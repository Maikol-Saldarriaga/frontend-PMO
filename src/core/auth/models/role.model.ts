export type UserRole = 'ADMIN' | 'COORDINADOR' | 'DILIGENCIADOR' | 'LAWYER' | 'FINANCE' | 'USER' | 'SUPERVISOR_ALIADO';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN:             'Administrador',
  COORDINADOR:       'Coordinador',
  DILIGENCIADOR:     'Diligenciador',
  LAWYER:            'Abogado',
  FINANCE:           'Financiero',
  USER:              'Usuario',
  SUPERVISOR_ALIADO: 'Supervisor aliado',
};

export const PROJECT_CREATOR_ROLES: UserRole[] = ['ADMIN', 'COORDINADOR', 'DILIGENCIADOR'];
