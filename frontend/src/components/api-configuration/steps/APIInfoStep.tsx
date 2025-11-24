import { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2, AlertCircle, Info, BookOpen, Shield, Key } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';

interface APIInfoStepProps {
  data: WizardData;
  onUpdateData: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}

interface APIInfo {
  name: string;
  description: string;
  docsUrl?: string;
  requirements: string[];
  fields: Array<{
    key: string;
    label: string;
    required: boolean;
    description?: string;
    helpText?: string;
  }>;
  supportsOAuth: boolean;
  oauthSteps?: string[];
}

export default function APIInfoStep({
  data,
}: APIInfoStepProps) {
  const [apiInfo, setApiInfo] = useState<APIInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data.selectedAPI) {
      loadAPIInfo();
    }
  }, [data.selectedAPI]);

  const loadAPIInfo = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/settings/apis');
      const result = response.data;
      
      if (result.success && result.data) {
        const api = result.data.find((a: any) => a.apiName === data.selectedAPI);
        if (api) {
          const env = data.selectedEnvironment;
          const envConfig = api.supportsEnvironments && api.environments?.[env];
          const fields = envConfig?.fields || api.fields || [];
          
          setApiInfo({
            name: api.name,
            description: api.description || '',
            docsUrl: api.documentation,
            requirements: getRequirementsForAPI(data.selectedAPI!),
            fields: fields.map((f: any) => ({
              key: f.key,
              label: f.label,
              required: f.required || false,
              description: f.helpText || f.description,
            })),
            supportsOAuth: api.supportsOAuth || false,
            oauthSteps: getOAuthStepsForAPI(data.selectedAPI!),
          });
        }
      }
    } catch (error) {
      console.error('Error loading API info:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRequirementsForAPI = (apiName: string): string[] => {
    const requirements: Record<string, string[]> = {
      ebay: [
        'Cuenta de desarrollador de eBay',
        'App ID, Dev ID y Cert ID',
        'RuName (Redirect URI) configurado en eBay Developer Portal',
      ],
      amazon: [
        'Cuenta de Amazon Seller Central',
        'LWA Client ID y Client Secret',
        'Refresh Token de LWA',
        'Credenciales AWS IAM',
      ],
      mercadolibre: [
        'Cuenta de MercadoLibre',
        'Client ID y Client Secret',
        'Access Token (se obtiene vía OAuth)',
      ],
      paypal: [
        'Cuenta de negocio de PayPal',
        'Client ID y Client Secret',
      ],
    };
    return requirements[apiName] || ['Credenciales de la API'];
  };

  const getOAuthStepsForAPI = (apiName: string): string[] | undefined => {
    if (apiName === 'ebay') {
      return [
        'Haz clic en "Iniciar OAuth"',
        'Serás redirigido a eBay para autorizar',
        'Inicia sesión con tu cuenta de eBay',
        'Autoriza el acceso a la aplicación',
        'Serás redirigido de vuelta automáticamente',
      ];
    }
    if (apiName === 'mercadolibre') {
      return [
        'Haz clic en "Iniciar OAuth"',
        'Serás redirigido a MercadoLibre',
        'Inicia sesión y autoriza',
        'Serás redirigido de vuelta automáticamente',
      ];
    }
    return undefined;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!apiInfo) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">No se pudo cargar la información de la API</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Header */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-primary-200 dark:border-primary-800">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {apiInfo.name}
        </h3>
        <p className="text-gray-700 dark:text-gray-300">
          {apiInfo.description}
        </p>
        {apiInfo.docsUrl && (
          <a
            href={apiInfo.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-primary-600 dark:text-primary-400 hover:underline"
          >
            <BookOpen className="w-4 h-4" />
            Ver documentación oficial
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Requirements */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Requisitos previos
            </h4>
            <ul className="space-y-1">
              {apiInfo.requirements.map((req, index) => (
                <li key={index} className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Fields Overview */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Campos requeridos
        </h4>
        <div className="space-y-2">
          {apiInfo.fields.filter(f => f.required).map((field) => (
            <div
              key={field.key}
              className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
            >
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {field.label}
                </div>
                {field.description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {field.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OAuth Info */}
      {apiInfo.supportsOAuth && apiInfo.oauthSteps && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Proceso de autorización OAuth
              </h4>
              <ol className="space-y-2">
                {apiInfo.oauthSteps.map((step, index) => (
                  <li key={index} className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Environment Info */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-semibold text-gray-900 dark:text-white">
            Ambiente seleccionado: {data.selectedEnvironment === 'sandbox' ? 'Sandbox' : 'Producción'}
          </h4>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {data.selectedEnvironment === 'sandbox'
            ? 'El ambiente sandbox es para pruebas. No realizará transacciones reales.'
            : 'El ambiente de producción es para uso real. Todas las acciones serán reales.'}
        </p>
      </div>
    </div>
  );
}

