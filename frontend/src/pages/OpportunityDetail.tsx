import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

export default function OpportunityDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/opportunities/${id}`);
        setItem(data.item);
        setSnapshots(data.snapshots || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!item) return <div className="p-6">Not found</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Opportunity #{item.id}</h1>
      <div className="bg-white border rounded p-4">
        <div className="font-medium text-lg">{item.title}</div>
        <div className="text-sm text-gray-600">Source: {item.sourceMarketplace}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Stat label="Cost (USD)" value={`$${item.costUsd.toFixed(2)}`} />
          <Stat label="Suggested (USD)" value={`$${item.suggestedPriceUsd.toFixed(2)}`} />
          <Stat label="Margin %" value={`${Math.round(item.profitMargin*100)}%`} />
          <Stat label="ROI %" value={`${Math.round(item.roiPercentage)}%`} />
        </div>
      </div>
      <div className="bg-white border rounded p-4">
        <div className="font-medium mb-2">Competition Snapshots</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Marketplace</th>
                <th className="text-left p-2">Region</th>
                <th className="text-right p-2">Listings</th>
                <th className="text-right p-2">Avg</th>
                <th className="text-right p-2">Median</th>
                <th className="text-right p-2">Competitive</th>
                <th className="text-left p-2">When</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{s.marketplace}</td>
                  <td className="p-2">{s.region}</td>
                  <td className="p-2 text-right">{s.listingsFound}</td>
                  <td className="p-2 text-right">{s.averagePrice.toFixed(2)}</td>
                  <td className="p-2 text-right">{s.medianPrice.toFixed(2)}</td>
                  <td className="p-2 text-right">{s.competitivePrice.toFixed(2)}</td>
                  <td className="p-2">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr><td className="p-4 text-center text-gray-500" colSpan={7}>No snapshots saved</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border rounded">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

