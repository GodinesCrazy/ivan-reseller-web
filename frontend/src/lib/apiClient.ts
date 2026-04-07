/**
 * ? FIX AUTH: Helper centralizado para requests API con credentials garantizados
 * Asegura que TODAS las requests env�en cookies autom�ticamente
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_BASE_HAS_SUFFIX } from '../config/runtime';

// ? Re-exportar api de services/api.ts (ya tiene withCredentials: true)
export { api as default } from '../services/api';

/**
 * ? Helper para fetch() con credentials garantizados
 * Usar este helper en lugar de fetch() directo para asegurar que cookies se env�en
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // ? CR�TICO: Asegurar credentials: 'include' siempre
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include', // Siempre incluir cookies
    mode: 'cors', // Habilitar CORS con credentials
  };

  // ? Asegurar headers Content-Type si hay body
  if (options.body && !fetchOptions.headers) {
    fetchOptions.headers = {
      'Content-Type': 'application/json',
    };
  } else if (options.body && fetchOptions.headers) {
    const headers = new Headers(fetchOptions.headers);
    if (!headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    fetchOptions.headers = headers;
  }

  return fetch(url, fetchOptions);
}

/**
 * ? Helper para crear instancia de axios con credentials garantizados
 * Preferir usar 'api' de services/api.ts, pero si necesitas una instancia nueva, usa esto
 */
export function createApiClient(config?: AxiosRequestConfig): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // ? CR�TICO: Siempre incluir cookies
    headers: {
      'Content-Type': 'application/json',
      ...config?.headers,
    },
    ...config,
  });

  return client;
}

