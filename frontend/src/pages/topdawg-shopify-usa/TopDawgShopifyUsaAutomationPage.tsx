import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';

type AutoState  = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';
type AutoConfig = { intervalHours: number; maxDailyPublish: number; maxPerCycle: number; minMarginPct: number; autoPublish: boolean };
type CycleResult = { startedAt: string; completedAt: string | null; discovered: number; approved: number; published: number; failed: number; events: string[] };
type Status = { state: AutoState; config: AutoConfig; currentCycle: CycleResult | null; cycleHistory: CycleResult[]; dailyPublishCount: number };

const STATE_COLORS: Record<AutoState, string> = {
  IDLE:    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  RUNNING: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PAUSED:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ERROR:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export default function TopDawgShopifyUsaAutomationPage() {
  const [status, setStatus]   = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [cfg, setCfg]         = useState<AutoConfig | null>(null);
  const [msg, setMsg]         = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get('/api/topdawg-shopify-usa/automation/status');
    setStatus(res.data);
    if (!cfg) setCfg(res.data.config);
    setLoading(false);
  }, [cfg]);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  async function ctrl(action: string) {
    setBusy(true); setMsg(null);
    try { await api.post(`/api/topdawg-shopify-usa/automation/${action}`); await load(); }
    finally { setBusy(false); }
  }

  async function saveConfig() {
    if (!cfg) return;
    setBusy(true);
    try { await api.post('/api/topdawg-shopify-usa/automation/config', cfg); setMsg('Configuración guardada.'); }
    finally { setBusy(false); }
  }

  if (loading || !status) return <p className="text-sm text-slate-500">Cargando automatización…</p>;

  const s = status.state;

  return (
    <div className="space-y-6">
      {/* State + controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATE_COLORS[s]}`}>{s}</span>
          <span className="text-sm text-slate-500">Publicados hoy: <strong>{status.dailyPublishCount}</strong> / {status.config.maxDailyPublish}</span>
        </div>
        <div className="flex gap-2 ml-auto">
          {s === 'IDLE'   && <button onClick={() => void ctrl('start')}  disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">▶ Iniciar</button>}
          {s === 'RUNNING'&& <button onClick={() => void ctrl('pause')}  disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">⏸ Pausar</button>}
          {s === 'PAUSED' && <button onClick={() => void ctrl('resume')} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">▶ Reanudar</button>}
          {s !== 'IDLE'   && <button onClick={() => void ctrl('stop')}   disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">⏹ Detener</button>}
        </div>
      </div>

      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">{msg}</div>}

      {/* Current cycle */}
      {status.currentCycle && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4 space-y-2">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">Ciclo en curso</p>
          <div className="flex flex-wrap gap-4 text-xs text-orange-700 dark:text-orange-300">
            <span>Descubiertos: {status.currentCycle.discovered}</span>
            <span>Aprobados: {status.currentCycle.approved}</span>
            <span>Publicados: {status.currentCycle.published}</span>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs font-mono text-orange-700 dark:text-orange-400 space-y-0.5">
            {status.currentCycle.events.slice(-10).map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
      )}

      {/* Config */}
      {cfg && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Configuración de automatización</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Intervalo (horas)', key: 'intervalHours',   type: 'number' },
              { label: 'Máx publicados/día', key: 'maxDailyPublish', type: 'number' },
              { label: 'Máx por ciclo',      key: 'maxPerCycle',     type: 'number' },
              { label: 'Margen mínimo (%)',   key: 'minMarginPct',    type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                <input type={f.type} value={(cfg as Record<string, unknown>)[f.key] as number}
                  onChange={e => setCfg(prev => prev ? { ...prev, [f.key]: Number(e.target.value) } : prev)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="autoPublish" checked={cfg.autoPublish}
              onChange={e => setCfg(prev => prev ? { ...prev, autoPublish: e.target.checked } : prev)} />
            <label htmlFor="autoPublish" className="text-sm text-slate-600 dark:text-slate-400">Auto-publicar productos aprobados</label>
          </div>
          <button onClick={() => void saveConfig()} disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
            Guardar configuración
          </button>
        </div>
      )}

      {/* Cycle history */}
      {status.cycleHistory.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Historial de ciclos</h2>
          {status.cycleHistory.map((c, i) => (
            <div key={i} className="text-xs border border-slate-100 dark:border-slate-800 rounded-lg p-3 space-y-1">
              <div className="flex gap-4 text-slate-500">
                <span>{new Date(c.startedAt).toLocaleString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span>Desc: {c.discovered} · Apr: {c.approved} · Pub: {c.published} · Err: {c.failed}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
