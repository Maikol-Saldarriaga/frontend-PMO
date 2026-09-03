export type NotificationType = 'hito_cumplido' | 'riesgo_registrado';

/** tab es el tab exacto del detalle de proyecto al que debe navegar el click ('hitos' | 'riesgos'). */
export interface Notification {
  id:                     string;
  company_id:             string;
  user_id:                string;
  contract_agreement_id:  string;
  type:                   NotificationType;
  tab:                    string;
  title:                  string;
  message:                string;
  reference_id:           string;
  is_read:                boolean;
  created_at:             string;
}
