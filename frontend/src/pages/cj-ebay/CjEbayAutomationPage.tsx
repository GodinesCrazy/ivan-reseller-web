import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, Loader2, Pause, Play, RefreshCw, Save, Settings, ShieldCheck, Square, Zap } from 'lucide-react';
import { api } from '@/services/api';

type AutomationStatus = {
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR' | string;
  running: boolean;
  paused: boolean;
  locked: boolean;
  readiness: { ready: boolean; checks: Array<{ id: string; ok: boolean; detail: string; hint?: string }> };
  sellingLimits: {
    configured: boolean;
    remainingListings: number | null;
    listingLimit: number | null;
    remainingAmountUsd: number | null;
    amountLimitUsd: number | null;
  };
  config: {
    enabled: boolean;
    intervalMinutes: number;
    maxPublishPerRun: number;
    maxOrdersPerRun: number;
    requireUsWarehouseOnly: boolean;
    autoPayCjOrders: boolean;
    orderPollingLookbackHours: number;
    minDataConfidenceScore: number;
    checkoutMode: string;
  };
  lastRun: null | {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    metrics: Record<string, number>;
    lastError: string | null;
    summary: { events?: string[] } | null;
  };
  nextRunAt: string | Date | null;
  recentEvents: Array<{ id: string; step: string; message: string; createdAt: string }>;
};

type ConfigForm = {
  intervalMinutes: string;
  maxPublishPerRun: string;
  maxOrdersPerRun: string;
  orderPollingLookbackHours: string;
  minDataConfidenceScore: string;
  requireUsWarehouseOnly: boolean;
  autoPayCjOrders: boolean;
};

function apiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const data = e.response.data as { message?: string; error?: string };
    return data.message || data.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function n(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toForm(data: AutomationStatus): ConfigForm {
  return {
    intervalMinutes: String(data.config.intervalMinutes),
    maxPublishPerRun: String(data.config.maxPublishPerRun),
    maxOrdersPerRun: String(data.config.maxOrdersPerRun),
    orderPollingLookbackHours: String(data.config.orderPollingLookbackHours),
    minDataConfidenceScore: String(data.config.minDataConfidenceScore),
    requireUsWarehouseOnly: data.config.requireUsWarehouseOnly,
    autoPayCjOrders: data.config.autoPayCjOrders,
  };
}

function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function progressFrom(status: AutomationStatus | null): number {
  if (!status?.lastRun) return 0;
  if (status.lastRun.status === 'COMPLETED') return 100;
  if (status.lastRun.status === 'RUNNING') {
    const m = status.lastRun.metrics ?? {};
    const total = Math.max(1, (m.candidatesChecked ?? 0) + (m.ordersImported ?? 0) + (m.trackingSynced ?? 0));
    const done = (m.draftsCreated ?? 0) + (m.listingsPublished ?? 0) + (m.ordersPaid ?? 0) + (m.trackingSynced ?? 0);
    return Math.min(95, Math.max(18, (done / total) * 100));
  }
  if (status.status === 'RUNNING') return 38;
  if (status.status === 'ERROR') return 100;
  return 0;
}

function stateLabel(status: AutomationStatus | null): string {
  if (!status) return 'CARGANDO';
  if (status.locked) return 'EN EJECUCION';
  if (status.status === 'RUNNING') return 'EN EJECUCION';
  if (status.status === 'PAUSED') return 'PAUSADO';
  if (status.status === 'ERROR') return 'ERROR';
  return 'INACTIVO';
}

function stateColor(status: AutomationStatus | null): string {
  if (status?.status === 'ERROR') return '#ef4444';
  if (status?.status === 'PAUSED') return '#f59e0b';
  if (status?.status === 'RUNNING' || status?.locked) return '#10b981';
  return '#64748b';
}

function EngineRing({ status }: { status: AutomationStatus | null }) {
  const progress = progressFrom(status);
  const color = stateColor(status);
  const radius = 72;
  const circ = 2 * Math.PI * radius;
  const dash = (progress / 100) * circ;
  const pulse = status?.status === 'RUNNING' || status?.locked;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 200, height: 200 }}>
      {pulse && <div className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: color, animationDuration: '2.5s' }} />}
      <svg width="200" height="200" className="absolute inset-0 -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle cx="100" cy="100" r={radius} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
        <circle cx="100" cy="100" r={58} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.22" strokeDasharray="8 6" className={pulse ? 'animate-spin' : ''} style={{ animationDuration: '12s' }} />
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}33`, color }}>
          <Zap className="h-5 w-5" />
        </div>
        <span className="text-xs font-bold tracking-widest" style={{ color }}>{stateLabel(status)}</span>
        <span className="text-2xl font-black text-white">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

export default function CjEbayAutomationPage() {
  const [data, setData] = useState<AutomationStatus | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean } & AutomationStatus>('/api/cj-ebay/automation/status');
      setData(res.data);
      setForm((prev) => prev ?? toForm(res.data));
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar automatizacion CJ-eBay.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => void load(true), 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  async function command(cmd: 'start' | 'pause' | 'resume' | 'stop' | 'run-now', options: { dryRun?: boolean } = {}) {
    const busyKey = options.dryRun ? 'dry-run' : cmd;
    setBusy(busyKey);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ message?: string }>(`/api/cj-ebay/automation/${cmd}`, options.dryRun ? { dryRun: true } : {});
      setMessage(options.dryRun ? 'Dry-run ejecutado: sin publicar en eBay ni pagar CJ.' : res.data.message ?? `Comando ${cmd} ejecutado.`);
      await load(true);
    } catch (e) {
      setError(apiError(e, `No se pudo ejecutar ${cmd}.`));
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig() {
    if (!form) return;
    setBusy('save');
    setMessage(null);
    setError(null);
    try {
      await api.post('/api/cj-ebay/automation/config', {
        intervalMinutes: n(form.intervalMinutes, 60),
        maxPublishPerRun: n(form.maxPublishPerRun, 1),
        maxOrdersPerRun: n(form.maxOrdersPerRun, 10),
        orderPollingLookbackHours: n(form.orderPollingLookbackHours, 24),
        minDataConfidenceScore: n(form.minDataConfidenceScore, 60),
        requireUsWarehouseOnly: form.requireUsWarehouseOnly,
        autoPayCjOrders: form.autoPayCjOrders,
      });
      setMessage('Configuracion guardada.');
      await load(true);
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar la configuracion.'));
    } finally {
      setBusy(null);
    }
  }

  const metrics = data?.lastRun?.metrics ?? {};
  const ready = Boolean(data?.readiness.ready && data.sellingLimits.configured);
  const failedChecks = data?.readiness.checks.filter((check) => !check.ok) ?? [];
  const events = useMemo(() => {
    const lastRunEvents = data?.lastRun?.summary?.events ?? [];
    const recent = data?.recentEvents?.map((event) => `${event.step}: ${event.message}`) ?? [];
    return [...lastRunEvents, ...recent].slice(-14);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando automatizacion CJ-eBay...
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-950 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <Zap className="h-5 w-5 text-amber-300" />
            Automatizacion CJ {'->'} eBay USA
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Ciclo autonomo de discovery PET, evaluacion, publicacion eBay, polling de ventas, pago CJ y tracking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={ready ? 'ok' : 'warn'}>{ready ? 'OPERATIVO' : 'LIMITADO'}</Badge>
          <Badge tone={data?.status === 'RUNNING' ? 'ok' : data?.status === 'ERROR' ? 'bad' : 'warn'}>{data?.status ?? 'UNKNOWN'}</Badge>
          {data?.locked && <Badge tone="warn">LOCK</Badge>}
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-6">
            <div className="flex flex-wrap items-center gap-8">
              <EngineRing status={data} />
              <div className="min-w-[240px] flex-1 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Proximo ciclo en</p>
                  <p className={`text-4xl font-black tabular-nums ${data?.status === 'RUNNING' ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {data?.nextRunAt ? fmtTime(data.nextRunAt) : '-'}
                  </p>
                </div>
                <div className="grid gap-3 text-xs sm:grid-cols-[0.8fr_1.2fr]">
                  <div>
                    <p className="mb-0.5 text-slate-500">Ultima corrida</p>
                    <p className="font-mono text-slate-300">{fmtTime(data?.lastRun?.startedAt)}</p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-slate-500">Guardrails activos</p>
                      <p className="font-mono text-slate-300">{ready ? '100%' : 'Revisar'}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: ready ? '100%' : '48%' }} />
                    </div>
                    <p className="mt-1 font-mono text-slate-500">
                      {data?.config.requireUsWarehouseOnly ? 'USA-only activo' : 'USA-only desactivado'} · pago CJ {data?.config.autoPayCjOrders ? 'auto' : 'manual'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton busy={busy === 'start'} onClick={() => void command('start')} icon={<Play className="h-4 w-4" />} tone="green">Iniciar</ActionButton>
                  <ActionButton busy={busy === 'run-now'} onClick={() => void command('run-now')} icon={<Zap className="h-4 w-4" />} tone="green">Ejecutar ahora</ActionButton>
                  <ActionButton busy={busy === 'dry-run'} onClick={() => void command('run-now', { dryRun: true })} icon={<ShieldCheck className="h-4 w-4" />} tone="slate">Dry-run</ActionButton>
                  <ActionButton busy={busy === 'pause'} onClick={() => void command('pause')} icon={<Pause className="h-4 w-4" />} tone="amber">Pausar</ActionButton>
                  <ActionButton busy={busy === 'resume'} onClick={() => void command('resume')} icon={<RefreshCw className="h-4 w-4" />} tone="slate">Reanudar</ActionButton>
                  <ActionButton busy={busy === 'stop'} onClick={() => void command('stop')} icon={<Square className="h-4 w-4" />} tone="slate">Detener</ActionButton>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-cyan-300">Fase actual</span>
                    <span className="font-mono text-slate-300">{Math.round(progressFrom(data))}%</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {data?.locked ? 'Ejecutando corrida protegida por lock' : data?.lastRun?.status ?? 'Esperando proximo ciclo'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['Limites', 'Discovery', 'Pricing', 'Drafts', 'Publicacion', 'Ordenes', 'Pago CJ', 'Tracking'].map((phase) => (
                      <span key={phase} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">{phase}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Stock libre" value={data?.sellingLimits.listingLimit ? `${data.sellingLimits.remainingListings}/${data.sellingLimits.listingLimit}` : 'Sin limite'} accent="text-emerald-400" />
            <StatCard label="Monto libre" value={data?.sellingLimits.amountLimitUsd ? usd(data.sellingLimits.remainingAmountUsd) : 'Sin limite'} accent="text-sky-400" />
            <StatCard label="Publicados" value={metrics.listingsPublished ?? 0} sub="ultima corrida" />
            <StatCard label="Errores" value={metrics.errors ?? (data?.lastRun?.lastError ? 1 : 0)} sub={fmtDuration(data?.lastRun?.durationMs)} accent={data?.lastRun?.lastError ? 'text-red-400' : 'text-slate-300'} />
          </div>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Ultima corrida - {data?.lastRun?.id ?? 'sin corrida'}</span>
              <span className="rounded bg-slate-700 px-2 py-0.5 font-bold text-slate-300">{data?.lastRun?.status ?? 'IDLE'}</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressFrom(data)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="text-emerald-400">{metrics.candidatesChecked ?? 0} candidatos</span>
              <span>{metrics.draftsCreated ?? 0} drafts</span>
              <span>{metrics.listingsPublished ?? 0} publicados</span>
              <span>{metrics.ordersImported ?? 0} ordenes</span>
              <span>{metrics.ordersPaid ?? 0} pagos CJ</span>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Log en vivo</p>
            <div className="h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs">
              {events.length === 0 ? (
                <p className="text-slate-600">No hay eventos. Ejecuta una corrida para ver el log del autopilot.</p>
              ) : (
                events.map((event, index) => <p key={`${event}-${index}`} className="py-0.5 text-slate-400">{event}</p>)
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><Settings className="h-4 w-4" />Configuracion del ciclo</h3>
            {form && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Intervalo (min)" value={form.intervalMinutes} onChange={(v) => setForm({ ...form, intervalMinutes: v })} />
                <Field label="Max por ciclo" value={form.maxPublishPerRun} onChange={(v) => setForm({ ...form, maxPublishPerRun: v })} />
                <Field label="Max ordenes" value={form.maxOrdersPerRun} onChange={(v) => setForm({ ...form, maxOrdersPerRun: v })} />
                <Field label="Lookback h" value={form.orderPollingLookbackHours} onChange={(v) => setForm({ ...form, orderPollingLookbackHours: v })} />
                <Field label="Confianza min." value={form.minDataConfidenceScore} onChange={(v) => setForm({ ...form, minDataConfidenceScore: v })} />
                <Toggle label="Solo warehouse USA" checked={form.requireUsWarehouseOnly} onChange={(v) => setForm({ ...form, requireUsWarehouseOnly: v })} />
                <Toggle label="Pago CJ automatico" checked={form.autoPayCjOrders} onChange={(v) => setForm({ ...form, autoPayCjOrders: v })} />
                <button type="button" onClick={() => void saveConfig()} disabled={busy === 'save'} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar configuracion
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5">
            <h3 className="text-sm font-bold text-slate-200">Como funciona</h3>
            <ol className="mt-3 space-y-2 text-xs text-slate-400">
              {[
                'Descubre productos PET en CJ con señales de eBay USA.',
                'Exige warehouse USA antes de draft/publicacion.',
                'Calcula precio con costo CJ, flete, fees eBay/pago y buffer.',
                'Respeta cuota de 300 stock publicados y monto configurado.',
                'Importa ventas por polling eBay y prepara cumplimiento CJ.',
                'Sincroniza tracking cuando CJ lo entregue.',
              ].map((text, index) => (
                <li key={text} className="flex gap-2">
                  <span className="text-slate-600">{index + 1}.</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/80">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Checklist</div>
            <div className="divide-y divide-slate-900">
              {data?.readiness.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 px-4 py-3">
                  {check.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />}
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{check.id}</p>
                    <p className="mt-1 text-xs text-slate-500">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {failedChecks.length > 0 && (
            <section className="rounded-xl border border-amber-800/40 bg-amber-950/30 p-4 text-xs text-amber-200">
              <p className="font-bold text-amber-100">Atencion requerida</p>
              <p className="mt-1">{failedChecks.length} checks deben resolverse antes de dejar el autopilot sin supervision.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: string }) {
  const cls = tone === 'ok' ? 'bg-emerald-500/10 text-emerald-200' : tone === 'bad' ? 'bg-rose-500/10 text-rose-200' : 'bg-amber-500/10 text-amber-200';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function ActionButton({ busy, onClick, icon, tone, children }: { busy: boolean; onClick: () => void; icon: ReactNode; tone: 'green' | 'amber' | 'slate'; children: string }) {
  const cls = tone === 'green' ? 'bg-emerald-600 hover:bg-emerald-500' : tone === 'amber' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600';
  return (
    <button type="button" disabled={busy} onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 ${cls}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-2xl font-black ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="col-span-2 flex cursor-pointer items-center gap-3 text-sm text-slate-300">
      <span className={`relative h-5 w-10 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
      {label}
    </label>
  );
}
