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
    return data.data;
  },

  register: async (userData: RegisterData) => {
    const { data } = await api.post('/api/auth/register', userData);
    return data.data;
  },

  me: async () => {
    const { data } = await api.get('/api/auth/me');
    return data.data;
  },
};
