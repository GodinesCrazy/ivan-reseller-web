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
import { useEnvironment } from '@/contexts/EnvironmentContext';

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
  mlHandlingTimeDays?: number;
}

export default function WorkflowConfig() {
  const { refreshEnvironment } = useEnvironment();
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingCapital, setWorkingCapital] = useState<number | null>(null);
  const [workingCapitalLoadError, setWorkingCapitalLoadError] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setWorkingCapitalLoadError(false);
      const [configRes, capitalRes] = await Promise.all([
        api.get('/api/workflow/config'),
        api.get('/api/workflow/working-capital')
      ]);

      const workflowConfig = configRes.data?.config;
      const capital = capitalRes.data?.workingCapital;
      const capitalNum = typeof capital === 'number' ? capital : (capitalRes.data != null ? 500 : null);

      setConfig(workflowConfig || {
        environment: 'production',
        workflowMode: 'manual',
        stageScrape: 'automatic',
        stageAnalyze: 'automatic',
        stagePublish: 'manual',
        stagePurchase: 'manual',
        stageFulfillment: 'manual',
        stageCustomerService: 'manual',
        workingCapital: 500,
        mlHandlingTimeDays: 30,
      });
      setWorkingCapital(capitalNum);
    } catch (error: any) {
      console.error('Error loading workflow config:', error);
      setWorkingCapitalLoadError(true);
      setWorkingCapital(null);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar configuración de workflow');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    const payload = {
      workingCapital: Number(workingCapital) || 500,
      environment: config.environment,
      workflowMode: config.workflowMode,

      scrapeStage: config.stageScrape,
      analyzeStage: config.stageAnalyze,
      publishStage: config.stagePublish,
      purchaseStage: config.stagePurchase,
      fulfillmentStage: config.stageFulfillment,
      customerServiceStage: config.stageCustomerService,

      autoApproveThreshold: config.autoApproveThreshold != null ? Number(config.autoApproveThreshold) || 75 : 75,
      autoPublishThreshold: config.autoPublishThreshold != null ? Number(config.autoPublishThreshold) || 85 : 85,
      maxAutoInvestment: config.maxAutoInvestment != null ? Number(config.maxAutoInvestment) || 100 : 100,
      mlHandlingTimeDays: config.mlHandlingTimeDays != null ? Math.max(1, Math.round(Number(config.mlHandlingTimeDays))) || 30 : 30,
    };

    try {
      setSaving(true);
      console.log('[FRONTEND DEBUG] WORKFLOW CONFIG PAYLOAD:', payload);
      await api.put('/api/workflow/config', payload);

      await api.put('/api/workflow/working-capital', { workingCapital });

      const testRes = await api.get('/api/workflow/config/test');
      const savedConfig = testRes.data;
      console.log('[FRONTEND DEBUG] SAVED CONFIG:', savedConfig);
      if (savedConfig?.workflowMode === 'automatic') {
        console.log('[FRONTEND DEBUG] workflowMode === "automatic" confirmed');
      }

      toast.success('Configuración de workflow guardada exitosamente');
      refreshEnvironment?.();
    } catch (error: any) {
      console.error('[FRONTEND] Workflow config save failed:', error.response?.data ?? error);
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
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-red-800 dark:text-red-200">Error al cargar configuración de workflow</p>
        </div>
      </div>
    );
  }

  const stages = [
    {
      key: 'stageScrape' as keyof WorkflowConfig,
      label: 'SCRAPE — Búsqueda de Oportunidades',
      icon: Search,
      description: 'Búsqueda automática de productos en AliExpress y otros marketplaces'
    },
    {
      key: 'stageAnalyze' as keyof WorkflowConfig,
      label: 'ANALYZE — Análisis IA',
      icon: Brain,
      description: 'Análisis inteligente de oportunidades con IA para determinar rentabilidad'
    },
    {
      key: 'stagePublish' as keyof WorkflowConfig,
      label: 'PUBLISH — Publicación',
      icon: Send,
      description: 'Publicación de productos en marketplaces (eBay, Amazon, MercadoLibre)'
    },
    {
      key: 'stagePurchase' as keyof WorkflowConfig,
      label: 'PURCHASE — Compra Automática',
      icon: ShoppingCart,
      description: 'Compra automática al proveedor cuando se recibe una venta'
    },
    {
      key: 'stageFulfillment' as keyof WorkflowConfig,
      label: 'FULFILLMENT — Cumplimiento',
      icon: Package,
      description: 'Gestión de envíos, tracking y entrega al cliente final'
    },
    {
      key: 'stageCustomerService' as keyof WorkflowConfig,
      label: 'CUSTOMER SERVICE — Atención al Cliente',
      icon: MessageCircle,
      description: 'Gestión de consultas, devoluciones y soporte al cliente'
    }
  ];

  const modeButtonBase = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all';

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Configuración de Workflow</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Personaliza cómo funciona el sistema de automatización para tu cuenta
          </p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Guardando…</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>

      {/* Capital de Trabajo */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/40 rounded-lg flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Capital de Trabajo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Capital disponible en PayPal para operaciones (USD)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Capital de Trabajo (USD)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={workingCapitalLoadError ? '' : (workingCapital ?? '')}
              placeholder={workingCapitalLoadError ? '— Error al cargar' : undefined}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setWorkingCapital(isNaN(v) ? null : v);
                if (workingCapitalLoadError) setWorkingCapitalLoadError(false);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {workingCapitalLoadError ? 'No se pudo cargar el capital. Introduce un valor manualmente o recarga la página.' : 'El sistema optimizará la publicación de productos basado en este capital. Por defecto: $500 USD'}
            </p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-0.5">Importante: El capital no se verifica contra PayPal</p>
                <p className="text-amber-700 dark:text-amber-300">
                  El valor que indicas es declarativo. El sistema no comprueba que tengas ese saldo disponible en tu cuenta de PayPal. Asegúrate de que el capital refleje lo que realmente tienes disponible.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-0.5">¿Cómo funciona el Capital de Trabajo?</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-300">
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-50 dark:bg-green-950/40 rounded-lg flex items-center justify-center">
            <Settings className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ambiente de Operación</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona el ambiente para todas las operaciones
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <input
              type="radio"
              name="environment"
              value="sandbox"
              checked={config.environment === 'sandbox'}
              onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Sandbox (Pruebas)</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Usa APIs de prueba. Perfecto para aprender y experimentar.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <input
              type="radio"
              name="environment"
              value="production"
              checked={config.environment === 'production'}
              onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Production (Producción)</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Operaciones reales con dinero real. Usa con precaución.</p>
            </div>
          </label>
        </div>
      </div>

      {/* Modo de Workflow */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/40 rounded-lg flex items-center justify-center">
            <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Modo de Workflow</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configuración general del sistema
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <input
              type="radio"
              name="workflowMode"
              value="manual"
              checked={config.workflowMode === 'manual'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Manual</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded">Override</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Todas las etapas requieren aprobación manual. Sobrescribe la configuración individual.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <input
              type="radio"
              name="workflowMode"
              value="automatic"
              checked={config.workflowMode === 'automatic'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Automático</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded">Override</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Todas las etapas se ejecutan automáticamente sin intervención. Sobrescribe la configuración individual.
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <input
              type="radio"
              name="workflowMode"
              value="hybrid"
              checked={config.workflowMode === 'hybrid'}
              onChange={(e) => setConfig({ ...config, workflowMode: e.target.value as any })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Híbrido</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded">Recomendado</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configuración mixta por etapa. Respeta la configuración individual que defines abajo.
              </p>
            </div>
          </label>
        </div>
        
        {config.workflowMode !== 'hybrid' && (
          <div className="mt-3 bg-yellow-50 dark:bg-yellow-950/25 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-xs text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">Modo {config.workflowMode === 'manual' ? 'Manual' : 'Automático'} activo</p>
                <p className="mt-0.5 text-yellow-700 dark:text-yellow-300">
                  La configuración de etapas individuales será ignorada. Todas las etapas se comportarán como <strong>{config.workflowMode === 'manual' ? 'manual' : 'automático'}</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuración por Etapa */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Configuración por Etapa</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Configura cada etapa del proceso de dropshipping individualmente
        </p>

        <div className="space-y-3">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const currentValue = config[stage.key] as 'manual' | 'automatic' | 'guided';

            return (
              <div key={stage.key} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/40 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stage.label}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stage.description}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button
                    onClick={() => updateStage(stage.key, 'manual')}
                    className={`${modeButtonBase} ${
                      currentValue === 'manual'
                        ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-700'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => updateStage(stage.key, 'automatic')}
                    className={`${modeButtonBase} ${
                      currentValue === 'automatic'
                        ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-700'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    Automático
                  </button>
                  <button
                    onClick={() => updateStage(stage.key, 'guided')}
                    className={`${modeButtonBase} ${
                      currentValue === 'guided'
                        ? 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 ring-1 ring-yellow-300 dark:ring-yellow-700'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    Guiado
                  </button>
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-red-600 dark:text-red-400">Manual:</span>
                      <span>Requiere aprobación tuya en cada paso.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-green-600 dark:text-green-400">Automático:</span>
                      <span>Se ejecuta sin intervención.</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-yellow-600 dark:text-yellow-400">Guiado:</span>
                      <span>Notifica y espera 5 min; luego continúa automáticamente.</span>
                    </div>
                  </div>
                  
                  {config.workflowMode !== 'hybrid' && (
                    <div className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-2 rounded-lg">
                      <span className="font-medium">Nota:</span> Modo <strong>{config.workflowMode === 'manual' ? 'Manual' : 'Automático'}</strong> activo — esta configuración será ignorada.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Umbrales de Automatización */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Umbrales de Automatización</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Umbral de Auto-Aprobación (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.autoApproveThreshold || 75}
              onChange={(e) => setConfig({ ...config, autoApproveThreshold: parseFloat(e.target.value) || 75 })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Confianza mínima de IA para aprobar automáticamente (0-100%)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Umbral de Auto-Publicación (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.autoPublishThreshold || 85}
              onChange={(e) => setConfig({ ...config, autoPublishThreshold: parseFloat(e.target.value) || 85 })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Confianza mínima de IA para publicar automáticamente (0-100%)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Inversión Máxima Auto (USD)
            </label>
            <input
              type="number"
              min="0"
              value={config.maxAutoInvestment || 100}
              onChange={(e) => setConfig({ ...config, maxAutoInvestment: parseFloat(e.target.value) || 100 })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Inversión máxima por producto para operaciones automáticas
            </p>
          </div>
        </div>
      </div>

      {/* Configuración de Envío */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/40 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configuración de Envío</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Parámetros de despacho para publicaciones en marketplaces
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Plazo de Envío — MercadoLibre (días)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              step="1"
              title="Plazo de envío en días para publicaciones en MercadoLibre"
              placeholder="30"
              value={config?.mlHandlingTimeDays ?? 30}
              onChange={(e) => setConfig({ ...config!, mlHandlingTimeDays: Math.max(1, parseInt(e.target.value) || 30) })}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Días hábiles declarados al comprador como plazo de despacho. Por defecto: 30 días (dropshipping China → Chile).
            </p>
          </div>

          <div className="bg-orange-50 dark:bg-orange-950/25 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
              <div className="text-xs text-orange-800 dark:text-orange-200">
                <p className="font-medium mb-0.5">Nota sobre MercadoLibre Chile</p>
                <p className="text-orange-700 dark:text-orange-300">
                  ML Chile usa el modo de envío me2 (obligatorio para cuentas Gold). El plazo aquí configurado se incluye
                  en el payload de publicación y en la descripción del producto para informar al comprador el tiempo real
                  de entrega del dropshipping internacional.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botón de guardar al final */}
      <div className="flex justify-end pb-2">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Guardando…</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Guardar Configuración</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
