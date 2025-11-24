import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { WizardData } from '../APIConfigurationWizard';
import api from '../../../services/api';

interface APISelectorStepProps {
  data: WizardData;
  onUpdateData: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
}

interface APIOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'marketplace' | 'payment' | 'ai' | 'scraping' | 'notification' | 'automation';
  configured: boolean;
  supportsEnvironments: boolean;
  docsUrl?: string;
}

export default function APISelectorStep({
  data,
  onUpdateData,
}: APISelectorStepProps) {
  const [apis, setApis] = useState<APIOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAPIs();
  }, []);

  const loadAPIs = async () => {
    try {
      setLoading(true);
      // Cargar APIs disponibles desde el backend
      const response = await api.get('/api/settings/apis');
      const result = response.data;
      
      if (result.success && result.data) {
        const apiOptions: APIOption[] = result.data.map((api: any) => ({
          id: api.apiName,
          name: api.name,
          description: api.description || '',
          icon: getIconForAPI(api.apiName),
          category: getCategoryForAPI(api.apiName),
          configured: api.status === 'configured',
          supportsEnvironments: api.supportsEnvironments || false,
          docsUrl: api.documentation,
        }));
        setApis(apiOptions);
      }
    } catch (error) {
      console.error('Error loading APIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIconForAPI = (apiName: string): string => {
    const icons: Record<string, string> = {
      ebay: '🛒',
      amazon: '📦',
      mercadolibre: '🛍️',
      paypal: '💳',
      stripe: '💳',
      groq: '🤖',
      openai: '🧠',
      scraperapi: '🕷️',
      zenrows: '🕷️',
      '2captcha': '🔐',
      aliexpress: '📦',
      email: '📧',
      twilio: '📱',
      slack: '💬',
    };
    return icons[apiName] || '🔌';
  };

  const getCategoryForAPI = (apiName: string): APIOption['category'] => {
    if (['ebay', 'amazon', 'mercadolibre'].includes(apiName)) return 'marketplace';
    if (['paypal', 'stripe'].includes(apiName)) return 'payment';
    if (['groq', 'openai'].includes(apiName)) return 'ai';
    if (['scraperapi', 'zenrows', '2captcha'].includes(apiName)) return 'scraping';
    if (['email', 'twilio', 'slack'].includes(apiName)) return 'notification';
    if (['aliexpress'].includes(apiName)) return 'automation';
    return 'marketplace';
  };

  const handleSelectAPI = (apiId: string) => {
    onUpdateData({ selectedAPI: apiId });
  };

  const categories = ['marketplace', 'payment', 'ai', 'scraping', 'notification', 'automation'] as const;
  const categoryLabels: Record<string, string> = {
    marketplace: 'Marketplaces',
    payment: 'Pagos',
    ai: 'Inteligencia Artificial',
    scraping: 'Scraping',
    notification: 'Notificaciones',
    automation: 'Automatización',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Selecciona el servicio que deseas configurar
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Puedes configurar múltiples APIs. Este asistente te guiará paso a paso.
            </p>
          </div>
        </div>
      </div>

      {/* Environment Selector (si hay API seleccionada y soporta ambientes) */}
      {data.selectedAPI && apis.find(a => a.id === data.selectedAPI)?.supportsEnvironments && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Ambiente
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => onUpdateData({ selectedEnvironment: 'sandbox' })}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                data.selectedEnvironment === 'sandbox'
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="font-semibold">Sandbox</div>
              <div className="text-xs mt-1">Para pruebas y desarrollo</div>
            </button>
            <button
              onClick={() => onUpdateData({ selectedEnvironment: 'production' })}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                data.selectedEnvironment === 'production'
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="font-semibold">Producción</div>
              <div className="text-xs mt-1">Para uso real con clientes</div>
            </button>
          </div>
        </div>
      )}

      {/* API Selection by Category */}
      {categories.map((category) => {
        const categoryApis = apis.filter(a => a.category === category);
        if (categoryApis.length === 0) return null;

        return (
          <div key={category} className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {categoryLabels[category]}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categoryApis.map((api) => (
                <button
                  key={api.id}
                  onClick={() => handleSelectAPI(api.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    data.selectedAPI === api.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl">{api.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {api.name}
                          </h4>
                          {api.configured && (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {api.description}
                        </p>
                        {api.docsUrl && (
                          <a
                            href={api.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 inline-flex items-center gap-1"
                          >
                            Documentación
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        data.selectedAPI === api.id
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {data.selectedAPI === api.id && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {data.selectedAPI && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              {apis.find(a => a.id === data.selectedAPI)?.name} seleccionado
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

