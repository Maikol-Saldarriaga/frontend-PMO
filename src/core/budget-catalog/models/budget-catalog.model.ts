export type BudgetCostType = 'directo' | 'indirecto';

export interface BudgetComponentCatalogItem {
  id:         string;
  company_id: string;
  name:       string;
  cost_type:  BudgetCostType;
  is_active:  boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetComponentCatalogRequest {
  name:       string;
  cost_type:  BudgetCostType;
  sort_order: number;
}
