import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Check = { name: string; ok: boolean; hint?: string };
type Overview = { products: number; listings: Array<{ status: string; _count: number }>; orders: Array<{ status: string; _count: number }>; openAlerts: number };

export default function TopDawgShopifyUsaOverviewPage() {
  const [readiness, setReadiness] = useState<{ ready: boolean; checks: Check[] } | null>(null);
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/topdawg-shopify-usa/system-readiness').then(r => setReadiness(r.data)),
      api.get('/api/topdawg-shopify-usa/overview').then(r => setOverview(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando…</p>;

  const activeListings = overview?.listings.find(l => l.status === 'ACTIVE')?._count ?? 0;
  const draftListings  = overview?.listings.find(l => l.status === 'DRAFT')?._count ?? 0;
  const openOrders     = overview?.orders.filter(o => !['COMPLETED','FAILED'].includes(o.status)).reduce((s,o) => s + o._count, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Readiness */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">System Readiness</h2>
        {readiness?.checks.map(c => (
          <div key={c.name} className="flex items-center gap-3 text-sm">
            <span className={c.ok ? 'text-emerald-500' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
            <span className="text-slate-700 dark:text-slate-300">{c.name}</span>
            {!c.ok && c.hint && <span className="text-slate-400 text-xs">— {c.hint}</span>}
          </div>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Productos importados', value: overview?.products ?? 0, color: 'text-orange-600' },
          { label: 'Publicados en Shopify', value: activeListings, color: 'text-emerald-600' },
          { label: 'Drafts',                value: draftListings,  color: 'text-amber-600' },
          { label: 'Órdenes activas',       value: openOrders,     color: 'text-blue-600' },
          { label: 'Alertas abiertas',      value: overview?.openAlerts ?? 0, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* USA Warehouse banner */}
      <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4">
        <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">🚀 TopDawg — US Warehouse Advantage</p>
        <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
          Los productos TopDawg se envían desde bodegas en USA → entrega en 3-7 días hábiles.
          Ventaja competitiva frente a proveedores chinos con 10-20 días de espera.
        </p>
      </div>
    </div>
  );
}
