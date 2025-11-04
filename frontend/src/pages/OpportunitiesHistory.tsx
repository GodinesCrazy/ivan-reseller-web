import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

interface OpportunityRow {
  id: number;
  title: string;
  sourceMarketplace: string;
  costUsd: number;
  suggestedPriceUsd: number;
  profitMargin: number;
  status: string;
  createdAt: string;
}

export default function OpportunitiesHistory() {
  const [items, setItems] = useState<OpportunityRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function load(p = 1) {
    setLoading(true);
    try {
      const { data } = await api.get('/opportunities/list', { params: { page: p, limit: 20 } });
      setItems(data.items || []);
      setCount(data.count || 0);
      setPage(data.page || p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  const pages = Math.max(1, Math.ceil(count / 20));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Opportunities History</h1>
        <div className="text-sm text-gray-600">{count} total</div>
      </div>
      <div className="overflow-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Title</th>
              <th className="text-center p-3">Source</th>
              <th className="text-right p-3">Cost</th>
              <th className="text-right p-3">Suggested</th>
              <th className="text-right p-3">Margin%</th>
              <th className="text-center p-3">Status</th>
              <th className="text-center p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-3">{it.title}</td>
                <td className="p-3 text-center">{it.sourceMarketplace}</td>
                <td className="p-3 text-right">${it.costUsd.toFixed(2)}</td>
                <td className="p-3 text-right">${it.suggestedPriceUsd.toFixed(2)}</td>
                <td className="p-3 text-right">{Math.round(it.profitMargin * 100)}%</td>
                <td className="p-3 text-center">{it.status}</td>
                <td className="p-3 text-center">
                  <Link to={`/opportunities/${it.id}`} className="text-primary-600 underline">View</Link>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td className="p-6 text-center text-gray-500" colSpan={7}>No saved opportunities yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button disabled={page<=1} onClick={() => load(page-1)} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
        <div className="text-sm">Page {page} / {pages}</div>
        <button disabled={page>=pages} onClick={() => load(page+1)} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

