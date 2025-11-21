import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Login failed';
      toast.error(errorMessage);
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center flex flex-col items-center space-y-4">
          <div className="h-16 w-16 rounded-3xl overflow-hidden shadow-lg ring-2 ring-primary-200/60">
            <img
              src="/brand-logo.png"
              alt="Logotipo Ivan Reseller"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Ivan Reseller</h2>
            <p className="mt-1 text-sm text-gray-600">Ingresá para detectar oportunidades de negocio</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              {...register('username')}
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              {...register('password')}
              type="password"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>

          {/* ✅ P0.5: Botón para solicitar acceso */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 mb-2">
              Don't have an account?
            </p>
            <button
              type="button"
              onClick={() => navigate('/request-access')}
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Request Access
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
