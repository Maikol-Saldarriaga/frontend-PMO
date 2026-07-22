import { UserRole } from './role.model';

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface LoginResponse {
  access_token:  string;
  refresh_token: string;
  user_id:       string;
  name:          string;
  email:         string;
  role:          UserRole;
  image_url:     string | null;
}

export interface RefreshResponse {
  access_token:   string;
  refresh_token?: string;
}

export interface UserProfile {
  id:        string;
  name:      string;
  email:     string;
  role:      UserRole;
  image_url: string | null;
}
