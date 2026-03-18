import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Plus, 
  Edit, 
  Trash2, 
  Clock,
  Zap,
  CheckCircle,
  XCircle,
  BarChart3,
  Activity,
  AlertCircle,
  Settings as SettingsIcon,
  Calendar,
  Target,
  TrendingUp,
  Save,
  X,
  Copy,
  RefreshCw,
  Link2,
  DollarSign,
  Package,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { formatLastRun } from '@/utils/date';

interface Workflow {
  id: number;
  name: string;
  description?: string;
  type: 'search' | 'analyze' | 'publish' | 'reprice' | 'custom';
  enabled: boolean;
  schedule: string;
  conditions: any;
  actions: any;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  successRate: number;
  createdAt: string;
}

interface WorkflowLog {
  id: number;
  workflowId: number;
  workflowName: string;
  status: 'success' | 'failed' | 'running';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  itemsProcessed: number;
  errors?: string;
}

interface AutopilotStats {
  activeWorkflows: number;
  totalRuns: number;
  successRate: number;
  itemsProcessed: number;
  lastRunTime?: string;
}

/** Id used for the virtual "main cycle" workflow row (not stored in DB). */
const MAIN_CYCLE_WORKFLOW_ID = 0;

/** Production status from GET /api/autopilot/status */
interface AutopilotStatusResponse {
  running: boolean;
  totalRuns?: number;
  itemsProcessed?: number;
  productsPublished?: number;
  opportunitiesGenerated?: number;
  successRate?: number;
  lastRun?: string | null;
  config?: {
    targetMarketplaces?: string[];
    targetMarketplace?: string;
    cycleIntervalMinutes?: number;
    enabled?: boolean;
  };
  currentPhase?: 'idle' | 'searching' | 'filtering' | 'analyzing' | 'publishing';
  cycleStartedAt?: string | null;
  currentCycleProgress?: {
    query?: string;
    opportunitiesFound?: number;
    analyzed?: number;
    published?: number;
    filteredCount?: number;
    category?: string;
    cycleStartedAt?: string;
    marketplacesTarget?: string[];
    publishingCurrent?: number;
    publishingTotal?: number;
  };
}

/** Autopilot business metrics from GET /api/dashboard/autopilot-metrics */
interface AutopilotMetrics {
  activeListings: number;
  dailySales: number;
  profitToday: number;
  profitMonth: number;
  winningProductsCount: number;
  topWinningProducts?: Array<{ productId: number; productTitle: string; winningScore: number }>;
}

/** Start readiness from GET /api/autopilot/start-readiness */
interface StartReadiness {
  canStart: boolean;
  reason?: string;
  checks: { scraping: boolean; ebay: boolean; onboarding: boolean };
}

interface InventorySummaryListings {
  listingsByMarketplace?: { ebay?: number; mercadolibre?: number; amazon?: number };
  ordersByStatus?: { CREATED?: number; PAID?: number; PURCHASING?: number; PURCHASED?: number; FAILED?: number };
  pendingPurchasesCount?: number;
  salesDeliveredCount?: number;
}

export default function Autopilot() {
  const { environment } = useEnvironment();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatusResponse | null>(null);
  const [autopilotMetrics, setAutopilotMetrics] = useState<AutopilotMetrics | null>(null);
  const [inventoryListings, setInventoryListings] = useState<InventorySummaryListings | null>(null);

  // Modals
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  // eBay OAuth: detectar si falta conectar y ofrecer hacerlo desde aquí (sin ir a Settings)
  const [ebayNeedsOAuth, setEbayNeedsOAuth] = useState(false);
  const [ebayOAuthing, setEbayOAuthing] = useState(false);

  // Start readiness (Scraping, eBay, onboarding) y error al intentar Start
  const [startReadiness, setStartReadiness] = useState<StartReadiness | null>(null);
  const [startError, setStartError] = useState<{ message: string; code?: string } | null>(null);

  // Autopilot config: marketplaces destino
  const [targetMarketplaces, setTargetMarketplaces] = useState<string[]>(['ebay']);
  const [savingConfig, setSavingConfig] = useState(false);
  // API credentials: mostrar aviso si ML/Amazon no conectados (sin bloquear selección)
  const [marketplaceApiStatus, setMarketplaceApiStatus] = useState<Record<string, { isConfigured: boolean; isAvailable: boolean }>>({});

  // Phase summary (colapsable)
  const [showPhaseSummary, setShowPhaseSummary] = useState(false);

  // Autopilot Settings (extended config)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    maxActiveProducts: 0,
    minProfitUsd: 10,
    minRoiPct: 50,
    minSupplierPrice: 0,
    maxSupplierPrice: 0,
    maxDuplicatesPerProduct: 0,
    autoRepeatWinners: false,
    deleteListingsAfterDays: 0,
    repricingIntervalHours: 6,
    targetCountry: 'US',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Form state
  const [workflowForm, setWorkflowForm] = useState({
    name: '',
    description: '',
    type: 'search' as 'search' | 'analyze' | 'publish' | 'reprice' | 'custom',
    enabled: true,
    schedule: 'manual',
    conditions: {},
    actions: {}
  });
  const [workflowFormMarketplaces, setWorkflowFormMarketplaces] = useState<string[]>(['ebay']);

  // Predefined schedules
  const schedules = [
    { value: 'manual', label: 'Manual Only' },
    { value: '*/15 * * * *', label: 'Every 15 minutes' },
    { value: '0 * * * *', label: 'Every hour' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
    { value: '0 0 * * *', label: 'Daily at midnight' },
    { value: '0 9 * * *', label: 'Daily at 9 AM' },
    { value: '0 0 * * 0', label: 'Weekly (Sunday)' },
    { value: '0 0 1 * *', label: 'Monthly (1st day)' },
    { value: 'custom', label: 'Custom Cron Expression' }
  ];

  // ✅ P9: Validar formato de cron expression con preview
  const validateCronExpression = (cron: string): { valid: boolean; error?: string; description?: string } => {
    if (cron === 'manual' || cron === '') {
      return { valid: true, description: 'Manual execution only' };
    }

    // Formato cron: 5 campos separados por espacios
    // minuto hora día mes día-semana
    const parts = cron.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      return { valid: false, error: 'Cron expression must have exactly 5 fields (minute hour day month weekday)' };
    }

    // Validar cada campo básicamente (números, *, /, -, ,)
    const cronPattern = /^[\d\*\/\-\,\s]+$/;
    for (let i = 0; i < parts.length; i++) {
      if (!cronPattern.test(parts[i])) {
        return { valid: false, error: `Invalid character in field ${i + 1}` };
      }
    }

    // Validaciones básicas por campo
    const [minute, hour, day, month, weekday] = parts;
    
    // Minuto: 0-59
    if (minute !== '*' && !minute.includes('/') && !minute.includes('-') && !minute.includes(',')) {
      const min = parseInt(minute);
      if (isNaN(min) || min < 0 || min > 59) {
        return { valid: false, error: 'Minute must be between 0-59' };
      }
    }

    // Hora: 0-23
    if (hour !== '*' && !hour.includes('/') && !hour.includes('-') && !hour.includes(',')) {
      const h = parseInt(hour);
      if (isNaN(h) || h < 0 || h > 23) {
        return { valid: false, error: 'Hour must be between 0-23' };
      }
    }

    // Día: 1-31
    if (day !== '*' && !day.includes('/') && !day.includes('-') && !day.includes(',')) {
      const d = parseInt(day);
      if (isNaN(d) || d < 1 || d > 31) {
        return { valid: false, error: 'Day must be between 1-31' };
      }
    }

    // Mes: 1-12
    if (month !== '*' && !month.includes('/') && !month.includes('-') && !month.includes(',')) {
      const m = parseInt(month);
      if (isNaN(m) || m < 1 || m > 12) {
        return { valid: false, error: 'Month must be between 1-12' };
      }
    }

    // Día de semana: 0-7 (0 y 7 = domingo)
    if (weekday !== '*' && !weekday.includes('/') && !weekday.includes('-') && !weekday.includes(',')) {
      const w = parseInt(weekday);
      if (isNaN(w) || w < 0 || w > 7) {
        return { valid: false, error: 'Weekday must be between 0-7 (0 and 7 = Sunday)' };
      }
    }

    // ✅ P9: Generar descripción humana básica
    let description = '';
    if (minute === '*/15' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      description = 'Every 15 minutes';
    } else if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      description = 'Every hour';
    } else if (minute === '0' && hour === '0' && day === '*' && month === '*' && weekday === '*') {
      description = 'Daily at midnight';
    } else if (minute === '0' && hour === '9' && day === '*' && month === '*' && weekday === '*') {
      description = 'Daily at 9:00 AM';
    } else if (minute === '0' && hour === '0' && day === '*' && month === '*' && weekday === '0') {
      description = 'Weekly on Sunday at midnight';
    } else if (minute === '0' && hour === '0' && day === '1' && month === '*' && weekday === '*') {
      description = 'Monthly on the 1st at midnight';
    } else {
      description = `Custom schedule: ${cron}`;
    }

    return { valid: true, description };
  };

  // ✅ P9: Calcular próximas ejecuciones (preview básico)
  const getNextRunsPreview = (cron: string, count: number = 3): string[] => {
    if (cron === 'manual' || !cron || cron === '') {
      return ['Manual execution only'];
    }

    const validation = validateCronExpression(cron);
    if (!validation.valid) {
      return ['Invalid cron expression'];
    }

    // Preview básico - el backend calculará el nextRun real
    const now = new Date();
    const previews: string[] = [];
    
    // Para patrones simples, calcular próximas ejecuciones aproximadas
    const parts = cron.trim().split(/\s+/);
    const [minute, hour] = parts;

    if (minute === '*/15' && hour === '*') {
      // Cada 15 minutos
      for (let i = 1; i <= count; i++) {
        const next = new Date(now.getTime() + i * 15 * 60 * 1000);
        previews.push(next.toLocaleString());
      }
    } else if (minute === '0' && hour === '*') {
      // Cada hora
      for (let i = 1; i <= count; i++) {
        const next = new Date(now.getTime() + i * 60 * 60 * 1000);
        previews.push(next.toLocaleString());
      }
    } else if (minute !== '*' && hour !== '*') {
      // Hora específica
      const h = parseInt(hour) || 0;
      const m = parseInt(minute) || 0;
      for (let i = 0; i < count; i++) {
        const next = new Date(now);
        next.setHours(h, m, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        next.setDate(next.getDate() + i);
        previews.push(next.toLocaleString());
      }
    } else {
      previews.push('Schedule will be calculated by the system');
    }

    return previews;
  };

  const [customCron, setCustomCron] = useState('');
  const [cronError, setCronError] = useState<string | null>(null);

  // Ref para polling periódico (evita closure obsoleta)
  const loadDataRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const fetchStartReadiness = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; canStart: boolean; reason?: string; checks: StartReadiness['checks'] }>('/api/autopilot/start-readiness');
      if (data && typeof data.canStart === 'boolean' && data.checks) {
        setStartReadiness({ canStart: data.canStart, reason: data.reason, checks: data.checks });
      } else {
        setStartReadiness(null);
      }
    } catch {
      setStartReadiness(null);
    }
  }, []);

  useEffect(() => {
    loadData();
    checkAutopilotStatus();
    fetchStartReadiness();
  }, [environment, fetchStartReadiness]);

  useEffect(() => {
    const ms = autopilotRunning ? 4000 : 10000;
    const interval = setInterval(checkAutopilotStatus, ms);
    return () => clearInterval(interval);
  }, [autopilotRunning]);

  // Polling periódico de workflows, stats, metrics, inventario (información en vivo)
  useEffect(() => {
    const ms = autopilotRunning ? 15000 : 20000; // 15s corriendo, 20s parado
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDataRef.current();
      }
    }, ms);
    return () => clearInterval(interval);
  }, [autopilotRunning, environment]);

  // Detectar si eBay tiene credenciales base pero falta OAuth (para mostrar "Conectar eBay" automáticamente)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/workflow/environment');
        const env = data?.environment || 'sandbox';
        const credRes = await api.get(`/api/marketplace/credentials/ebay?environment=${env}`);
        const body = credRes.data?.data ?? credRes.data;
        if (cancelled) return;
        // Si hay credenciales base pero falta OAuth (issues/warnings lo indican)
        const issues = body?.issues || [];
        const warnings = body?.warnings || [];
        const present = body?.present ?? credRes.data?.present;
        const needsOAuth =
          !!present &&
          (issues.some((s: string) => /oauth|token/i.test(s)) ||
            warnings.some((s: string) => /oauth|token|autoriz/i.test(s)));
        setEbayNeedsOAuth(!!needsOAuth);
      } catch {
        if (!cancelled) setEbayNeedsOAuth(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listener para OAuth completado (callback envía postMessage)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success') {
        setEbayNeedsOAuth(false);
        setEbayOAuthing(false);
        toast.success('eBay conectado correctamente');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Workflow virtual del ciclo principal (Start Autopilot) para mostrarlo en la tabla
  const mainCycleWorkflow = useMemo((): Workflow | null => {
    if (autopilotStatus == null && stats == null) return null;
    const intervalMin = autopilotStatus?.config?.cycleIntervalMinutes ?? 15;
    const lastRunRaw = autopilotStatus?.lastRun ?? stats?.lastRunTime ?? null;
    const lastRun = typeof lastRunRaw === 'string' ? lastRunRaw : (lastRunRaw != null ? new Date(lastRunRaw).toISOString() : null);
    let nextRun: string | undefined;
    if (lastRun) {
      const next = new Date(new Date(lastRun).getTime() + intervalMin * 60 * 1000);
      nextRun = next.toISOString();
    }
    return {
      id: MAIN_CYCLE_WORKFLOW_ID,
      name: 'Ciclo principal Autopilot',
      description: 'Buscar oportunidades y publicar en marketplaces (Start/Stop arriba).',
      type: 'publish',
      enabled: autopilotRunning ?? autopilotStatus?.config?.enabled ?? false,
      schedule: `Cada ${intervalMin} min`,
      lastRun: lastRun ?? undefined,
      nextRun,
      runCount: stats?.totalRuns ?? 0,
      successRate: ((stats?.successRate ?? 0) * 100),
      createdAt: '',
      conditions: {},
      actions: {},
    };
  }, [autopilotStatus, stats, autopilotRunning]);

  const displayWorkflows = useMemo(
    () => (mainCycleWorkflow ? [mainCycleWorkflow, ...workflows] : workflows),
    [mainCycleWorkflow, workflows]
  );

  const handleConnectEbay = async () => {
    setEbayOAuthing(true);
    try {
      const { data: envData } = await api.get('/api/workflow/environment');
      const env = envData?.environment || 'sandbox';
      const { data } = await api.get(`/api/marketplace/auth-url/ebay?environment=${env}`);
      const authUrl = data?.data?.authUrl || data?.authUrl || data?.url;
      if (!authUrl) {
        toast.error('No se pudo obtener la URL de autorización de eBay');
        return;
      }
      toast('Redirigiendo a eBay para autorizar…', { icon: 'ℹ️' });
      window.location.replace(authUrl);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (err as Error)?.message || 'Error';
      toast.error('Error al iniciar OAuth: ' + msg);
    } finally {
      setEbayOAuthing(false);
    }
  };

  const loadData = async () => {
    try {
      const [workflowsRes, statsRes, configRes, metricsRes, invRes, credsRes] = await Promise.all([
        api.get('/api/autopilot/workflows'),
        api.get('/api/autopilot/stats'),
        api.get('/api/autopilot/config').catch(() => ({ data: {} })),
        api.get('/api/dashboard/autopilot-metrics', { params: { environment } }).catch(() => ({ data: {} })),
        api.get<InventorySummaryListings>('/api/dashboard/inventory-summary', { params: { environment } }).catch(() => ({ data: null })),
        api.get('/api/credentials/status').catch(() => ({ data: {} })),
      ]);
      
      setWorkflows(workflowsRes.data?.workflows || []);
      setStats(statsRes.data?.stats || null);
      if (invRes.data) {
        setInventoryListings({
          listingsByMarketplace: invRes.data.listingsByMarketplace,
          ordersByStatus: invRes.data.ordersByStatus,
          pendingPurchasesCount: invRes.data.pendingPurchasesCount ?? 0,
          salesDeliveredCount: invRes.data.salesDeliveredCount ?? 0,
        });
      } else {
        setInventoryListings(null);
      }
      const cfg = configRes.data?.config;
      if (cfg) {
        setSettingsForm((prev) => ({
          ...prev,
          maxActiveProducts: cfg.maxActiveProducts ?? prev.maxActiveProducts,
          minProfitUsd: typeof cfg.minProfitUsd === 'number' ? cfg.minProfitUsd : prev.minProfitUsd,
          minRoiPct: typeof cfg.minRoiPct === 'number' ? cfg.minRoiPct : prev.minRoiPct,
          minSupplierPrice: cfg.minSupplierPrice ?? prev.minSupplierPrice,
          maxSupplierPrice: cfg.maxSupplierPrice ?? prev.maxSupplierPrice,
          maxDuplicatesPerProduct: cfg.maxDuplicatesPerProduct ?? prev.maxDuplicatesPerProduct,
          autoRepeatWinners: cfg.autoRepeatWinners ?? prev.autoRepeatWinners,
          deleteListingsAfterDays: cfg.deleteListingsAfterDays ?? prev.deleteListingsAfterDays,
          repricingIntervalHours: cfg.repricingIntervalHours ?? prev.repricingIntervalHours,
          targetCountry: cfg.targetCountry || prev.targetCountry,
        }));
      }
      if (metricsRes.data && !metricsRes.data._safeMode) {
        setAutopilotMetrics({
          activeListings: metricsRes.data.activeListings ?? 0,
          dailySales: metricsRes.data.dailySales ?? 0,
          profitToday: metricsRes.data.profitToday ?? 0,
          profitMonth: metricsRes.data.profitMonth ?? 0,
          winningProductsCount: metricsRes.data.winningProductsCount ?? 0,
        });
      }
      // Marketplace API status: para mostrar avisos si no están conectados
      const apis = credsRes?.data?.data?.apis || [];
      const statusMap: Record<string, { isConfigured: boolean; isAvailable: boolean }> = {};
      apis.forEach((entry: { apiName?: string; isConfigured?: boolean; isAvailable?: boolean }) => {
        const name = String(entry?.apiName || '').toLowerCase();
        if (['ebay', 'mercadolibre', 'amazon'].includes(name)) {
          statusMap[name] = {
            isConfigured: Boolean(entry?.isConfigured),
            isAvailable: Boolean(entry?.isAvailable),
          };
        }
      });
      setMarketplaceApiStatus(statusMap);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading autopilot data: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setLoading(false);
    }
  };
  loadDataRef.current = loadData;

  const loadLogs = async (workflowId?: number) => {
    try {
      const url = workflowId 
        ? `/api/autopilot/workflows/${workflowId}/logs`
        : '/api/autopilot/logs';
      const { data } = await api.get(url);
      setLogs(data?.logs || []);
      setShowLogsModal(true);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error loading logs');
      }
    }
  };

  const checkAutopilotStatus = async () => {
    try {
      const { data } = await api.get<AutopilotStatusResponse>('/api/autopilot/status');
      setAutopilotRunning(data?.running ?? false);
      setAutopilotStatus(data ? {
        running: data.running ?? false,
        opportunitiesGenerated: data.opportunitiesGenerated,
        productsPublished: data.productsPublished,
        lastRun: data.lastRun ?? undefined,
        config: data.config,
        currentPhase: data.currentPhase,
        cycleStartedAt: data.cycleStartedAt ?? undefined,
        currentCycleProgress: data.currentCycleProgress,
      } : null);
      // Sincronizar marketplaces destino desde config
      const cfg = data?.config;
      if (cfg?.targetMarketplaces && Array.isArray(cfg.targetMarketplaces) && cfg.targetMarketplaces.length > 0) {
        setTargetMarketplaces(cfg.targetMarketplaces);
      } else if (cfg?.targetMarketplace) {
        setTargetMarketplaces([cfg.targetMarketplace]);
      }
    } catch (error: any) {
      // Silent fail
    }
  };

  const saveAutopilotMarketplaces = async (marketplaces: string[]) => {
    setSavingConfig(true);
    try {
      await api.put('/api/autopilot/config', { targetMarketplaces: marketplaces });
      setTargetMarketplaces(marketplaces);
      toast.success('Marketplaces de destino actualizados');
    } catch (error: any) {
      toast.error('Error al guardar: ' + (error?.response?.data?.error || error?.message || 'Error'));
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleMarketplace = (mp: string) => {
    const next = targetMarketplaces.includes(mp)
      ? targetMarketplaces.filter(m => m !== mp)
      : [...targetMarketplaces, mp];
    if (next.length === 0) return; // Al menos uno debe estar seleccionado
    saveAutopilotMarketplaces(next);
  };

  const saveAutopilotSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/api/autopilot/config', {
        maxActiveProducts: settingsForm.maxActiveProducts || undefined,
        minProfitUsd: settingsForm.minProfitUsd,
        minRoiPct: settingsForm.minRoiPct,
        minSupplierPrice: settingsForm.minSupplierPrice || undefined,
        maxSupplierPrice: settingsForm.maxSupplierPrice || undefined,
        maxDuplicatesPerProduct: settingsForm.maxDuplicatesPerProduct || undefined,
        autoRepeatWinners: settingsForm.autoRepeatWinners,
        deleteListingsAfterDays: settingsForm.deleteListingsAfterDays || undefined,
        repricingIntervalHours: settingsForm.repricingIntervalHours,
        targetCountry: settingsForm.targetCountry || undefined,
      });
      toast.success('Configuración de Autopilot guardada');
    } catch (error: any) {
      toast.error('Error al guardar configuración: ' + (error.response?.data?.error || error?.message));
    } finally {
      setSavingSettings(false);
    }
  };

  const applyTestListingPreset = async () => {
    const testValues = {
      minProfitUsd: 1,
      minSupplierPrice: 0.5,
      minRoiPct: 15,
      maxActiveProducts: 1,
    };
    setSettingsForm((prev) => ({ ...prev, ...testValues }));
    setSavingSettings(true);
    try {
      await api.put('/api/autopilot/config', {
        ...settingsForm,
        ...testValues,
        maxActiveProducts: testValues.maxActiveProducts,
        minProfitUsd: testValues.minProfitUsd,
        minRoiPct: testValues.minRoiPct,
        minSupplierPrice: testValues.minSupplierPrice,
        maxSupplierPrice: settingsForm.maxSupplierPrice || undefined,
        maxDuplicatesPerProduct: settingsForm.maxDuplicatesPerProduct || undefined,
        autoRepeatWinners: settingsForm.autoRepeatWinners,
        deleteListingsAfterDays: settingsForm.deleteListingsAfterDays || undefined,
        repricingIntervalHours: settingsForm.repricingIntervalHours,
        targetCountry: settingsForm.targetCountry || undefined,
      });
      toast.success(
        'Configuración de prueba guardada. Ve a Oportunidades (o Panel → Tendencias), elige un producto barato y publícalo en eBay para probar el ciclo.'
      );
    } catch (error: any) {
      toast.error('Error al aplicar preset: ' + (error.response?.data?.error || error?.message));
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleAutopilot = async () => {
    setStartError(null);
    try {
      if (autopilotRunning) {
        await api.post('/api/autopilot/stop');
        toast.success('Autopilot stopped');
        setAutopilotRunning(false);
        loadData();
      } else {
        await api.post('/api/autopilot/start');
        toast.success('Autopilot started. First cycle running…');
        setAutopilotRunning(true);
        checkAutopilotStatus();
        loadData();
        fetchStartReadiness();
        const refresh = () => {
          checkAutopilotStatus();
          loadData();
        };
        setTimeout(refresh, 2000);
        setTimeout(refresh, 6000);
        setTimeout(refresh, 12000);
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      const code = error.response?.data?.code;
      setStartError({ message: errMsg, code });
      toast.error('Error al iniciar Autopilot: ' + errMsg);
    }
  };

  const openWorkflowModal = (workflow?: Workflow) => {
    const defaultMarketplaces = ['ebay'];
    if (workflow) {
      setSelectedWorkflow(workflow);
      const acts = workflow.actions || {};
      const mps = Array.isArray(acts.marketplaces) && acts.marketplaces.length > 0
        ? acts.marketplaces
        : defaultMarketplaces;
      setWorkflowForm({
        name: workflow.name,
        description: workflow.description || '',
        type: workflow.type,
        enabled: workflow.enabled,
        schedule: workflow.schedule,
        conditions: workflow.conditions || {},
        actions: { ...acts, marketplaces: mps }
      });
    } else {
      setSelectedWorkflow(null);
      setWorkflowForm({
        name: '',
        description: '',
        type: 'search',
        enabled: true,
        schedule: 'manual',
        conditions: {},
        actions: { marketplaces: defaultMarketplaces, query: '' }
      });
    }
    setShowWorkflowModal(true);
  };

  const saveWorkflow = async () => {
    if (!workflowForm.name) {
      toast.error('Workflow name is required');
      return;
    }

    // ✅ P9: Validar cron expression antes de guardar
    if (workflowForm.schedule !== 'manual' && workflowForm.schedule !== '') {
      const finalSchedule = workflowForm.schedule === 'custom' ? customCron : workflowForm.schedule;
      const validation = validateCronExpression(finalSchedule);
      if (!validation.valid) {
        toast.error(`Invalid cron expression: ${validation.error}`);
        setCronError(validation.error || 'Invalid cron expression');
        return;
      }
    }

    try {
      const actions = { ...workflowForm.actions };
      if (workflowForm.type === 'publish' || workflowForm.type === 'search') {
        actions.marketplaces = Array.isArray(actions.marketplaces) && actions.marketplaces.length > 0
          ? actions.marketplaces
          : ['ebay'];
      }
      const workflowData = {
        ...workflowForm,
        actions,
        schedule: workflowForm.schedule === 'custom' ? customCron : workflowForm.schedule
      };

      if (selectedWorkflow) {
        await api.put(`/api/autopilot/workflows/${selectedWorkflow.id}`, workflowData);
        toast.success('Workflow updated successfully');
      } else {
        await api.post('/api/autopilot/workflows', workflowData);
        toast.success('Workflow created successfully');
      }
      setShowWorkflowModal(false);
      setCustomCron('');
      setCronError(null);
      loadData();
    } catch (error: any) {
      toast.error('Error saving workflow: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleWorkflow = async (workflowId: number, currentStatus: boolean) => {
    try {
      const response = await api.put(`/api/autopilot/workflows/${workflowId}/enabled`, { enabled: !currentStatus });
      const message = response.data?.message || `Workflow ${!currentStatus ? 'activado' : 'desactivado'} exitosamente`;
      toast.success(message);
      loadData();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Error actualizando workflow';
      toast.error(errorMessage);
    }
  };

  const deleteWorkflow = async (workflowId: number) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
      await api.delete(`/api/autopilot/workflows/${workflowId}`);
      toast.success('Workflow deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error deleting workflow');
    }
  };

  const runWorkflow = async (workflowId: number) => {
    try {
      const response = await api.post(`/api/autopilot/workflows/${workflowId}/run`);
      const data = response.data;
      
      if (data?.success && data?.executed) {
        toast.success(data?.message || 'Workflow ejecutado exitosamente');
      } else {
        toast.warning(data?.message || 'Workflow ejecutado con advertencias');
      }
      
      loadData();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Error ejecutando workflow';
      toast.error(errorMessage);
    }
  };

  const runMainCycle = async () => {
    try {
      await api.post('/api/autopilot/run-cycle', {});
      toast.success('Ciclo principal ejecutado');
      loadData();
      checkAutopilotStatus();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Error ejecutando ciclo';
      toast.error(errorMessage);
    }
  };

  const duplicateWorkflow = async (workflow: Workflow) => {
    try {
      const newWorkflow = {
        ...workflow,
        name: `${workflow.name} (Copy)`,
        id: undefined,
        createdAt: undefined,
        lastRun: undefined,
        nextRun: undefined,
        runCount: 0,
        successRate: 0
      };
      await api.post('/api/autopilot/workflows', newWorkflow);
      toast.success('Workflow duplicated successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error duplicating workflow');
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'search': return 'bg-blue-100 text-blue-700';
      case 'analyze': return 'bg-purple-100 text-purple-700';
      case 'publish': return 'bg-green-100 text-green-700';
      case 'reprice': return 'bg-yellow-100 text-yellow-700';
      case 'custom': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getLogStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'running': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  /** Devuelve minutos desde una fecha ISO, o null si es inválida/extraña (evita mostrar "2006") */
  const getMinutesAgo = (isoDate: string | null | undefined): number | null => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 2010 || y > 2030) return null;
    return Math.floor((Date.now() - d.getTime()) / 60000);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* eBay OAuth banner: conectar automáticamente sin ir a Settings */}
      {ebayNeedsOAuth && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">eBay requiere autorización</p>
              <p className="text-sm text-amber-800 dark:text-amber-200">Conecta tu cuenta eBay para que el Autopilot encuentre más productos. Un clic y listo.</p>
            </div>
          </div>
          <button
            onClick={handleConnectEbay}
            disabled={ebayOAuthing}
            className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 font-medium"
          >
            <Link2 className="w-4 h-4" />
            {ebayOAuthing ? 'Abriendo...' : 'Conectar eBay'}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Autopilot</h1>
          <p className="text-gray-600 dark:text-gray-400">Configure and run automated workflows</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Datos en tiempo real desde el servidor.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadLogs()}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-900 dark:text-gray-100"
            >
              <Activity className="w-4 h-4" />
              View All Logs
            </button>
            <button
              onClick={toggleAutopilot}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                autopilotRunning 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {autopilotRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {autopilotRunning ? 'Stop Autopilot' : 'Start Autopilot'}
            </button>
            <button
              onClick={() => openWorkflowModal()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </div>
          {startReadiness && !startReadiness.canStart && !autopilotRunning && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Para iniciar: {startReadiness.reason ?? 'Revisa la configuración.'}
              {(startReadiness.checks.scraping === false || startReadiness.checks.ebay === false) && (
                <a href="/api-settings" className="ml-1 underline font-medium">Ir a Configuración de APIs</a>
              )}
            </p>
          )}
        </div>
      </div>

      {startError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">No se pudo iniciar el Autopilot</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{startError.message}</p>
            {(startError.code === 'SCRAPING_MISSING' || startError.code === 'EBAY_MISSING') && (
              <a href="/api-settings" className="inline-block mt-2 text-sm font-medium text-red-600 dark:text-red-400 underline">
                Ir a Configuración de APIs
              </a>
            )}
            {startError.code === 'ONBOARDING_INCOMPLETE' && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">Completa el wizard de onboarding antes de iniciar.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStartError(null)}
            className="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-800/50 text-red-600 dark:text-red-400"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Estado del ciclo — Ciclo del Autopilot (1-4) separado de post-venta (5-7) */}
      <div className="rounded-xl border-2 overflow-hidden">
        <div className={`px-4 py-3 font-semibold text-sm uppercase tracking-wide ${
          autopilotRunning ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
        }`}>
          Estado del ciclo
        </div>
        <div className={`border-t p-4 flex items-start gap-4 transition-colors ${
          autopilotRunning ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className={`p-3 rounded-xl shrink-0 ${autopilotRunning ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
            {autopilotRunning ? (
              <Activity className="w-8 h-8 text-green-600 dark:text-green-400 animate-pulse" />
            ) : (
              <Pause className="w-8 h-8 text-gray-600 dark:text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                {autopilotRunning ? 'En ejecución' : 'Detenido'}
              </div>
              {autopilotRunning && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ciclo del Autopilot (buscar → publicar)</p>
              )}
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
                {autopilotRunning ? (
                  <>
                    {(() => {
                      const phase = autopilotStatus?.currentPhase;
                      const phaseNames: Record<string, { num: number; name: string }> = {
                        idle: { num: 0, name: 'Entre ciclos' },
                        searching: { num: 1, name: 'Buscar' },
                        filtering: { num: 2, name: 'Filtrar' },
                        analyzing: { num: 3, name: 'Analizar' },
                        publishing: { num: 4, name: 'Publicar' },
                      };
                      const phaseInfo = phase ? phaseNames[phase] ?? { num: 0, name: '—' } : { num: 0, name: '—' };
                      const prog = autopilotStatus?.currentCycleProgress;
                      let detail = '';
                      if (phase === 'searching') detail = 'Buscando oportunidades en AliExpress…';
                      else if (phase === 'filtering') detail = 'Filtrando por criterios de precio y calidad…';
                      else if (phase === 'analyzing') detail = 'Analizando rentabilidad y ROI…';
                      else if (phase === 'publishing') {
                        const curr = prog?.publishingCurrent;
                        const tot = prog?.publishingTotal;
                        detail = (curr != null && tot != null && tot > 0) ? `Publicando… producto ${curr} de ${tot}` : 'Publicando en marketplace(s)…';
                      } else if (phase === 'idle') detail = 'Siguiente ciclo según intervalo configurado.';
                      else detail = 'buscar → filtrar → analizar → publicar.';
                      return (
                        <>
                          <div className="font-medium text-base text-gray-900 dark:text-gray-100">
                            Ahora: Fase {phaseInfo.num || '—'} — {phaseInfo.name}
                          </div>
                          {detail && <span className="text-sm">{detail}</span>}
                        </>
                      );
                    })()}
                    {(() => {
                      const mins = getMinutesAgo(autopilotStatus?.cycleStartedAt);
                      return mins != null ? (
                        <span className="block text-xs text-gray-500 dark:text-gray-500">
                          Ciclo iniciado hace {mins} min
                        </span>
                      ) : null;
                    })()}
                    {autopilotStatus?.config?.targetMarketplaces && autopilotStatus.config.targetMarketplaces.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {autopilotStatus.config.targetMarketplaces.map((mp) => (
                          <span key={mp} className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                            {mp === 'mercadolibre' ? 'Mercado Libre' : mp}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  'Inicia el autopilot para ejecutar ciclos automáticos (buscar oportunidades y publicar).'
                )}
              </div>
            </div>
            {(() => {
              const cyclePhases = ['idle', 'searching', 'filtering', 'analyzing', 'publishing'];
              const cyclePhaseLabels = ['Buscar', 'Filtrar', 'Analizar', 'Publicar'];
              const currentIdx = cyclePhases.indexOf(autopilotStatus?.currentPhase || 'idle');
              const cycleProgress = currentIdx >= 0 ? Math.round((currentIdx / Math.max(1, cyclePhases.length - 1)) * 100) : 0;
              const orders = inventoryListings?.ordersByStatus ?? {};
              const compraCount = (orders.PAID ?? 0) + (orders.PURCHASING ?? 0) + (inventoryListings?.pendingPurchasesCount ?? 0);
              const envioCount = orders.PURCHASED ?? 0;
              const entregadoCount = inventoryListings?.salesDeliveredCount ?? 0;
              const currentPhase = autopilotStatus?.currentPhase;
              return (
                <div className="space-y-4">
                  {/* Bloque 1: Ciclo del Autopilot (solo fases 1-4) */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      {!autopilotRunning && <span>Autopilot detenido</span>}
                      {autopilotRunning && currentPhase === 'idle' && (
                        <span>Entre ciclos — próximo ciclo según intervalo configurado</span>
                      )}
                      {autopilotRunning && currentPhase !== 'idle' && (
                        <>
                          <span>Progreso de este ciclo</span>
                          <span>{cycleProgress}%</span>
                        </>
                      )}
                    </div>
                    {/* Barra: indeterminada entre ciclos, continua con fill cuando hay ciclo, gris vacía si parado */}
                    <div className="h-2.5 w-full rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                      {autopilotRunning && currentPhase === 'idle' && (
                        <div
                          className="h-full w-full animate-pulse bg-gray-300 dark:bg-gray-600 rounded"
                          aria-hidden
                        />
                      )}
                      {autopilotRunning && currentPhase !== 'idle' && (
                        <div
                          className={`h-full bg-green-500 dark:bg-green-600 transition-all duration-300 ${cycleProgress >= 100 ? 'rounded' : 'rounded-l'}`}
                          style={{ width: `${cycleProgress}%` }}
                          role="progressbar"
                          aria-valuenow={cycleProgress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cyclePhaseLabels.map((label, i) => {
                        const phaseKey = cyclePhases[i + 1];
                        const isCurrent = currentPhase === phaseKey && autopilotRunning;
                        const titles = ['Query a AliExpress / tendencias', 'Precio, capital, duplicados', 'Rentabilidad, ROI, compliance', 'Crear listados en eBay/ML/Amazon'];
                        return (
                          <span
                            key={label}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                              isCurrent
                                ? 'ring-2 ring-green-500 dark:ring-green-400 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                            title={titles[i]}
                          >
                            {i + 1}. {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {/* Bloque 2: Pipeline post-venta (ventas y envíos) */}
                  <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Ventas y envíos en proceso</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200" title="Pagadas + Comprando en AliExpress + Pendientes de compra">
                        5. Compra: {compraCount}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" title="Órdenes compradas en proveedor, esperando envío">
                        6. Envío: {envioCount}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" title="Ventas marcadas como entregadas">
                        7. Entregado: {entregadoCount}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPhaseSummary((v) => !v)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                  >
                    {showPhaseSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showPhaseSummary ? 'Ocultar' : 'Ver'} descripción de fases
                  </button>
                  {showPhaseSummary && (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Fase</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Nombre</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Descripción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          <tr><td className="px-3 py-2 font-medium">1</td><td>Buscar</td><td>Query a AliExpress / tendencias</td></tr>
                          <tr><td className="px-3 py-2 font-medium">2</td><td>Filtrar</td><td>Precio, capital, duplicados</td></tr>
                          <tr><td className="px-3 py-2 font-medium">3</td><td>Analizar</td><td>Rentabilidad, ROI, compliance</td></tr>
                          <tr><td className="px-3 py-2 font-medium">4</td><td>Publicar</td><td>Crear listados en eBay/ML/Amazon</td></tr>
                          <tr><td className="px-3 py-2 font-medium">5</td><td>Compra</td><td>Orden pagada, compra en AliExpress</td></tr>
                          <tr><td className="px-3 py-2 font-medium">6</td><td>Envío</td><td>En tránsito desde proveedor</td></tr>
                          <tr><td className="px-3 py-2 font-medium">7</td><td>Entregado</td><td>Venta completada</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
            {autopilotRunning && autopilotStatus?.currentCycleProgress && (autopilotStatus.currentCycleProgress.query || autopilotStatus.currentCycleProgress.opportunitiesFound != null || autopilotStatus.currentCycleProgress.analyzed != null || autopilotStatus.currentCycleProgress.published != null) && (
            <div className="flex flex-wrap gap-2 items-center pt-1">
              {(autopilotStatus.currentCycleProgress.query || autopilotStatus.currentCycleProgress.opportunitiesFound != null) && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-800 dark:text-gray-200" title="Query de búsqueda">
                  Query: <span className="ml-1 truncate max-w-[240px]" title={autopilotStatus.currentCycleProgress.query || ''}>{autopilotStatus.currentCycleProgress.query || 'selección automática'}</span>
                </span>
              )}
              {autopilotStatus.currentCycleProgress.opportunitiesFound != null && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-medium">
                  Oportunidades: {autopilotStatus.currentCycleProgress.opportunitiesFound}
                </span>
              )}
              {autopilotStatus.currentCycleProgress.analyzed != null && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 text-xs font-medium">
                  Analizadas: {autopilotStatus.currentCycleProgress.analyzed}
                </span>
              )}
              {autopilotStatus.currentCycleProgress.published != null && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs font-medium">
                  Publicadas: {autopilotStatus.currentCycleProgress.published}
                </span>
              )}
            </div>
          )}
            {!autopilotRunning && (autopilotStatus?.lastRun != null || autopilotStatus?.opportunitiesGenerated != null || autopilotStatus?.productsPublished != null) && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Resumen del último ciclo</div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
              {autopilotStatus.lastRun != null && autopilotStatus.lastRun && (
                <span>Última ejecución: {formatLastRun(autopilotStatus.lastRun)}</span>
              )}
              {autopilotStatus.opportunitiesGenerated != null && (
                <span>Oportunidades último ciclo: {autopilotStatus.opportunitiesGenerated}</span>
              )}
              {autopilotStatus.productsPublished != null && (
                <span title="Acumulado de todos los ciclos del Autopilot">Total publicados por Autopilot: {autopilotStatus.productsPublished}</span>
              )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Autopilot Dashboard - Business metrics */}
      {autopilotMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-600 dark:text-gray-400">Listados activos</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{autopilotMetrics.activeListings}</div>
                {inventoryListings?.listingsByMarketplace && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    eBay: {inventoryListings.listingsByMarketplace.ebay ?? 0} · ML: {inventoryListings.listingsByMarketplace.mercadolibre ?? 0} · Amazon: {inventoryListings.listingsByMarketplace.amazon ?? 0}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <BarChart3 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Daily Sales</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{autopilotMetrics.dailySales}</div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Winning Products</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{autopilotMetrics.winningProductsCount}</div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Profit Today</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${autopilotMetrics.profitToday.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                <DollarSign className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Profit Month</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${autopilotMetrics.profitMonth.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top winning products list */}
      {autopilotMetrics?.topWinningProducts && autopilotMetrics.topWinningProducts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Top productos ganadores (WinningScore &gt; 75)</h3>
          <ul className="space-y-2">
            {autopilotMetrics.topWinningProducts.map((p) => (
              <li key={p.productId} className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[70%]" title={p.productTitle}>
                  {p.productTitle || `Producto #${p.productId}`}
                </span>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0 ml-2">
                  Score: {p.winningScore}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Marketplaces destino para publicación */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <span className="font-medium text-gray-900 dark:text-gray-100">Marketplaces de publicación</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          El Autopilot publicará en los marketplaces seleccionados. Selecciona al menos uno.
        </p>
        <div className="flex flex-wrap gap-4">
          {['ebay', 'amazon', 'mercadolibre'].map((mp) => {
            const status = marketplaceApiStatus[mp];
            const notConnected = status && !status.isAvailable;
            const displayName = mp === 'mercadolibre' ? 'Mercado Libre' : mp;
            return (
              <div key={mp} className="flex flex-col gap-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={targetMarketplaces.includes(mp)}
                    onChange={() => toggleMarketplace(mp)}
                    disabled={savingConfig || (targetMarketplaces.length === 1 && targetMarketplaces.includes(mp))}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium capitalize">{displayName}</span>
                </label>
                {notConnected && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 ml-6">
                    Conecta {displayName} en Settings &gt; APIs
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Autopilot Settings (extended config) */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSettingsPanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <span className="font-medium text-gray-900 dark:text-gray-100">Autopilot Settings</span>
          </div>
          {showSettingsPanel ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {showSettingsPanel && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max active listings</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={settingsForm.maxActiveProducts || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxActiveProducts: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="0 = no limit"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min profit (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={settingsForm.minProfitUsd}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minProfitUsd: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min ROI (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settingsForm.minRoiPct}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minRoiPct: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min supplier price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settingsForm.minSupplierPrice || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minSupplierPrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="0 = no min"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max supplier price (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settingsForm.maxSupplierPrice || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxSupplierPrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="0 = no max"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max duplicates per product</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={settingsForm.maxDuplicatesPerProduct || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxDuplicatesPerProduct: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="0 = off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repricing interval (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settingsForm.repricingIntervalHours}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, repricingIntervalHours: parseInt(e.target.value, 10) || 6 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delete listings after (days)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={settingsForm.deleteListingsAfterDays || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, deleteListingsAfterDays: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="0 = off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target country</label>
                <input
                  type="text"
                  maxLength={10}
                  value={settingsForm.targetCountry}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, targetCountry: e.target.value.trim() || 'US' }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                  placeholder="US"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoRepeatWinners"
                  checked={settingsForm.autoRepeatWinners}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, autoRepeatWinners: e.target.checked }))}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <label htmlFor="autoRepeatWinners" className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto repeat winning products</label>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={applyTestListingPreset}
                disabled={savingSettings}
                className="px-4 py-2 border border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50"
              >
                Usar valores para 1 artículo de prueba (más económico)
              </button>
              <button
                type="button"
                onClick={saveAutopilotSettings}
                disabled={savingSettings}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors" title="Ciclo de dropshipping activo cuando el Autopilot está en ejecución">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Ciclo activo</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {autopilotRunning ? 1 : 0}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors" title="Número de ciclos del Autopilot ejecutados.">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Ciclos completados</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats?.totalRuns || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">Grado de éxito</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats?.successRate?.toFixed(1) || 0}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Media de publicaciones/aprobaciones por ciclo</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Target className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Items Processed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats?.itemsProcessed || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflows Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Workflows ({displayWorkflows.length})
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Los workflows personalizados automatizan tareas adicionales (ej. búsqueda de oportunidades). El &quot;Resumen del último ciclo&quot; mostrado arriba corresponde al <strong>ciclo principal del Autopilot</strong> (Start Autopilot). Los workflows tipo &quot;search&quot; ejecutan ciclos independientes y solo buscan oportunidades; para publicar en eBay o Mercado Libre usa <strong>Start Autopilot</strong>.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <span className="inline-flex items-center gap-1" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">
                    Success Rate
                    <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {displayWorkflows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                      <p>No hay workflows configurados.</p>
                      <p className="text-sm">Crea uno para automatizar búsqueda, análisis o publicación.</p>
                      <button
                        type="button"
                        onClick={() => openWorkflowModal()}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        Crear primer workflow
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {displayWorkflows.map((workflow) => {
                const isMainCycle = workflow.id === MAIN_CYCLE_WORKFLOW_ID;
                return (
                <tr
                  key={workflow.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isMainCycle ? 'border-l-4 border-primary-500 bg-gray-50/50 dark:bg-gray-900/50' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{workflow.name}</span>
                      {isMainCycle && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                          Principal
                        </span>
                      )}
                    </div>
                    {workflow.description && (
                      <div className="text-sm text-gray-500">{workflow.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadgeColor(workflow.type)}`}>
                      {workflow.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                      <Clock className="w-3 h-3" />
                      {schedules.find(s => s.value === workflow.schedule)?.label || workflow.schedule}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {workflow.lastRun ? formatLastRun(workflow.lastRun) : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {workflow.nextRun ? formatLastRun(workflow.nextRun) : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {workflow.runCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {workflow.successRate?.toFixed(1) || 0}%
                      </div>
                      {workflow.successRate >= 80 ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : workflow.successRate >= 50 ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {workflow.enabled ? (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-700">
                        Enabled
                      </span>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-700">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => isMainCycle ? runMainCycle() : runWorkflow(workflow.id)}
                        className="text-green-600 hover:text-green-900"
                        title={isMainCycle ? 'Ejecutar ciclo ahora' : 'Run Now'}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => (isMainCycle ? loadLogs() : loadLogs(workflow.id))}
                        className="text-purple-600 hover:text-purple-900"
                        title="View Logs"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      {!isMainCycle && (
                        <>
                          <button
                            onClick={() => openWorkflowModal(workflow)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => duplicateWorkflow(workflow)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleWorkflow(workflow.id, workflow.enabled)}
                            className="text-yellow-600 hover:text-yellow-900"
                            title={workflow.enabled ? 'Disable' : 'Enable'}
                          >
                            {workflow.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteWorkflow(workflow.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create/Edit Workflow */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transition-colors">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {selectedWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
              </h3>
              <button onClick={() => setShowWorkflowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Name *</label>
                <input
                  type="text"
                  value={workflowForm.name}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="E.g. Auto Search High Margin Products"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={workflowForm.description}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Optional description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Type</label>
                  <select
                    value={workflowForm.type}
                    onChange={(e) => {
                      const newType = e.target.value as typeof workflowForm.type;
                      const acts = { ...workflowForm.actions };
                      if ((newType === 'publish' || newType === 'search') && (!Array.isArray(acts.marketplaces) || acts.marketplaces.length === 0)) {
                        acts.marketplaces = ['ebay'];
                      }
                      setWorkflowForm({ ...workflowForm, type: newType, actions: acts });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="search">Search Opportunities</option>
                    <option value="analyze">Analyze Products</option>
                    <option value="publish">Publish Products</option>
                    <option value="reprice">Reprice Products</option>
                    <option value="custom">Custom Workflow</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
                  <select
                    value={workflowForm.schedule === 'custom' ? 'custom' : (schedules.find(s => s.value === workflowForm.schedule) ? workflowForm.schedule : 'manual')}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setWorkflowForm({ ...workflowForm, schedule: customCron || '*/15 * * * *' });
                      } else {
                        setWorkflowForm({ ...workflowForm, schedule: e.target.value });
                        setCustomCron('');
                        setCronError(null);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    {schedules.map(schedule => (
                      <option key={schedule.value} value={schedule.value}>
                        {schedule.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* ✅ P9: Campo para cron personalizado */}
                  {(workflowForm.schedule === 'custom' || (workflowForm.schedule !== 'manual' && !schedules.find(s => s.value === workflowForm.schedule))) && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={workflowForm.schedule === 'custom' ? customCron : workflowForm.schedule}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCustomCron(value);
                          const validation = validateCronExpression(value);
                          if (validation.valid) {
                            setCronError(null);
                            setWorkflowForm({ ...workflowForm, schedule: value });
                          } else {
                            setCronError(validation.error || 'Invalid cron expression');
                          }
                        }}
                        placeholder="*/15 * * * * (minute hour day month weekday)"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                          cronError ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {cronError && (
                        <p className="mt-1 text-sm text-red-600">{cronError}</p>
                      )}
                      {!cronError && workflowForm.schedule !== 'manual' && workflowForm.schedule !== '' && (
                        <p className="mt-1 text-xs text-gray-500">
                          Format: minute hour day month weekday (e.g., "0 9 * * *" = daily at 9 AM)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Marketplaces (para publish y search) */}
              {(workflowForm.type === 'publish' || workflowForm.type === 'search') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Marketplaces</label>
                  <div className="flex flex-wrap gap-4">
                    {['ebay', 'amazon', 'mercadolibre'].map((mp) => {
                      const mps = Array.isArray(workflowForm.actions?.marketplaces)
                        ? workflowForm.actions.marketplaces
                        : ['ebay'];
                      const checked = mps.includes(mp);
                      return (
                        <label key={mp} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const current = mps;
                              const next = checked
                                ? current.filter(m => m !== mp)
                                : [...current, mp];
                              if (next.length === 0) return;
                              setWorkflowForm({
                                ...workflowForm,
                                actions: { ...workflowForm.actions, marketplaces: next }
                              });
                            }}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm capitalize">{mp === 'mercadolibre' ? 'Mercado Libre' : mp}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {workflowForm.type === 'publish' ? 'Publicar productos en estos marketplaces' : 'Buscar oportunidades en estos marketplaces'}
                  </p>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={workflowForm.enabled}
                    onChange={(e) => setWorkflowForm({ ...workflowForm, enabled: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Workflow Enabled</span>
                </label>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 mb-1">Workflow Configuration:</div>
                <div className="text-sm text-blue-800">
                  {workflowForm.type === 'search' && 'This workflow will search for profitable products based on configured criteria.'}
                  {workflowForm.type === 'analyze' && 'This workflow will analyze existing products for profitability and optimization.'}
                  {workflowForm.type === 'publish' && 'This workflow will automatically publish approved products to marketplaces.'}
                  {workflowForm.type === 'reprice' && 'This workflow will adjust product prices based on market conditions.'}
                  {workflowForm.type === 'custom' && 'Configure custom actions and conditions for this workflow.'}
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveWorkflow}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {selectedWorkflow ? 'Update Workflow' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Workflow Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto transition-colors">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">Workflow Execution Logs</h3>
              <button onClick={() => setShowLogsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No logs available
                        </td>
                      </tr>
                    )}
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-sm text-gray-900">{log.workflowName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLogStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {log.startedAt ? formatLastRun(log.startedAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDuration(log.duration)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {log.itemsProcessed}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {log.errors || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
