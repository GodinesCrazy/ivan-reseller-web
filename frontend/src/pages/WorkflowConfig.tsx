import { useState, useEffect } from 'react';
import {
  Settings,
  DollarSign,
  Search,
  Brain,
  Send,
  ShoppingCart,
  Package,
  MessageCircle,
  Save,
  RefreshCw,
  Info,
  AlertCircle
} from 'lucide-react';
import api from '@services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '@components/ui/LoadingSpinner';

interface WorkflowConfig {
  environment: 'sandbox' | 'production';
  workflowMode: 'manual' | 'automatic' | 'hybrid';
  stageScrape: 'manual' | 'automatic' | 'guided';
  stageAnalyze: 'manual' | 'automatic' | 'guided';
  stagePublish: 'manual' | 'automatic' | 'guided';
  stagePurchase: 'manual' | 'automatic' | 'guided';
  stageFulfillment: 'manual' | 'automatic' | 'guided';
  stageCustomerService: 'manual' | 'automatic' | 'guided';
  autoApproveThreshold?: number;
  autoPublishThreshold?: number;
  maxAutoInvestment?: number;
  workingCapital: number;
}

export default function WorkflowConfig() {
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingCapital, setWorkingCapital] = useState(500);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const [configRes, capitalRes] = await Promise.all([
        api.get('/api/workflow/config'),
        api.get('/api/workflow/working-capital')
      ]);

      const workflowConfig = configRes.data?.config;
      const capital = capitalRes.data?.workingCapital || 500;

      setConfig(workflowConfig || {
        environment: 'sandbox',
        workflowMode: 'manual',
        stageScrape: 'automatic',
        stageAnalyze: 'automatic',
        stagePublish: 'manual',
        stagePurchase: 'manual',
        stageFulfillment: 'manual',
        stageCustomerService: 'manual',
        workingCapital: 500
      });
      setWorkingCapital(capital);
    } catch (error: any) {
      console.error('Error loading workflow config:', error);
      toast.error('Error al cargar configuración de workflow');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await api.put('/api/workflow/config', {
        ...config,
        workingCapital
      });

      // También actualizar working capital por separado
      await api.put('/api/workflow/working-capital', { workingCapital });

      toast.success('Configuración de workflow guardada exitosamente');
    } catch (error: any) {
      console.error('Error saving workflow config:', error);
      toast.error(error.response?.data?.error || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const updateStage = (stage: keyof WorkflowConfig, value: 'manual' | 'automatic' | 'guided') => {
    if (!config) return;
    setConfig({ ...config, [stage]: value });
  };

  if (loading) {
    return <LoadingSpinner text="Cargando configuración de workflow..." />;
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error al cargar configuración de workflow</p>
        </div>
      </div>
    );
  }

  const stages = [
    {
      key: 'stageScrape' as keyof WorkflowConfig,
      label: 'SCRAPE - Búsqueda de Oportunidades',
      icon: Search,
      description: 'Búsqueda automática de productos en AliExpress y otros marketplaces'
    },
    {
      key: 'stageAnalyze' as keyof WorkflowConfig,
      label: 'ANALYZE - Análisis IA',
      icon: Brain,
      description: 'Análisis inteligente de oportunidades con IA para determinar rentabilidad'
    },
    {
      key: 'stagePublish' as keyof WorkflowConfig,
      label: 'PUBLISH - Publicación',
      icon: Send,
      description: 'Publicación de productos en marketplaces (eBay, Amazon, MercadoLibre)'
    },
    {
      key: 'stagePurchase' as keyof WorkflowConfig,
      label: 'PURCHASE - Compra Automática',
      icon: ShoppingCart,
      description: 'Compra automática al proveedor cuando se recibe una venta'
    },
    {
      key: 'stageFulfillment' as keyof WorkflowConfig,
      label: 'FULFILLMENT - Cumplimiento',
      icon: Package,
      description: 'Gestión de envíos, tracking y entrega al cliente final'
    },
    {
      key: 'stageCustomerService' as keyof WorkflowConfig,
      label: 'CUSTOMER SERVICE - Atención al Cliente',
      icon: MessageCircle,
      description: 'Gestión de consultas, devoluciones y soporte al cliente'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración de Workflow</h1>
          <p className="text-gray-600 mt-2">
            Personaliza cómo funciona el sistema de automatización para tu cuenta
          </p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>

      {/* Capital de Trabajo */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Capital de Trabajo</h2>
            <p className="text-sm text-gray-600">
              Capital disponible en PayPal para operaciones (USD)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Capital de Trabajo (USD)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={workingCapital}
              onChange={(e) => setWorkingCapital(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-2">
              El sistema optimizará la publicación de productos basado en este capital.
              Por defecto: $500 USD
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">¿Cómo funciona el Capital de Trabajo?</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>El sistema usa este capital para calcular cuántos productos puede publicar simultáneamente</li>
                  <li>El tiempo de publicación se optimiza automáticamente basado en el capital disponible</li>
                  <li>Cuando el marketplace deposita dinero en tu PayPal, el sistema se adapta automáticamente</li>
                  <li>Puedes ajustar este valor según tu capital disponible</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ambiente */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <Settings className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Ambiente de Operación</h2>
            <p className="text-sm text-gray-600">
              Selecciona el ambiente para todas las operaciones
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="environment"
              value="sandbox"
              checked={config.environment === 'sandbox'}
              onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <span className="font-medium text-gray-900">Sandbox (Pruebas)</span>
              <p className="text-sm text-gray-600">Usa APIs de prueba. Perfecto para aprender y experimentar.</p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="environment"
              value="production"
              checked={config.environment === 'production'}
              onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <span className="font-medium text-gray-900">Production (Producción)</span>
              <p className="text-sm text-gray-600">Operaciones reales con dinero real. Usa con precaución.</p>
            </div>
          </label>
        </div>
      </div>

      {/* Modo de Workflow */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <Settings className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Modo de Workflow</h2>
            <p className="text-sm text-gray-600">
              Configuración general del sistema
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="workflowMode"
              value="manual"
              checked={config.workflowMode === 'manual'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Manual</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">Override</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Todas las etapas requieren aprobación manual. Esta configuración sobrescribe la configuración individual de cada etapa.
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="workflowMode"
              value="automatic"
              checked={config.workflowMode === 'automatic'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Automatic</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">Override</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Todas las etapas se ejecutan automáticamente sin intervención. Esta configuración sobrescribe la configuración individual de cada etapa.
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="workflowMode"
              value="hybrid"
              checked={config.workflowMode === 'hybrid'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">Hybrid</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Recomendado</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Configuración mixta por etapa. Respeta la configuración individual de cada etapa que defines abajo.
              </p>
            </div>
          </label>
        </div>
        
        {config.workflowMode !== 'hybrid' && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Modo {config.workflowMode === 'manual' ? 'Manual' : 'Automático'} activo</p>
                <p className="mt-1">
                  La configuración de etapas individuales será ignorada. Todas las etapas se comportarán como <strong>{config.workflowMode === 'manual' ? 'manual' : 'automático'}</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuración por Etapa */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuración por Etapa</h2>
        <p className="text-sm text-gray-600 mb-6">
          Configura cada etapa del proceso de dropshipping individualmente
        </p>

        <div className="space-y-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const currentValue = config[stage.key] as 'manual' | 'automatic' | 'guided';

            return (
              <div key={stage.key} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{stage.label}</h3>
                      <p className="text-sm text-gray-600 mt-1">{stage.description}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <button
                    onClick={() => updateStage(stage.key, 'manual')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentValue === 'manual'
                        ? 'bg-red-100 text-red-700 border-2 border-red-300'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => updateStage(stage.key, 'automatic')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentValue === 'automatic'
                        ? 'bg-green-100 text-green-700 border-2 border-green-300'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Automatic
                  </button>
                  <button
                    onClick={() => updateStage(stage.key, 'guided')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentValue === 'guided'
                        ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Guided
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex items-start space-x-2">
                      <span className="font-semibold text-red-700">Manual:</span>
                      <span>Requiere aprobación tuya en cada paso. El proceso se pausa y te envía una notificación.</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="font-semibold text-green-700">Automatic:</span>
                      <span>Se ejecuta sin intervención. El proceso continúa automáticamente sin esperar tu confirmación.</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="font-semibold text-yellow-700">Guided:</span>
                      <span>Te notifica antes de ejecutar y espera tu confirmación. Si no respondes en 5 minutos, continúa automáticamente.</span>
                    </div>
                  </div>
                  
                  {config.workflowMode !== 'hybrid' && (
                    <div className="text-xs bg-gray-100 text-gray-600 p-2 rounded">
                      <span className="font-medium">Nota:</span> Como el Modo de Workflow está en <strong>{config.workflowMode === 'manual' ? 'Manual' : 'Automático'}</strong>, esta configuración será ignorada. Todas las etapas se comportarán como <strong>{config.workflowMode === 'manual' ? 'manual' : 'automático'}</strong>.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Umbrales de Automatización */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Umbrales de Automatización</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Umbral de Auto-Aprobación (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.autoApproveThreshold || 75}
              onChange={(e) => setConfig({ ...config, autoApproveThreshold: parseFloat(e.target.value) || 75 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Confianza mínima de IA para aprobar automáticamente (0-100%)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Umbral de Auto-Publicación (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.autoPublishThreshold || 85}
              onChange={(e) => setConfig({ ...config, autoPublishThreshold: parseFloat(e.target.value) || 85 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Confianza mínima de IA para publicar automáticamente (0-100%)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Inversión Máxima Auto (USD)
            </label>
            <input
              type="number"
              min="0"
              value={config.maxAutoInvestment || 100}
              onChange={(e) => setConfig({ ...config, maxAutoInvestment: parseFloat(e.target.value) || 100 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Inversión máxima por producto para operaciones automáticas
            </p>
          </div>
        </div>
      </div>

      {/* Botón de guardar al final */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center space-x-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

