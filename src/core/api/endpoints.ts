import { API_URL } from '../config/api.config';

export const ENDPOINTS = {
  auth: {
    login:   `${API_URL}/auth/login`,
    logout:  `${API_URL}/auth/logout`,
    refresh: `${API_URL}/auth/refresh`,
    me:      `${API_URL}/auth/me`,
  },
  projects: {
    list:          `${API_URL}/projects`,
    detail:        (id: string) => `${API_URL}/projects/${id}`,
    steps:         (step: number) => `${API_URL}/projects/steps/${step}`,
    stepById:      (id: string, step: number) => `${API_URL}/projects/${id}/steps/${step}`,
    details:           (id: string) => `${API_URL}/projects/${id}/details`,
    budgetWizard:      (id: string) => `${API_URL}/projects/${id}/budget/wizard`,
    budgetBulk:        (id: string) => `${API_URL}/projects/${id}/budget/bulk`,
    budget:            (id: string) => `${API_URL}/projects/${id}/budget`,
    componentsActs:    (id: string) => `${API_URL}/projects/${id}/components/acts`,
    components:        (id: string) => `${API_URL}/projects/${id}/components`,
    componentScopes:   (id: string, cid: string) => `${API_URL}/projects/${id}/components/${cid}/scopes`,
    gantt:             (id: string) => `${API_URL}/projects/${id}/gantt`,
  },
  contracts: {
    list:           `${API_URL}/contracts`,
    detail:         (id: string) => `${API_URL}/projects/${id}`,
    wizard:         (id: string) => `${API_URL}/projects/${id}/wizard`,
    step1:          `${API_URL}/projects/steps/1`,
    step1b:         (id: string) => `${API_URL}/projects/${id}/steps/supervisors`,
    stepById:       (id: string, step: number) => `${API_URL}/projects/${id}/steps/${step}`,
    step4:          (id: string, sid: string) => `${API_URL}/projects/${id}/steps/4/${sid}`,
    scopeVerify:    (id: string, scopeId: string) => `${API_URL}/projects/${id}/scopes/${scopeId}/verifications`,
    scopeVerifyById:(id: string, scopeId: string, vid: string) => `${API_URL}/projects/${id}/scopes/${scopeId}/verifications/${vid}`,
  },
  tasks: {
    list:   `${API_URL}/tasks`,
    detail: (id: string) => `${API_URL}/tasks/${id}`,
  },
  users: {
    get:    (id: string) => `${API_URL}/users/${id}`,
    update: (id: string) => `${API_URL}/users/${id}`,
  },
  supervisors: {
    list:            `${API_URL}/projects/supervisors`,
    createUser:      `${API_URL}/users`,
    createAffiliate: (projectId: string) => `${API_URL}/projects/${projectId}/affiliates`,
  },
};
