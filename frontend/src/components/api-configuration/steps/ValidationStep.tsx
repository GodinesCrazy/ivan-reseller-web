import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';

interface ValidationStepProps {
  data: WizardData;
  onUpdateData: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}

interface ValidationResult {
  success: boolean;
  message: string;
  errors?: string[];
  warnings?: string[];
}

export default function ValidationStep({
  data,
  onUpdateData,
}: ValidationStepProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    // Auto-validar al cargar el paso
    handleValidate();
  }, []);

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);

    try {
      // Primero, guardar las credenciales
      await api.post('/api/credentials', {
        apiName: data.selectedAPI,
        environment: data.selectedEnvironment,
        credentials: data.credentials,
        isActive: true,
      });

      // Luego, validar las credenciales
      const validateResponse = await api.get(
        `/api/marketplace/validate/${data.selectedAPI}`,
        {
          params: {
            environment: data.selectedEnvironment,
          },
        }
      );

      const validateData = validateResponse.data;

      if (validateData.success && validateData.isValid) {
        setValidationResult({
          success: true,
          message: 'Credenciales guardadas y validadas exitosamente',
        });
        onUpdateData({
          validationResult: {
            success: true,
            message: 'Credenciales guardadas y validadas exitosamente',
          },
        });
      } else {
        setValidationResult({
          success: false,
          message: validateData.message || 'Las credenciales no son válidas',
          errors: validateData.errors || [],
          warnings: validateData.warnings || [],
        });
        onUpdateData({
          validationResult: {
            success: false,
            message: validateData.message || 'Las credenciales no son válidas',
            errors: validateData.errors || [],
          },
        });
      }
    } catch (error: any) {
      setValidationResult({
        success: false,
        message: error.message || 'Error al validar credenciales',
        errors: [error.message || 'Error desconocido'],
      });
      onUpdateData({
        validationResult: {
          success: false,
          message: error.message || 'Error al validar credenciales',
          errors: [error.message || 'Error desconocido'],
        },
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
          Validación final
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Verificaremos que las credenciales sean válidas y estén configuradas correctamente.
        </p>
      </div>

      {validating && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Validando credenciales...
          </p>
        </div>
      )}

      {validationResult && !validating && (
        <div className="space-y-4">
          {validationResult.success ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                    ¡Configuración exitosa!
                  </h4>
                  <p className="text-sm text-green-800 dark:text-green-200">
                    {validationResult.message}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                    Error en la validación
                  </h4>
                  <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                    {validationResult.message}
                  </p>
                  {validationResult.errors && validationResult.errors.length > 0 && (
                    <ul className="space-y-1">
                      {validationResult.errors.map((error, index) => (
                        <li key={index} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                          <span className="text-red-600 dark:text-red-400 mt-0.5">•</span>
                          <span>{error}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                    Advertencias
                  </h4>
                  <ul className="space-y-1">
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index} className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                        <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!validationResult.success && (
            <button
              onClick={handleValidate}
              className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reintentar validación
            </button>
          )}
        </div>
      )}

      {/* Resumen de configuración */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
          Resumen de configuración
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">API:</span>
            <span className="font-medium text-gray-900 dark:text-white">{data.selectedAPI}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Ambiente:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {data.selectedEnvironment === 'sandbox' ? 'Sandbox' : 'Producción'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">OAuth:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {data.oauthCompleted ? 'Completado' : 'No requerido'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Campos configurados:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {Object.keys(data.credentials).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

