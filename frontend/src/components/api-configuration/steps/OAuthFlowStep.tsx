import { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';

interface OAuthFlowStepProps {
  data: WizardData;
  onUpdateData: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}

const OAUTH_APIS = ['ebay', 'mercadolibre'];

export default function OAuthFlowStep({
  data,
  onUpdateData,
}: OAuthFlowStepProps) {
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthWindow, setOauthWindow] = useState<Window | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const requiresOAuth = data.selectedAPI && OAUTH_APIS.includes(data.selectedAPI);

  useEffect(() => {
    if (requiresOAuth && !data.oauthCompleted) {
      loadOAuthUrl();
    }
  }, [data.selectedAPI, data.selectedEnvironment]);

  // Verificar estado de OAuth periódicamente
  useEffect(() => {
    if (oauthWindow && !data.oauthCompleted) {
      const interval = setInterval(() => {
        checkOAuthStatus();
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [oauthWindow, data.oauthCompleted]);

  const loadOAuthUrl = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/marketplace-oauth/start', {
        params: {
          marketplace: data.selectedAPI,
          environment: data.selectedEnvironment,
        },
      });
      
      const result = response.data;
      if (result.success && result.authUrl) {
        setOauthUrl(result.authUrl);
      } else {
        throw new Error(result.message || 'Error al obtener URL de OAuth');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar OAuth');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = () => {
    if (!oauthUrl) return;

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const windowFeatures = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

    const newWindow = window.open(oauthUrl, 'OAuth', windowFeatures);
    
    if (newWindow) {
      setOauthWindow(newWindow);
    } else {
      setError('No se pudo abrir la ventana de OAuth. Verifica que los popups no estén bloqueados.');
    }
  };

  const checkOAuthStatus = async () => {
    if (checkingStatus || data.oauthCompleted) return;

    try {
      setCheckingStatus(true);
      
      const response = await api.get('/api/marketplace/credentials', {
        params: {
          marketplace: data.selectedAPI,
          environment: data.selectedEnvironment,
        },
      });
      
      const result = response.data;
      const hasToken = result.data?.credentials?.token || result.data?.credentials?.accessToken;
      
      if (hasToken) {
        onUpdateData({ oauthCompleted: true });
        if (oauthWindow) {
          oauthWindow.close();
          setOauthWindow(null);
        }
      }
    } catch (err) {
      // Silenciar errores durante la verificación
    } finally {
      setCheckingStatus(false);
    }
  };

  if (!requiresOAuth) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              Esta API no requiere autorización OAuth. Puedes continuar al siguiente paso.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Autorización OAuth requerida
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Necesitas autorizar el acceso a tu cuenta de {data.selectedAPI} para continuar.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-900 dark:text-red-100">{error}</span>
          </div>
        </div>
      )}

      {data.oauthCompleted ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              Autorización completada exitosamente
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">
              Pasos para autorizar:
            </h4>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Haz clic en el botón "Iniciar Autorización" a continuación
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Serás redirigido a {data.selectedAPI} para iniciar sesión
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                  3
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Inicia sesión y autoriza el acceso a la aplicación
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                  4
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Serás redirigido de vuelta automáticamente
                </span>
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleStartOAuth}
              disabled={!oauthUrl || loading}
              className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <ExternalLink className="w-5 h-5" />
                  Iniciar Autorización
                </>
              )}
            </button>
            
            {oauthWindow && (
              <button
                onClick={checkOAuthStatus}
                disabled={checkingStatus}
                className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${checkingStatus ? 'animate-spin' : ''}`} />
                Verificar
              </button>
            )}
          </div>

          {oauthWindow && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-900 dark:text-amber-100">
                  Ventana de autorización abierta. Completa el proceso allí y regresa aquí.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

