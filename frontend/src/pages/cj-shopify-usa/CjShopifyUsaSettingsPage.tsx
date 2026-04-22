import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';

type SettingsPayload = {
  minMarginPct: number;
  minProfitUsd: number;
  maxShippingUsd: number;
};

function toErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: string; message?: string } | undefined;
    return payload?.error || payload?.message || `HTTP ${error.response?.status || 'ERROR'}`;
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}

export default function CjShopifyUsaSettingsPage() {
  const [values, setValues] = useState<SettingsPayload>({
    minMarginPct: 12,
    minProfitUsd: 1.5,
    maxShippingUsd: 15,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/cj-shopify-usa/config');
        const settings = res.data?.settings as Partial<SettingsPayload> | undefined;
        if (!cancelled && settings) {
          setValues({
            minMarginPct: Number(settings.minMarginPct ?? 12),
            minProfitUsd: Number(settings.minProfitUsd ?? 1.5),
            maxShippingUsd: Number(settings.maxShippingUsd ?? 15),
          });
        }
      } catch (e) {
        if (!cancelled) setError(`No se pudo cargar configuración: ${toErrorMessage(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/api/cj-shopify-usa/config', values);
      setSuccess('Configuración guardada correctamente.');
    } catch (e) {
      setError(`No se pudo guardar: ${toErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando configuración operativa...
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Reglas de pricing (CJ → Shopify USA)
          </h2>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Max shipping USD</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.maxShippingUsd}
              onChange={(e) => setValues((prev) => ({ ...prev, maxShippingUsd: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Min margin %</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={values.minMarginPct}
              onChange={(e) => setValues((prev) => ({ ...prev, minMarginPct: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Min profit USD</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.minProfitUsd}
              onChange={(e) => setValues((prev) => ({ ...prev, minProfitUsd: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
          {success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{success}</span>}
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  );
}
