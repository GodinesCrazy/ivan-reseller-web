import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/auth.api';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  fullName?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isCheckingAuth: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
      checkAuth: async () => {
        const { token } = get();
        
        // Si no hay token, no está autenticado
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }

        // Si ya está verificando, no hacer nada
        if (get().isCheckingAuth) {
          return get().isAuthenticated;
        }

        set({ isCheckingAuth: true });

        try {
          // Validar token con el backend
          const userData = await authApi.me();
          
          // Token válido - actualizar usuario
          set({ 
            user: userData, 
            isAuthenticated: true,
            isCheckingAuth: false 
          });
          return true;
        } catch (error: any) {
          // Token inválido o expirado - limpiar estado
          console.warn('Token inválido o expirado, limpiando sesión');
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false,
            isCheckingAuth: false 
          });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
