export interface FodcConfigItem {
  id:            string;
  company_id:    string;
  config_key:    string;
  numeric_value: number | null;
  text_value:    string | null;
  description:   string | null;
  created_at:    string;
  updated_at:    string;
}

export interface UpdateTotalMoneyRequest {
  numeric_value: number;
  description?:  string;
}
