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

export default function CjEbayOverviewPage() {
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ ok: boolean; counts: OverviewCounts; note?: string }>(
          '/api/cj-ebay/overview'
        );
        if (!cancelled && res.data?.ok && res.data.counts) {
          setCounts(res.data.counts);
        }
      } catch (e: unknown) {
        let msg = 'No se pudo cargar el resumen.';
        if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
          const err = (e.response.data as { error?: string }).error;
          if (err === 'CJ_EBAY_MODULE_DISABLED') {
            msg = 'Módulo desactivado en el servidor (ENABLE_CJ_EBAY_MODULE).';
          } else if (e.response.status === 404) {
            msg = 'Ruta no disponible (¿migración Prisma aplicada y flag del servidor activo?).';
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
    return <p className="text-sm text-slate-500">Cargando resumen desde la API…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        {error}
      </div>
    );
  }
  if (!counts) {
    return <p className="text-sm text-slate-500">Sin datos.</p>;
  }

  const items: Array<{ label: string; value: number }> = [
    { label: 'Productos CJ (snapshots)', value: counts.products },
    { label: 'Variantes', value: counts.variants },
    { label: 'Evaluaciones', value: counts.evaluations },
    { label: 'Aprobadas', value: counts.evaluationsApproved },
    { label: 'Rechazadas', value: counts.evaluationsRejected },
    { label: 'Pendientes', value: counts.evaluationsPending },
    { label: 'Cotizaciones envío guardadas', value: counts.shippingQuotes },
    { label: 'Listings', value: counts.listings },
    { label: 'Listings activos', value: counts.listingsActive },
    { label: 'Órdenes (vertical)', value: counts.orders },
    { label: 'Órdenes abiertas', value: counts.ordersOpen },
    { label: 'Con tracking', value: counts.ordersWithTracking },
    { label: 'Alertas abiertas', value: counts.alertsOpen },
    { label: 'Snapshots profit', value: counts.profitSnapshots },
    { label: 'Trazas (24h)', value: counts.tracesLast24h },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Cifras reales desde tablas <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">cj_ebay_*</code>
        (FASE 3C añade pending y cotizaciones de envío).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ label, value }) => (
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
    </div>
  );
}
