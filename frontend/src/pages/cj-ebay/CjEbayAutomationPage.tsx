import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, Zap } from 'lucide-react';

type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  action?: string;
};

type SellingLimits = {
  configured: boolean;
  listingLimit: number | null;
  amountLimitUsd: number | null;
  remainingListings: number | null;
  remainingAmountUsd: number | null;
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
  const [ready, setReady] = useState<boolean | null>(null);
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [limits, setLimits] = useState<SellingLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [readinessRes, limitsRes] = await Promise.all([
          api.get<{ ready: boolean; checks: ReadinessCheck[] }>('/api/cj-ebay/system-readiness'),
          api.get<{ ok: boolean; sellingLimits: SellingLimits }>('/api/cj-ebay/selling-limits'),
        ]);
        if (!cancelled) {
          setReady(readinessRes.data.ready);
          setChecks(readinessRes.data.checks ?? []);
          setLimits(limitsRes.data.sellingLimits);
        }
      } catch (e) {
        if (!cancelled) setError(apiError(e, 'No se pudo cargar automatizacion CJ-eBay.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando automatizacion CJ-eBay...
      </div>
    );
  }

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Automatizacion CJ → eBay USA</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control operativo para publicar solo cuando credenciales, cuotas y politicas estan listas.
          </p>
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'}`}>
        <p className="text-sm font-semibold">{ready ? 'Modulo listo para automatizar con supervision' : 'Automatizacion limitada por readiness'}</p>
        {limits && (
          <p className="mt-1 text-xs">
            Cuotas: {limits.listingLimit ? `${limits.remainingListings}/${limits.listingLimit} publicaciones libres` : 'sin limite de publicaciones'} · {limits.amountLimitUsd ? `${usd(limits.remainingAmountUsd)} libres de ${usd(limits.amountLimitUsd)}` : 'sin limite de monto'}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Checklist de automatizacion</h2>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {checks.map((check) => (
            <div key={check.key} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${check.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                {check.ok ? '✓' : '!'}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{check.label}</p>
                {check.detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{check.detail}</p>}
                {check.action && <p className="mt-1 text-xs font-medium text-primary-700 dark:text-primary-300">{check.action}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
