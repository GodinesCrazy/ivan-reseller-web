import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';
import ErrorMessageWithSolution from '../ErrorMessageWithSolution';

interface ValidationStepProps {
  data: WizardData;
  onNext: (data?: Partial<WizardData>) => void;
  onBack: () => void;
  onUpdateData: (data: Partial<WizardData>) => void;
}

export default function ValidationStep({
  data,
  onNext,
  onBack,
  onUpdateData
}: ValidationStepProps) {
  const [validating, setValidating] = useState(true);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
    errorCode?: string;
    solution?: string;
    documentationUrl?: string;
  } | null>(null);

  const marketplace = data.marketplace || '';
  const environment = data.environment || 'production';
  const credentials = data.credentials || {};

  useEffect(() => {
    validateCredentials();
  }, []);

  const validateCredentials = async () => {
    try {
      setValidating(true);
      setValidationResult(null);

      // Primero guardar las credenciales
      await api.post('/api/credentials', {
        apiName: marketplace,
        environment,
        credentials,
        isActive: true
      });

      // Luego validar
      const response = await api.get(`/api/marketplace/validate/${marketplace}`, {
        params: { environment }
      });

      if (response.data?.success && response.data?.isValid) {
        setValidationResult({
          success: true,
          message: 'Credenciales válidas y guardadas correctamente'
        });
        onUpdateData({
          validationResult: {
            success: true,
            message: 'Credenciales válidas'
          }
        });
      } else {
        throw new Error(response.data?.message || 'Las credenciales no son válidas');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Error al validar credenciales';
      const errorCode = error.response?.data?.errorCode;
      
      // Generar solución basada en el error
      const solution = getSolutionForError(errorMessage, marketplace);
      const documentationUrl = getDocumentationUrl(marketplace);

      setValidationResult({
        success: false,
        message: errorMessage,
        errorCode,
        solution,
        documentationUrl
      });

      onUpdateData({
        validationResult: {
          success: false,
          message: errorMessage
        }
      });
    } finally {
      setValidating(false);
    }
  };

  const getSolutionForError = (error: string, marketplace: string): string => {
    const lowerError = error.toLowerCase();
    
    if (lowerError.includes('token') || lowerError.includes('oauth')) {
      return `1. Verifica que hayas completado el flujo OAuth correctamente\n2. Si el token expiró, vuelve a autorizar la aplicación\n3. Asegúrate de que el Redirect URI coincida exactamente con el configurado en ${marketplace}`;
    }
    
    if (lowerError.includes('invalid') || lowerError.includes('credenciales')) {
      return `1. Verifica que copiaste las credenciales correctamente (sin espacios extra)\n2. Asegúrate de estar usando credenciales del ambiente correcto (${data.environment})\n3. Revisa que las credenciales no hayan expirado en el portal de ${marketplace}`;
    }
    
    if (lowerError.includes('connection') || lowerError.includes('timeout')) {
      return `1. Verifica tu conexión a internet\n2. Intenta nuevamente en unos momentos\n3. Si el problema persiste, puede ser un problema temporal del servicio de ${marketplace}`;
    }
    
    return `1. Revisa la documentación oficial de ${marketplace}\n2. Verifica que todas las credenciales estén correctas\n3. Asegúrate de tener los permisos necesarios en tu cuenta de ${marketplace}`;
  };

  const getDocumentationUrl = (marketplace: string): string => {
    const urls: Record<string, string> = {
      ebay: 'https://developer.ebay.com/api-docs/static/oauth-credentials.html',
      amazon: 'https://developer-docs.amazon.com/sp-api/',
      mercadolibre: 'https://developers.mercadolibre.com/',
      paypal: 'https://developer.paypal.com/api/rest/'
    };
    return urls[marketplace] || '';
  };

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">
          Validación de Credenciales
        </h4>
        <p className="text-sm text-gray-600">
          Estamos validando tus credenciales y guardando la configuración.
        </p>
      </div>

      {validating ? (
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-600">Validando credenciales...</p>
          <p className="text-xs text-gray-500 mt-2">Esto puede tomar unos segundos</p>
        </div>
      ) : validationResult ? (
        <div>
          {validationResult.success ? (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h5 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Configuración exitosa!
              </h5>
              <p className="text-sm text-gray-600 mb-6">
                {validationResult.message}
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
                <h6 className="font-semibold text-green-900 mb-2">Próximos pasos:</h6>
                <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                  <li>Puedes comenzar a publicar productos en {marketplace}</li>
                  <li>Revisa la configuración en la página de API Settings</li>
                  <li>Puedes configurar más marketplaces cuando lo desees</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-center py-4 mb-4">
                <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h5 className="text-lg font-semibold text-gray-900 mb-2">
                  Error en la validación
                </h5>
              </div>
              
              <ErrorMessageWithSolution
                error={validationResult.message}
                errorCode={validationResult.errorCode}
                solution={validationResult.solution}
                documentationUrl={validationResult.documentationUrl}
              />

              <div className="mt-4 flex gap-2">
                <button
                  onClick={onBack}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Volver y corregir
                </button>
                <button
                  onClick={validateCredentials}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Reintentar validación
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

