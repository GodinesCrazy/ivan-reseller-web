import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { AlertTriangle, CheckCircle2, Loader2, Pause, Play, RefreshCw, Save, Settings, Square, Zap } from 'lucide-react';

type AutomationStatus = {
  status: string;
  running: boolean;
  paused: boolean;
  locked: boolean;
  readiness: { ready: boolean; checks: Array<{ id: string; ok: boolean; detail: string; hint?: string }> };
  sellingLimits: { configured: boolean; remainingListings: number | null; listingLimit: number | null; remainingAmountUsd: number | null; amountLimitUsd: number | null };
  config: {
    enabled: boolean;
    intervalMinutes: number;
    maxPublishPerRun: number;
    maxOrdersPerRun: number;
    requireQuota: boolean;
    requirePolicyClear: boolean;
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

export default function CjEbayAutomationPage() {
  const [data, setData] = useState<AutomationStatus | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean } & AutomationStatus>('/api/cj-ebay/automation/status');
      setData(res.data);
      setForm(toForm(res.data));
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar automatización CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function command(cmd: 'start' | 'pause' | 'resume' | 'stop' | 'run-now') {
    setBusy(cmd);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ message?: string }>(`/api/cj-ebay/automation/${cmd}`);
      setMessage(res.data.message ?? `Comando ${cmd} ejecutado.`);
      await load();
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
      setMessage('Configuración guardada.');
      await load();
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar la configuración.'));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando automatización CJ-eBay...</div>;

  const ready = Boolean(data?.readiness.ready && data.sellingLimits.configured);
  const failedChecks = data?.readiness.checks.filter((c) => !c.ok) ?? [];
  const lastMetrics = data?.lastRun?.metrics ?? {};

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${data?.status === 'RUNNING' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}><Zap className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">Autopilot CJ USA → eBay USA</h1>
              <p className="text-sm text-slate-400">Discovery, warehouse USA, publicación, polling de ventas, pago CJ y tracking eBay.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ready ? 'ok' : 'warn'}>{ready ? 'READY' : 'LIMITED'}</Badge>
            <Badge tone={data?.status === 'RUNNING' ? 'ok' : data?.status === 'ERROR' ? 'bad' : 'warn'}>{data?.status ?? 'UNKNOWN'}</Badge>
            {data?.locked && <Badge tone="warn">LOCKED</Badge>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Stock libre" value={data?.sellingLimits.listingLimit ? `${data.sellingLimits.remainingListings}/${data.sellingLimits.listingLimit}` : 'Sin límite'} />
          <Metric label="Monto libre" value={data?.sellingLimits.amountLimitUsd ? `${usd(data.sellingLimits.remainingAmountUsd)} / ${usd(data.sellingLimits.amountLimitUsd)}` : 'Sin límite'} />
          <Metric label="Próxima corrida" value={data?.nextRunAt ? new Date(data.nextRunAt).toLocaleString() : '-'} />
          <Metric label="Última corrida" value={data?.lastRun?.status ?? 'Sin corrida'} />
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Controles operativos</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { cmd: 'start', label: 'Iniciar', Icon: Play },
              { cmd: 'run-now', label: 'Run now', Icon: Zap },
              { cmd: 'pause', label: 'Pausar', Icon: Pause },
              { cmd: 'resume', label: 'Reanudar', Icon: RefreshCw },
              { cmd: 'stop', label: 'Stop', Icon: Square },
            ].map(({ cmd, label, Icon }) => (
              <button key={String(cmd)} type="button" onClick={() => void command(cmd as 'start' | 'pause' | 'resume' | 'stop' | 'run-now')} disabled={busy === cmd} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                {busy === cmd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Candidatos" value={String(lastMetrics.candidatesChecked ?? 0)} />
            <Metric label="Drafts" value={String(lastMetrics.draftsCreated ?? 0)} />
            <Metric label="Publicados" value={String(lastMetrics.listingsPublished ?? 0)} />
            <Metric label="Rechazo no-USA" value={String(lastMetrics.listingsRejectedUs ?? 0)} />
            <Metric label="Órdenes importadas" value={String(lastMetrics.ordersImported ?? 0)} />
            <Metric label="Pagos CJ" value={String(lastMetrics.ordersPaid ?? 0)} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100"><Settings className="h-4 w-4" />Configuración real</div>
            {form && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Intervalo min" value={form.intervalMinutes} onChange={(v) => setForm({ ...form, intervalMinutes: v })} />
                <Field label="Max publish/run" value={form.maxPublishPerRun} onChange={(v) => setForm({ ...form, maxPublishPerRun: v })} />
                <Field label="Max orders/run" value={form.maxOrdersPerRun} onChange={(v) => setForm({ ...form, maxOrdersPerRun: v })} />
                <Field label="Lookback órdenes h" value={form.orderPollingLookbackHours} onChange={(v) => setForm({ ...form, orderPollingLookbackHours: v })} />
                <Field label="Confianza mínima" value={form.minDataConfidenceScore} onChange={(v) => setForm({ ...form, minDataConfidenceScore: v })} />
                <Toggle label="Solo warehouse USA" checked={form.requireUsWarehouseOnly} onChange={(v) => setForm({ ...form, requireUsWarehouseOnly: v })} />
                <Toggle label="Pago CJ automático" checked={form.autoPayCjOrders} onChange={(v) => setForm({ ...form, autoPayCjOrders: v })} />
                <button type="button" onClick={() => void saveConfig()} disabled={busy === 'save'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-950">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Checklist</div>
            <div className="divide-y divide-slate-900">
              {data?.readiness.checks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 px-4 py-3">
                  {check.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />}
                  <div><p className="text-xs font-semibold text-slate-200">{check.id}</p><p className="mt-1 text-xs text-slate-500">{check.detail}</p></div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-800 bg-slate-950">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Última corrida</div>
            <div className="space-y-2 p-4 text-xs text-slate-400">
              <p>Trigger: <b className="text-slate-100">{data?.lastRun?.trigger ?? '-'}</b></p>
              <p>Inicio: <b className="text-slate-100">{data?.lastRun?.startedAt ? new Date(data.lastRun.startedAt).toLocaleString() : '-'}</b></p>
              <p>Duración: <b className="text-slate-100">{data?.lastRun?.durationMs != null ? `${data.lastRun.durationMs} ms` : '-'}</b></p>
              {data?.lastRun?.lastError && <p className="text-rose-300">{data.lastRun.lastError}</p>}
              {(data?.lastRun?.summary?.events ?? []).slice(-5).map((event, idx) => <p key={`${event}-${idx}`} className="rounded bg-slate-900 px-2 py-1">{event}</p>)}
            </div>
          </section>
        </aside>
      </div>

      {failedChecks.length > 0 && <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{failedChecks.length} checks requieren atención antes de liberar automatización completa.</div>}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: string }) {
  const cls = tone === 'ok' ? 'bg-emerald-500/10 text-emerald-200' : tone === 'bad' ? 'bg-rose-500/10 text-rose-200' : 'bg-amber-500/10 text-amber-200';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-bold text-white">{value}</p></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs text-slate-400">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">{label}<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}
