export interface SupervisorUser {
  id:                    string;
  full_name:             string;
  type_identification:   string;
  identification_number: string;
  image_url:             string | null;
}

export interface AffiliateUser {
  id:                    string;
  full_name:             string;
  type_identification:   string;
  identification_number: string;
}

export interface SupervisorListResponse {
  users:      SupervisorUser[];
  affiliates: AffiliateUser[];
}

import { UserRole } from '../../../../core/auth/models/role.model';

export type SupervisorDocumentType = 'CC' | 'CE' | 'TI' | 'PP' | 'RC' | 'NIT' | 'PEP';
/** Alias del catálogo global de roles, usado al crear usuarios supervisores/coordinadores. */
export type SupervisorRole = UserRole;

export interface CreateSupervisorUserRequest {
  first_name:                string;
  first_surname:             string;
  second_surname:            string;
  document_type:             SupervisorDocumentType;
  identity_document_number:  string;
  birthdate:                 string;
  email:                     string;
  phone:                     string;
  password:                  string;
  role:                      SupervisorRole;
  middle_name?:              string;
  address?:                  string;
  image_url?:                File | null;
}

export interface CreateSupervisorUserResponse {
  id:                       string;
  first_name:               string;
  middle_name:              string | null;
  first_surname:            string;
  second_surname:           string | null;
  document_type:            string;
  identity_document_number: string;
  email:                    string;
  phone:                    string;
  address:                  string;
  role:                     string;
  image_url:                string | null;
  is_active:                boolean;
  created_at:               string;
}

export interface CreateAffiliateRequest {
  is_beneficiary:       boolean;
  first_name:           string;
  first_surname:        string;
  second_surname:       string;
  type_identification:  string;
  identification_number: string;
  middle_name?:         string | null;
  entity?:              string | null;
  job_title?:           string | null;
  phone?:               string | null;
  email?:               string | null;
  department?:          string | null;
  municipality?:        string | null;
}

export interface CreateAffiliateResponse {
  id:                    string;
  contract_agreement_id: string;
  is_beneficiary:        boolean;
  first_name:            string;
  first_surname:         string;
  type_identification:   string;
  identification_number: string;
}
