import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { Link } from 'react-router-dom';

interface Overview {
  products: { total: number; evaluated: number; approved: number };
  listings: { total: number; active: number; draft: number; failed: number };
  orders: { total: number; active: number; completed: number };
  alerts: { open: number; critical: number };
  profit: { totalRevenueCLP: number; totalRevenueUsd: number; totalProfitUsd: number; listingsActive: number };
}

interface Readiness {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail?: string }>;
}

function clpFormat(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function StatCard({ label, value, sub, to, warn }: { label: string; value: string | number; sub?: string; to?: string; warn?: boolean }) {
  const inner = (
    <div className={`rounded-xl border p-4 space-y-1 ${warn ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function CjMlChileOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/cj-ml-chile/overview'),
      api.get('/api/cj-ml-chile/system-readiness'),
    ]).then(([ovRes, rdRes]) => {
      setOverview(ovRes.data);
      setReadiness(rdRes.data);
    }).catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-slate-500">Cargando overview…</div>;
  if (error) return <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>;

  const rd = readiness?.checks ?? {};
  const allReady = readiness?.ok;

  return (
    <div className="space-y-6">
      {/* System readiness banner */}
      {!allReady && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Sistema no listo — revisa la configuración</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(rd).map(([key, v]) => (
              <span key={key} className={`px-2 py-0.5 rounded text-xs font-medium ${v.ok ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                {key}: {v.ok ? '✓' : '✗'} {v.detail ? `(${v.detail})` : ''}
              </span>
            ))}
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">Activa ENABLE_CJ_ML_CHILE_MODULE=true y conecta tus credenciales CJ y ML.</p>
        </div>
      )}

      {/* Stats grid */}
      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Productos" value={overview.products.total} sub={`${overview.products.approved} aprobados`} to="/cj-ml-chile/products" />
            <StatCard label="Listings activos" value={overview.listings.active} sub={`${overview.listings.draft} borradores`} to="/cj-ml-chile/listings" />
            <StatCard label="Órdenes completadas" value={overview.orders.completed} sub={`${overview.orders.active} en progreso`} to="/cj-ml-chile/orders" />
            <StatCard label="Alertas abiertas" value={overview.alerts.open} to="/cj-ml-chile/alerts" warn={overview.alerts.open > 0} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Revenue total (CLP)" value={clpFormat(overview.profit.totalRevenueCLP)} />
            <StatCard label="Revenue total (USD)" value={`$${overview.profit.totalRevenueUsd.toFixed(2)}`} />
            <StatCard label="Profit neto (USD)" value={`$${overview.profit.totalProfitUsd.toFixed(2)}`} />
          </div>
        </>
      )}

      {/* Next steps */}
      {allReady && overview && overview.listings.total === 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Próximo paso</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Ve a <Link to="/cj-ml-chile/products" className="underline font-medium">Products</Link> para buscar y evaluar productos CJ con warehouse Chile.
          </p>
        </div>
      )}
    </div>
  );
}
