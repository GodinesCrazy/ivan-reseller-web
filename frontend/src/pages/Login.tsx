import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { authApi } from '@services/auth.api';
import { useAuthStore } from '@stores/authStore';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '';
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const result = await authApi.login(data);
      
      // Verificar que tenemos los datos necesarios
      if (!result || !result.user) {
        throw new Error('Invalid response from server');
      }
      
      // El token puede estar en la cookie httpOnly O en el body
      // Si está en el body, authApi.login ya lo guardó en localStorage
      // Siempre pasar el token (puede ser undefined si solo hay cookies, pero el store lo maneja)
      login(result.user, result.token);
      
      // Pequeño delay para asegurar que el estado se actualice antes de navegar
      await new Promise(resolve => setTimeout(resolve, 100));
      
      toast.success('Login successful!');
      const target = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
        ? returnUrl
        : '/dashboard';
      navigate(target, { replace: true });
    } catch (error: any) {
      // Manejo robusto de errores - prevenir crash de React
      let errorMessage = 'Login failed';
      
      if (error?.response) {
        // Error HTTP con respuesta
        const status = error.response.status;
        if (status === 502 || status === 503 || status === 504) {
          errorMessage = 'Backend no disponible. Por favor, intenta más tarde.';
        } else if (status === 403 && error.response.data?.errorCode === 'DEFAULT_CREDENTIALS_DISABLED') {
          errorMessage =
            error.response.data?.message ||
            error.response.data?.error ||
            'Credenciales por defecto bloqueadas por política (BLOCK_DEFAULT_ADMIN_LOGIN_IN_PRODUCTION). Cambia la contraseña del admin o quita esa variable en Railway.';
        } else {
          errorMessage = error.response.data?.message || 
                        error.response.data?.error || 
                        `Error ${status}`;
        }
      } else if (error?.message) {
        // Error con mensaje
        errorMessage = String(error.message);
      } else if (typeof error === 'string') {
        // Error como string
        errorMessage = error;
      }
      
      toast.error(errorMessage);
      console.error('Login error:', {
        message: errorMessage,
        status: error?.response?.status,
        error: error?.response?.data || error?.message || error
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#040f2a] via-[#081a3e] to-[#050b1c] p-4">
      <div className="max-w-md w-full space-y-8 p-10 bg-white/8 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/15">
        <div className="text-center flex flex-col items-center space-y-4">
          <div className="h-24 w-24 rounded-3xl overflow-hidden shadow-xl ring-2 ring-white/30 bg-white/10 flex items-center justify-center">
            <img
              src="/brand-logo.png"
              alt="Logotipo Ivan Reseller"
              className="h-[82%] w-[82%] object-contain brightness-0 invert"
              loading="lazy"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Ivan Reseller</h2>
            <p className="mt-1 text-sm text-slate-300">Ingresá para detectar oportunidades de negocio</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-200">
              Username
            </label>
            <input
              {...register('username')}
              id="username"
              type="text"
              autoComplete="username"
              className="mt-1 block w-full px-3 py-2.5 border border-white/15 rounded-md shadow-sm bg-black/25 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-300">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              {...register('password')}
              id="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 block w-full px-3 py-2.5 border border-white/15 rounded-md shadow-sm bg-black/25 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-300">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {/* ✅ P0.5: Botón para solicitar acceso */}
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-2">
              ¿No tienes cuenta?
            </p>
            <button
              type="button"
              onClick={() => navigate('/request-access')}
              className="text-sm font-medium text-blue-300 hover:text-blue-200"
            >
              Solicitar acceso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
