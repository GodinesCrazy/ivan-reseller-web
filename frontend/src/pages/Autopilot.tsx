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
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { formatLastRun } from '@/utils/date';
import { useAuthStore } from '@stores/authStore';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthResponse } from '@/types/operations';
import OperationsTruthSummaryPanel from '@/components/OperationsTruthSummaryPanel';
import PostSaleProofLadderPanel from '@/components/PostSaleProofLadderPanel';
import AgentDecisionTracePanel from '@/components/AgentDecisionTracePanel';

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
  workflowScheduler?: {
    initialized: boolean;
    scheduledCount: number;
    eligibleWorkflowsForUser: number;
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

interface WorkflowActions {
  marketplaces?: string[];
  query?: string;
  [key: string]: unknown;
}

interface WorkflowFormState {
  name: string;
  description: string;
  type: 'search' | 'analyze' | 'publish' | 'reprice' | 'custom';
  enabled: boolean;
  schedule: string;
  conditions: Record<string, unknown>;
  actions: WorkflowActions;
}

export default function Autopilot() {
  const { environment } = useEnvironment();
  const userRole = useAuthStore((s) => s.user?.role?.toUpperCase() || '');
  const isAdmin = userRole === 'ADMIN';
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatusResponse | null>(null);
  const [autopilotMetrics, setAutopilotMetrics] = useState<AutopilotMetrics | null>(null);
  const [inventoryListings, setInventoryListings] = useState<InventorySummaryListings | null>(null);
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);

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
  const [reloadingScheduler, setReloadingScheduler] = useState(false);

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
  const [workflowForm, setWorkflowForm] = useState<WorkflowFormState>({
    name: '',
    description: '',
    type: 'search',
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
    const cronPattern = /^[\d*/\-,\s]+$/;
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
    let cancelled = false;
    fetchOperationsTruth({ limit: 24, environment })
      .then((data) => {
        if (!cancelled) setOperationsTruth(data);
      })
      .catch(() => {
        if (!cancelled) setOperationsTruth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

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
        workflowScheduler: data.workflowScheduler,
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

  const reloadWorkflowScheduler = async () => {
    setReloadingScheduler(true);
    try {
      await api.post('/api/autopilot/workflows/reload-scheduler');
      toast.success('Programador de workflows recargado');
      await checkAutopilotStatus();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Error';
      toast.error(typeof msg === 'string' ? msg : 'No se pudo recargar el programador');
    } finally {
      setReloadingScheduler(false);
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
      case 'custom': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getLogStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'running': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
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
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-lg w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Autopilot</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Runtime del programador (ciclos buscar/publicar). La verdad de listings, blockers y pruebas vive en{' '}
            <Link to="/control-center" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Control Center
            </Link>
            — no sustituye el contrato canónico.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Contadores y fases aquí son telemetría de ejecución, no estado comercial probado.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadLogs()}
              className="inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <Activity className="w-4 h-4" />
              Ver todos los logs
            </button>
            <button
              onClick={toggleAutopilot}
              className={`inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg shadow-sm transition-colors ${
                autopilotRunning 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {autopilotRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {autopilotRunning ? 'Detener Autopilot' : 'Iniciar Autopilot'}
            </button>
            <button
              onClick={() => openWorkflowModal()}
              className="inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Workflow
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

      {operationsTruth && (
        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Verdad operativa canónica (muestra reciente)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Blockers, listing externo y pruebas — prioridad sobre narrativa de fases del Autopilot.
              </p>
            </div>
            <Link
              to="/control-center"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Abrir Control Center →
            </Link>
          </div>
          <OperationsTruthSummaryPanel data={operationsTruth} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <PostSaleProofLadderPanel
              summary={operationsTruth.summary.proofCounts}
              title="Proof ladder (subset)"
              subtitle="No confundir publicaciones u oportunidades con fondos liberados o beneficio realizado."
            />
            <AgentDecisionTracePanel items={operationsTruth.items} />
          </div>
        </div>
      )}

      {/* Estado del ciclo — telemetría de ejecución (1-4); post-venta probada arriba / en órdenes */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
        <div className={`px-4 py-3 font-semibold text-[11px] uppercase tracking-wider ${
          autopilotRunning ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
        }`}>
          Estado del ciclo
        </div>
        <div className={`border-t p-4 flex items-start gap-4 transition-colors ${
          autopilotRunning ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'border-slate-200 dark:border-slate-800'
        }`}>
          <div className={`p-3 rounded-xl shrink-0 ${autopilotRunning ? 'bg-green-100 dark:bg-green-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {autopilotRunning ? (
              <Activity className="w-8 h-8 text-green-600 dark:text-green-400 animate-pulse" />
            ) : (
              <Pause className="w-8 h-8 text-slate-500 dark:text-slate-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                {autopilotRunning ? 'En ejecución' : 'Detenido'}
              </div>
              {autopilotRunning && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ciclo del Autopilot (buscar → publicar)</p>
              )}
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 space-y-1">
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
                      else if (phase === 'analyzing') detail = 'Analizando rentabilidad y ROI (estimaciones internas del ciclo, no proof comercial)…';
                      else if (phase === 'publishing') {
                        const curr = prog?.publishingCurrent;
                        const tot = prog?.publishingTotal;
                        detail = (curr != null && tot != null && tot > 0) ? `Publicando… producto ${curr} de ${tot}` : 'Publicando en marketplace(s)…';
                      } else if (phase === 'idle') detail = 'Siguiente ciclo según intervalo configurado.';
                      else detail = 'buscar → filtrar → analizar → publicar.';
                      return (
                        <>
                          <div className="font-medium text-base text-slate-900 dark:text-slate-100">
                            Ahora: Fase {phaseInfo.num || '—'} — {phaseInfo.name}
                          </div>
                          {detail && <span className="text-sm">{detail}</span>}
                        </>
                      );
                    })()}
                    {(() => {
                      const mins = getMinutesAgo(autopilotStatus?.cycleStartedAt);
                      return mins != null ? (
                        <span className="block text-xs text-slate-500">
                          Ciclo iniciado hace {mins} min
                        </span>
                      ) : null;
                    })()}
                    {autopilotStatus?.config?.targetMarketplaces && autopilotStatus.config.targetMarketplaces.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {autopilotStatus.config.targetMarketplaces.map((mp) => (
                          <span key={mp} className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
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
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
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
                    <div className="h-2.5 w-full rounded overflow-hidden bg-slate-200 dark:bg-slate-800">
                      {autopilotRunning && currentPhase === 'idle' && (
                        <div
                          className="h-full w-full animate-pulse bg-slate-300 dark:bg-slate-600 rounded"
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
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
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
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Ventas y envíos en proceso</div>
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
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                  >
                    {showPhaseSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showPhaseSummary ? 'Ocultar' : 'Ver'} descripción de fases
                  </button>
                  {showPhaseSummary && (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-900/80">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Fase</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Nombre</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Descripción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
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
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-200 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200" title="Query de búsqueda">
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
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Resumen del último ciclo</div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
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

      {/* Dashboard analytics — estimates / aggregates; not canonical proof */}
      {autopilotMetrics && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Métricas de panel (ventas/proyecciones): referencia analítica; el margen mostrado no es ganancia realizada salvo proof en órdenes y finance.
          </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">Listados activos</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{autopilotMetrics.activeListings}</div>
                {inventoryListings?.listingsByMarketplace && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    eBay: {inventoryListings.listingsByMarketplace.ebay ?? 0} · ML: {inventoryListings.listingsByMarketplace.mercadolibre ?? 0} · Amazon: {inventoryListings.listingsByMarketplace.amazon ?? 0}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <BarChart3 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Ventas diarias</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{autopilotMetrics.dailySales}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Productos “winning” (score heurístico)</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{autopilotMetrics.winningProductsCount}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Margen proyectado hoy (estim.)</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  ${autopilotMetrics.profitToday.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                <DollarSign className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Margen proyectado mes (estim.)</div>
                <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  ${autopilotMetrics.profitMonth.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Top winning products list */}
      {autopilotMetrics?.topWinningProducts && autopilotMetrics.topWinningProducts.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Top productos por score heurístico (WinningScore &gt; 75, no es proof comercial)</h3>
          <ul className="space-y-2">
            {autopilotMetrics.topWinningProducts.map((p) => (
              <li key={p.productId} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[70%]" title={p.productTitle}>
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
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Marketplaces de publicación</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
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
                    Conecta {displayName} en Configuración &gt; APIs
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Autopilot Settings (extended config) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSettingsPanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configuración de Autopilot</span>
          </div>
          {showSettingsPanel ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {showSettingsPanel && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Máx. listados activos</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={settingsForm.maxActiveProducts || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxActiveProducts: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0 = sin límite"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ganancia mín. (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={settingsForm.minProfitUsd}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minProfitUsd: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min ROI (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settingsForm.minRoiPct}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minRoiPct: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Precio mín. proveedor (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settingsForm.minSupplierPrice || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, minSupplierPrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0 = sin mínimo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Precio máx. proveedor (USD)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settingsForm.maxSupplierPrice || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxSupplierPrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0 = sin máximo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Máx. duplicados por producto</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={settingsForm.maxDuplicatesPerProduct || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, maxDuplicatesPerProduct: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0 = desactivado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Intervalo de repricing (horas)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settingsForm.repricingIntervalHours}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, repricingIntervalHours: parseInt(e.target.value, 10) || 6 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Eliminar listados después de (días)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={settingsForm.deleteListingsAfterDays || ''}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, deleteListingsAfterDays: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0 = desactivado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">País destino</label>
                <input
                  type="text"
                  maxLength={10}
                  value={settingsForm.targetCountry}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, targetCountry: e.target.value.trim() || 'US' }))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                <label htmlFor="autoRepeatWinners" className="text-sm font-medium text-slate-700 dark:text-slate-300">Repetir automáticamente productos ganadores</label>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={applyTestListingPreset}
                disabled={savingSettings}
                className="inline-flex items-center justify-center h-9 px-3.5 text-sm font-medium rounded-lg border border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50 transition-colors"
              >
                Usar valores para 1 artículo de prueba (más económico)
              </button>
              <button
                type="button"
                onClick={saveAutopilotSettings}
                disabled={savingSettings}
                className="inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm disabled:opacity-50 transition-colors"
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
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4" title="Ciclo de dropshipping activo cuando el Autopilot está en ejecución">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Ciclo activo</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {autopilotRunning ? 1 : 0}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4" title="Número de ciclos del Autopilot ejecutados.">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Ciclos completados</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {stats?.totalRuns || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">Grado de éxito</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {stats?.successRate?.toFixed(1) || 0}%
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Media de publicaciones/aprobaciones por ciclo</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Target className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Items procesados</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {stats?.itemsProcessed || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflows Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
        <div className="bg-slate-50/80 dark:bg-slate-900/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Workflows ({displayWorkflows.length})
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            <strong>Start Autopilot (arriba)</strong> ejecuta el <strong>ciclo completo</strong> cada unos minutos: buscar oportunidades → filtrar → analizar → publicar. La fila <strong>Ciclo principal Autopilot</strong> en esta tabla es un workflow programado (cron) que solo ejecuta la fase de <strong>publicar</strong> productos ya aprobados; no sustituye al ciclo completo. Para automatismo de punta a punta, mantén Start Autopilot encendido.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Los workflows tipo &quot;search&quot; solo buscan oportunidades. El resumen de métricas de la tarjeta superior corresponde al Smart Autopilot (Start/Stop arriba).
          </p>
          {autopilotStatus?.workflowScheduler && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${
                !autopilotStatus.workflowScheduler.initialized ||
                (autopilotStatus.workflowScheduler.eligibleWorkflowsForUser > 0 &&
                  autopilotStatus.workflowScheduler.scheduledCount === 0)
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  {!autopilotStatus.workflowScheduler.initialized && (
                    <p>
                      <strong>Programador de workflows:</strong> no inicializado (p. ej. la base de datos no estaba lista al arrancar). Los cron de la tabla no se ejecutarán hasta recargar el programador o reiniciar el servidor.
                    </p>
                  )}
                  {autopilotStatus.workflowScheduler.initialized && autopilotStatus.workflowScheduler.scheduledCount > 0 && (
                    <p>
                      <strong>Programador activo:</strong> {autopilotStatus.workflowScheduler.scheduledCount} workflow(s) con cron cargado(s) en el servidor.
                    </p>
                  )}
                  {autopilotStatus.workflowScheduler.initialized && autopilotStatus.workflowScheduler.scheduledCount === 0 && (
                    <p>
                      <strong>Programador activo</strong> pero sin tareas cron en memoria. Si no tienes workflows con horario, es normal. Si sí los tienes y Next Run no se actualiza, prueba recargar (admin).
                    </p>
                  )}
                  {autopilotStatus.workflowScheduler.initialized &&
                    autopilotStatus.workflowScheduler.eligibleWorkflowsForUser > 0 &&
                    autopilotStatus.workflowScheduler.scheduledCount === 0 && (
                      <p className="font-medium">
                        Tienes {autopilotStatus.workflowScheduler.eligibleWorkflowsForUser} workflow(s) con horario, pero el servidor no tiene ninguno en el programador. Pulsa &quot;Recargar programador&quot; (admin) o reinicia el backend.
                      </p>
                    )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void reloadWorkflowScheduler()}
                    disabled={reloadingScheduler}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reloadingScheduler ? 'animate-spin' : ''}`} />
                    Recargar programador
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50/80 dark:bg-slate-900/80">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nombre</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Programación</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Última ejecución</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Próxima ejecución</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ejecuciones</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="inline-flex items-center gap-1" title="Media de publicaciones y aprobaciones por ciclo (no % de ciclos exitosos).">
                    Tasa de éxito
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                  </span>
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {displayWorkflows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
                      <p className="text-sm">No hay workflows configurados.</p>
                      <p className="text-xs">Crea uno para automatizar búsqueda, análisis o publicación.</p>
                      <button
                        type="button"
                        onClick={() => openWorkflowModal()}
                        className="inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm transition-colors"
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
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isMainCycle ? 'border-l-4 border-primary-500 bg-slate-50/50 dark:bg-slate-900/50' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{workflow.name}</span>
                      {isMainCycle && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                          Principal
                        </span>
                      )}
                    </div>
                    {workflow.description && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">{workflow.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadgeColor(workflow.type)}`}>
                      {workflow.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm text-slate-900 dark:text-slate-100">
                      <Clock className="w-3 h-3" />
                      {schedules.find(s => s.value === workflow.schedule)?.label || workflow.schedule}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {workflow.lastRun ? formatLastRun(workflow.lastRun) : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {workflow.nextRun ? formatLastRun(workflow.nextRun) : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                    {workflow.runCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
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
                      <span className="px-2 py-0.5 inline-flex text-[11px] font-medium rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Activo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 inline-flex text-[11px] font-medium rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => isMainCycle ? runMainCycle() : runWorkflow(workflow.id)}
                        className="text-green-600 hover:text-green-900"
                        title={isMainCycle ? 'Ejecutar ciclo ahora' : 'Ejecutar ahora'}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => (isMainCycle ? loadLogs() : loadLogs(workflow.id))}
                        className="text-purple-600 hover:text-purple-800 dark:hover:text-purple-400"
                        title="Ver logs"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      {!isMainCycle && (
                        <>
                          <button
                            onClick={() => openWorkflowModal(workflow)}
                            className="text-blue-600 hover:text-blue-800 dark:hover:text-blue-400"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => duplicateWorkflow(workflow)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            title="Duplicar"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleWorkflow(workflow.id, workflow.enabled)}
                            className="text-yellow-600 hover:text-yellow-800 dark:hover:text-yellow-400"
                            title={workflow.enabled ? 'Desactivar' : 'Activar'}
                          >
                            {workflow.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteWorkflow(workflow.id)}
                            className="text-red-600 hover:text-red-800 dark:hover:text-red-400"
                            title="Eliminar"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selectedWorkflow ? 'Editar Workflow' : 'Crear Nuevo Workflow'}
              </h3>
              <button onClick={() => setShowWorkflowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nombre del Workflow *</label>
                <input
                  type="text"
                  value={workflowForm.name}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Ej. Buscar productos de alto margen"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Descripción</label>
                <textarea
                  value={workflowForm.description}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  rows={2}
                  placeholder="Descripción opcional..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de Workflow</label>
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="search">Buscar oportunidades</option>
                    <option value="analyze">Analizar productos</option>
                    <option value="publish">Publicar productos</option>
                    <option value="reprice">Repricing de productos</option>
                    <option value="custom">Workflow personalizado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Programación</label>
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                          cronError ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                      {cronError && (
                        <p className="mt-1 text-sm text-red-600">{cronError}</p>
                      )}
                      {!cronError && workflowForm.schedule !== 'manual' && workflowForm.schedule !== '' && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Marketplaces</label>
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
                                ? current.filter((m: string) => m !== mp)
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Workflow Habilitado</span>
                </label>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Configuración del Workflow:</div>
                <div className="text-sm text-blue-800 dark:text-blue-300">
                  {workflowForm.type === 'search' && 'Este workflow buscará productos rentables según los criterios configurados.'}
                  {workflowForm.type === 'analyze' && 'Este workflow analizará productos existentes para rentabilidad y optimización.'}
                  {workflowForm.type === 'publish' && 'Este workflow publicará automáticamente productos aprobados en marketplaces.'}
                  {workflowForm.type === 'reprice' && 'Este workflow ajustará precios de productos según condiciones de mercado.'}
                  {workflowForm.type === 'custom' && 'Configura acciones y condiciones personalizadas para este workflow.'}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="inline-flex items-center justify-center h-9 px-3.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveWorkflow}
                className="inline-flex items-center justify-center gap-2 h-9 px-3.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                {selectedWorkflow ? 'Actualizar Workflow' : 'Crear Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Workflow Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historial de Ejecuciones</h3>
              <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workflow</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Inicio</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Duración</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Items</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                          Sin registros disponibles
                        </td>
                      </tr>
                    )}
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{log.workflowName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLogStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                          {log.startedAt ? formatLastRun(log.startedAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                          {formatDuration(log.duration)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                          {log.itemsProcessed}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
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
