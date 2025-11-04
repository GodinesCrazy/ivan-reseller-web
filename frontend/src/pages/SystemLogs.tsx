import { useEffect, useRef, useState } from 'react';

export default function SystemLogs() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
      const es = new EventSource(`${base}/api/logs/stream`, { withCredentials: true } as any);
      es.onopen = () => setConnected(true);
      es.onerror = () => setError('Stream not available yet');
      es.onmessage = (ev) => {
        const div = document.createElement('div');
        div.className = 'text-xs text-gray-800';
        div.textContent = ev.data;
        boxRef.current?.appendChild(div);
        boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
      };
      return () => es.close();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">System Logs</h1>
      <p className="text-gray-600 mb-4">Live log stream (SSE). If empty, backend SSE route is pending.</p>
      <div className="mb-2 text-sm text-gray-700">Status: {connected ? 'connected' : 'disconnected'}{error ? ` — ${error}` : ''}</div>
      <div ref={boxRef} className="h-80 overflow-auto border rounded bg-white p-2"></div>
    </div>
  );
}
