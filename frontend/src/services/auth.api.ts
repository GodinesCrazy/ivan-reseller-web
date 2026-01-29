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
    try {
      const { data } = await api.post('/api/auth/login', credentials, {
        withCredentials: true,
      });
      
      // Normalizar respuesta: backend puede retornar { success, user } o { success, data: { user } }
      const user = data.user || data.data?.user;
      
      if (!data.success || !user) {
        throw new Error(data.message || 'Invalid login response');
      }
      
      const token = data.token || data.data?.token;
      
      // El token puede estar en la cookie httpOnly O en el body
      // Si está en el body, lo guardamos en localStorage como fallback
      // CRÍTICO: Siempre guardar el token en localStorage como fallback para garantizar que funcione
      if (token) {
        localStorage.setItem('auth_token', token);
        const refreshToken = data.refreshToken || data.data?.refreshToken;
        if (refreshToken) {
          localStorage.setItem('auth_refresh_token', refreshToken);
        }
      }
      
      return { user, token };
    } catch (error: any) {
      // Normalizar error para prevenir crash de React
      if (error?.response?.status === 502 || error?.response?.status === 503 || error?.response?.status === 504) {
        throw new Error('Backend no disponible. Por favor, intenta más tarde.');
      }
      if (error?.message) {
        throw new Error(String(error.message));
      }
      if (typeof error === 'string') {
        throw new Error(error);
      }
      throw new Error('Login failed');
    }
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
