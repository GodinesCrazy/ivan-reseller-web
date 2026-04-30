import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────

type AutoState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR';

interface AutoConfig {
  intervalHours: number;
  maxDailyPublish: number;
  maxPerCycle: number;
  minMarginPct: number;
  autoPublish: boolean;
  enabled: boolean;
}

interface CycleEvent {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface CycleResult {
  cycleId: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  productsScanned: number;
  productsApproved: number;
  draftsCreated: number;
  published: number;
  skipped: number;
  errors: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  events: CycleEvent[];
}

interface StatusResponse {
  state: AutoState;
  config: AutoConfig;
  currentCycle: CycleResult | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  dailyPublishCount: number;
  cycleHistory: CycleResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function countdown(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const STATE_COLOR: Record<AutoState, string> = {
  IDLE:    'text-slate-400',
  RUNNING: 'text-emerald-400',
  PAUSED:  'text-amber-400',
  ERROR:   'text-red-400',
};

const STATE_RING: Record<AutoState, string> = {
  IDLE:    '#64748b',
  RUNNING: '#10b981',
  PAUSED:  '#f59e0b',
  ERROR:   '#ef4444',
};

const STATE_LABEL: Record<AutoState, string> = {
  IDLE:    'INACTIVO',
  RUNNING: 'EN EJECUCIÓN',
  PAUSED:  'PAUSADO',
  ERROR:   'ERROR',
};

const LOG_COLOR: Record<CycleEvent['level'], string> = {
  info:    'text-slate-400',
  success: 'text-emerald-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
};

const LOG_ICON: Record<CycleEvent['level'], string> = {
  info: '·', success: '✓', warn: '⚠', error: '✗',
};

// ── Animated Engine Ring ───────────────────────────────────────────────────

function EngineRing({ state, progress }: { state: AutoState; progress: number }) {
  const r = 72;
  const circ = 2 * Math.PI * r;
  const dash = (progress / 100) * circ;
  const color = STATE_RING[state];
  const pulse = state === 'RUNNING';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 200, height: 200 }}>
      {/* Outer glow */}
      {pulse && (
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ background: color, animationDuration: '2.5s' }}
        />
      )}

      {/* Background ring */}
      <svg width="200" height="200" className="absolute inset-0 -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
        {/* Progress arc */}
        <circle
          cx="100" cy="100" r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Secondary decorative ring */}
        <circle
          cx="100" cy="100" r={58}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeOpacity="0.2"
          strokeDasharray="8 6"
          className={pulse ? 'animate-spin' : ''}
          style={{ animationDuration: '12s' }}
        />
      </svg>

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-1 z-10">
        {/* Animated paw icon */}
        <svg width="36" height="36" viewBox="0 0 38 38" fill="none">
          <rect width="38" height="38" rx="10" fill={color} opacity={pulse ? undefined : '0.5'} className={pulse ? 'animate-pulse' : ''} />
          <ellipse cx="11.5" cy="14" rx="3.2" ry="3.6" fill="white" opacity="0.9" />
          <ellipse cx="19" cy="11.5" rx="3.6" ry="4" fill="white" opacity="0.9" />
          <ellipse cx="26.5" cy="14" rx="3.2" ry="3.6" fill="white" opacity="0.9" />
          <path d="M10 23.5C10 19.63 13.13 16.5 17 16.5H21C24.87 16.5 28 19.63 28 23.5C28 25.98 25.98 28 23.5 28H14.5C12.02 28 10 25.98 10 23.5Z" fill="white" opacity="0.9" />
        </svg>
        <span className="text-xs font-bold tracking-widest" style={{ color }}>{STATE_LABEL[state]}</span>
        <span className="text-2xl font-black text-white">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-4 flex flex-col gap-1">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-black ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Cycle Log ─────────────────────────────────────────────────────────────

function CycleLog({ events }: { events: CycleEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [events.length]);

  return (
    <div
      ref={ref}
      className="h-48 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs space-y-0.5"
    >
      {events.length === 0 ? (
        <p className="text-slate-600">No hay eventos. Inicia un ciclo para ver el log en tiempo real.</p>
      ) : (
        events.map((ev, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span className="text-slate-600 flex-shrink-0">{new Date(ev.ts).toLocaleTimeString()}</span>
            <span className={`flex-shrink-0 ${LOG_COLOR[ev.level]}`}>{LOG_ICON[ev.level]}</span>
            <span className={LOG_COLOR[ev.level]}>{ev.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── History Row ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<CycleResult['status'], string> = {
  RUNNING:   'bg-emerald-500/20 text-emerald-300',
  COMPLETED: 'bg-slate-700 text-slate-300',
  FAILED:    'bg-red-500/20 text-red-300',
  ABORTED:   'bg-amber-500/20 text-amber-300',
};

function HistoryRow({ c }: { c: CycleResult }) {
  return (
    <div className="flex items-center gap-3 text-xs border-t border-slate-800/60 pt-2">
      <span className={`rounded px-1.5 py-0.5 font-semibold text-[10px] ${STATUS_BADGE[c.status]}`}>
        {c.status}
      </span>
      <span className="text-slate-500">{fmt(c.startedAt)}</span>
      <span className="text-slate-400">
        {c.published} publicados · {c.draftsCreated} drafts · {c.errors} errores
      </span>
      <span className="ml-auto text-slate-600">{fmtDuration(c.duration)}</span>
    </div>
  );
}

// ── Config Panel ───────────────────────────────────────────────────────────

function ConfigPanel({ config, onChange, onSave }: {
  config: AutoConfig;
  onChange: (patch: Partial<AutoConfig>) => void;
  onSave: () => void;
}) {
  const inp = 'w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-5 space-y-4">
      <h3 className="text-sm font-bold text-slate-200 tracking-wide">⚙ Configuración del Ciclo</h3>

      <div className="grid grid-cols-2 gap-4">
        <label>
          <span className={lbl}>Intervalo (horas)</span>
          <input type="number" min={1} max={24} className={inp}
            value={config.intervalHours}
            onChange={(e) => onChange({ intervalHours: Number(e.target.value) })} />
        </label>
        <label>
          <span className={lbl}>Máx. diario</span>
          <input type="number" min={1} max={500} className={inp}
            value={config.maxDailyPublish}
            onChange={(e) => onChange({ maxDailyPublish: Number(e.target.value) })} />
        </label>
        <label>
          <span className={lbl}>Máx. por ciclo</span>
          <input type="number" min={1} max={100} className={inp}
            value={config.maxPerCycle}
            onChange={(e) => onChange({ maxPerCycle: Number(e.target.value) })} />
        </label>
        <label>
          <span className={lbl}>Margen mín. (%)</span>
          <input type="number" min={0} max={100} step={0.1} className={inp}
            value={config.minMarginPct}
            onChange={(e) => onChange({ minMarginPct: Number(e.target.value) })} />
        </label>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={() => {
            if (!config.autoPublish) {
              const confirmed = window.confirm(
                '⚠️ ¿Activar auto-publicación?\n\nTodos los productos aprobados en cada ciclo se publicarán DIRECTAMENTE en Shopify sin revisión manual.\n\nAsegúrate de que el margen mínimo y filtros estén configurados correctamente antes de activar.'
              );
              if (!confirmed) return;
            }
            onChange({ autoPublish: !config.autoPublish });
          }}
          className={`relative w-10 h-5 rounded-full transition-colors ${config.autoPublish ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.autoPublish ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-sm text-slate-300">
          Auto-publicar (si OFF → solo crea drafts)
          {config.autoPublish && <span className="ml-2 text-xs bg-amber-500/20 text-amber-300 rounded px-1.5 py-0.5">ACTIVO — publica sin revisión</span>}
        </span>
      </label>

      <button
        type="button"
        onClick={onSave}
        className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-2 transition"
      >
        Guardar configuración
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CjShopifyUsaAutomationPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [localConfig, setLocalConfig] = useState<AutoConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [countdown_, setCountdown] = useState('—');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<StatusResponse>('/api/cj-shopify-usa/automation/status');
      setStatus(res.data);
      if (!localConfig) setLocalConfig(res.data.config);
    } catch { /* ignore */ }
  }, [localConfig]);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => void load(), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // Countdown ticker
  useEffect(() => {
    const t = setInterval(() => setCountdown(countdown(status?.nextRunAt ?? null)), 1000);
    return () => clearInterval(t);
  }, [status?.nextRunAt]);

  async function call(endpoint: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<StatusResponse>(`/api/cj-shopify-usa/automation/${endpoint}`);
      setStatus(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setMsg(err?.response?.data?.message ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    if (!localConfig) return;
    setBusy(true);
    try {
      await api.post('/api/cj-shopify-usa/automation/config', localConfig);
      setMsg('Configuración guardada.');
      await load();
    } catch { setMsg('Error al guardar.'); }
    finally { setBusy(false); }
  }

  const state: AutoState = status?.state ?? 'IDLE';
  const cycle = status?.currentCycle;

  // Progress: for running cycle estimate based on elapsed vs expected
  let progress = 0;
  if (cycle?.status === 'RUNNING' && cycle.productsApproved > 0) {
    progress = Math.min(99, ((cycle.published + cycle.errors + cycle.skipped) / cycle.productsApproved) * 100);
  } else if (cycle?.status === 'COMPLETED') {
    progress = 100;
  }

  const history = status?.cycleHistory ?? [];
  const lastCycle = history[history.length - 1];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight">
            <span className="text-emerald-400">⚡</span> Automatización CJ → Shopify
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ciclo autónomo de descubrimiento, evaluación y publicación de productos pet
          </p>
        </div>
        {msg && (
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300">
            {msg}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

        {/* LEFT — Engine + controls */}
        <div className="space-y-5">

          {/* Engine card */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-6">
            <div className="flex items-center gap-8 flex-wrap">

              {/* Ring */}
              <div className="flex-shrink-0">
                <EngineRing state={state} progress={progress} />
              </div>

              {/* Cycle info */}
              <div className="flex-1 space-y-4 min-w-[200px]">
                {/* Timer */}
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Próximo ciclo en</p>
                  <p className={`text-4xl font-black tabular-nums ${state === 'RUNNING' ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {state === 'RUNNING' ? countdown_ : '—'}
                  </p>
                </div>

                {/* Last / Next */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500 mb-0.5">Último ciclo</p>
                    <p className="text-slate-300 font-mono">{fmt(status?.lastRunAt ?? null)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Intervalo</p>
                    <p className="text-slate-300 font-mono">{status?.config.intervalHours ?? '—'}h</p>
                  </div>
                </div>

                {/* Control buttons */}
                <div className="flex gap-2 flex-wrap">
                  {state === 'IDLE' || state === 'ERROR' ? (
                    <button disabled={busy} onClick={() => void call('start')}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 text-sm transition">
                      <span className="text-base">▶</span> Iniciar
                    </button>
                  ) : state === 'RUNNING' ? (
                    <>
                      <button disabled={busy} onClick={() => void call('pause')}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 text-sm transition">
                        <span className="text-base">⏸</span> Pausar
                      </button>
                      <button disabled={busy} onClick={() => void call('stop')}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 text-sm transition">
                        <span className="text-base">⏹</span> Detener
                      </button>
                    </>
                  ) : state === 'PAUSED' ? (
                    <>
                      <button disabled={busy} onClick={() => void call('resume')}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 text-sm transition">
                        <span className="text-base">▶</span> Reanudar
                      </button>
                      <button disabled={busy} onClick={() => void call('stop')}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 text-sm transition">
                        <span className="text-base">⏹</span> Detener
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Publicados hoy"
              value={status?.dailyPublishCount ?? 0}
              sub={`límite: ${status?.config.maxDailyPublish ?? '—'}`}
              accent={((status?.dailyPublishCount ?? 0) >= (status?.config.maxDailyPublish ?? 999)) ? 'text-red-400' : 'text-emerald-400'}
            />
            <StatCard
              label="En ciclo actual"
              value={cycle?.published ?? lastCycle?.published ?? 0}
              sub="publicados"
              accent="text-sky-400"
            />
            <StatCard
              label="Aprobados"
              value={cycle?.productsApproved ?? lastCycle?.productsApproved ?? 0}
              sub="candidatos encontrados"
            />
            <StatCard
              label="Errores"
              value={cycle?.errors ?? lastCycle?.errors ?? 0}
              sub={`${fmtDuration(cycle?.duration ?? lastCycle?.duration)} duración`}
              accent={((cycle?.errors ?? 0) > 0) ? 'text-red-400' : 'text-slate-300'}
            />
          </div>

          {/* Active cycle progress bar */}
          {cycle && (
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Ciclo activo — {cycle.cycleId}</span>
                <span className={`rounded px-2 py-0.5 font-bold ${STATUS_BADGE[cycle.status]}`}>{cycle.status}</span>
              </div>

              {/* Progress bar */}
              <div className="relative h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
                {cycle.status === 'RUNNING' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                )}
              </div>

              {/* Micro stats */}
              <div className="flex gap-4 text-xs text-slate-500">
                <span className="text-emerald-400 font-bold">{cycle.published} publicados</span>
                <span>{cycle.draftsCreated} drafts</span>
                <span>{cycle.skipped} saltados</span>
                {cycle.errors > 0 && <span className="text-red-400">{cycle.errors} errores</span>}
                <span className="ml-auto">{fmt(cycle.startedAt)}</span>
              </div>
            </div>
          )}

          {/* Live log */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Log en vivo</p>
            <CycleLog events={cycle?.events ?? lastCycle?.events ?? []} />
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Historial de ciclos</p>
              <div className="space-y-2">
                {[...history].reverse().slice(0, 8).map((c) => <HistoryRow key={c.cycleId} c={c} />)}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Config */}
        <div className="space-y-4">
          {localConfig && (
            <ConfigPanel
              config={localConfig}
              onChange={(patch) => setLocalConfig((prev) => prev ? { ...prev, ...patch } : prev)}
              onSave={saveConfig}
            />
          )}

          {/* How it works */}
          <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">¿Cómo funciona?</h3>
            <ol className="space-y-2 text-xs text-slate-400">
              {[
                ['🔍', 'Escanea productos CJ aprobados con margen ≥ configurado'],
                ['📊', 'Ordena por margen descendente — mejores primero'],
                ['🚫', 'Filtra los que ya tienen listing activo/draft'],
                ['📝', 'Crea drafts automáticamente (hasta máx. por ciclo)'],
                ['🚀', 'Si auto-publicar ON → publica directo a Shopify'],
                ['⏰', 'Repite cada N horas configurado'],
                ['♻️', 'Mantiene el estado activo aunque Railway reinicie'],
                ['📈', 'Registra estadísticas de cada ciclo para análisis'],
              ].map(([icon, text], i) => (
                <li key={i} className="flex gap-2">
                  <span>{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Tips */}
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/30 p-4 space-y-1.5 text-xs text-amber-300/80">
            <p className="font-bold text-amber-300">💡 Optimización</p>
            <p>Para mejores resultados: primero ejecuta <strong>Descubrir</strong> manualmente para poblar la BD con evaluaciones recientes, luego activa la automatización.</p>
            <p className="mt-1">El sistema prioriza productos con <strong>mayor margen</strong> — ajusta el mínimo de margen para filtrar solo los más rentables.</p>
            <p className="mt-1">La configuración queda guardada en la base de datos; si el backend se reinicia, el ciclo vuelve a programarse automáticamente.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
