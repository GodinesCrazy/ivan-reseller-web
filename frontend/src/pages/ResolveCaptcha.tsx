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
        // ✅ CORREGIDO: Usar endpoint correcto /api/manual-auth/:token para obtener sesión por token
        const response = await api.get(`/api/manual-auth/${token}`);
        const data = response.data;
        
        if (!data?.success) {
          throw new Error(data?.error || 'Error al obtener sesión');
        }

        // ✅ Convertir formato de ManualAuthService a formato esperado por el componente
        const sessionData: CaptchaSession = {
          success: true,
          token: token,
          captchaUrl: data.loginUrl || '', // loginUrl contiene la URL de AliExpress con CAPTCHA
          pageUrl: data.loginUrl || '',
          status: data.status === 'completed' ? 'solved' : 
                  data.status === 'expired' ? 'expired' : 
                  data.status === 'cancelled' ? 'cancelled' : 'pending',
          solvedAt: data.completedAt
        };

        setSession(sessionData);
        setLoadError(null);

        // ✅ Abrir automáticamente la ventana de AliExpress cuando se carga la sesión
        if (sessionData.captchaUrl && sessionData.status === 'pending') {
          // Esperar un momento para que la página se cargue completamente antes de abrir
          setTimeout(() => {
            try {
              const newWindow = window.open(sessionData.captchaUrl, '_blank', 'noopener,noreferrer');
              if (newWindow) {
                toast.info('Se abrió la página de AliExpress en una nueva ventana. Por favor, resuelve el CAPTCHA allí.');
              } else {
                // Pop-up bloqueado por el navegador
                toast.warning('El navegador bloqueó la ventana emergente. Por favor, haz clic en "Abrir página de AliExpress" para abrirla manualmente.');
              }
            } catch (error) {
              // Error al abrir ventana
              console.error('[ResolveCaptcha] Error abriendo ventana:', error);
              toast.warning('No se pudo abrir la ventana automáticamente. Por favor, haz clic en "Abrir página de AliExpress" para abrirla manualmente.');
            }
          }, 800); // Esperar 800ms para asegurar que la página esté cargada
        }

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
    // ✅ Polling cada 5 segundos para verificar si el CAPTCHA fue resuelto
    // Verificamos el estado de la sesión en /api/manual-auth/:token
    const interval = window.setInterval(async () => {
      try {
        const response = await api.get(`/api/manual-auth/${sessionToken}`);
        const data = response.data;
        
        if (data?.success && data?.status === 'completed') {
          // CAPTCHA resuelto
          clearInterval(interval);
          setPollingInterval(null);
          setSession((prev) => prev ? { ...prev, status: 'solved', solvedAt: data.completedAt } : prev);
          toast.success('¡CAPTCHA resuelto! El sistema continuará con la búsqueda de oportunidades.');
          
          // Redirigir después de 2 segundos
          setTimeout(() => {
            navigate('/opportunities');
          }, 2000);
        } else if (data?.success && data?.status === 'expired') {
          // Sesión expirada
          clearInterval(interval);
          setPollingInterval(null);
          setSession((prev) => prev ? { ...prev, status: 'expired' } : prev);
          toast.error('La sesión de CAPTCHA ha expirado. Por favor, intenta buscar oportunidades nuevamente.');
        }
      } catch (error) {
        // Ignorar errores de polling
      }
    }, 5000); // Polling cada 5 segundos

    setPollingInterval(interval);
  };

  const handleCheckStatus = async () => {
    if (!token) return;
    
    setChecking(true);
    try {
      // ✅ CORREGIDO: Usar endpoint correcto /api/manual-auth/:token
      const response = await api.get(`/api/manual-auth/${token}`);
      const data = response.data;
      
      if (data?.success && data?.status === 'completed') {
        setSession((prev) => prev ? { ...prev, status: 'solved', solvedAt: data.completedAt } : prev);
        toast.success('¡CAPTCHA resuelto! El sistema continuará con la búsqueda.');
        setTimeout(() => {
          navigate('/opportunities');
        }, 2000);
      } else if (data?.success && data?.status === 'expired') {
        setSession((prev) => prev ? { ...prev, status: 'expired' } : prev);
        toast.error('La sesión de CAPTCHA ha expirado. Por favor, intenta buscar oportunidades nuevamente.');
      } else {
        toast.info('El CAPTCHA aún no ha sido resuelto. Por favor, resuélvelo en la página de AliExpress que se abrió.');
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
    
    // ✅ Para resolver CAPTCHA, necesitamos guardar cookies de AliExpress
    // Esto requiere que el usuario copie las cookies desde la página de AliExpress
    toast.info('Para marcar el CAPTCHA como resuelto, necesitas guardar las cookies de AliExpress. Usa la página de configuración de APIs para guardar las cookies.');
    navigate('/settings/api-credentials');
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
                  <li>Se abrirá automáticamente una nueva ventana con la página de AliExpress que contiene el CAPTCHA (si el navegador bloqueó el pop-up, haz clic en "Abrir página de AliExpress" abajo).</li>
                  <li>Resuelve el CAPTCHA en la página de AliExpress que se abrió.</li>
                  <li>Una vez resuelto el CAPTCHA, el sistema lo detectará automáticamente y continuará con la búsqueda de oportunidades.</li>
                  <li>Si necesitas verificar manualmente, puedes usar el botón "Verificar estado".</li>
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

