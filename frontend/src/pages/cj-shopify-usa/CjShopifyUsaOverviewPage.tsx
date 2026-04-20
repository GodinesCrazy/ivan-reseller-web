import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

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

export default function CjShopifyUsaOverviewPage() {
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; checks: ReadinessCheck[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resParams, resOverview] = await Promise.all([
          api.get('/api/cj-shopify-usa/system-readiness'),
          api.get('/api/cj-shopify-usa/overview')
        ]);
        if (!cancelled) {
          if (resParams.data) {
            setReadiness(resParams.data);
          }
          if (resOverview.data?.ok && resOverview.data.counts) {
            setCounts(resOverview.data.counts);
          }
        }
      } catch (e: unknown) {
        let msg = 'No se pudo cargar el resumen.';
        if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
          const err = (e.response.data as { error?: string }).error;
          if (err === 'CJ_SHOPIFY_USA_MODULE_DISABLED') {
            msg = 'Módulo desactivado en el servidor (ENABLE_CJ_SHOPIFY_USA_MODULE).';
          } else if (e.response.status === 404) {
            msg = 'Ruta no disponible...';
          }
        } else if (e instanceof Error) {
          msg = e.message;
        }
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando resumen de integración…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Readiness Section */}
      {readiness && (
        <section className="bg-white dark:bg-slate-900 shadow rounded-xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Estado de la Integración (Readiness)</h2>
            <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${readiness.ready ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {readiness.ready ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {readiness.ready ? 'Ready to operate' : 'Action Required'}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {readiness.checks.map(check => (
              <div key={check.id} className="border border-slate-100 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-start gap-3">
                  {check.status === 'PASS' && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'FAIL' && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'WARNING' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                  {check.status === 'PENDING' && <Loader2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />}
                  
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-slate-200">{check.name}</h3>
                    {check.message && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{check.message}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Counts */}
      {counts && (
        <section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: 'Productos CJ (snapshots)', value: counts.products },
              { label: 'Listings Activos', value: counts.listingsActive },
              { label: 'Órdenes abiertas', value: counts.ordersOpen },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-4 py-3"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
