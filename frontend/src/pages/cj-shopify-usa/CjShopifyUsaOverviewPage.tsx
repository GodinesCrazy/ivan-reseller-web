import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';
import { CheckCircle2, XCircle, AlertCircle, Loader2, Search, Package, ShoppingBag, ClipboardList, ArrowRight, Wifi, WifiOff, RefreshCw } from 'lucide-react';

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

export default function CjShopifyUsaOverviewPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; checks: ReadinessCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [resParams, resOverview] = await Promise.all([
        api.get('/api/cj-shopify-usa/system-readiness'),
        api.get('/api/cj-shopify-usa/overview'),
      ]);
      if (resParams.data) setReadiness(resParams.data);
      if (resOverview.data?.ok && resOverview.data.counts) setCounts(resOverview.data.counts);
      if (resOverview.data?.webhookHealth) setWebhookHealth(resOverview.data.webhookHealth);
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

  if (loading) return <p className="text-sm text-slate-500">Cargando resumen de integración…</p>;

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {error}
      </div>
    );
  }

  const failCount = readiness?.checks.filter((c) => c.status === 'FAIL').length ?? 0;
  const warnCount = readiness?.checks.filter((c) => c.status === 'WARNING').length ?? 0;

  return (
    <div className="space-y-8">

      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div />
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {/* Webhook health banner */}
      {webhookHealth && (
        <section>
          {webhookHealth.ordersNeedingAttention > 0 && (
            <button
              type="button"
              onClick={() => navigate('/cj-shopify-usa/orders')}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors mb-2"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>{webhookHealth.ordersNeedingAttention} orden{webhookHealth.ordersNeedingAttention > 1 ? 'es' : ''} requieren atención (FAILED / NEEDS_MANUAL)</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${webhookHealth.hasRecentActivity ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'}`}>
            {webhookHealth.hasRecentActivity
              ? <Wifi className="w-4 h-4 flex-shrink-0" />
              : <WifiOff className="w-4 h-4 flex-shrink-0" />}
            <span>
              Webhook Shopify:{' '}
              {webhookHealth.hasRecentActivity
                ? `Activo — última orden recibida ${webhookHealth.lastOrderReceived ? new Date(webhookHealth.lastOrderReceived).toLocaleString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recientemente'}`
                : 'Sin órdenes en las últimas 48h — verifica que el webhook esté registrado en Shopify'}
            </span>
          </div>
        </section>
      )}



      {/* Pipeline CTA strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Descubrir Productos',
            description: 'Busca en CJ, evalúa márgenes y crea drafts.',
            icon: Search,
            path: '/cj-shopify-usa/discover',
            accent: 'border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20',
            btnCls: 'bg-primary-600 hover:bg-primary-700',
          },
          {
            label: 'Productos (Snapshots)',
            description: `${counts?.products ?? 0} en DB · ${counts?.evaluationsApproved ?? 0} aprobados`,
            icon: Package,
            path: '/cj-shopify-usa/products',
            accent: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50',
            btnCls: 'bg-slate-600 hover:bg-slate-700',
          },
          {
            label: 'Store Products (Listings)',
            description: `${counts?.listings ?? 0} total · ${counts?.listingsActive ?? 0} activos en Shopify`,
            icon: ShoppingBag,
            path: '/cj-shopify-usa/listings',
            accent: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50',
            btnCls: 'bg-slate-600 hover:bg-slate-700',
          },
        ].map(({ label, description, icon: Icon, path, accent, btnCls }) => (
          <button
            type="button"
            key={path}
            onClick={() => navigate(path)}
            className={`rounded-xl border ${accent} px-4 py-4 text-left group hover:shadow-sm transition-shadow`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-6">{description}</p>
          </button>
        ))}
      </section>

      {/* Warnings strip */}
      {(failCount > 0 || warnCount > 0 || (counts?.alertsOpen ?? 0) > 0) && (
        <section className="space-y-2">
          {failCount > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{failCount} verificación{failCount > 1 ? 'es' : ''} fallida{failCount > 1 ? 's' : ''} — la integración no está lista para operar.</span>
            </div>
          )}
          {warnCount > 0 && failCount === 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{warnCount} advertencia{warnCount > 1 ? 's' : ''} activa{warnCount > 1 ? 's' : ''} — revisa el estado antes de publicar.</span>
            </div>
          )}
          {(counts?.alertsOpen ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate('/cj-shopify-usa/alerts')}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{counts!.alertsOpen} alerta{counts!.alertsOpen > 1 ? 's' : ''} abierta{counts!.alertsOpen > 1 ? 's' : ''}</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </section>
      )}

      {/* Readiness Section */}
      {readiness && (
        <section className="bg-white dark:bg-slate-900 shadow rounded-xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Estado de la Integración</h2>
            <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${readiness.ready ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {readiness.ready ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {readiness.ready ? 'Ready to operate' : 'Action Required'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {readiness.checks.map((check) => (
              <div key={check.id} className="border border-slate-100 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-start gap-3">
                  {check.status === 'PASS'    && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'FAIL'    && <XCircle      className="w-5 h-5 text-red-500   flex-shrink-0 mt-0.5" />}
                  {check.status === 'WARNING' && <AlertCircle  className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'PENDING' && <Loader2      className="w-5 h-5 text-blue-500  flex-shrink-0 mt-0.5 animate-spin" />}
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-200">{check.name}</h3>
                    {check.message && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{check.message}</p>}
                    {check.hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{check.hint}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Counts grid */}
      {counts && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Estado del pipeline
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Productos CJ', value: counts.products, sub: `${counts.variants} variantes`, onClick: () => navigate('/cj-shopify-usa/products') },
              { label: 'Listings Activos', value: counts.listingsActive, sub: `${counts.listings} total`, onClick: () => navigate('/cj-shopify-usa/listings') },
              { label: 'Órdenes abiertas', value: counts.ordersOpen, sub: `${counts.orders} total · ${counts.ordersWithTracking} con tracking`, onClick: () => navigate('/cj-shopify-usa/orders') },
              { label: 'Actividad 24h', value: counts.tracesLast24h, sub: 'trazas de ejecución', onClick: () => navigate('/cj-shopify-usa/logs') },
            ].map(({ label, value, sub, onClick }) => (
              <button
                type="button"
                key={label}
                onClick={onClick}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-4 py-3 text-left hover:shadow-sm transition-shadow group"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                  <ClipboardList className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
                <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{value}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
