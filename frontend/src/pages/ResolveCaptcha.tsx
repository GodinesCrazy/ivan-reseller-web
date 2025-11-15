import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface CaptchaSession {
  success: boolean;
  token: string;
  captchaUrl: string;
  pageUrl: string;
  status: 'pending' | 'solved' | 'expired' | 'cancelled';
  expiresAt?: string;
  solvedAt?: string;
}

export default function ResolveCaptcha() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CaptchaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      if (!token) {
        setLoading(false);
        setLoadError('Token no encontrado');
        return;
      }

      try {
        // Obtener información de la sesión desde el backend
        const response = await api.get(`/api/manual-captcha/active`);
        const data = response.data;
        
        if (!data?.success) {
          throw new Error('Error al obtener sesión');
        }

        const sessionData = data.data;
        
        // Verificar que el token coincida si hay sesión
        if (sessionData && sessionData.token !== token) {
          throw new Error('Token de sesión no coincide');
        }

        if (!sessionData) {
          throw new Error('Sesión no encontrada o expirada');
        }

        setSession(sessionData);
        setLoadError(null);

        // Iniciar polling para verificar si el CAPTCHA fue resuelto
        startPolling(token);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Sesión no encontrada';
        setLoadError(message);
        setSession(null);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    // Cleanup al desmontar
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [token]);

  const startPolling = (sessionToken: string) => {
    // Polling cada 3 segundos para verificar si el CAPTCHA fue resuelto
    const interval = window.setInterval(async () => {
      try {
        const response = await api.get(`/api/manual-captcha/status/${sessionToken}`);
        const data = response.data;
        
        if (data?.success && data?.data?.solved) {
          // CAPTCHA resuelto
          clearInterval(interval);
          setPollingInterval(null);
          setSession((prev) => prev ? { ...prev, status: 'solved' } : prev);
          toast.success('¡CAPTCHA resuelto! El sistema continuará con la búsqueda de oportunidades.');
          
          // Redirigir después de 2 segundos
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        }
      } catch (error) {
        // Ignorar errores de polling
      }
    }, 3000);

    setPollingInterval(interval);
  };

  const handleCheckStatus = async () => {
    if (!token) return;
    
    setChecking(true);
    try {
      const response = await api.get(`/api/manual-captcha/status/${token}`);
      const data = response.data;
      
      if (data?.success && data?.data?.solved) {
        setSession((prev) => prev ? { ...prev, status: 'solved' } : prev);
        toast.success('¡CAPTCHA resuelto! El sistema continuará con la búsqueda.');
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        toast.info('El CAPTCHA aún no ha sido resuelto. Por favor, resuélvelo en la página de AliExpress.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al verificar estado');
    } finally {
      setChecking(false);
    }
  };

  const handleOpenAliExpress = () => {
    if (session?.captchaUrl) {
      window.open(session.captchaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMarkAsSolved = async () => {
    if (!token) return;
    
    setChecking(true);
    try {
      const response = await api.post(`/api/manual-captcha/complete/${token}`);
      const data = response.data;
      
      if (data?.success) {
        setSession((prev) => prev ? { ...prev, status: 'solved' } : prev);
        toast.success('CAPTCHA marcado como resuelto. El sistema continuará con la búsqueda.');
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Error al marcar como resuelto');
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando sesión de CAPTCHA...</p>
        </div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Sesión no encontrada</h1>
          <p className="text-gray-600 mb-4">
            {loadError || 'La sesión de CAPTCHA ha expirado o no existe.'}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isSolved = session.status === 'solved';
  const isExpired = session.status === 'expired';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Resolver CAPTCHA de AliExpress
            </h1>
            <p className="text-gray-600">
              AliExpress requiere que resuelvas un CAPTCHA para continuar con la búsqueda de oportunidades.
            </p>
          </div>

          {/* Status */}
          {isSolved ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">¡CAPTCHA resuelto!</p>
                <p className="text-sm text-green-700">
                  El sistema continuará automáticamente con la búsqueda de oportunidades.
                </p>
              </div>
            </div>
          ) : isExpired ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Sesión expirada</p>
                <p className="text-sm text-red-700">
                  La sesión de CAPTCHA ha expirado. Por favor, intenta buscar oportunidades nuevamente.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">Esperando resolución de CAPTCHA</p>
                <p className="text-sm text-amber-700">
                  El sistema verificará automáticamente cuando resuelvas el CAPTCHA.
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!isSolved && !isExpired && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <h2 className="font-semibold text-gray-900">Instrucciones:</h2>
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  <li>Haz clic en el botón "Abrir página de AliExpress" para abrir la página con el CAPTCHA en una nueva pestaña.</li>
                  <li>Resuelve el CAPTCHA en la página de AliExpress.</li>
                  <li>Una vez resuelto, vuelve a esta página y haz clic en "Marcar como resuelto".</li>
                  <li>El sistema continuará automáticamente con la búsqueda de oportunidades.</li>
                </ol>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleOpenAliExpress}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  Abrir página de AliExpress
                </button>
                <button
                  onClick={handleCheckStatus}
                  disabled={checking}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {checking ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                  Verificar estado
                </button>
                <button
                  onClick={handleMarkAsSolved}
                  disabled={checking}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {checking ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  Marcar como resuelto
                </button>
              </div>
            </div>
          )}

          {/* Auto-redirect message */}
          {isSolved && (
            <div className="text-center">
              <p className="text-gray-600 mb-4">
                Redirigiendo al Dashboard...
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Ir al Dashboard ahora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

