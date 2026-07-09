export type DocumentSource = 'condicion' | 'entregable' | 'indicador' | 'cumplimiento' | 'cambio' | 'firma';

export interface GlobalDocument {
  id:              string;
  contract_id:     string;
  project_number:  string;
  project_name:    string | null;
  name:            string;
  file_name:       string | null;
  file_url:        string;
  file_type:       string | null;
  source:          DocumentSource;
  file_size_bytes: number;
  file_size_label: string;
  created_at:      string | null;
}

export interface DocumentsSummary {
  total:        number;
  recent:       number;
  entregable:   number;
  firma:        number;
}
