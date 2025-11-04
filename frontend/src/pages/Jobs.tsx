import { useEffect, useState } from 'react';
import { api } from '../services/api';

type JobItem = {
  id: string;
  name: string;
  state: string;
  progress: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  data: any;
  failedReason?: string;
};

export default function JobsPage() {
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const { data } = await api.get('/api/jobs/publishing/recent');
      setItems(data?.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Jobs</h1>
      <p className="text-gray-600 mb-4">Recent publishing jobs and progress.</p>
      <div className="bg-white border rounded overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Job ID</th>
              <th className="text-left p-3">State</th>
              <th className="text-left p-3">Progress</th>
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">Marketplaces</th>
              <th className="text-left p-3">Started</th>
              <th className="text-left p-3">Finished</th>
            </tr>
          </thead>
          <tbody>
            {items.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-3 font-mono">{j.id}</td>
                <td className="p-3 capitalize">{j.state}</td>
                <td className="p-3">
                  <div className="w-40 h-2 bg-gray-100 rounded">
                    <div className="h-full bg-primary-500" style={{ width: `${Number(j.progress)||0}%` }} />
                  </div>
                </td>
                <td className="p-3">{j.data?.productId}</td>
                <td className="p-3">{Array.isArray(j.data?.marketplaces) ? j.data.marketplaces.join(', ') : ''}</td>
                <td className="p-3">{j.processedOn ? new Date(j.processedOn).toLocaleTimeString() : '-'}</td>
                <td className="p-3">{j.finishedOn ? new Date(j.finishedOn).toLocaleTimeString() : '-'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td className="p-3 text-gray-600" colSpan={7}>No recent jobs.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

