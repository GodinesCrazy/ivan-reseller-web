import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Search,
  Package,
  ShoppingBag,
  ClipboardList,
  ArrowRight,
  Wifi,
  WifiOff,
  RefreshCw,
  TrendingUp,
  Activity,
  Eye,
  Zap,
} from 'lucide-react';
import {
  ActionPriorityBand,
  CommercialMetricCard,
  CommercialPageHeader,
  CycleNarrativeStrip,
} from './components/CommercialCockpit';

interface ReadinessCheck {
  id: string;
  name: string;
  status: 'PENDING' | 'PASS' | 'FAIL' | 'WARNING';
  message?: string;
  hint?: string;
}

interface OverviewCounts {
  products: number;
  variants: number;
  evaluations: number;
  evaluationsApproved: number;
  evaluationsRejected: number;
  evaluationsPending: number;
  shippingQuotes: number;
  listings: number;
  listingsActive: number;
  shopifyProductsInSoftware: number;
  orders: number;
  ordersOpen: number;
  ordersWithTracking: number;
  alertsOpen: number;
  profitSnapshots: number;
  tracesLast24h: number;
}

interface WebhookHealth {
  lastOrderReceived: string | null;
  hasRecentActivity: boolean;
  ordersNeedingAttention: number;
}

interface CleanupPreview {
  ok: boolean;
  totals: {
    scale: number;
    optimize: number;
    protect: number;
    rotate: number;
    archiveCandidates: number;
    actionable: number;
  };
}

// ── Pipeline stage component ─────────────────────────────────────────────────

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
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center flex-1 min-w-0">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 group relative rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/60 px-4 py-4 text-left hover:shadow-md hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 hover:-translate-y-0.5 transition-all duration-300"
      >
        <div className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${color}`} />
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${color} bg-opacity-10`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtext}</p>
      </button>
      {!isLast && (
        <div className="hidden lg:flex items-center justify-center w-8 flex-shrink-0">
          <div className="flex flex-col items-center">
            <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CjShopifyUsaOverviewPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [cleanup, setCleanup] = useState<CleanupPreview | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; checks: ReadinessCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [resParams, resOverview, resCleanup] = await Promise.all([
        api.get('/api/cj-shopify-usa/system-readiness'),
        api.get('/api/cj-shopify-usa/overview'),
        api.get('/api/cj-shopify-usa/cleanup/preview'),
      ]);
      if (resParams.data) setReadiness(resParams.data);
      if (resOverview.data?.ok && resOverview.data.counts) setCounts(resOverview.data.counts);
      if (resOverview.data?.webhookHealth) setWebhookHealth(resOverview.data.webhookHealth);
      if (resCleanup.data?.ok) setCleanup(resCleanup.data);
      setError(null);
    } catch (e: unknown) {
      let msg = 'No se pudo cargar el resumen.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const err = (e.response.data as { error?: string }).error;
        if (err === 'CJ_SHOPIFY_USA_MODULE_DISABLED') msg = 'Módulo desactivado en el servidor (ENABLE_CJ_SHOPIFY_USA_MODULE).';
        else if (e.response.status === 404) msg = 'Ruta no disponible.';
      } else if (e instanceof Error) { msg = e.message; }
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando resumen de integración…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 text-sm text-amber-900 dark:text-amber-100 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  const failCount = readiness?.checks.filter((c) => c.status === 'FAIL').length ?? 0;
  const warnCount = readiness?.checks.filter((c) => c.status === 'WARNING').length ?? 0;
  const passCount = readiness?.checks.filter((c) => c.status === 'PASS').length ?? 0;
  const totalChecks = readiness?.checks.length ?? 0;

  return (
    <div className="space-y-6 ir-fade-in">
      <CommercialPageHeader
        title="Cockpit comercial PawVault"
        description="Vista ejecutiva del ciclo PET: descubrir productos, publicar con margen, proteger postventa y repetir ganadores."
      >
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-400 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </CommercialPageHeader>

      <ActionPriorityBand
        tone={failCount > 0 || (counts?.alertsOpen ?? 0) > 0 ? 'amber' : (counts?.listingsActive ?? 0) > 0 ? 'emerald' : 'cyan'}
        title={
          failCount > 0
            ? 'Primero corrige la integración antes de publicar.'
            : (counts?.alertsOpen ?? 0) > 0
              ? 'Hay alertas que pueden afectar ventas, margen o reputación.'
              : (cleanup?.totals.rotate ?? 0) > 0
                ? 'Hay productos sin tracción que conviene rotar antes de publicar más.'
              : (counts?.evaluationsApproved ?? 0) > (counts?.listings ?? 0)
                ? 'Tienes productos aprobados listos para convertir en listings.'
                : 'Siguiente paso: alimentar el ciclo con nuevos productos PET.'
        }
        description="La prioridad se calcula desde readiness, alertas, aprobados, listings activos y actividad reciente."
        primaryLabel={
          failCount > 0
            ? 'Ver configuración'
            : (counts?.alertsOpen ?? 0) > 0
              ? 'Revisar alertas'
              : (cleanup?.totals.rotate ?? 0) > 0
                ? 'Rotar productos'
              : (counts?.evaluationsApproved ?? 0) > (counts?.listings ?? 0)
                ? 'Publicar seguros'
                : 'Descubrir PET'
        }
        onPrimary={() => navigate(
          failCount > 0
            ? '/cj-shopify-usa/settings'
            : (counts?.alertsOpen ?? 0) > 0
              ? '/cj-shopify-usa/alerts'
              : (cleanup?.totals.rotate ?? 0) > 0
                ? '/cj-shopify-usa/listings'
              : (counts?.evaluationsApproved ?? 0) > (counts?.listings ?? 0)
                ? '/cj-shopify-usa/listings'
                : '/cj-shopify-usa/discover',
        )}
        secondaryLabel="Agente vendedor"
        onSecondary={() => navigate('/cj-shopify-usa/sales-agent')}
        meta={[
          `${counts?.evaluationsApproved ?? 0} aprobados`,
          `${counts?.listingsActive ?? 0} activos`,
          `${cleanup?.totals.rotate ?? 0} a rotar`,
          `${counts?.ordersOpen ?? 0} ordenes abiertas`,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard label="Potencial publicable" value={counts?.evaluationsApproved ?? 0} detail={`${counts?.evaluationsPending ?? 0} pendientes de decision`} tone="violet" />
        <CommercialMetricCard label="Listings activos" value={counts?.listingsActive ?? 0} detail={`${counts?.listings ?? 0} listings totales`} tone="emerald" />
        <CommercialMetricCard label="Rotar sin traccion" value={cleanup?.totals.rotate ?? 0} detail={`${cleanup?.totals.archiveCandidates ?? 0} archivables conservadores`} tone={(cleanup?.totals.rotate ?? 0) > 0 ? 'rose' : 'slate'} />
        <CommercialMetricCard label="Optimizar / proteger" value={(cleanup?.totals.optimize ?? 0) + (cleanup?.totals.protect ?? 0)} detail="senal debil o riesgo de margen" tone={(cleanup?.totals.optimize ?? 0) + (cleanup?.totals.protect ?? 0) > 0 ? 'amber' : 'slate'} />
        <CommercialMetricCard label="Postventa abierta" value={counts?.ordersOpen ?? 0} detail={`${counts?.ordersWithTracking ?? 0} con tracking`} tone={(counts?.ordersOpen ?? 0) > 0 ? 'amber' : 'slate'} />
        <CommercialMetricCard label="Actividad 24h" value={counts?.tracesLast24h ?? 0} detail="senales operativas recientes" tone="cyan" />
      </div>

      <CycleNarrativeStrip active="measure" />

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 dark:from-primary-900 dark:via-primary-950 dark:to-indigo-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="relative px-6 py-6 lg:px-8 lg:py-7">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🐾</span>
                <h1 className="text-xl font-bold text-white tracking-tight">PawVault · CJ → Shopify USA</h1>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  readiness?.ready
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                    : 'bg-red-500/20 text-red-200 border border-red-400/30'
                }`}>
                  {readiness?.ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {readiness?.ready ? 'Operativo' : 'Atención requerida'}
                </div>
              </div>
              <p className="text-primary-200/80 text-sm max-w-lg">
                Catálogo CJ, evaluación operativa y gestión para tu tienda Shopify USA.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Health score circle */}
              <div className="relative flex items-center justify-center w-20 h-20">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={readiness?.ready ? '#34d399' : '#f87171'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(passCount / Math.max(totalChecks, 1)) * 97.5} 97.5`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-white tabular-nums">{passCount}/{totalChecks}</span>
                  <span className="text-[9px] text-primary-200/60 uppercase font-semibold tracking-wide">checks</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium transition-colors border border-white/10"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          </div>

          {/* Quick stats row */}
          {counts && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {[
                { label: 'Listings activos', value: counts.listingsActive, icon: ShoppingBag },
                { label: 'Órdenes abiertas', value: counts.ordersOpen, icon: ClipboardList },
                { label: 'Alertas', value: counts.alertsOpen, icon: AlertCircle },
                { label: 'Actividad 24h', value: counts.tracesLast24h, icon: Activity },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">{label}</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-white">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Webhook Health Banner ──────────────────────────────────────────── */}
      {webhookHealth && (
        <section className="space-y-2">
          {webhookHealth.ordersNeedingAttention > 0 && (
            <button
              type="button"
              onClick={() => navigate('/cj-shopify-usa/orders')}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 px-5 py-3.5 text-sm text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/50 transition-all duration-200 group"
            >
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{webhookHealth.ordersNeedingAttention} orden{webhookHealth.ordersNeedingAttention > 1 ? 'es' : ''} requieren atención</span>
              </div>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          )}
          <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-sm ${
            webhookHealth.hasRecentActivity
              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
              : 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200'
          }`}>
            {webhookHealth.hasRecentActivity
              ? <Wifi className="w-4 h-4 flex-shrink-0" />
              : <WifiOff className="w-4 h-4 flex-shrink-0" />}
            <span>
              Webhook Shopify:{' '}
              {webhookHealth.hasRecentActivity
                ? `Activo — última orden ${webhookHealth.lastOrderReceived ? new Date(webhookHealth.lastOrderReceived).toLocaleString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recientemente'}`
                : 'Sin órdenes en 48h — verifica webhook en Shopify'}
            </span>
          </div>
        </section>
      )}

      {/* ── Pipeline Visual ────────────────────────────────────────────────── */}
      {counts && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pipeline del ciclo
            </h2>
          </div>
          <div className="flex flex-col lg:flex-row gap-2 lg:gap-0">
            <PipelineStage
              label="Descubrir"
              value={counts.products}
              subtext={`${counts.evaluationsApproved} aprobados · ${counts.variants} variantes`}
              icon={Search}
              color="bg-violet-500"
              onClick={() => navigate('/cj-shopify-usa/discover')}
            />
            <PipelineStage
              label="Catálogo CJ"
              value={counts.evaluationsApproved}
              subtext={`${counts.evaluationsRejected} rechazados · ${counts.evaluationsPending} pendientes`}
              icon={Package}
              color="bg-blue-500"
              onClick={() => navigate('/cj-shopify-usa/products')}
            />
            <PipelineStage
              label="Shopify"
              value={counts.shopifyProductsInSoftware}
              subtext={`${counts.listingsActive} activos · ${counts.listings} listings total`}
              icon={ShoppingBag}
              color="bg-emerald-500"
              onClick={() => navigate('/cj-shopify-usa/listings')}
            />
            <PipelineStage
              label="Ventas"
              value={counts.ordersOpen}
              subtext={`${counts.orders} total · ${counts.ordersWithTracking} con tracking`}
              icon={ClipboardList}
              color="bg-amber-500"
              onClick={() => navigate('/cj-shopify-usa/orders')}
              isLast
            />
          </div>
        </section>
      )}

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Descubrir Productos',
            description: 'Busca en CJ, evalúa márgenes y crea drafts.',
            icon: Search,
            path: '/cj-shopify-usa/discover',
            gradient: 'from-violet-500/10 to-purple-500/5 dark:from-violet-500/15 dark:to-purple-500/10',
            border: 'border-violet-200/80 dark:border-violet-800/40',
            iconBg: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
          },
          {
            label: 'Store Products',
            description: `${counts?.shopifyProductsInSoftware ?? 0} productos Shopify · ${counts?.listingsActive ?? 0} activos`,
            icon: ShoppingBag,
            path: '/cj-shopify-usa/listings',
            gradient: 'from-emerald-500/10 to-teal-500/5 dark:from-emerald-500/15 dark:to-teal-500/10',
            border: 'border-emerald-200/80 dark:border-emerald-800/40',
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Agente Vendedor',
            description: 'IA para optimización, pricing y promoción.',
            icon: Zap,
            path: '/cj-shopify-usa/sales-agent',
            gradient: 'from-amber-500/10 to-orange-500/5 dark:from-amber-500/15 dark:to-orange-500/10',
            border: 'border-amber-200/80 dark:border-amber-800/40',
            iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
          },
        ].map(({ label, description, icon: Icon, path, gradient, border, iconBg }) => (
          <button
            type="button"
            key={path}
            onClick={() => navigate(path)}
            className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} px-4 py-4 text-left group hover:shadow-lg hover:-translate-y-1 transition-all duration-300`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${iconBg}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-1 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-all flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </section>

      {/* ── Warnings ───────────────────────────────────────────────────────── */}
      {(failCount > 0 || warnCount > 0 || (counts?.alertsOpen ?? 0) > 0) && (
        <section className="space-y-2">
          {failCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 px-5 py-3.5 text-sm text-red-800 dark:text-red-200">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{failCount} verificación{failCount > 1 ? 'es' : ''} fallida{failCount > 1 ? 's' : ''} — la integración no está lista para operar.</span>
            </div>
          )}
          {warnCount > 0 && failCount === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 px-5 py-3.5 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{warnCount} advertencia{warnCount > 1 ? 's' : ''} — revisa el estado antes de publicar.</span>
            </div>
          )}
          {(counts?.alertsOpen ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate('/cj-shopify-usa/alerts')}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 px-5 py-3.5 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{counts!.alertsOpen} alerta{counts!.alertsOpen > 1 ? 's' : ''} abierta{counts!.alertsOpen > 1 ? 's' : ''}</span>
              </div>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </section>
      )}

      {/* ── Readiness Checks ───────────────────────────────────────────────── */}
      {readiness && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Estado de la Integración</h2>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              readiness.ready
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/50'
            }`}>
              {readiness.ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {readiness.ready ? 'Operativo' : 'Requiere atención'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100 dark:bg-slate-800/50">
            {readiness.checks.map((check) => (
              <div key={check.id} className="bg-white dark:bg-slate-900/80 p-4">
                <div className="flex items-start gap-3">
                  {check.status === 'PASS'    && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'FAIL'    && <XCircle      className="w-5 h-5 text-red-500   flex-shrink-0 mt-0.5" />}
                  {check.status === 'WARNING' && <AlertCircle  className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'PENDING' && <Loader2      className="w-5 h-5 text-blue-500  flex-shrink-0 mt-0.5 animate-spin" />}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{check.name}</h3>
                    {check.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{check.message}</p>}
                    {check.hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 italic">{check.hint}</p>}
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
