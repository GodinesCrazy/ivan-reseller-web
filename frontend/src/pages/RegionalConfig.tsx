import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function RegionalConfig() {
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/automation/config');
        setCfg(data?.data?.config);
      } catch {}
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Regional Configuration</h1>
      <p className="text-gray-600 mb-4">Currencies, taxes and shipping presets by country/marketplace.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-500">Mode</div>
          <div className="text-lg">{cfg?.mode ?? '—'}</div>
        </div>
        <div className="p-4 border rounded bg-white">
          <div className="text-sm text-gray-500">Environment</div>
          <div className="text-lg">{cfg?.environment ?? '—'}</div>
        </div>
      </div>
    </div>
  );
}
