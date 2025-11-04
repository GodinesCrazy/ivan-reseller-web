import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function FlexibleDropshipping() {
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/automation/rules');
        setRules(data?.data?.rules || []);
      } catch {}
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Flexible Dropshipping</h1>
      <p className="text-gray-600 mb-4">Multi-supplier, multi-marketplace strategy controls.</p>
      <div className="mb-2 text-sm text-gray-700">Active rules: {rules.filter(r => r.active).length} / {rules.length}</div>
      <ul className="list-disc ml-6 text-gray-700">
        {rules.slice(0, 10).map((r, i) => (
          <li key={i}>{r.name || r.id || 'Unnamed rule'}</li>
        ))}
      </ul>
    </div>
  );
}
