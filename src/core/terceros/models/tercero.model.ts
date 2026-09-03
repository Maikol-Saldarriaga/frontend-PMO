export interface Tercero {
  id:                     string;
  company_id:             string;
  contract_agreement_id:  string;
  name:                   string;
  document_type:          string | null;
  document_number:        string | null;
  is_active:              boolean;
  sort_order:             number;
  created_at:             string;
  updated_at:             string;
}

export interface TerceroRequest {
  name:             string;
  document_type?:   string | null;
  document_number?: string | null;
  sort_order?:      number;
}
