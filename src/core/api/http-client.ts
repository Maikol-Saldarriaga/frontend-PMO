import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RequestOptions {
  headers?: HttpHeaders | Record<string, string>;
  params?:  HttpParams  | Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ApiHttpClient {
  private http = inject(HttpClient);

  get<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(url, options);
  }

  post<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(url, body, options);
  }

  put<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(url, body, options);
  }

  patch<T>(url: string, body: unknown, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(url, body, options);
  }

  delete<T>(url: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(url, options);
  }
}
