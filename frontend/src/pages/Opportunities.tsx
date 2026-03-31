import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStatusStore } from '@stores/authStatusStore';
import { formatCurrencySimple } from '../utils/currency';
import { Download, Info, Package, Truck, Receipt } from 'lucide-react';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';

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
  images?: string[]; // ✅ MEJORADO: Array de todas las imágenes disponibles
  costUsd: number; // Costo base del producto
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  // ✅ MEJORADO: Costos adicionales para cálculo preciso
  shippingCost?: number; // Costo de envío internacional
  importTax?: number; // Impuestos de importación (IVA/aranceles)
  totalCost?: number; // Costo total (producto + envío + impuestos)
  targetCountry?: string; // País destino para cálculo de impuestos
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number; // 0-1 (basado en totalCost si está disponible)
  roiPercentage: number; // 0-100 (basado en totalCost si está disponible)
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
}

// ✅ Usar utilidad centralizada de formateo de moneda
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

// Componente de skeleton para tabla
function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="h-12 bg-gray-200 rounded animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

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
    // Cancel any in-flight search so its response cannot overwrite this one
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    let requestCanceled = false;
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

      // ✅ Manejar respuesta de CAPTCHA requerido (código 202 o en data)
      if (status === 202 || data?.captchaRequired || data?.requiresManualAuth) {
        const resolveUrl = data?.resolveCaptchaUrl || (data?.token ? `/resolve-captcha/${data.token}` : null);
        if (resolveUrl) {
          const absoluteUrl = resolveUrl.startsWith('http') ? resolveUrl : `${window.location.origin}${resolveUrl}`;
          // ✅ FASE A: Usar toast() de sonner (compatible) en lugar de toast.info()
          toast('AliExpress requiere que resuelvas un CAPTCHA para continuar. Redirigiendo...', { icon: 'ℹ️' });
          console.log('[OPPORTUNITIES] Redirigiendo a CAPTCHA:', absoluteUrl);
          // Redirigir a la página de resolución de CAPTCHA
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
      await fetchAuthStatuses();
    } catch (e: any) {
      if (axios.isCancel(e)) {
        requestCanceled = true;
        return;
      }
      // ✅ Manejar respuesta 202 (Accepted) cuando se requiere CAPTCHA
      if (e?.response?.status === 202) {
        const captchaData = e.response?.data || {};
        const resolveUrl = captchaData.resolveCaptchaUrl || (captchaData.token ? `/resolve-captcha/${captchaData.token}` : null);
        if (captchaData.captchaRequired && resolveUrl) {
          const absoluteUrl = resolveUrl.startsWith('http') ? resolveUrl : `${window.location.origin}${resolveUrl}`;
          // ✅ FASE A: Usar toast() de sonner (compatible) en lugar de toast.info()
          toast('AliExpress requiere que resuelvas un CAPTCHA para continuar. Redirigiendo...', { icon: 'ℹ️' });
          console.log('[OPPORTUNITIES] Redirigiendo a CAPTCHA desde catch:', absoluteUrl);
          // Redirigir a la página de resolución de CAPTCHA
          window.location.href = absoluteUrl;
          setLoading(false);
          return;
        }
      }
      
      if (e?.response?.status === 428) {
        // ✅ P0.3: Mostrar modal explicativo antes de abrir ventana
        const data = e.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        
        // Guardar URL para abrir después de confirmar en modal
        setPendingSearchUrl(targetUrl || null);
        setShowAliExpressModal(true);
        
        setError('Se requiere iniciar sesión en AliExpress para continuar.');
        await fetchAuthStatuses();
      } else {
        setError(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        const status = e?.response?.status;
        if (status !== 429 && status !== 403 && (status == null || status < 500)) {
          toast.error(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        }
        await fetchAuthStatuses();
      }
      setItems([]);
      setPaginationMeta(null);
    } finally {
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

  // ✅ P0.3: Handler para abrir ventana de login después de confirmar en modal
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
      // ✅ OBJETIVO B: Mejorar manejo de errores - no bloquear si falla
      const response = await api.get('/api/credentials/status').catch((err) => {
        console.warn('Error loading credentials status, using empty state:', err?.message || err);
        // Retornar respuesta parcial en lugar de fallar
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
      
      // ✅ Mostrar advertencia si hay problemas pero no bloquear
      if (response.data?.data?.warnings && response.data.data.warnings.length > 0) {
        console.warn('Credential status warnings:', response.data.data.warnings);
        // No mostrar toast de error, solo loguear
      }
    } catch (error: any) {
      console.error('Error loading marketplace statuses:', error?.message || error);
      // ✅ OBJETIVO B: No mostrar toast de error que bloquee, solo usar estado vacío
      // toast.error('No se pudieron cargar los estados de credenciales. Verifica tu conexión.');
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
    
    // ✅ CORREGIDO: Pre-llenar keyword desde query params si viene de sugerencias IA y ejecutar búsqueda automática
    const urlParams = new URLSearchParams(window.location.search);
    const keywordParam = urlParams.get('keyword');
    const marketplacesParam = urlParams.get('marketplaces');
    const autoSearch = urlParams.get('autoSearch') === 'true';
    
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
      // Limpiar params de la URL después de leerlos
      window.history.replaceState({}, '', window.location.pathname);
      
      // ✅ Si viene desde sugerencias IA (autoSearch=true), ejecutar búsqueda automáticamente
      if (autoSearch && keywordParam.trim()) {
        // Pequeño delay para asegurar que el estado se actualizó
        setTimeout(() => {
          void fetchOpportunitiesPage(1, keywordParam.trim());
        }, 100);
      }
    } else if (query.trim()) {
      // Si no hay keyword en params pero hay query inicial (URL o localStorage), ejecutar búsqueda
      void fetchOpportunitiesPage(getInitialPage());
    }
    return () => {
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
        // ✅ FASE A: Usar toast() de sonner (compatible) en lugar de toast.info()
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
      // ✅ FASE A: Usar toast() de sonner (compatible) en lugar de toast.info()
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
      text.match(/\bID\s*[:\#]?\s*(\d{1,12})\b/i) ||
      text.match(/producto\s*#\s*(\d{1,12})/i) ||
      text.match(/\(ID\s*(\d{1,12})\s*[,\)]/i);
    if (!m) return false;
    const id = parseInt(m[1], 10);
    if (!Number.isFinite(id) || id <= 0) return false;
    return handleDuplicateProductResponse({
      ...data,
      existingProductId: id,
      error: typeof data?.error === 'string' ? data.error : errMsg || text,
    });
  }

  // ✅ FASE 3: Función para solo importar producto (sin publicar)
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
        // ✅ MEJORADO: Incluir costos adicionales si están disponibles
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

      // ✅ MEJORADO: Pasar TODAS las imágenes disponibles, no solo una
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        // Filtrar solo URLs válidas
        const validImages = item.images.filter(img => 
          img && typeof img === 'string' && /^https?:\/\//i.test(img.trim())
        );
        if (validImages.length > 0) {
          payload.imageUrl = validImages[0]; // Primera imagen como principal
          payload.imageUrls = validImages; // Todas las imágenes en array
        }
      } else if (item.image && /^https?:\/\//i.test(item.image)) {
        // Fallback: si solo hay una imagen, crear array con ella
        payload.imageUrl = item.image;
        payload.imageUrls = [item.image];
      }

      // Crear producto desde la oportunidad (estado PENDING)
      const productResponse = await api.post('/api/products', payload);

      // ✅ El backend devuelve { success: true, data: { id, ...product } }
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

      // ✅ FASE 3: Solo importar, NO publicar. Mostrar mensaje y redirigir a /products
      toast.success('Producto importado correctamente. Ve a Products para revisarlo y publicarlo.');
      
      // Redirigir a /products después de un breve delay
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

  // ✅ FASE 3: Función para crear y publicar (mantener para casos especiales si se necesita)
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
        // ✅ MEJORADO: Usar costo total si está disponible para calcular precio sugerido
        suggestedPrice: item.suggestedPriceUsd, // Ya viene calculado con costo total desde backend
        currency: item.baseCurrency || 'USD',
        importSource: 'opportunity_search',
        aliExpressItemId: item.productId?.trim() || undefined,
        targetMarketplaces: Array.isArray(item.targetMarketplaces) ? item.targetMarketplaces : [],
        // ✅ MEJORADO: Incluir costos adicionales si están disponibles
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

      // ✅ MEJORADO: Pasar TODAS las imágenes disponibles, no solo una
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        // Filtrar solo URLs válidas
        const validImages = item.images.filter(img => 
          img && typeof img === 'string' && /^https?:\/\//i.test(img.trim())
        );
        if (validImages.length > 0) {
          payload.imageUrl = validImages[0]; // Primera imagen como principal
          payload.imageUrls = validImages; // Todas las imágenes en array
        }
      } else if (item.image && /^https?:\/\//i.test(item.image)) {
        // Fallback: si solo hay una imagen, crear array con ella
        payload.imageUrl = item.image;
        payload.imageUrls = [item.image];
      }

      // 1. Crear producto desde la oportunidad
      const productResponse = await api.post('/api/products', payload);

      // ✅ El backend devuelve { success: true, data: { id, ...product } }
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

      // 2. Publicar a marketplace
      const publishResponse = await api.post('/api/marketplace/publish', {
        productId: Number(productId),
        marketplace: targetMarketplace,
        environment,
      });

      if (publishResponse.data?.success) {
        toast.success(`Publicado en ${targetMarketplace} (${environment}) exitosamente`);
        // Opcional: redirigir a productos
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
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Oportunidades</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Busca oportunidades de negocio desde tendencias o términos libres</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Elegí <strong>20 por página</strong> y usá <strong>Siguiente</strong> para el siguiente lote (la URL guarda{' '}
          <code className="text-[11px]">?q=…&amp;page=…&amp;size=…</code>). Cada clic en <strong>Search</strong> pide datos
          frescos al servidor (<code className="text-[11px]">refresh=1</code>).
        </p>
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={2} />
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearchFromForm();
            }
          }}
          placeholder="Buscar oportunidades (ej: auriculares, luces solares, organizador cocina)"
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <select value={region} onChange={e => setRegion(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
          <option value="us">US</option>
          <option value="cl">CL / Chile (Mercado Libre MLC)</option>
          <option value="uk">UK</option>
          <option value="mx">MX</option>
          <option value="de">DE</option>
          <option value="es">ES</option>
          <option value="br">BR</option>
        </select>
        <select
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value))}
          title="Resultados por página (máx. 20 por limitación de AliExpress Affiliate API)"
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          <option value={10}>10 por página</option>
          <option value={20}>20 por página</option>
        </select>
        <button type="button" onClick={runSearchFromForm} disabled={loading} className="bg-primary-600 text-white rounded px-4 py-2">
          {loading ? 'Searching…' : 'Search'}
        </button>
        <div className="md:col-span-4 flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('ebay')} onChange={() => toggleMarketplace('ebay')} /> eBay</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('amazon')} onChange={() => toggleMarketplace('amazon')} /> Amazon</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('mercadolibre')} onChange={() => toggleMarketplace('mercadolibre')} /> MercadoLibre</label>
        </div>
      </div>

      {aliStatus?.status === 'refreshing' && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm rounded flex flex-col gap-1">
          <span>Estamos renovando tu sesión de AliExpress automáticamente. Puedes continuar; reintentaremos las búsquedas en unos segundos.</span>
          {aliStatus.message ? <span className="text-xs text-blue-600 dark:text-blue-400">{aliStatus.message}</span> : null}
        </div>
      )}

      {/* ✅ SOLO mostrar banner si realmente hay sesión manual pendiente (por CAPTCHA/bloqueo), NO si solo faltan cookies */}
      {aliStatus?.status === 'manual_required' && aliStatus?.manualSession?.token && aliStatus?.requiresManual && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <span className="font-semibold">Necesitamos que confirmes tu sesión de AliExpress</span>
            <p className="text-xs text-red-600 dark:text-red-400">
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
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition"
            >
              Reintentar automático
            </button>
            {manualLoginUrl ? (
              <a
                href={manualLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded hover:bg-red-200 transition"
              >
                Abrir login manual
              </a>
            ) : null}
          </div>
        </div>
      )}

      {aliStatus?.status === 'error' && (
        <div className="px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 text-sm rounded flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span>
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
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-200 rounded hover:bg-orange-200 transition"
          >
            Reintentar ahora
          </button>
        </div>
      )}

      {/* ✅ P0.3: Modal explicativo antes de abrir ventana de login AliExpress */}
      {showAliExpressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inicio de sesión requerido en AliExpress</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Para buscar oportunidades en AliExpress, necesitamos que inicies sesión en tu cuenta de AliExpress.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4 space-y-2">
              <p className="font-semibold text-blue-900 dark:text-blue-200">Pasos a seguir:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>Se abrirá una ventana nueva con instrucciones</li>
                <li>Inicia sesión en AliExpress en esa ventana</li>
                <li>Guarda tu sesión siguiendo las instrucciones</li>
                <li>Vuelve aquí y vuelve a intentar la búsqueda</li>
              </ol>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenAliExpressLogin}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
              >
                Abrir ventana de login
              </button>
              <button
                onClick={() => {
                  setShowAliExpressModal(false);
                  setPendingSearchUrl(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}

      {(items.length > 0 || paginationMeta != null) && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded px-4 py-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Página <span className="font-semibold text-gray-900 dark:text-gray-100">{paginationMeta?.page ?? page}</span>
            {' · '}
            {paginationMeta?.returned ?? items.length} resultado(s) en esta vista
            {' · '}
            {maxItems} por página
            {paginationMeta?.mayHaveMore ? (
              <span className="text-amber-700 dark:text-amber-300 ml-1">— podés ir a la siguiente página</span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => void fetchOpportunitiesPage(page - 1)}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800"
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
              onClick={() => void fetchOpportunitiesPage(page + 1)}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={9} />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-center p-3 text-gray-600 dark:text-gray-300">Imagen</th>
                <th className="text-left p-3 text-gray-600 dark:text-gray-300">Título</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-300">
                  <div className="flex items-center justify-end gap-1">
                    <span>Costo</span>
                    <Info className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-help" title="Incluye: producto + envío + impuestos (si disponible)" />
                  </div>
                </th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-300">Precio sugerido</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-300">Margen %</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-300">ROI %</th>
                <th className="text-center p-3 text-gray-600 dark:text-gray-300">Competencia</th>
                <th className="text-center p-3 text-gray-600 dark:text-gray-300">Marketplaces</th>
                <th className="text-center p-3 text-gray-600 dark:text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((it, idx) => (
              <tr
                key={String(it.productId || it.aliexpressUrl || `row-${paginationMeta?.page ?? page}-${idx}`)}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="p-3 text-center">
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
                        className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600 hover:opacity-90 transition"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64x64?text=No+Image';
                        }}
                      />
                    </a>
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                      Sin imagen
                    </div>
                  )}
                </td>
                <td className="p-3 text-gray-900 dark:text-gray-100">
                  <a
                    href={it.aliexpressUrl || it.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium line-clamp-2 max-w-xs text-primary-600 hover:underline"
                    title="Abrir producto en AliExpress"
                  >
                    {it.title}
                  </a>
                  <div className="text-xs text-gray-500 mt-1">
                    Confianza: {(Number(it.confidenceScore ?? 0) * 100).toFixed(2)}% |
                    ID: {it.productId || 'N/A'}
                  </div>
                  {it.feesConsidered && Object.keys(it.feesConsidered).length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 cursor-help" title={Object.entries(it.feesConsidered).map(([k, v]) => `${k}: $${Number(v ?? 0).toFixed(2)}`).join(', ')}>
                      Fees: ${Number(Object.values(it.feesConsidered).reduce((a, b) => a + (Number(b ?? 0)), 0)).toFixed(2)}
                    </div>
                  )}
                  {it.commercialTruth?.competitionSources &&
                  it.commercialTruth.competitionSources.length > 0 ? (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      Comparables:{' '}
                      {it.commercialTruth.competitionSources
                        .map((s) => COMPETITION_SOURCE_LABELS[s] || s)
                        .join(' · ')}
                    </div>
                  ) : null}
                  {it.estimationNotes?.length ? (
                    <div className="text-xs text-amber-600 mt-1 space-y-1">
                      {it.estimationNotes.map((note, noteIdx) => (
                        <div key={noteIdx}>* {note}</div>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="p-3 text-right font-semibold">
                  <div className="flex flex-col items-end gap-1">
                    {/* ✅ MEJORADO: Mostrar costo total si está disponible, sino costo base */}
                    {it.totalCost && it.totalCost > it.costUsd ? (
                      <>
                        <div className="flex items-center gap-1 group relative">
                          <span className="font-semibold">{formatMoney(it.totalCost, it.baseCurrency)}</span>
                          <Info className="w-3 h-3 text-gray-400 cursor-help" />
                          <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            <div className="font-semibold mb-1">Desglose de costos:</div>
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
                              <div className="border-t border-gray-700 mt-1 pt-1 flex justify-between font-semibold">
                                <span>Total:</span>
                                <span>{formatMoney(it.totalCost, it.baseCurrency)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          Base: {formatMoney(it.costUsd, it.baseCurrency)}
                        </div>
                      </>
                    ) : (
                      <span>{formatMoney(it.costUsd, it.baseCurrency)}</span>
                    )}
                    {it.costCurrency && it.costCurrency !== it.baseCurrency ? (
                      <span className="text-xs text-gray-500">
                        ({formatMoney(it.costAmount, it.costCurrency)})
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-semibold text-green-600">
                        {formatMoney(it.suggestedPriceUsd, it.baseCurrency)}
                      </span>
                      {it.suggestedPriceCurrency && it.suggestedPriceCurrency !== it.baseCurrency ? (
                        <span className="text-xs text-gray-500">
                          ({formatMoney(it.suggestedPriceAmount, it.suggestedPriceCurrency)})
                        </span>
                      ) : null}
                    </div>
                    {isFieldEstimated(it.commercialTruth, 'suggestedPrice', it.estimatedFields) && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase text-[10px] font-semibold">
                        Estimado
                      </span>
                    )}
                    {it.commercialTruth?.suggestedPrice === 'exact' && (
                      <span
                        className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 uppercase text-[10px] font-semibold"
                        title="Precio sugerido basado en listados comparables reales del marketplace"
                      >
                        Real
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-2">
                    {/* ✅ MEJORADO: Colores mejorados (verde >30%, rojo <10%) */}
                    <span
                      className={`font-semibold ${
                        it.profitMargin >= 0.3
                          ? 'text-green-600'
                          : it.profitMargin >= 0.1
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {(Number(it.profitMargin ?? 0) * 100).toFixed(2)}%
                    </span>
                    {it.totalCost && it.totalCost > it.costUsd && (
                      <Info className="w-3 h-3 text-gray-400 cursor-help group relative" title="Margen calculado con costo total (producto + envío + impuestos)" />
                    )}
                    {isFieldEstimated(it.commercialTruth, 'profitMargin', it.estimatedFields) && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase text-[10px] font-semibold">
                        Estimado
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`font-semibold ${
                        it.roiPercentage >= 50
                          ? 'text-green-600'
                          : it.roiPercentage >= 30
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {Number(it.roiPercentage ?? 0).toFixed(2)}%
                    </span>
                    {isFieldEstimated(it.commercialTruth, 'roi', it.estimatedFields) && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase text-[10px] font-semibold">
                        Estimado
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    it.competitionLevel === 'low' ? 'bg-green-100 text-green-800' :
                    it.competitionLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    it.competitionLevel === 'high' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {it.competitionLevel === 'unknown' ? 'N/A' : it.competitionLevel}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {it.targetMarketplaces?.map((mp, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {mp}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <div className="flex flex-col gap-2 items-center">
                    {/* ✅ FASE 3: Botón único de Importar (sin publicar automáticamente) */}
                    <button
                      onClick={() => importProduct(it)}
                      disabled={publishing[idx]}
                      className="px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                      title="Importar producto (se guardará en Products para revisión y publicación)"
                    >
                      {publishing[idx] ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Importar
                        </>
                      )}
                    </button>
                    {/* Nota informativa */}
                    <p className="text-xs text-gray-500 max-w-[120px] text-center">
                      El producto se guardará en Products para que puedas revisarlo y publicarlo
                    </p>
                  </div>
                </td>
              </tr>
            ))}
              {items.length === 0 && (
                <tr>
                  <td className="p-8 text-center" colSpan={9}>
                    <div className="max-w-md mx-auto text-left">
                      <p className="font-medium text-gray-700 mb-2">Sin oportunidades</p>
                      <p className="text-sm text-gray-600 mb-3">Aún no hay productos candidatos. Realiza una búsqueda con un término o URL de AliExpress. Los resultados suelen aparecer en segundos.</p>
                      <p className="text-xs text-gray-500">Verifica que tengas la API de búsqueda configurada (AliExpress Affiliate, ScraperAPI o ZenRows) en Configuración.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {hasEstimatedValues && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded px-4 py-3 space-y-1">
          <p>
            <strong>Nota:</strong> Las filas con <span className="uppercase font-semibold">Estimado</span> no obtuvieron precios comparables reales (eBay Browse, catálogo público Mercado Libre o Amazon) para ese título y región.
          </p>
          <p>
            El servidor añade en <strong>notas de estimación</strong> códigos por marketplace cuando puede diagnosticar el motivo (por ejemplo{' '}
            <code className="text-[11px]">EBAY_BROWSE_NOT_CONFIGURED</code>,{' '}
            <code className="text-[11px]">ML_PUBLIC_CATALOG_ZERO_RESULTS</code>,{' '}
            <code className="text-[11px]">AMAZON_CREDENTIALS_MISSING</code>). Para Chile/canary ML, elegí región <strong>CL</strong> y términos de búsqueda más cortos si ML no devuelve listados.
          </p>
          <p className="text-amber-700/90 dark:text-amber-300/90">
            Tras corregir credenciales o región, reintentá la búsqueda (refresh); puede haber caché breve en el servidor.
          </p>
        </div>
      )}
    </div>
  );
}

