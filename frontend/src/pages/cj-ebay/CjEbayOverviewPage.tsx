import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';

type OverviewCounts = {
  products: number;
  variants: number;
  evaluations: number;
  evaluationsApproved: number;
  evaluationsRejected: number;
  evaluationsPending: number;
  shippingQuotes: number;
  listings: number;
  listingsActive: number;
  orders: number;
  ordersOpen: number;
  ordersWithTracking: number;
  alertsOpen: number;
  profitSnapshots: number;
  tracesLast24h: number;
};

type SellingLimits = {
  listingLimit: number | null;
  amountLimitUsd: number | null;
  usedListings: number;
  usedAmountUsd: number;
  remainingListings: number | null;
  remainingAmountUsd: number | null;
  configured: boolean;
};

type ReadinessCheck = {
  id: string;
  ok: boolean;
  detail: string;
  hint?: string;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function shortCheckName(id: string): string {
  const map: Record<string, string> = {
    'env.enable_cj_ebay_module': 'Module Flag',
    'database.connection': 'Database',
    'schema.cj_ebay_orders': 'CJ-eBay Schema',
    'migrations.cj_ebay_applied': 'Migrations',
    'credentials.cj_dropshipping': 'CJ Credentials',
    'credentials.ebay_oauth': 'eBay OAuth',
    'http.cj_api_policy': 'API Policy',
  };
  return map[id] ?? id;
}

function apiMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
    const payload = error.response.data as { error?: string; message?: string };
    if (payload.error === 'CJ_EBAY_MODULE_DISABLED') return 'Modulo desactivado en el servidor (ENABLE_CJ_EBAY_MODULE).';
    return payload.message || payload.error || 'No se pudo cargar el resumen.';
  }
  return error instanceof Error ? error.message : 'No se pudo cargar el resumen.';
}

function PipelineStage({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  isLast,
  onClick,
}: {
  label: string;
  value: number;
  subtext: string;
  icon: React.ElementType;
  color: string;
  isLast?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <button
        type="button"
        onClick={onClick}
        className="group relative flex-1 rounded-xl border border-slate-200/80 bg-white px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:shadow-slate-900/50"
      >
        <div className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${color}`} />
        <div className="mb-2 flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} bg-opacity-10`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{subtext}</p>
      </button>
      {!isLast && (
        <div className="hidden w-8 flex-shrink-0 items-center justify-center lg:flex">
          <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
        </div>
      )}
    </div>
  );
}

export default function CjEbayOverviewPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [sellingLimits, setSellingLimits] = useState<SellingLimits | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; checks: ReadinessCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [readinessRes, overviewRes] = await Promise.all([
        api.get<{ ready: boolean; checks: ReadinessCheck[] }>('/api/cj-ebay/system-readiness'),
        api.get<{ ok: boolean; counts: OverviewCounts; sellingLimits: SellingLimits }>('/api/cj-ebay/overview'),
      ]);
      setReadiness(readinessRes.data);
      setCounts(overviewRes.data.counts);
      setSellingLimits(overviewRes.data.sellingLimits);
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando resumen de integracion eBay...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  const passCount = readiness?.checks.filter((c) => c.ok).length ?? 0;
  const totalChecks = readiness?.checks.length ?? 0;
  const failCount = Math.max(0, totalChecks - passCount);
  const quotaText = sellingLimits?.configured
    ? `${sellingLimits.remainingListings ?? '-'} publicaciones libres · ${fmtUsd(sellingLimits.remainingAmountUsd)} disponibles`
    : 'Sin cuotas configuradas: configura limites mensuales antes de automatizar.';

  return (
    <div className="space-y-6 ir-fade-in">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/50">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-900 dark:from-sky-950 dark:via-blue-950 dark:to-indigo-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
        <div className="relative px-6 py-6 lg:px-8 lg:py-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="text-2xl">eB</span>
                <h1 className="text-xl font-bold tracking-tight text-white">CJ → eBay USA</h1>
                <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                  readiness?.ready
                    ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-500/20 text-amber-100'
                }`}>
                  {readiness?.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {readiness?.ready ? 'Operativo' : 'Atencion requerida'}
                </div>
              </div>
              <p className="max-w-2xl text-sm text-sky-100/80">
                Catalogo CJ, evaluacion con fees eBay, control de cuota mensual, publicacion y postventa para eBay USA.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={readiness?.ready ? '#34d399' : '#fbbf24'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(passCount / Math.max(totalChecks, 1)) * 97.5} 97.5`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tabular-nums text-white">{passCount}/{totalChecks}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-100/60">checks</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          {counts && (
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'Listings activos', value: counts.listingsActive, icon: ShoppingBag },
                { label: 'Ordenes abiertas', value: counts.ordersOpen, icon: ClipboardList },
                { label: 'Alertas', value: counts.alertsOpen, icon: AlertCircle },
                { label: 'Actividad 24h', value: counts.tracesLast24h, icon: Activity },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-white/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-white">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-sm ${
        sellingLimits?.configured
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200'
      }`}>
        <Wifi className="h-4 w-4 flex-shrink-0" />
        <span>Cuotas eBay: {quotaText}</span>
      </section>

      {counts && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pipeline del ciclo</h2>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:gap-0">
            <PipelineStage
              label="Descubrir"
              value={counts.products}
              subtext={`${counts.evaluationsApproved} aprobados · ${counts.variants} variantes`}
              icon={Search}
              color="bg-violet-500"
              onClick={() => navigate('/cj-ebay/discover')}
            />
            <PipelineStage
              label="Catalogo CJ"
              value={counts.evaluationsApproved}
              subtext={`${counts.evaluationsRejected} rechazados · ${counts.evaluationsPending} pendientes`}
              icon={Package}
              color="bg-blue-500"
              onClick={() => navigate('/cj-ebay/products')}
            />
            <PipelineStage
              label="eBay"
              value={counts.listings}
              subtext={`${counts.listingsActive} activos · ${counts.shippingQuotes} fletes cotizados`}
              icon={ShoppingBag}
              color="bg-sky-500"
              onClick={() => navigate('/cj-ebay/listings')}
            />
            <PipelineStage
              label="Ventas"
              value={counts.ordersOpen}
              subtext={`${counts.orders} total · ${counts.ordersWithTracking} con tracking`}
              icon={ClipboardList}
              color="bg-amber-500"
              onClick={() => navigate('/cj-ebay/orders')}
              isLast
            />
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Descubrir Productos',
            description: 'Busca oportunidades CJ con señales eBay.',
            icon: Search,
            path: '/cj-ebay/discover',
            gradient: 'from-violet-500/10 to-purple-500/5 dark:from-violet-500/15 dark:to-purple-500/10',
            border: 'border-violet-200/80 dark:border-violet-800/40',
            iconBg: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
          },
          {
            label: 'Listings eBay',
            description: `${counts?.listings ?? 0} listings · ${counts?.listingsActive ?? 0} activos`,
            icon: ShoppingBag,
            path: '/cj-ebay/listings',
            gradient: 'from-sky-500/10 to-cyan-500/5 dark:from-sky-500/15 dark:to-cyan-500/10',
            border: 'border-sky-200/80 dark:border-sky-800/40',
            iconBg: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400',
          },
          {
            label: 'Store Optimizer',
            description: 'Protege margen, cuota y riesgo de cuenta.',
            icon: SlidersHorizontal,
            path: '/cj-ebay/store-optimizer',
            gradient: 'from-amber-500/10 to-orange-500/5 dark:from-amber-500/15 dark:to-orange-500/10',
            border: 'border-amber-200/80 dark:border-amber-800/40',
            iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
          },
        ].map(({ label, description, icon: Icon, path, gradient, border, iconBg }) => (
          <button
            type="button"
            key={path}
            onClick={() => navigate(path)}
            className={`group rounded-xl border ${border} bg-gradient-to-br ${gradient} px-4 py-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
                </div>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
            </div>
          </button>
        ))}
      </section>

      {(failCount > 0 || (counts?.alertsOpen ?? 0) > 0) && (
        <section className="space-y-2">
          {failCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="font-medium">{failCount} verificacion{failCount > 1 ? 'es' : ''} requiere{failCount > 1 ? 'n' : ''} atencion antes de automatizar eBay.</span>
            </div>
          )}
          {(counts?.alertsOpen ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate('/cj-ebay/alerts')}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/30"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">{counts!.alertsOpen} alerta{counts!.alertsOpen > 1 ? 's' : ''} abierta{counts!.alertsOpen > 1 ? 's' : ''}</span>
              </div>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          )}
        </section>
      )}

      {readiness && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/50 dark:bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <Eye className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Estado de la Integracion</h2>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
              readiness.ready
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400'
            }`}>
              {readiness.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {readiness.ready ? 'Operativo' : 'Requiere atencion'}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px bg-slate-100 dark:bg-slate-800/50 md:grid-cols-2 lg:grid-cols-3">
            {readiness.checks.map((check) => (
              <div key={check.id} className="bg-white p-4 dark:bg-slate-900/80">
                <div className="flex items-start gap-3">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{shortCheckName(check.id)}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{check.detail}</p>
                    {check.hint && <p className="mt-1 text-[11px] italic text-slate-400 dark:text-slate-500">{check.hint}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
