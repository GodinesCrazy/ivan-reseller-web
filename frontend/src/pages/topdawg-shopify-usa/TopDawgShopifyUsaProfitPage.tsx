import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Snapshot = { id: number; date: string; revenueUsd: number; costUsd: number; feesUsd: number; profitUsd: number; orderCount: number };

export default function TopDawgShopifyUsaProfitPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    api.get('/api/topdawg-shopify-usa/profit').then(r => { setSnapshots(r.data.snapshots ?? []); setLoading(false); });
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando datos de profit…</p>;

  const totals = snapshots.reduce((acc, s) => ({
    revenue: acc.revenue + Number(s.revenueUsd),
    cost:    acc.cost    + Number(s.costUsd),
    fees:    acc.fees    + Number(s.feesUsd),
    profit:  acc.profit  + Number(s.profitUsd),
    orders:  acc.orders  + s.orderCount,
  }), { revenue: 0, cost: 0, fees: 0, profit: 0, orders: 0 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Revenue',  value: `$${totals.revenue.toFixed(2)}`,  color: 'text-emerald-600' },
          { label: 'Costo TD', value: `$${totals.cost.toFixed(2)}`,     color: 'text-red-500' },
          { label: 'Fees',     value: `$${totals.fees.toFixed(2)}`,     color: 'text-amber-500' },
          { label: 'Profit',   value: `$${totals.profit.toFixed(2)}`,   color: 'text-orange-600' },
          { label: 'Órdenes',  value: String(totals.orders),             color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {!snapshots.length && <p className="text-sm text-slate-400">Sin datos de profit aún. Los snapshots se generan automáticamente cuando se completan órdenes.</p>}

      {snapshots.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-xs font-medium text-slate-500 uppercase">
              <tr>
                {['Fecha','Revenue','Costo','Fees','Profit','Órdenes'].map(h => <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-500 text-xs">{new Date(s.date).toLocaleDateString('es-CL')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">${Number(s.revenueUsd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">${Number(s.costUsd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-500">${Number(s.feesUsd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-orange-600">${Number(s.profitUsd).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{s.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
