import { useEffect, useState } from 'react';
import { api } from '@/services/api';

interface Snapshot { date: string; revenueCLP: number; revenueUsd: number; profitUsd: number; fxRate: number | null; }
interface Summary {
  totalRevenueCLP: number;
  totalRevenueUsd: number;
  totalProfitUsd: number;
  listingsActive: number;
  fxRateCLPperUSD: number | null;
  snapshots: Snapshot[];
}

function clpFormat(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export default function CjMlChileProfitPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fxData, setFxData] = useState<{ rate: number; timestamp: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/cj-ml-chile/profit'),
      api.get('/api/cj-ml-chile/fx/rate'),
    ]).then(([pr, fr]) => {
      setData(pr.data);
      setFxData({ rate: fr.data.rate, timestamp: fr.data.timestamp });
    }).catch((e) => setError(e?.response?.data?.message ?? e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-slate-500">Cargando datos financieros…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* FX rate banner */}
      {fxData && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Tasa FX actual:</span>
          <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">1 USD = {fxData.rate.toFixed(0)} CLP</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">{new Date(fxData.timestamp).toLocaleTimeString('es-CL')}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Revenue total (CLP)', value: clpFormat(data.totalRevenueCLP) },
          { label: 'Revenue total (USD)', value: `$${data.totalRevenueUsd.toFixed(2)}` },
          { label: 'Profit neto (USD)', value: `$${data.totalProfitUsd.toFixed(2)}` },
          { label: 'Listings activos', value: data.listingsActive },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Nota */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700 dark:text-slate-300">Notas del modelo financiero</p>
        <p>• IVA 19%: incluido en el costo aterrizado (producto + envío). Real según régimen de importaciones de bajo valor Chile.</p>
        <p>• Fee ML: {12}% estándar sobre precio venta (variable por categoría — actualizar en Configuración).</p>
        <p>• Fee Mercado Pago: {5.18}% sobre precio venta.</p>
        <p>• FX: tasa obtenida de servicio externo con TTL 1h. Se persiste junto con cada evaluación y draft.</p>
        <p>• Los profits reflejan órdenes COMPLETED + snapshots guardados manualmente.</p>
      </div>

      {/* Snapshots table */}
      {data.snapshots.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {['Fecha', 'Revenue CLP', 'Revenue USD', 'Profit USD', 'FX'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.snapshots.map((s) => (
                <tr key={s.date} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400">{new Date(s.date).toLocaleDateString('es-CL')}</td>
                  <td className="px-4 py-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">{clpFormat(s.revenueCLP)}</td>
                  <td className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300">${s.revenueUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300">${s.profitUsd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{s.fxRate ? s.fxRate.toFixed(0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.snapshots.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Sin snapshots de profit aún.</div>
      )}
    </div>
  );
}
