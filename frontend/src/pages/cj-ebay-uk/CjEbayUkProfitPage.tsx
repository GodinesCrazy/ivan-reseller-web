import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type ProfitSummary = {
  totalRevenueGbp: number;
  totalProfitGbp: number;
  totalCompletedOrders: number;
  activeOrders: number;
  blockedOrders: number;
  marginNote: string;
};

export default function CjEbayUkProfitPage() {
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ ok: boolean; summary: ProfitSummary }>('/api/cj-ebay-uk/profit')
      .then((r) => { if (r.data?.ok) setSummary(r.data.summary); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando profit UK…</p>;
  if (!summary) return <p className="text-sm text-slate-500">Sin datos de profit.</p>;

  const items = [
    { label: 'Est. Revenue (GBP)', value: `£${summary.totalRevenueGbp.toFixed(2)}` },
    { label: 'Est. Profit (GBP)', value: `£${summary.totalProfitGbp.toFixed(2)}` },
    { label: 'Completed Orders', value: String(summary.totalCompletedOrders) },
    { label: 'Active Orders', value: String(summary.activeOrders) },
    { label: 'Payment Blocked', value: String(summary.blockedOrders), warn: summary.blockedOrders > 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map(({ label, value, warn }) => (
          <div
            key={label}
            className={`rounded-lg border p-3 text-center ${
              warn ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}
          >
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> {summary.marginNote}
        </p>
      </div>
    </div>
  );
}
