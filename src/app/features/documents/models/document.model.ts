export type DocumentType = 'contrato' | 'acta' | 'informe' | 'anexo' | 'otro';

export interface ProjectDocument {
  id:           string;
  name:         string;
  type:         DocumentType;
  project_id:   string;
  project_name: string;
  uploaded_by:  string;
  size_kb:      number;
  created_at:   string;
}

export interface DocumentsSummary {
  total:    number;
  recent:   number;
  contrato: number;
  informe:  number;
}
