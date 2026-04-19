import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';

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

export default function CjEbayUkOverviewPage() {
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ ok: boolean; counts: OverviewCounts }>('/api/cj-ebay-uk/overview');
        if (!cancelled && res.data?.ok && res.data.counts) setCounts(res.data.counts);
      } catch (e: unknown) {
        let msg = 'No se pudo cargar el resumen.';
        if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
          const err = (e.response.data as { error?: string }).error;
          if (err === 'CJ_EBAY_UK_MODULE_DISABLED') msg = 'Módulo UK desactivado (ENABLE_CJ_EBAY_UK_MODULE).';
          else if (e.response.status === 404) msg = 'Ruta UK no disponible — ¿migraciones aplicadas y flag activo?';
        } else if (e instanceof Error) msg = e.message;
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando resumen UK…</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {error}
      </div>
    );
  }
  if (!counts) return <p className="text-sm text-slate-500">Sin datos.</p>;

  const items: Array<{ label: string; value: number; highlight?: boolean }> = [
    { label: 'Productos CJ (snapshots)', value: counts.products },
    { label: 'Variantes', value: counts.variants },
    { label: 'Evaluaciones', value: counts.evaluations },
    { label: 'Aprobadas', value: counts.evaluationsApproved, highlight: true },
    { label: 'Rechazadas', value: counts.evaluationsRejected },
    { label: 'Pendientes', value: counts.evaluationsPending },
    { label: 'Shipping quotes (GB)', value: counts.shippingQuotes },
    { label: 'Listings total', value: counts.listings },
    { label: 'Listings ACTIVE (eBay UK)', value: counts.listingsActive, highlight: true },
    { label: 'Órdenes total', value: counts.orders },
    { label: 'Órdenes abiertas', value: counts.ordersOpen, highlight: counts.ordersOpen > 0 },
    { label: 'Órdenes con tracking', value: counts.ordersWithTracking },
    { label: 'Alertas abiertas', value: counts.alertsOpen, highlight: counts.alertsOpen > 0 },
    { label: 'Profit snapshots', value: counts.profitSnapshots },
    { label: 'Trazas (24h)', value: counts.tracesLast24h },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          🇬🇧 CJ → eBay UK — Destination: United Kingdom · Currency: GBP · VAT: 20% marketplace-facilitated
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
          eBay UK siteId=3 (ebay.co.uk) · UK warehouse probing: startCountryCode=GB · Orders ≤ £135: eBay collects VAT from buyer
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`rounded-lg border p-3 text-center ${
              highlight && value > 0
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
