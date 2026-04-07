import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, Trash2, Search } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { API_BASE_URL } from '../config/runtime';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace' | 'all';

interface LogEntry {
  timestamp: string; // ISO string
  level: Exclude<LogLevel, 'all'> | string;
  module?: string;
  message: string;
  raw?: string; // original payload
}

export default function SystemLogs() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LogLevel>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const boxRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    try {
      const base = API_BASE_URL;
      const es = new EventSource(`${base}/api/logs/stream`, { withCredentials: true } as any);
      esRef.current = es;
      es.onopen = () => { setConnected(true); setError(null); };
      es.onerror = () => setError('El stream aún no está disponible');
      es.onmessage = (ev) => {
        if (paused) return;
        const payload = ev.data;
        let entry: LogEntry | null = null;
        try {
          const obj = JSON.parse(payload);
          entry = {
            timestamp: obj.timestamp || new Date().toISOString(),
            level: (obj.level || 'info').toLowerCase(),
            module: obj.module,
            message: obj.message || payload,
            raw: payload,
          };
        } catch {
          // Fallback: parse plain text "[2025-11-05T12:00:00Z] [INFO] [module] message" o texto libre
          const tsMatch = payload.match(/\[(.*?)\]/);
          const lvlMatch = payload.match(/\[(debug|info|warn|error|trace)\]/i);
          const modMatch = payload.match(/\[(?!.*\])(.*)\]/); // última sección entre []
          entry = {
            timestamp: tsMatch?.[1] || new Date().toISOString(),
            level: (lvlMatch?.[1] || 'info').toLowerCase(),
            module: modMatch?.[1] && lvlMatch ? modMatch[1] : undefined,
            message: payload,
            raw: payload,
          };
        }
        setLogs((prev) => {
          const next = [entry!, ...prev];
          return next.slice(0, 5000); // cap buffer
        });
      };
      return () => { es.close(); esRef.current = null; };
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }, [paused]);

  // Auto-scroll when new logs arrive (only when not paused)
  useEffect(() => {
    if (paused) return;
    const el = boxRef.current;
    if (!el) return;
    el.scrollTo({ top: 0 }); // lista invertida (mostramos recientes arriba)
  }, [logs, paused]);

  // Derived filters
  const modules = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => l.module && set.add(l.module));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (level !== 'all' && l.level.toLowerCase() !== level) return false;
      if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
      if (startDate && new Date(l.timestamp) < startDate) return false;
      if (endDate && new Date(l.timestamp) > endDate) return false;
      if (search) {
        const s = search.toLowerCase();
        const text = `${l.timestamp} ${l.level} ${l.module || ''} ${l.message}`.toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });
  }, [logs, level, moduleFilter, startDate, endDate, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearLogs = () => {
    setLogs([]);
    setCurrentPage(1);
  };

  const toggleStream = () => setPaused(p => !p);

  const exportCsv = () => {
    const rows = [['timestamp','level','module','message']]
      .concat(filtered.map(l => [l.timestamp, String(l.level || ''), String(l.module || ''), l.message.replace(/\n/g, ' ')]));
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Registros del sistema</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Stream en vivo, filtros y exportación</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStream}
            className={`px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-2 ${paused ? 'bg-yellow-50 border-yellow-300 dark:border-yellow-700' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50 dark:bg-slate-900/50'}`}
            title={paused ? 'Reanudar stream' : 'Pausar stream'}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button
            onClick={clearLogs}
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/50 dark:bg-slate-900/50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Limpiar
          </button>
          <button
            onClick={exportCsv}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 text-sm">
        <span className={`px-2 py-1 rounded ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {connected ? 'Conectado' : 'Desconectado'}
        </span>
        <span className="text-slate-600 dark:text-slate-400">{filtered.length} coincidencias</span>
        {error && <span className="text-red-600">{error}</span>}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar en mensaje/módulo..."
              className="w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={level}
            onChange={(e) => { setLevel(e.target.value as LogLevel); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos los niveles</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="trace">Trace</option>
          </select>
          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos los módulos</option>
            {modules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div>
            <DatePicker value={startDate} onChange={(d) => { setStartDate(d); setCurrentPage(1); }} />
          </div>
          <div>
            <DatePicker value={endDate} onChange={(d) => { setEndDate(d); setCurrentPage(1); }} />
          </div>
        </div>
      </div>

      {/* Logs list (most recent first) */}
      <div ref={boxRef} className="h-96 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-0">
        {pageItems.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">Sin registros</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Marca de tiempo</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nivel</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Módulo</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      l.level === 'error' ? 'bg-red-100 text-red-700' :
                      l.level === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                      l.level === 'debug' ? 'bg-purple-100 text-purple-700' :
                      l.level === 'trace' ? 'bg-slate-100 text-slate-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{l.level}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.module || '-'}</td>
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    <div className="whitespace-pre-wrap break-words">{l.message}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card px-4 py-3">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length} registros
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-50">Primera</button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-50">Anterior</button>
            <span className="px-3 py-1 text-slate-700 dark:text-slate-300">Página {currentPage} de {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-50">Siguiente</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 border border-slate-200 dark:border-slate-700 rounded disabled:opacity-50">Última</button>
          </div>
        </div>
      )}
    </div>
  );
}
