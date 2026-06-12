import { Injectable, signal, computed } from '@angular/core';
import { UserProfile } from '../models/auth.model';

const TOKEN_KEY = 'pmo_token';
const USER_KEY  = 'pmo_user';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _user  = signal<UserProfile | null>(
    JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  );

  // Señales públicas de solo lectura
  readonly token        = this._token.asReadonly();
  readonly user         = this._user.asReadonly();
  readonly isLoggedIn   = computed(() => !!this._token());
  readonly userFullName = computed(() => this._user()?.name ?? '');

  setSession(token: string, user: UserProfile): void {
    this._token.set(token);
    this._user.set(user);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  updateUser(partial: Partial<UserProfile>): void {
    const current = this._user();
    if (!current) return;
    const updated = { ...current, ...partial };
    this._user.set(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  clearSession(): void {
    this._token.set(null);
    this._user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}
