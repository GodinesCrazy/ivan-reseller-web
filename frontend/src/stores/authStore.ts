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
  token: string | null; // Mantenemos para compatibilidad, pero el token real está en cookie
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  login: (user: User, token?: string) => void; // token es opcional ahora
  logout: () => Promise<void>;
  clearSession: () => void; // Clear local state only (no API call); use on 401 to avoid logout loop
  setCheckingAuth: (checking: boolean) => void; // Evitar overlay "Verificando sesión" bloqueado
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null, // Mantenemos para compatibilidad, pero el token real está en cookie httpOnly
      isAuthenticated: false,
      isCheckingAuth: false,
      login: (user, token) => {
        // El token puede estar en la cookie httpOnly O en localStorage (Safari iOS)
        // Si recibimos un token, lo guardamos en localStorage como fallback
        if (token && token !== 'cookie') {
          localStorage.setItem('auth_token', token);
        } else {
          // Si no hay token pero hay uno en localStorage, usarlo
          const storedToken = localStorage.getItem('auth_token');
          if (storedToken) {
            token = storedToken;
          }
        }
        // CRÍTICO: Asegurar que isAuthenticated se establezca en true
        set({ 
          user, 
          token: token || 'cookie', 
          isAuthenticated: true,
          isCheckingAuth: false 
        });
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch (error) {
          console.warn('Error al hacer logout en el servidor:', error);
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        set({ user: null, token: null, isAuthenticated: false });
      },
      clearSession: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        set({ user: null, token: null, isAuthenticated: false });
      },
      setCheckingAuth: (checking) => set({ isCheckingAuth: checking }),
      checkAuth: async () => {
        // Si ya está verificando, no hacer nada
        if (get().isCheckingAuth) {
          return get().isAuthenticated;
        }

        set({ isCheckingAuth: true });

        try {
          // Validar token con el backend (el token está en la cookie httpOnly)
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
      // Persistir user Y isAuthenticated para que al volver de OAuth no se muestre login
      // antes de que checkAuth valide la cookie. Si user existe, asumimos sesión potencial.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.user ? state.isAuthenticated : false,
      }),
    }
  )
);
