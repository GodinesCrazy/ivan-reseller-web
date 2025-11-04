import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function FinanceDashboard() {
  const [revenue, setRevenue] = useState(0);
  const [profit, setProfit] = useState(0);
  const [pendingPayouts, setPendingPayouts] = useState(0);

  useEffect(() => {
    (async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      try {
        const { data } = await api.get('/reports/sales', {
          params: { startDate: start.toISOString(), endDate: end.toISOString(), format: 'json' }
        });
        const items = data?.data || [];
        setRevenue(items.reduce((s: number, it: any) => s + (it.salePrice || 0), 0));
        setProfit(items.reduce((s: number, it: any) => s + (it.profit || 0), 0));
      } catch {}
      try {
        const { data } = await api.get('/commissions', { params: { status: 'PENDING' } });
        const list = data?.commissions || [];
        setPendingPayouts(list.reduce((s: number, c: any) => s + (c.amount || 0), 0));
      } catch {}
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Finance</h1>
      <p className="text-gray-600 mb-4">Consolidated KPIs of sales, commissions, payouts and balances.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-500">Total Revenue (30d)</div>
          <div className="text-2xl font-semibold">${revenue.toFixed(2)}</div>
        </div>
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-500">Total Profit (30d)</div>
          <div className="text-2xl font-semibold">${profit.toFixed(2)}</div>
        </div>
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-500">Pending Payouts</div>
          <div className="text-2xl font-semibold">${pendingPayouts.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
