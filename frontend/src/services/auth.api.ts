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
    
    // Verificar que la respuesta sea exitosa
    if (!data.success || !data.data) {
      throw new Error(data.message || 'Login failed');
    }
    
    // El token puede estar en la cookie httpOnly O en el body
    // Si está en el body, lo guardamos en localStorage como fallback
    // CRÍTICO: Siempre guardar el token en localStorage como fallback para garantizar que funcione
    if (data.data.token) {
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
