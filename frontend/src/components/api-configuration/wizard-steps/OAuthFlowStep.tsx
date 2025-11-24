import { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';

interface OAuthFlowStepProps {
  data: WizardData;
  onNext: (data?: Partial<WizardData>) => void;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
}

export default function OAuthFlowStep({
  data,
  onNext,
  onBack,
  onUpdateData
}: OAuthFlowStepProps) {
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'initiating' | 'waiting' | 'completed' | 'error'>('idle');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marketplace = data.marketplace || '';
  const environment = data.environment || 'production';

  const supportsOAuth = ['ebay', 'mercadolibre'].includes(marketplace);

  useEffect(() => {
    if (supportsOAuth && oauthStatus === 'idle') {
      initiateOAuth();
    }
  }, []);

  const initiateOAuth = async () => {
    try {
      setOauthStatus('initiating');
      setError(null);

      // Obtener URL de autorización
      const response = await api.get(`/api/marketplace-oauth/start/${marketplace}`, {
        params: { environment }
      });

      if (response.data?.authUrl) {
        setAuthUrl(response.data.authUrl);
        setOauthStatus('waiting');
        
        // Abrir ventana de OAuth
        const oauthWindow = window.open(
          response.data.authUrl,
          'OAuth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Escuchar mensaje de callback
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'oauth-callback' && event.data.success) {
            setOauthStatus('completed');
            onUpdateData({ oauthCompleted: true });
            window.removeEventListener('message', handleMessage);
            if (oauthWindow) oauthWindow.close();
          }
        };

        window.addEventListener('message', handleMessage);

        // Polling para verificar estado (fallback)
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await api.get(`/api/marketplace/credentials/${marketplace}`, {
              params: { environment }
            });
            
            if (statusResponse.data?.data?.token) {
              setOauthStatus('completed');
              onUpdateData({ oauthCompleted: true });
              clearInterval(pollInterval);
              window.removeEventListener('message', handleMessage);
              if (oauthWindow) oauthWindow.close();
            }
          } catch (err) {
            // Continuar polling
          }
        }, 2000);

        // Limpiar después de 5 minutos
        setTimeout(() => {
          clearInterval(pollInterval);
          window.removeEventListener('message', handleMessage);
        }, 300000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Error al iniciar OAuth');
      setOauthStatus('error');
    }
  };

  const skipOAuth = () => {
    onUpdateData({ oauthCompleted: false });
    onNext();
  };

  if (!supportsOAuth) {
    return (
      <div>
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">
            OAuth no requerido
          </h4>
          <p className="text-sm text-gray-600">
            Este marketplace no requiere autorización OAuth. Puedes continuar al siguiente paso.
          </p>
        </div>
        <button
          onClick={() => onNext()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          Autorización OAuth
        </h4>
        <p className="text-sm text-gray-600">
          Necesitas autorizar la aplicación para acceder a tu cuenta de {marketplace === 'ebay' ? 'eBay' : 'MercadoLibre'}.
        </p>
      </div>

      {oauthStatus === 'idle' || oauthStatus === 'initiating' ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-600">Preparando autorización...</p>
        </div>
      ) : oauthStatus === 'waiting' ? (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h5 className="font-semibold text-blue-900 mb-2">Instrucciones:</h5>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Se abrirá una nueva ventana para autorizar la aplicación</li>
              <li>Inicia sesión en tu cuenta de {marketplace === 'ebay' ? 'eBay' : 'MercadoLibre'}</li>
              <li>Autoriza el acceso a la aplicación</li>
              <li>La ventana se cerrará automáticamente cuando completes la autorización</li>
            </ol>
          </div>

          {authUrl && (
            <div className="text-center">
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Abrir página de autorización
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={skipOAuth}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Omitir OAuth por ahora (puedes configurarlo más tarde)
            </button>
          </div>
        </div>
      ) : oauthStatus === 'completed' ? (
        <div className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h5 className="font-semibold text-gray-900 mb-2">¡Autorización completada!</h5>
          <p className="text-sm text-gray-600">
            La autorización OAuth se completó exitosamente. Puedes continuar al siguiente paso.
          </p>
        </div>
      ) : (
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h5 className="font-semibold text-gray-900 mb-2">Error en autorización</h5>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={initiateOAuth}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Reintentar
          </button>
          <button
            onClick={skipOAuth}
            className="ml-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Omitir OAuth
          </button>
        </div>
      )}
    </div>
  );
}

