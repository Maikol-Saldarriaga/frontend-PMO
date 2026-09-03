export interface CostCenter {
  id:         string;
  company_id: string;
  code:       string;
  name:       string;
  is_active:  boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CostCenterRequest {
  code:       string;
  name:       string;
  sort_order: number;
}
