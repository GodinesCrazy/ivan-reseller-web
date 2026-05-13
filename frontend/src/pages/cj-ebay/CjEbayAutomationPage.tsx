import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { AlertTriangle, CheckCircle2, Loader2, Pause, Play, RefreshCw, Settings, Square, Zap } from 'lucide-react';

type AutomationStatus = {
  status: string;
  running: boolean;
  paused: boolean;
  readiness: { ready: boolean; checks: Array<{ id: string; ok: boolean; detail: string; hint?: string }> };
  sellingLimits: { configured: boolean; remainingListings: number | null; listingLimit: number | null; remainingAmountUsd: number | null; amountLimitUsd: number | null };
  config: { maxPublishPerRun: number; requireQuota: boolean; requirePolicyClear: boolean; checkoutMode: string };
  recentEvents: Array<{ id: string; step: string; message: string; createdAt: string }>;
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

export default function CjEbayAutomationPage() {
  const [data, setData] = useState<AutomationStatus | null>(null);
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
      setMessage(res.data.message ?? `Comando ${cmd} aceptado.`);
      await load();
    } catch (e) {
      setError(apiError(e, `No se pudo ejecutar ${cmd}.`));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando automatización CJ-eBay...</div>;

  const ready = data?.readiness.ready && data.sellingLimits.configured;
  const failedChecks = data?.readiness.checks.filter((c) => !c.ok) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${ready ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}><Zap className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">Automatización CJ → eBay USA</h1>
              <p className="text-sm text-slate-400">Cockpit con guardrails de cuota, política eBay, checkout CJ y publicación supervisada.</p>
            </div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-bold ${ready ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>
            {ready ? 'READY' : 'LIMITED'}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Publicaciones libres" value={data?.sellingLimits.listingLimit ? `${data.sellingLimits.remainingListings}/${data.sellingLimits.listingLimit}` : 'Sin límite'} />
          <Metric label="Monto libre" value={data?.sellingLimits.amountLimitUsd ? `${usd(data.sellingLimits.remainingAmountUsd)} / ${usd(data.sellingLimits.amountLimitUsd)}` : 'Sin límite'} />
          <Metric label="Max por corrida" value={String(data?.config.maxPublishPerRun ?? 0)} />
          <Metric label="Checkout CJ" value={data?.config.checkoutMode ?? 'MANUAL'} />
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
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
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100"><Settings className="h-4 w-4" />Guardrails activos</div>
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              <span className="rounded bg-slate-950 px-3 py-2">Cuota requerida: <b>{data?.config.requireQuota ? 'Sí' : 'No'}</b></span>
              <span className="rounded bg-slate-950 px-3 py-2">Policy clear: <b>{data?.config.requirePolicyClear ? 'Sí' : 'No'}</b></span>
              <span className="rounded bg-slate-950 px-3 py-2">Readiness: <b>{data?.readiness.ready ? 'OK' : 'Atención'}</b></span>
            </div>
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
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Eventos recientes</div>
            <div className="divide-y divide-slate-900">
              {data?.recentEvents.slice(0, 8).map((event) => <div key={event.id} className="px-4 py-3"><p className="text-xs font-mono text-cyan-300">{event.step}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{event.message}</p></div>)}
              {data?.recentEvents.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Sin eventos.</div>}
            </div>
          </section>
        </aside>
      </div>

      {failedChecks.length > 0 && <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">{failedChecks.length} checks requieren atención antes de liberar automatización completa.</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-bold text-white">{value}</p></div>;
}
