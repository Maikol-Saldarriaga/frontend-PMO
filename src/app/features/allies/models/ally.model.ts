export interface Ally {
  id:        string;
  name:      string;
  nit:       string | null;
  phone:     string | null;
  email:     string | null;
  address:   string | null;
  is_active: boolean;
}

export interface CreateAllyRequest {
  name:     string;
  nit?:     string | null;
  phone?:   string | null;
  email?:   string | null;
  address?: string | null;
}

export type UpdateAllyRequest = CreateAllyRequest;

// Mismo shape que AffiliateUser (supervisor.model.ts) — un supervisor aliado
// visto desde el aliado al que pertenece.
export interface AllySupervisor {
  id:                    string;
  full_name:             string;
  type_identification:   string;
  identification_number: string;
}
