import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStatusStore } from '@stores/authStatusStore';
import { formatCurrencySimple } from '../utils/currency';
import { Download, Info, Package, Truck, Receipt } from 'lucide-react';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';
import PublishingDecisionBadge, { type PublishingDecisionResult, type PublishingDecision } from '@/components/PublishingDecisionBadge';

type Marketplace = 'ebay' | 'amazon' | 'mercadolibre';

type EnvironmentKey = 'sandbox' | 'production';

interface EnvStatus {
  isConfigured: boolean;
  isAvailable: boolean;
  message?: string;
  error?: string;
}

type MarketplaceEnvStatusMap = Record<EnvironmentKey, EnvStatus>;

const createEmptyEnvStatus = (): EnvStatus => ({
  isConfigured: false,
  isAvailable: false,
  message: undefined,
  error: undefined,
});

type CommercialFieldTruth = 'exact' | 'estimated' | 'unavailable';

interface CommercialTruthMeta {
  sourceCost: CommercialFieldTruth;
  suggestedPrice: CommercialFieldTruth;
  profitMargin: CommercialFieldTruth;
  roi: CommercialFieldTruth;
  competitionLevel: CommercialFieldTruth;
  competitionSources?: string[];
}

const COMPETITION_SOURCE_LABELS: Record<string, string> = {
  mercadolibre_public_catalog: 'Mercado Libre (catálogo público)',
  mercadolibre_authenticated_catalog: 'Mercado Libre (búsqueda con tu token)',
  ebay_browse_application_token: 'eBay Browse (token de aplicación)',
  ebay_browse_user_oauth: 'eBay Browse (tu OAuth)',
  amazon_catalog: 'Amazon (catálogo)',
};


/** Map Opportunities region selector → ISO country for import / AliExpress ship-to / ML site alignment. */
function regionToIsoCountry(region: string): string | undefined {
  const r = String(region || '').toLowerCase();
  const map: Record<string, string> = {
    cl: 'CL',
    us: 'US',
    mx: 'MX',
    uk: 'GB',
    de: 'DE',
    es: 'ES',
    fr: 'FR',
    it: 'IT',
    br: 'BR',
    ar: 'AR',
    co: 'CO',
    pe: 'PE',
  };
  return map[r];
}

function isFieldEstimated(
  truth: CommercialTruthMeta | undefined,
  field: 'suggestedPrice' | 'profitMargin' | 'roi',
  legacyEstimatedFields?: string[]
): boolean {
  if (truth) {
    if (field === 'suggestedPrice') return truth.suggestedPrice === 'estimated';
    if (field === 'profitMargin') return truth.profitMargin === 'estimated';
    return truth.roi === 'estimated';
  }
  if (field === 'suggestedPrice') return Boolean(legacyEstimatedFields?.includes('suggestedPriceUsd'));
  if (field === 'profitMargin') return Boolean(legacyEstimatedFields?.includes('profitMargin'));
  return Boolean(legacyEstimatedFields?.includes('roiPercentage'));
}

interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  imageUrl?: string;
  productUrl?: string;
  images?: string[];
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  targetCountry?: string;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number;
  roiPercentage: number;
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered?: Record<string, number>;
  generatedAt: string;
  estimatedFields?: string[];
  estimationNotes?: string[];
  commercialTruth?: CommercialTruthMeta;
  competitionDiagnostics?: Array<{
    marketplace: string;
    region: string;
    listingsFound: number;
    competitivePrice: number;
    dataSource?: string;
    probeCode?: string;
    probeDetail?: string;
  }>;
  publishingDecision?: PublishingDecisionResult;
}

const formatMoney = (value: number, currency: string) => {
  if (!Number.isFinite(value)) return '—';
  return formatCurrencySimple(value, currency);
};

const STORAGE_KEY = 'opportunities_last_query';

interface OpportunitiesPagination {
  page: number;
  pageSize: number;
  returned: number;
  mayHaveMore: boolean;
}

function getInitialPage(): number {
  try {
    const params = new URLSearchParams(window.location.search);
    const n = parseInt(params.get('page') || '1', 10);
    if (Number.isFinite(n) && n >= 1) return n;
  } catch {
    /* ignore */
  }
  return 1;
}

function getInitialMaxItems(): number {
  try {
    const params = new URLSearchParams(window.location.search);
    const n = parseInt(params.get('size') || '20', 10);
    if (n === 10 || n === 20) return n;
  } catch {
    /* ignore */
  }
  return 20;
}

function getInitialQuery(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('q') || params.get('query') || params.get('keyword');
  if (fromUrl?.trim()) return fromUrl.trim();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored?.trim()) return stored;
  } catch {
    /* ignore */
  }
  return '';
}

function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

const premiumCard = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card';

export default function Opportunities() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(getInitialQuery);
  const [region, setRegion] = useState('us');
  /** Results per page (AliExpress Affiliate caps at 20 per API request). */
  const [maxItems, setMaxItems] = useState(getInitialMaxItems);
  const [page, setPage] = useState(getInitialPage);
  const [paginationMeta, setPaginationMeta] = useState<OpportunitiesPagination | null>(null);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>(['ebay', 'amazon', 'mercadolibre']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OpportunityItem[]>([]);
  /** Tracks whether the user has run at least one explicit search in this session. */
  const [hasSearched, setHasSearched] = useState(false);
  const [publishing, setPublishing] = useState<Record<number, boolean>>({});
  const authStatuses = useAuthStatusStore((state) => state.statuses);
  const fetchAuthStatuses = useAuthStatusStore((state) => state.fetchStatuses);
  const requestAuthRefresh = useAuthStatusStore((state) => state.requestRefresh);
  const [envStatusLoaded, setEnvStatusLoaded] = useState(false);
  const [workflowEnvironment, setWorkflowEnvironment] = useState<EnvironmentKey | null>(null);
  const [marketplaceEnvStatus, setMarketplaceEnvStatus] = useState<Record<Marketplace, MarketplaceEnvStatusMap>>({
    ebay: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
    amazon: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
    mercadolibre: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
  });
  const [showAliExpressModal, setShowAliExpressModal] = useState(false);
  const [pendingSearchUrl, setPendingSearchUrl] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  /** Ref to the most recent successfully-executed query, used by pagination to avoid stale closure. */
  const lastExecutedQueryRef = useRef<string>('');
  type ComparableHealth = {
    mercadolibre: string;
    ebay: string;
    messages?: Partial<Record<'mercadolibre' | 'ebay', string>>;
    checkedAt?: string;
  };
  const [comparableHealth, setComparableHealth] = useState<ComparableHealth | null>(null);

  useEffect(() => {
    if (items.length >= 0) console.log('[UI] Opportunities rendered:', items.length);
  }, [items.length]);

  const marketplacesParam = useMemo(() => marketplaces.join(','), [marketplaces]);
  const hasEstimatedValues = useMemo(
    () =>
      items.some((it) => {
        const t = it.commercialTruth;
        if (t) {
          return (
            t.suggestedPrice === 'estimated' ||
            t.profitMargin === 'estimated' ||
            t.roi === 'estimated'
          );
        }
        return (it.estimatedFields?.length || 0) > 0;
      }),
    [items]
  );
  const aliStatus = authStatuses?.aliexpress;
  const manualLoginUrl = aliStatus?.manualSession?.token
    ? aliStatus.manualSession.loginUrl?.startsWith('http')
      ? aliStatus.manualSession.loginUrl
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${
          aliStatus.manualSession.loginUrl || `/manual-login/${aliStatus.manualSession.token}`
        }`
    : null;

  async function fetchOpportunitiesPage(
    pageNum: number,
    queryOverride?: string,
    opts?: { refresh?: boolean }
  ) {
    const effectiveQuery = (queryOverride ?? query).trim();
    if (!effectiveQuery) return;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    let requestCanceled = false;
    let timedOut = false;
    // Hard cap: if backend never responds, unblock the UI after 90s
    const searchTimeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);
    try {
      const params: Record<string, string | number> = {
        query: effectiveQuery,
        maxItems,
        page: pageNum,
        marketplaces: marketplacesParam,
        region,
      };
      if (opts?.refresh) params.refresh = 1;

      const response = await api.get('/api/opportunities', {
        params,
        signal: controller.signal,
      });

      const data = response.data;
      const status = response.status;

      if (status === 202 || data?.captchaRequired || data?.requiresManualAuth) {
        const resolveUrl = data?.resolveCaptchaUrl || (data?.token ? `/resolve-captcha/${data.token}` : null);
        if (resolveUrl) {
          const absoluteUrl = resolveUrl.startsWith('http') ? resolveUrl : `${window.location.origin}${resolveUrl}`;
          toast('AliExpress requiere que resuelvas un CAPTCHA para continuar. Redirigiendo...', { icon: 'ℹ️' });
          console.log('[OPPORTUNITIES] Redirigiendo a CAPTCHA:', absoluteUrl);
          window.location.href = absoluteUrl;
          setLoading(false);
          return;
        }
      }

      const nextItems =
        response?.data?.items ??
        response?.data?.data ??
        response?.data?.opportunities ??
        [];
      console.log('[FRONTEND] Opportunities received:', nextItems.length, 'page', pageNum);
      setItems(nextItems);
      setPage(pageNum);
      const p = response?.data?.pagination as OpportunitiesPagination | undefined;
      setPaginationMeta(
        p && typeof p.page === 'number'
          ? p
          : {
              page: pageNum,
              pageSize: maxItems,
              returned: nextItems.length,
              mayHaveMore: nextItems.length >= maxItems,
            }
      );
      lastExecutedQueryRef.current = effectiveQuery;
      try {
        localStorage.setItem(STORAGE_KEY, effectiveQuery);
      } catch {
        /* ignore */
      }
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set('q', effectiveQuery);
          n.set('page', String(pageNum));
          n.set('size', String(maxItems));
          return n;
        },
        { replace: true }
      );
      // Fire-and-forget: auth status is a background update; awaiting it can
      // block the finally{setLoading(false)} if /api/auth-status hangs.
      void fetchAuthStatuses();
    } catch (e: any) {
      if (axios.isCancel(e)) {
        if (timedOut) {
          // Timeout-initiated abort: surface a clear error and reset loading
          setError('La búsqueda tardó demasiado (>90s). Intentá de nuevo o reducí los filtros.');
          setItems([]);
          setPaginationMeta(null);
        } else {
          // User-initiated abort (new search started): leave state to the next request
          requestCanceled = true;
        }
        return;
      }
      if (e?.response?.status === 202) {
        const captchaData = e.response?.data || {};
        const resolveUrl = captchaData.resolveCaptchaUrl || (captchaData.token ? `/resolve-captcha/${captchaData.token}` : null);
        if (captchaData.captchaRequired && resolveUrl) {
          const absoluteUrl = resolveUrl.startsWith('http') ? resolveUrl : `${window.location.origin}${resolveUrl}`;
          toast('AliExpress requiere que resuelvas un CAPTCHA para continuar. Redirigiendo...', { icon: 'ℹ️' });
          console.log('[OPPORTUNITIES] Redirigiendo a CAPTCHA desde catch:', absoluteUrl);
          window.location.href = absoluteUrl;
          setLoading(false);
          return;
        }
      }
      
      if (e?.response?.status === 428) {
        const data = e.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        
        setPendingSearchUrl(targetUrl || null);
        setShowAliExpressModal(true);

        setError('Se requiere iniciar sesión en AliExpress para continuar.');
        void fetchAuthStatuses();
      } else {
        setError(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        const status = e?.response?.status;
        if (status !== 429 && status !== 403 && (status == null || status < 500)) {
          toast.error(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        }
        void fetchAuthStatuses();
      }
      setItems([]);
      setPaginationMeta(null);
    } finally {
      clearTimeout(searchTimeoutId);
      if (!requestCanceled) {
        setLoading(false);
      }
    }
  }

  /** New search from the form: always starts at page 1. */
  function runSearchFromForm() {
    setPage(1);
    void fetchOpportunitiesPage(1, undefined, { refresh: true });
  }

  const handleOpenAliExpressLogin = () => {
    if (pendingSearchUrl) {
      window.open(pendingSearchUrl, '_blank', 'noopener,noreferrer');
      setShowAliExpressModal(false);
      setPendingSearchUrl(null);
      toast.success('Ventana de login abierta. Completa el inicio de sesión y guarda la sesión.');
    }
  };

  const loadMarketplaceEnvStatus = useCallback(async () => {
    const createNormalizedState = (): Record<Marketplace, MarketplaceEnvStatusMap> => ({
      ebay: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
      amazon: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
      mercadolibre: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
    });

    try {
      const response = await api.get('/api/credentials/status').catch((err) => {
        console.warn('Error loading credentials status, using empty state:', err?.message || err);
        return {
          data: {
            success: true,
            data: {
              apis: [],
              summary: { total: 0, configured: 0, available: 0, missing: 0 },
              warnings: ['No se pudieron cargar todos los estados de credenciales. Algunos pueden no estar disponibles.']
            }
          }
        };
      });

      const statuses: any[] = response.data?.data?.apis || [];
      const normalized = createNormalizedState();

      statuses.forEach((entry) => {
        const apiName = entry?.apiName as Marketplace | undefined;
        if (!apiName || !normalized[apiName]) {
          return;
        }

        const environment: EnvironmentKey =
          entry?.environment === 'sandbox' ? 'sandbox' : 'production';

        normalized[apiName][environment] = {
          isConfigured: Boolean(entry?.isConfigured),
          isAvailable: Boolean(entry?.isAvailable),
          message: entry?.message || undefined,
          error: entry?.error || undefined,
        };
      });

      setMarketplaceEnvStatus(normalized);

      const caps = response.data?.data?.capabilities;
      const oc = caps?.opportunityComparables;
      if (oc && typeof oc.mercadolibre === 'string' && typeof oc.ebay === 'string') {
        setComparableHealth({
          mercadolibre: oc.mercadolibre,
          ebay: oc.ebay,
          messages: oc.messages,
          checkedAt: oc.checkedAt,
        });
      } else {
        setComparableHealth(null);
      }
      
      if (response.data?.data?.warnings && response.data.data.warnings.length > 0) {
        console.warn('Credential status warnings:', response.data.data.warnings);
      }
    } catch (error: any) {
      console.error('Error loading marketplace statuses:', error?.message || error);
      setMarketplaceEnvStatus(createNormalizedState());
    } finally {
      setEnvStatusLoaded(true);
    }
  }, []);

  const loadWorkflowEnvironment = useCallback(async () => {
    try {
      const response = await api.get('/api/workflow/environment');
      const env = response.data?.environment;
      if (env === 'sandbox' || env === 'production') {
        setWorkflowEnvironment(env);
      }
    } catch (error: any) {
      console.error('Error loading workflow environment:', error?.message || error);
    }
  }, []);

  useEffect(() => {
    fetchAuthStatuses();
    loadMarketplaceEnvStatus();
    loadWorkflowEnvironment();
    
    const urlParams = new URLSearchParams(window.location.search);
    const keywordParam = urlParams.get('keyword');
    const marketplacesParam = urlParams.get('marketplaces');
    const autoSearch = urlParams.get('autoSearch') === 'true';
    
    let autoSearchTimer: ReturnType<typeof setTimeout> | undefined;

    if (keywordParam) {
      setQuery(keywordParam);
      if (marketplacesParam) {
        const mpList = marketplacesParam.split(',').filter(mp =>
          ['ebay', 'amazon', 'mercadolibre'].includes(mp.toLowerCase())
        ) as Marketplace[];
        if (mpList.length > 0) {
          setMarketplaces(mpList);
        }
      }
      window.history.replaceState({}, '', window.location.pathname);

      if (autoSearch && keywordParam.trim()) {
        autoSearchTimer = setTimeout(() => {
          void fetchOpportunitiesPage(1, keywordParam.trim());
        }, 100);
      }
    }
    // NOTE: We intentionally do NOT auto-search on page load, even if there is
    // a pre-filled query from URL params or localStorage. The user must always
    // click "Buscar" explicitly to trigger a search (Bug #1 fix).
    return () => {
      if (autoSearchTimer !== undefined) clearTimeout(autoSearchTimer);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMarketplace(mp: Marketplace) {
    setMarketplaces(prev => prev.includes(mp) ? prev.filter(m => m !== mp) : [...prev, mp]);
  }

  const resolveEnvironmentForMarketplace = async (
    marketplace: Marketplace
  ): Promise<EnvironmentKey | null> => {
    if (!envStatusLoaded) {
      await loadMarketplaceEnvStatus();
    }

    const status = marketplaceEnvStatus[marketplace];
    if (!status) {
      toast.error(`No se pudo determinar el entorno para ${marketplace}`);
      return null;
    }

    const entries = Object.entries(status) as Array<[EnvironmentKey, EnvStatus]>;
    const available = entries.filter(([, info]) => info.isAvailable);
    const preferredEnv = workflowEnvironment && status[workflowEnvironment];

    if (preferredEnv?.isAvailable && workflowEnvironment) {
      return workflowEnvironment;
    }

    if (available.length === 0) {
      const details = entries
        .map(([env, info]) => {
          if (info.isConfigured) {
            return `${env}: ${info.error || info.message || 'Configura OAuth y vuelve a intentar.'}`;
          }
          return `${env}: Sin credenciales activas.`;
        })
        .join(' • ');

      toast.error(
        `No hay credenciales listas para ${marketplace}. ${details || ''}`.trim()
      );
      return null;
    }

    if (available.length === 1) {
      const selected = available[0][0];
      if (workflowEnvironment && workflowEnvironment !== selected) {
        toast(`Usaremos ${selected} para ${marketplace} porque ${workflowEnvironment} no está disponible.`, { icon: 'ℹ️' });
      }
      return selected;
    }

    if (workflowEnvironment && status[workflowEnvironment]?.isConfigured) {
      const preferred = status[workflowEnvironment];
      if (preferred?.isAvailable) {
        return workflowEnvironment;
      }
    }

    const defaultPromptValue = workflowEnvironment || 'production';
    const choice = window.prompt(
      `Selecciona el entorno para ${marketplace} (sandbox/production). Preferencia actual: ${defaultPromptValue}`,
      defaultPromptValue
    );
    if (!choice) {
      toast('Operación cancelada por el usuario.', { icon: 'ℹ️' });
      return null;
    }

    const normalizedChoice = choice.toLowerCase();
    if (normalizedChoice !== 'sandbox' && normalizedChoice !== 'production') {
      toast.error('Valor inválido. Debes escribir "sandbox" o "production".');
      return null;
    }

    const selectedInfo = status[normalizedChoice as EnvironmentKey];
    if (!selectedInfo?.isAvailable) {
      toast.error(
        `No hay credenciales disponibles en ${normalizedChoice} para ${marketplace}.`
      );
      return null;
    }

    return normalizedChoice as EnvironmentKey;
  };

  /** 409 duplicate import: show truthful UX (never "missing product id"). */
  function handleDuplicateProductResponse(data: Record<string, unknown> | undefined): boolean {
    const idRaw = data?.existingProductId ?? (data?.details as Record<string, unknown> | undefined)?.existingProductId;
    const id = idRaw != null ? Number(idRaw) : NaN;
    if (!Number.isFinite(id) || id <= 0) return false;
    const titleRaw = (data?.existingProductTitle ??
      (data?.details as Record<string, unknown> | undefined)?.existingProductTitle) as string | undefined;
    const title = (titleRaw || '').trim();
    const snippet = title.length > 72 ? `${title.slice(0, 72)}…` : title;
    const backendMsg = typeof data?.error === 'string' ? data.error : '';
    toast.error('Ya existe', {
      description: [
        `Producto #${id} en tu catálogo (misma URL de AliExpress).`,
        backendMsg || 'No se creó un duplicado.',
        snippet ? `Título: ${snippet}` : null,
        'Abrí el producto existente o andá a Productos.',
      ]
        .filter(Boolean)
        .join(' '),
      duration: 14_000,
      action: {
        label: 'Abrir producto existente',
        onClick: () => navigate(`/products/${id}/preview`),
      },
      cancel: {
        label: 'Ir a Productos',
        onClick: () => navigate('/products'),
      },
    });
    return true;
  }

  /** Parse create-product response for numeric id (handles string JSON and odd nesting). */
  function extractCreatedProductId(responseData: unknown): number | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const root = responseData as Record<string, unknown>;
    const inner = root.data;
    const blob =
      inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : root;
    const raw = blob.id ?? root.id;
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Duplicate/conflict from API body or message (proxies may alter HTTP status). */
  function tryHandleDuplicateImportError(
    data: Record<string, unknown> | undefined,
    errMsg: string
  ): boolean {
    if (data && handleDuplicateProductResponse(data)) return true;
    const detailsErr =
      data?.details && typeof data.details === 'object'
        ? (data.details as Record<string, unknown>).error
        : undefined;
    const text = [data?.error, data?.message, detailsErr, errMsg]
      .filter((x): x is string => typeof x === 'string')
      .join(' ');
    const m =
      text.match(/\bID\s*[:#]?\s*(\d{1,12})\b/i) ||
      text.match(/producto\s*#\s*(\d{1,12})/i) ||
      text.match(/\(ID\s*(\d{1,12})\s*[,)]/i);
    if (!m) return false;
    const id = parseInt(m[1], 10);
    if (!Number.isFinite(id) || id <= 0) return false;
    return handleDuplicateProductResponse({
      ...data,
      existingProductId: id,
      error: typeof data?.error === 'string' ? data.error : errMsg || text,
    });
  }

  async function importProduct(item: OpportunityItem) {
    const itemIndex = items.indexOf(item);

    try {
      setPublishing(prev => ({ ...prev, [itemIndex]: true }));

      const payload: Record<string, any> = {
        title: item.title,
        aliexpressUrl: item.aliexpressUrl,
        aliexpressPrice: item.costUsd,
        suggestedPrice: item.suggestedPriceUsd,
        currency: item.baseCurrency || 'USD',
        importSource: 'opportunity_search',
        aliExpressItemId: item.productId?.trim() || undefined,
        targetMarketplaces: Array.isArray(item.targetMarketplaces) ? item.targetMarketplaces : [],
        shippingCost: item.shippingCost || undefined,
        importTax: item.importTax || undefined,
        totalCost: item.totalCost || undefined,
        targetCountry: item.targetCountry || regionToIsoCountry(region),
        productData: {
          source: 'opportunities_page',
          opportunitySnapshot: {
            capturedAt: new Date().toISOString(),
            searchRegion: region,
            commercialTruth: item.commercialTruth ?? null,
            estimatedFields: item.estimatedFields ?? [],
            estimationNotes: item.estimationNotes ?? [],
            competitionDiagnostics: item.competitionDiagnostics ?? [],
            feesConsidered: item.feesConsidered ?? {},
            targetMarketplaces: item.targetMarketplaces ?? [],
          },
        },
      };

      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const validImages = item.images.filter(img => 
          img && typeof img === 'string' && /^https?:\/\//i.test(img.trim())
        );
        if (validImages.length > 0) {
          payload.imageUrl = validImages[0];
          payload.imageUrls = validImages;
        }
      } else if (item.image && /^https?:\/\//i.test(item.image)) {
        payload.imageUrl = item.image;
        payload.imageUrls = [item.image];
      }

      const productResponse = await api.post('/api/products', payload);

      const responseData = productResponse.data as Record<string, unknown> | undefined;
      if (responseData?.success === false && handleDuplicateProductResponse(responseData)) {
        return;
      }
      const productId = extractCreatedProductId(responseData);

      if (!productId) {
        if (tryHandleDuplicateImportError(responseData as Record<string, unknown>, '')) {
          return;
        }
        console.error('[Opportunities] importProduct: 2xx sin id parseable', responseData);
        throw new Error(
          'El servidor respondió sin ID de producto. Si acabás de importar el mismo artículo, puede ser duplicado: revisá Productos o intentá de nuevo.'
        );
      }

      toast.success('Producto importado correctamente. Ve a Products para revisarlo y publicarlo.');
      
      setTimeout(() => {
        navigate('/products');
      }, 1500);
    } catch (error: any) {
      console.error('Error importing product:', error);
      const status = error.response?.status as number | undefined;
      const data = error.response?.data as Record<string, unknown> | undefined;
      const errMsg = String(error.message || '');
      if (
        tryHandleDuplicateImportError(data, errMsg) ||
        (status === 409 && handleDuplicateProductResponse(data))
      ) {
        return;
      }
      const errorMessage =
        data?.error || data?.message || error.message || 'Error al importar producto';
      toast.error(String(errorMessage));
    } finally {
      setPublishing(prev => ({ ...prev, [itemIndex]: false }));
    }
  }

  async function createAndPublishProduct(item: OpportunityItem, targetMarketplace: Marketplace) {
    const itemIndex = items.indexOf(item);

    try {
      const environment = await resolveEnvironmentForMarketplace(targetMarketplace);
      if (!environment) {
        return;
      }

      setPublishing(prev => ({ ...prev, [itemIndex]: true }));

      const payload: Record<string, any> = {
        title: item.title,
        aliexpressUrl: item.aliexpressUrl,
        aliexpressPrice: item.costUsd,
        suggestedPrice: item.suggestedPriceUsd,
        currency: item.baseCurrency || 'USD',
        importSource: 'opportunity_search',
        aliExpressItemId: item.productId?.trim() || undefined,
        targetMarketplaces: Array.isArray(item.targetMarketplaces) ? item.targetMarketplaces : [],
        shippingCost: item.shippingCost || undefined,
        importTax: item.importTax || undefined,
        totalCost: item.totalCost || undefined,
        targetCountry: item.targetCountry || regionToIsoCountry(region),
        productData: {
          source: 'opportunities_page',
          opportunitySnapshot: {
            capturedAt: new Date().toISOString(),
            searchRegion: region,
            commercialTruth: item.commercialTruth ?? null,
            estimatedFields: item.estimatedFields ?? [],
            estimationNotes: item.estimationNotes ?? [],
            competitionDiagnostics: item.competitionDiagnostics ?? [],
            feesConsidered: item.feesConsidered ?? {},
            targetMarketplaces: item.targetMarketplaces ?? [],
          },
        },
      };

      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const validImages = item.images.filter(img => 
          img && typeof img === 'string' && /^https?:\/\//i.test(img.trim())
        );
        if (validImages.length > 0) {
          payload.imageUrl = validImages[0];
          payload.imageUrls = validImages;
        }
      } else if (item.image && /^https?:\/\//i.test(item.image)) {
        payload.imageUrl = item.image;
        payload.imageUrls = [item.image];
      }

      const productResponse = await api.post('/api/products', payload);

      const responseData = productResponse.data as Record<string, unknown> | undefined;
      if (responseData?.success === false && handleDuplicateProductResponse(responseData)) {
        return;
      }
      const productId = extractCreatedProductId(responseData);

      if (!productId) {
        if (tryHandleDuplicateImportError(responseData as Record<string, unknown>, '')) {
          return;
        }
        throw new Error(
          'El servidor respondió sin ID de producto. Si el artículo ya estaba importado, abrí Productos.'
        );
      }

      const publishResponse = await api.post('/api/marketplace/publish', {
        productId: Number(productId),
        marketplace: targetMarketplace,
        environment,
      });

      if (publishResponse.data?.success) {
        toast.success(`Publicado en ${targetMarketplace} (${environment}) exitosamente`);
        setTimeout(() => {
          navigate('/products');
        }, 1500);
      } else {
        throw new Error(publishResponse.data?.error || 'Error al publicar');
      }
    } catch (error: any) {
      console.error('Error creating/publishing product:', error);
      const status = error.response?.status as number | undefined;
      const data = error.response?.data as Record<string, unknown> | undefined;
      const errMsg = String(error.message || '');
      if (
        tryHandleDuplicateImportError(data, errMsg) ||
        (status === 409 && handleDuplicateProductResponse(data))
      ) {
        return;
      }
      const errorMessage =
        data?.error || data?.message || error.message || 'Error al crear o publicar producto';
      toast.error(String(errorMessage));
    } finally {
      setPublishing(prev => ({ ...prev, [itemIndex]: false }));
      loadMarketplaceEnvStatus().catch(() => {
        /* silent */
      });
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Oportunidades</h1>
        <p className="text-xs text-slate-500 mt-0.5">Busca oportunidades de negocio desde tendencias o términos libres</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Elegí <strong>20 por página</strong> y usá <strong>Siguiente</strong> para el siguiente lote (la URL guarda{' '}
          <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">?q=…&amp;page=…&amp;size=…</code>). Cada clic en <strong>Buscar</strong> pide datos
          frescos al servidor (<code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">refresh=1</code>).
        </p>
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={2} />
        </div>
      </div>

      {/* Search Form */}
      <div className={premiumCard + ' p-4'}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Búsqueda</label>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearchFromForm();
                }
              }}
              placeholder="ej: auriculares, luces solares…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Región</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition">
              <option value="us">US</option>
              <option value="cl">CL / Chile (Mercado Libre MLC)</option>
              <option value="uk">UK</option>
              <option value="mx">MX</option>
              <option value="de">DE</option>
              <option value="es">ES</option>
              <option value="br">BR</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Por página</label>
            <select
              value={maxItems}
              onChange={(e) => setMaxItems(Number(e.target.value))}
              title="Resultados por página (máx. 20 por limitación de AliExpress Affiliate API)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 transition"
            >
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={runSearchFromForm}
              disabled={loading}
              className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium shadow-sm transition"
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-5 text-sm">
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={marketplaces.includes('ebay')} onChange={() => toggleMarketplace('ebay')} className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/40" />
            <span className="text-xs">eBay</span>
          </label>
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={marketplaces.includes('amazon')} onChange={() => toggleMarketplace('amazon')} className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/40" />
            <span className="text-xs">Amazon</span>
          </label>
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={marketplaces.includes('mercadolibre')} onChange={() => toggleMarketplace('mercadolibre')} className="rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500/40" />
            <span className="text-xs">MercadoLibre</span>
          </label>
        </div>
      </div>

      {/* ML Chile notice: shown when region=cl and mercadolibre is selected */}
      {region === 'cl' && marketplaces.includes('mercadolibre') && (
        <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-sm space-y-1">
          <div className="font-semibold text-xs">Región: Chile (MLC) + Mercado Libre seleccionados</div>
          <p className="text-[11px] opacity-90">
            La búsqueda de productos AliExpress funcionará normalmente. Los <strong>precios de referencia comparables</strong> de Mercado Libre Chile pueden no estar disponibles desde el servidor (bloqueo de IP de Railway en GET /sites/MLC/search). Si los comparables fallan, los precios sugeridos se calcularán por estimación. Tu cuenta, OAuth y publicaciones <strong>no están afectadas</strong>.
          </p>
        </div>
      )}

      {/* Comparable Health Banner */}
      {comparableHealth &&
        (comparableHealth.mercadolibre === 'degraded' ||
          comparableHealth.mercadolibre === 'error' ||
          comparableHealth.ebay === 'degraded' ||
          comparableHealth.ebay === 'error') &&
        marketplaces.some((m) => m === 'mercadolibre' || m === 'ebay') && (
          <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm space-y-2">
            <div className="font-semibold text-xs">Precios de referencia (comparables) — degradados</div>
            {/* Explicit separation: connection OK vs comparables probe failing */}
            <div className="flex flex-wrap gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
                ✓ Conexión y OAuth activos
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                ⚠ Sondeo de comparables fallando
              </span>
            </div>
            <p className="text-[11px] opacity-90">
              Tu conexión a los marketplaces y la publicación <strong>no están afectadas</strong>. Este aviso aplica exclusivamente al sondeo de <em>precios de referencia</em> (listados comparables que el servidor consulta para estimar precios sugeridos).
            </p>
            <ul className="text-[11px] list-disc list-inside space-y-1">
              {(comparableHealth.mercadolibre === 'degraded' ||
                comparableHealth.mercadolibre === 'error') &&
                marketplaces.includes('mercadolibre') && (
                  <li>
                    <strong>Mercado Libre — catálogo de comparables:</strong>{' '}
                    {comparableHealth.messages?.mercadolibre
                      ? `${comparableHealth.messages.mercadolibre} (solo afecta precios de referencia, no tu cuenta ni publicaciones)`
                      : 'El catálogo público de ML no devolvió listados desde este backend. Puede ser temporal o por IP/región.'}
                  </li>
                )}
              {(comparableHealth.ebay === 'degraded' || comparableHealth.ebay === 'error') &&
                marketplaces.includes('ebay') && (
                  <li>
                    <strong>eBay Browse — comparables:</strong>{' '}
                    {comparableHealth.messages?.ebay ||
                      'Browse API no verificada para comparables desde este entorno.'}
                  </li>
                )}
            </ul>
            <p className="text-[10px] opacity-80">
              Impacto real: columnas con <strong>ESTIMADO</strong> usarán margen calculado sin precios de mercado reales.
              En <strong>API Settings</strong> verás el estado de tu OAuth/token (que está OK); esto es independiente.
            </p>
          </div>
        )}

      {/* AliExpress Refreshing Banner */}
      {aliStatus?.status === 'refreshing' && (
        <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm flex flex-col gap-1">
          <span>Estamos renovando tu sesión de AliExpress automáticamente. Puedes continuar; reintentaremos las búsquedas en unos segundos.</span>
          {aliStatus.message ? <span className="text-[11px] text-blue-600 dark:text-blue-400">{aliStatus.message}</span> : null}
        </div>
      )}

      {/* AliExpress Manual Required Banner */}
      {aliStatus?.status === 'manual_required' && aliStatus?.manualSession?.token && aliStatus?.requiresManual && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <span className="font-semibold text-xs">Necesitamos que confirmes tu sesión de AliExpress</span>
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Ya abrimos una ventana con instrucciones. Si no la ves, usa los botones para abrirla nuevamente o reintentar el inicio automático.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                try {
                  await requestAuthRefresh('aliexpress');
                } catch {
                  /* handled in store */
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
            >
              Reintentar automático
            </button>
            {manualLoginUrl ? (
              <a
                href={manualLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/40 transition"
              >
                Abrir login manual
              </a>
            ) : null}
          </div>
        </div>
      )}

      {/* AliExpress Error Banner */}
      {aliStatus?.status === 'error' && (
        <div className="px-4 py-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200 text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-xs">
            No pudimos renovar la sesión automáticamente. Puedes reintentar ahora; si persiste, el sistema te pedirá confirmar sesión manualmente.
          </span>
          <button
            onClick={async () => {
              try {
                await requestAuthRefresh('aliexpress');
              } catch {
                /* handled in store */
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/40 transition"
          >
            Reintentar ahora
          </button>
        </div>
      )}

      {/* AliExpress Login Modal */}
      {showAliExpressModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={premiumCard + ' max-w-md w-full p-6 space-y-4 shadow-xl'}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Inicio de sesión requerido en AliExpress</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Para buscar oportunidades en AliExpress, necesitamos que inicies sesión en tu cuenta de AliExpress.
            </p>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 space-y-2">
              <p className="font-semibold text-xs text-blue-900 dark:text-blue-200">Pasos a seguir:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-800 dark:text-blue-300">
                <li>Se abrirá una ventana nueva con instrucciones</li>
                <li>Inicia sesión en AliExpress en esa ventana</li>
                <li>Guarda tu sesión siguiendo las instrucciones</li>
                <li>Vuelve aquí y vuelve a intentar la búsqueda</li>
              </ol>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenAliExpressLogin}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition"
              >
                Abrir ventana de login
              </button>
              <button
                onClick={() => {
                  setShowAliExpressModal(false);
                  setPendingSearchUrl(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}

      {/* Pagination Bar */}
      {(items.length > 0 || paginationMeta != null) && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-2.5 text-sm">
          <span className="text-xs text-slate-500">
            Página <span className="font-semibold text-slate-900 dark:text-slate-100">{paginationMeta?.page ?? page}</span>
            {' · '}
            {paginationMeta?.returned ?? items.length} resultado(s) en esta vista
            {' · '}
            {maxItems} por página
            {paginationMeta?.mayHaveMore ? (
              <span className="text-amber-600 dark:text-amber-400 ml-1">— podés ir a la siguiente página</span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => void fetchOpportunitiesPage(page - 1, lastExecutedQueryRef.current || undefined)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={
                loading ||
                (paginationMeta != null
                  ? !paginationMeta.mayHaveMore
                  : items.length < maxItems)
              }
              onClick={() => void fetchOpportunitiesPage(page + 1, lastExecutedQueryRef.current || undefined)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {loading ? (
          <TableSkeleton rows={5} columns={9} />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Imagen</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Título</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    Costo
                    <span title="Incluye: producto + envío + impuestos (si disponible)">
                      <Info className="w-3 h-3 text-slate-400 cursor-help" />
                    </span>
                  </span>
                </th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Precio sug.</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Margen %</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">ROI %</th>
                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Competencia</th>
                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marketplaces</th>
                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it, idx) => (
              <tr
                key={String(it.productId || it.aliexpressUrl || `row-${paginationMeta?.page ?? page}-${idx}`)}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td className="px-3 py-3 text-center">
                  {(it.image || it.imageUrl) ? (
                    <a
                      href={it.aliexpressUrl || it.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir en AliExpress"
                    >
                      <img
                        src={it.image || it.imageUrl}
                        alt={it.title}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-90 transition"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64x64?text=No+Image';
                        }}
                      />
                    </a>
                  ) : (
                    <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                      Sin img
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-900 dark:text-slate-100">
                  <a
                    href={it.aliexpressUrl || it.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium line-clamp-2 max-w-xs text-primary-600 hover:underline text-sm"
                    title="Abrir producto en AliExpress"
                  >
                    {it.title}
                  </a>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Confianza: {(Number(it.confidenceScore ?? 0) * 100).toFixed(2)}% |
                    ID: {it.productId || 'N/A'}
                  </div>
                  {it.feesConsidered && Object.keys(it.feesConsidered).length > 0 && (
                    <div className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 cursor-help" title={Object.entries(it.feesConsidered).map(([k, v]) => `${k}: $${Number(v ?? 0).toFixed(2)}`).join(', ')}>
                      Comisiones: ${Number(Object.values(it.feesConsidered).reduce((a, b) => a + (Number(b ?? 0)), 0)).toFixed(2)}
                    </div>
                  )}
                  {Array.isArray(it.commercialTruth?.competitionSources) &&
                  it.commercialTruth!.competitionSources.length > 0 ? (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                      Comparables:{' '}
                      {it.commercialTruth!.competitionSources
                        .map((s) => COMPETITION_SOURCE_LABELS[s] || s)
                        .join(' · ')}
                    </div>
                  ) : null}
                  {Array.isArray(it.estimationNotes) && it.estimationNotes.length > 0 ? (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 space-y-0.5">
                      {it.estimationNotes.map((note, noteIdx) => (
                        <div key={noteIdx}>* {typeof note === 'string' ? note : String(note)}</div>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right text-sm">
                  <div className="flex flex-col items-end gap-1">
                    {it.totalCost && it.totalCost > it.costUsd ? (
                      <>
                        <div className="flex items-center gap-1 group relative">
                          <span className="font-semibold tabular-nums">{formatMoney(it.totalCost, it.baseCurrency)}</span>
                          <Info className="w-3 h-3 text-slate-400 cursor-help" />
                          <div className="absolute right-0 top-full mt-1 w-64 p-2.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            <div className="font-semibold mb-1.5">Desglose de costos:</div>
                            <div className="space-y-0.5">
                              <div className="flex justify-between">
                                <span>Producto:</span>
                                <span>{formatMoney(it.costUsd, it.baseCurrency)}</span>
                              </div>
                              {it.shippingCost && it.shippingCost > 0 && (
                                <div className="flex justify-between">
                                  <span>Envío:</span>
                                  <span>{formatMoney(it.shippingCost, it.baseCurrency)}</span>
                                </div>
                              )}
                              {it.importTax && it.importTax > 0 && (
                                <div className="flex justify-between">
                                  <span>Impuestos:</span>
                                  <span>{formatMoney(it.importTax, it.baseCurrency)}</span>
                                </div>
                              )}
                              <div className="border-t border-slate-700 mt-1 pt-1 flex justify-between font-semibold">
                                <span>Total:</span>
                                <span>{formatMoney(it.totalCost, it.baseCurrency)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Base: {formatMoney(it.costUsd, it.baseCurrency)}
                        </div>
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums">{formatMoney(it.costUsd, it.baseCurrency)}</span>
                    )}
                    {it.costCurrency && it.costCurrency !== it.baseCurrency ? (
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        ({formatMoney(it.costAmount, it.costCurrency)})
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatMoney(it.suggestedPriceUsd, it.baseCurrency)}
                      </span>
                      {it.suggestedPriceCurrency && it.suggestedPriceCurrency !== it.baseCurrency ? (
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          ({formatMoney(it.suggestedPriceAmount, it.suggestedPriceCurrency)})
                        </span>
                      ) : null}
                    </div>
                    {isFieldEstimated(it.commercialTruth, 'suggestedPrice', it.estimatedFields) && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 uppercase text-[9px] font-semibold">
                        Estimado
                      </span>
                    )}
                    {it.commercialTruth?.suggestedPrice === 'exact' && (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 uppercase text-[9px] font-semibold"
                        title="Precio sugerido basado en listados comparables reales del marketplace"
                      >
                        Real
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`font-semibold tabular-nums ${
                        it.profitMargin >= 0.3
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : it.profitMargin >= 0.1
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {(Number(it.profitMargin ?? 0) * 100).toFixed(2)}%
                    </span>
                    {it.totalCost && it.totalCost > it.costUsd && (
                      <span title="Margen calculado con costo total (producto + envío + impuestos)">
                        <Info className="w-3 h-3 text-slate-400 cursor-help" />
                      </span>
                    )}
                    {isFieldEstimated(it.commercialTruth, 'profitMargin', it.estimatedFields) && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 uppercase text-[9px] font-semibold">
                        Estimado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`font-semibold tabular-nums ${
                        it.roiPercentage >= 50
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : it.roiPercentage >= 30
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {Number(it.roiPercentage ?? 0).toFixed(2)}%
                    </span>
                    {isFieldEstimated(it.commercialTruth, 'roi', it.estimatedFields) && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 uppercase text-[9px] font-semibold">
                        Estimado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    it.competitionLevel === 'low' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' :
                    it.competitionLevel === 'medium' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' :
                    it.competitionLevel === 'high' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {it.competitionLevel === 'low' ? 'Baja' : it.competitionLevel === 'medium' ? 'Media' : it.competitionLevel === 'high' ? 'Alta' : 'N/A'}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {it.targetMarketplaces?.map((mp, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-md text-[10px] font-medium">
                        {mp}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex flex-col gap-2 items-center">
                    {it.publishingDecision && (
                      <PublishingDecisionBadge result={it.publishingDecision} />
                    )}
                    <button
                      type="button"
                      onClick={() => importProduct(it)}
                      disabled={publishing[idx]}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-sm transition-colors"
                      title="Importar producto (se guardará en Productos para revisión)"
                    >
                      {publishing[idx] ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Importando…
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          Importar
                        </>
                      )}
                    </button>
                    {it.publishingDecision && !it.publishingDecision.canPublish && Array.isArray(it.publishingDecision.reasons) && it.publishingDecision.reasons.length > 0 && (
                      <p className="text-[10px] text-slate-400 max-w-[140px] text-center leading-tight">
                        {typeof it.publishingDecision.reasons[0] === 'string' ? it.publishingDecision.reasons[0] : null}
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
              {items.length === 0 && (
                <tr>
                  <td className="p-10 text-center" colSpan={9}>
                    <div className="max-w-sm mx-auto">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Package className="w-6 h-6 text-slate-400" />
                      </div>
                      {hasSearched ? (
                        <>
                          <p className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-1">Sin resultados</p>
                          <p className="text-xs text-slate-500 mb-2">La búsqueda no encontró productos candidatos. Prueba con otro término, reduce filtros o cambia de región.</p>
                          <p className="text-[11px] text-slate-400">Verifica que tengas la API de búsqueda configurada (AliExpress Affiliate, ScraperAPI o ZenRows) en Configuración.</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-1">Listo para buscar</p>
                          <p className="text-xs text-slate-500 mb-2">Escribe un término de búsqueda (ej: "auriculares", "luces LED") y haz clic en <strong>Buscar</strong>.</p>
                          <p className="text-[11px] text-slate-400">Puedes filtrar por región y marketplace antes de buscar.</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Estimated Values Footnote */}
      {hasEstimatedValues && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px] px-4 py-3 space-y-1.5">
          <p>
            <strong>Nota:</strong> Las filas con <span className="uppercase font-semibold">Estimado</span> no obtuvieron precios comparables reales (eBay Browse, catálogo público Mercado Libre o Amazon) para ese título y región.
          </p>
          <p>
            El servidor añade en <strong>notas de estimación</strong> códigos por marketplace cuando puede diagnosticar el motivo (por ejemplo{' '}
            <code className="text-[10px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">EBAY_BROWSE_NOT_CONFIGURED</code>,{' '}
            <code className="text-[10px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">ML_PUBLIC_CATALOG_ZERO_RESULTS</code>,{' '}
            <code className="text-[10px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">AMAZON_CREDENTIALS_MISSING</code>). Para Chile/canary ML, elegí región <strong>CL</strong> y términos de búsqueda más cortos si ML no devuelve listados.
          </p>
          <p className="opacity-90">
            Tras corregir credenciales o región, reintentá la búsqueda (refresh); puede haber caché breve en el servidor.
          </p>
        </div>
      )}
    </div>
  );
}
