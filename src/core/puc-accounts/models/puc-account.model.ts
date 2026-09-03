export interface PUCAccount {
  id:         string;
  company_id: string;
  code:       string;
  name:       string;
  is_active:  boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PUCAccountRequest {
  code:       string;
  name:       string;
  sort_order: number;
}

export interface PUCAccountListParams {
  cursor?: string;
  limit?:  number;
  search?: string;
  status?: 'active' | 'inactive';
}

export interface PUCAccountStats {
  total:    number;
  active:   number;
  inactive: number;
}

export interface PUCAccountPage {
  data:        PUCAccount[];
  next_cursor: string | null;
  stats:       PUCAccountStats;
}

/** Versión liviana (solo activas, ordenadas) para poblar dropdowns/pickers —
 * GET /puc-accounts/picker, cacheado 30min en backend. */
export interface PUCAccountLite {
  id:   string;
  code: string;
  name: string;
}
