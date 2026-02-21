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
      const response = await api.post('/api/auth/login', credentials, {
        withCredentials: true,
      });
      const requestUrl = response.config?.baseURL && response.config?.url
        ? `${String(response.config.baseURL).replace(/\/$/, '')}${response.config.url}`
        : '/api/auth/login';
      console.log('[login] request URL', requestUrl);
      console.log('[login] response status', response.status);
      console.log('[login] response body', response.data);

      const raw = response.data;

      const normalized = {
        user: raw?.user || raw?.data?.user,
        token: raw?.token || raw?.data?.token || null,
      };

      if (!raw?.success || !normalized.user) {
        throw new Error(raw?.message || 'Invalid login response');
      }

      if (normalized.token) {
        localStorage.setItem('auth_token', normalized.token);
        const refreshToken = raw?.refreshToken || raw?.data?.refreshToken;
        if (refreshToken) {
          localStorage.setItem('auth_refresh_token', refreshToken);
        }
      }

      return normalized;
    } catch (error: any) {
      console.log('[login] request URL', error?.config?.baseURL && error?.config?.url ? `${String(error.config.baseURL).replace(/\/$/, '')}${error.config.url}` : '/api/auth/login');
      console.log('[login] response status', error?.response?.status ?? 'no response');
      console.log('[login] response body', error?.response?.data ?? error?.message);
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
    const { data } = await api.post('/auth/register', userData);
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
