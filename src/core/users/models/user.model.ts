export interface UserDetail {
  id:                       string;
  company_id:               string;
  first_name:               string;
  middle_name:              string | null;
  first_surname:            string;
  second_surname:           string | null;
  document_type:            string;
  identity_document_number: string;
  birthdate:                string;
  email:                    string;
  phone:                    string;
  address:                  string | null;
  role:                     string;
  image_url:                string | null;
  is_active:                boolean;
  created_at:               string;
}

export interface UpdateUserRequest {
  first_name:               string;
  first_surname:            string;
  role:                     string;
  phone:                    string;
  birthdate:                string;
  document_type:            string;
  identity_document_number: string;
  image_url?:               File | null;
}

export interface UpdateUserResponse {
  user_id:   string;
  name:      string;
  email:     string;
  role:      string;
  image_url: string | null;
}
