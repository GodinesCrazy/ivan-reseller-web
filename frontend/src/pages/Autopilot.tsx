import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Autopilot() {
  const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle');
  const [message, setMessage] = useState<string>('');
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/automation/config');
        setConfig(data?.data);
      } catch (e: any) {
        setMessage(`Config error: ${e.message || e}`);
      }
    })();
  }, []);

  async function triggerOnce() {
    try {
      setStatus('running');
      setMessage('Searching opportunities (one-time)...');
      await api.post('/api/automation/opportunities/search', {
        query: 'organizador cocina',
        filters: { minProfitMargin: 15 }
      });
      setMessage('Search completed. Check notifications for results.');
      setStatus('stopped');
    } catch (e: any) {
      setMessage(`Error: ${e.message || e}`);
      setStatus('stopped');
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Autopilot</h1>
      <p className="text-gray-600 mb-4">Configure and run automated workflows (search, analyze, publish).</p>
      <div className="flex gap-2 mb-4">
        <button onClick={triggerOnce} className="px-4 py-2 bg-primary-600 text-white rounded">Run Once</button>
        <button onClick={async()=>{ await api.post('/api/automation/autopilot/start'); setMessage('Autopilot started'); }} className="px-4 py-2 bg-green-600 text-white rounded">Start</button>
        <button onClick={async()=>{ await api.post('/api/automation/autopilot/stop'); setMessage('Autopilot stopped'); }} className="px-4 py-2 bg-red-600 text-white rounded">Stop</button>
      </div>
      <div className="text-sm text-gray-700">Status: <span className="font-medium">{status}</span></div>
      {config && (
        <div className="mt-3 text-sm text-gray-700">
          <div>Mode: <span className="font-medium">{config?.config?.mode}</span></div>
          <div>Environment: <span className="font-medium">{config?.config?.environment}</span></div>
        </div>
      )}
      {message && <div className="mt-2 text-sm text-gray-700">{message}</div>}
    </div>
  );
}
