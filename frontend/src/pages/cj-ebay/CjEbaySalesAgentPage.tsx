import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Bot, Brain, CheckCircle2, Loader2, Pause, Play, RefreshCw, Zap } from 'lucide-react';

type AgentData = {
  scheduler: { status: string; config: { intervalMinutes: number; maxPublishesPerRun: number; respectMonthlyQuota: boolean; blockPolicyRisks: boolean } };
  pipeline: { overallScore: number; bottleneck: string; stages: Array<{ key: string; label: string; value: number; status: string }> };
  quotas: { configured: boolean; remainingListings: number | null; listingLimit: number | null; remainingAmountUsd: number | null; amountLimitUsd: number | null };
  kpis: { estimatedGrossProfitUsd: number; estimatedAvgMarginPct: number | null; attentionOrders: number; activeRefunds: number };
  recommendations: Array<{ id: string; title: string; seedKeyword: string; score: number; status: string; reason: string; suggestedPriceUsd: number | null; netProfitUsd: number | null; netMarginPct: number | null }>;
  actions: Array<{ id: string; listingId: number; title: string; severity: string; recommendation: string; reason: string }>;
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

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

export default function CjEbaySalesAgentPage() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean } & AgentData>('/api/cj-ebay/sales-agent');
      setData(res.data);
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar el Agente eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function scheduler(command: 'start' | 'pause' | 'stop' | 'run-now') {
    setBusy(command);
    setMessage(null);
    setError(null);
    try {
      await api.post(`/api/cj-ebay/sales-agent/scheduler/${command}`);
      setMessage(`Scheduler: ${command} aceptado.`);
      await load();
    } catch (e) {
      setError(apiError(e, `No se pudo ejecutar ${command}.`));
    } finally {
      setBusy(null);
    }
  }

  async function executeAction(id: string) {
    setBusy(id);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ result?: { message?: string } }>('/api/cj-ebay/sales-agent/actions', { id });
      setMessage(res.data.result?.message ?? 'Acción registrada.');
    } catch (e) {
      setError(apiError(e, 'No se pudo registrar la acción.'));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando Agente eBay...</div>;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/10 p-3 text-violet-200"><Bot className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-semibold text-white">Agente Vendedor eBay</h1>
              <p className="text-sm text-slate-400">Cockpit PET: oportunidades, cuota mensual, política eBay, profit y acciones supervisadas.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-violet-800 bg-violet-950/30 px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">Pipeline</p>
              <p className="text-2xl font-bold text-white">{data?.pipeline.overallScore ?? 0}/100</p>
            </div>
            <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Cuota listings" value={data?.quotas.listingLimit ? `${data.quotas.remainingListings}/${data.quotas.listingLimit}` : 'Sin límite'} />
          <Metric label="Cuota monto" value={data?.quotas.amountLimitUsd ? `${usd(data.quotas.remainingAmountUsd)} / ${usd(data.quotas.amountLimitUsd)}` : 'Sin límite'} />
          <Metric label="Utilidad estimada" value={usd(data?.kpis.estimatedGrossProfitUsd)} />
          <Metric label="Margen promedio" value={pct(data?.kpis.estimatedAvgMarginPct)} />
        </div>
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{message}</div>}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-100">Scheduler comercial</h2><p className="mt-1 text-xs text-slate-500">Estado: {data?.scheduler.status} · cada {data?.scheduler.config.intervalMinutes} min</p></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void scheduler('start')} disabled={busy === 'start'} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === 'start' ? '...' : <Play className="h-4 w-4" />}</button>
              <button type="button" onClick={() => void scheduler('pause')} disabled={busy === 'pause'} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Pause className="h-4 w-4" /></button>
              <button type="button" onClick={() => void scheduler('run-now')} disabled={busy === 'run-now'} className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Zap className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {data?.pipeline.stages.map((stage) => (
              <div key={stage.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-300">{stage.label}</span>{stage.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</div>
                <p className="text-2xl font-bold text-white">{stage.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-cyan-900/50 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100">Cuello actual: <b>{data?.pipeline.bottleneck}</b></div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="mb-3 flex items-center gap-2"><Brain className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-semibold text-slate-100">Estrategia eBay</h2></div>
          <div className="grid gap-2 text-xs text-slate-300">
            <span className="rounded bg-slate-900 px-3 py-2">Respeta cuota mensual: <b>{data?.scheduler.config.respectMonthlyQuota ? 'Sí' : 'No'}</b></span>
            <span className="rounded bg-slate-900 px-3 py-2">Bloquea policy risks: <b>{data?.scheduler.config.blockPolicyRisks ? 'Sí' : 'No'}</b></span>
            <span className="rounded bg-slate-900 px-3 py-2">Max publicaciones/corrida: <b>{data?.scheduler.config.maxPublishesPerRun}</b></span>
            <span className="rounded bg-slate-900 px-3 py-2">Órdenes atención: <b>{data?.kpis.attentionOrders}</b></span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Recomendaciones de oportunidad</div>
          <div className="divide-y divide-slate-900">
            {data?.recommendations.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{item.title}</p><p className="text-xs text-slate-500">Seed: {item.seedKeyword} · {item.status}</p></div><p className="text-2xl font-bold text-cyan-300">{item.score}</p></div>
                <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3"><span>Precio: <b>{usd(item.suggestedPriceUsd)}</b></span><span>Utilidad: <b>{usd(item.netProfitUsd)}</b></span><span>Margen: <b>{pct(item.netMarginPct)}</b></span></div>
                <p className="mt-2 text-xs text-slate-500">{item.reason}</p>
              </div>
            ))}
            {data?.recommendations.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Sin recomendaciones listas.</div>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">Acciones ejecutables</div>
          <div className="divide-y divide-slate-900">
            {data?.actions.map((action) => (
              <div key={action.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-100">{action.recommendation}</p>
                <p className="mt-1 text-xs text-slate-500">{action.title}</p>
                <p className="mt-2 text-xs text-slate-400">{action.reason}</p>
                <button type="button" onClick={() => void executeAction(action.id)} disabled={busy === action.id} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900 disabled:opacity-50">{busy === action.id ? 'Registrando...' : 'Registrar acción'}</button>
              </div>
            ))}
            {data?.actions.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">Sin acciones urgentes.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-bold text-white">{value}</p></div>;
}
