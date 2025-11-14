import api from './api';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  email: string;
  fullName?: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials) => {
    const { data } = await api.post('/api/auth/login', credentials);
    // El token puede estar en la cookie httpOnly O en el body (para Safari iOS)
    // Si está en el body, lo guardamos en localStorage como fallback
    if (data.data?.token) {
      // Safari iOS - guardar token en localStorage como fallback
      localStorage.setItem('auth_token', data.data.token);
      if (data.data.refreshToken) {
        localStorage.setItem('auth_refresh_token', data.data.refreshToken);
      }
    }
    return data.data;
  },

  register: async (userData: RegisterData) => {
    const { data } = await api.post('/api/auth/register', userData);
    return data.data;
  },

  logout: async () => {
    const { data } = await api.post('/api/auth/logout');
    return data;
  },

  me: async () => {
    const { data } = await api.get('/api/auth/me');
    return data.data;
  },
};
