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
  role:          string;
  image_url:     string | null;
}

export interface UserProfile {
  id:        string;
  name:      string;
  email:     string;
  role:      string;
  image_url: string | null;
}
