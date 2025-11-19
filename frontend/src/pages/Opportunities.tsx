import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuthStatusStore } from '@stores/authStatusStore';

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

interface OpportunityItem {
  productId?: string;
  title: string;
  sourceMarketplace: 'aliexpress';
  aliexpressUrl: string;
  image?: string;
  costUsd: number;
  costAmount: number;
  costCurrency: string;
  baseCurrency: string;
  suggestedPriceUsd: number;
  suggestedPriceAmount: number;
  suggestedPriceCurrency: string;
  profitMargin: number; // 0-1
  roiPercentage: number; // 0-100
  competitionLevel: 'low' | 'medium' | 'high' | 'unknown';
  marketDemand: string;
  confidenceScore: number;
  targetMarketplaces: string[];
  feesConsidered?: Record<string, number>;
  generatedAt: string;
  estimatedFields?: string[];
  estimationNotes?: string[];
}

const formatMoney = (value: number, currency: string) => {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

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
  const [query, setQuery] = useState('organizador cocina');
  const [region, setRegion] = useState('us');
  const [maxItems, setMaxItems] = useState(5);
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

  const marketplacesParam = useMemo(() => marketplaces.join(','), [marketplaces]);
  const hasEstimatedValues = useMemo(
    () => items.some((it) => (it.estimatedFields?.length || 0) > 0),
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

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/opportunities', {
        params: { query, maxItems, marketplaces: marketplacesParam, region }
      });
      setItems(data?.items || []);
      await fetchAuthStatuses();
    } catch (e: any) {
      if (e?.response?.status === 428) {
        const data = e.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        setError('Se requiere iniciar sesión en AliExpress. Abre la ventana y guarda la sesión.');
        toast.warning('Necesitamos que inicies sesión manualmente en AliExpress. Se abrirá una ventana con instrucciones.');
        if (targetUrl) {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
        await fetchAuthStatuses();
      } else {
        setError(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        toast.error(e?.response?.data?.error || e.message || 'Error fetching opportunities');
        await fetchAuthStatuses();
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const loadMarketplaceEnvStatus = useCallback(async () => {
    const createNormalizedState = (): Record<Marketplace, MarketplaceEnvStatusMap> => ({
      ebay: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
      amazon: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
      mercadolibre: { sandbox: createEmptyEnvStatus(), production: createEmptyEnvStatus() },
    });

    try {
      const response = await api.get('/api/credentials/status');
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
    } catch (error: any) {
      console.error('Error loading marketplace statuses:', error?.message || error);
      toast.error('No se pudieron cargar los estados de credenciales. Verifica tu conexión.');
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
    search();
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
        toast.info(
          `Usaremos ${selected} para ${marketplace} porque ${workflowEnvironment} no está disponible.`
        );
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
      toast.info('Operación cancelada por el usuario.');
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
        currency: 'USD',
      };

      if (item.image && /^https?:\/\//i.test(item.image)) {
        payload.imageUrl = item.image;
      }

      // 1. Crear producto desde la oportunidad
      const productResponse = await api.post('/api/products', payload);

      const productId = productResponse.data?.id || productResponse.data?.product?.id;

      if (!productId) {
        throw new Error('No se pudo obtener el ID del producto creado');
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
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Error al crear o publicar producto';
      toast.error(errorMessage);
    } finally {
      setPublishing(prev => ({ ...prev, [itemIndex]: false }));
      loadMarketplaceEnvStatus().catch(() => {
        /* silent */
      });
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Real Opportunities</h1>
      <div className="bg-white border rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search terms (e.g. organizador cocina)"
          className="border rounded px-3 py-2"
        />
        <select value={region} onChange={e => setRegion(e.target.value)} className="border rounded px-3 py-2">
          <option value="us">US</option>
          <option value="uk">UK</option>
          <option value="mx">MX</option>
          <option value="de">DE</option>
          <option value="es">ES</option>
          <option value="br">BR</option>
        </select>
        <input
          type="number"
          min={1}
          max={10}
          value={maxItems}
          onChange={e => setMaxItems(Math.max(1, Math.min(10, Number(e.target.value))))}
          className="border rounded px-3 py-2"
        />
        <button onClick={search} disabled={loading} className="bg-primary-600 text-white rounded px-4 py-2">
          {loading ? 'Searching…' : 'Search'}
        </button>
        <div className="md:col-span-4 flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('ebay')} onChange={() => toggleMarketplace('ebay')} /> eBay</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('amazon')} onChange={() => toggleMarketplace('amazon')} /> Amazon</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={marketplaces.includes('mercadolibre')} onChange={() => toggleMarketplace('mercadolibre')} /> MercadoLibre</label>
        </div>
      </div>

      {aliStatus?.status === 'refreshing' && (
        <div className="px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded flex flex-col gap-1">
          <span>Estamos renovando tu sesión de AliExpress automáticamente. Puedes continuar; reintentaremos las búsquedas en unos segundos.</span>
          {aliStatus.message ? <span className="text-xs text-blue-600">{aliStatus.message}</span> : null}
        </div>
      )}

      {/* ✅ SOLO mostrar banner si realmente hay sesión manual pendiente (por CAPTCHA/bloqueo), NO si solo faltan cookies */}
      {aliStatus?.status === 'manual_required' && aliStatus?.manualSession?.token && aliStatus?.requiresManual && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <span className="font-semibold">Necesitamos que confirmes tu sesión de AliExpress</span>
            <p className="text-xs text-red-600">
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
        <div className="px-4 py-3 bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="overflow-auto bg-white border rounded">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={9} />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center p-3">Imagen</th>
                <th className="text-left p-3">Título</th>
                <th className="text-right p-3">Costo</th>
                <th className="text-right p-3">Precio sugerido</th>
                <th className="text-right p-3">Margen %</th>
                <th className="text-right p-3">ROI %</th>
                <th className="text-center p-3">Competencia</th>
                <th className="text-center p-3">Marketplaces</th>
                <th className="text-center p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
              <tr key={idx} className="border-t hover:bg-gray-50">
                <td className="p-3 text-center">
                  {it.image ? (
                    <a
                      href={it.aliexpressUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir en AliExpress"
                    >
                      <img
                        src={it.image}
                        alt={it.title}
                        className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-90 transition"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64x64?text=No+Image';
                        }}
                      />
                    </a>
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-400">
                      Sin imagen
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <a
                    href={it.aliexpressUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium line-clamp-2 max-w-xs text-primary-600 hover:underline"
                    title="Abrir producto en AliExpress"
                  >
                    {it.title}
                  </a>
                  <div className="text-xs text-gray-500 mt-1">
                    Confianza: {Math.round((it.confidenceScore || 0) * 100)}% |
                    ID: {it.productId || 'N/A'}
                  </div>
                  {it.feesConsidered && Object.keys(it.feesConsidered).length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 cursor-help" title={Object.entries(it.feesConsidered).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join(', ')}>
                      Fees: ${Object.values(it.feesConsidered).reduce((a, b) => a + b, 0).toFixed(2)}
                    </div>
                  )}
                  {it.estimationNotes?.length ? (
                    <div className="text-xs text-amber-600 mt-1 space-y-1">
                      {it.estimationNotes.map((note, noteIdx) => (
                        <div key={noteIdx}>* {note}</div>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="p-3 text-right font-semibold">
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{formatMoney(it.costUsd, it.baseCurrency)}</span>
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
                    {it.estimatedFields?.includes('suggestedPriceUsd') && (
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
                        it.profitMargin >= 0.3
                          ? 'text-green-600'
                          : it.profitMargin >= 0.2
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {Math.round(it.profitMargin * 100)}%
                    </span>
                    {it.estimatedFields?.includes('profitMargin') && (
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
                      {Math.round(it.roiPercentage)}%
                    </span>
                    {it.estimatedFields?.includes('roiPercentage') && (
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
                    <div className="flex flex-wrap gap-1 justify-center">
                      {it.targetMarketplaces?.map((mp) => (
                        <button
                          key={mp}
                          onClick={() => createAndPublishProduct(it, mp as Marketplace)}
                          disabled={publishing[idx]}
                          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                          title={`Crear y publicar en ${mp}`}
                        >
                          {publishing[idx] ? '...' : mp === 'ebay' ? 'eBay' : mp === 'mercadolibre' ? 'ML' : 'AMZ'}
                        </button>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
              {items.length === 0 && (
                <tr><td className="p-6 text-center text-gray-500" colSpan={9}>No se encontraron resultados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {hasEstimatedValues && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded px-4 py-3">
          <strong>Nota:</strong> Algunos valores se muestran como <span className="uppercase font-semibold">Estimado</span> porque faltan datos reales de los marketplaces de destino. Configura tus credenciales en <span className="font-semibold">Settings → API Settings</span> para obtener precios y márgenes exactos.
        </div>
      )}
    </div>
  );
}

