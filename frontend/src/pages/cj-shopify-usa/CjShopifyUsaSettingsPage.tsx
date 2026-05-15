import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, Save, SlidersHorizontal, Info } from 'lucide-react';
import {
  ActionPriorityBand,
  CommercialMetricCard,
  CommercialPageHeader,
} from './components/CommercialCockpit';

type SettingsPayload = {
  minMarginPct: number;
  minProfitUsd: number;
  maxShippingUsd: number;
  maxSellPriceUsd: number;
  minCostUsd: number;
};

type CleanupConfig = {
  noTractionDays: number;
  minViewsToDecide: number;
  minAddToCart: number;
  autoPauseEnabled: boolean;
  archiveEnabled: boolean;
};

/** Parse a number from user input supporting both dot and comma as decimal separator */
function parseNumericInput(raw: string, fallback: number): number {
  const normalized = raw.trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  return isFinite(parsed) ? parsed : fallback;
}

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
    maxSellPriceUsd: 45,
    minCostUsd: 2,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [impactPreview, setImpactPreview] = useState<{ approved: number; rejected: number; total: number } | null>(null);
  const [cleanupConfig, setCleanupConfig] = useState<CleanupConfig>({
    noTractionDays: 14,
    minViewsToDecide: 20,
    minAddToCart: 1,
    autoPauseEnabled: false,
    archiveEnabled: true,
  });
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, cleanupRes] = await Promise.all([
          api.get('/api/cj-shopify-usa/config'),
          api.get('/api/cj-shopify-usa/cleanup/config'),
        ]);
        const settings = res.data?.settings as Partial<SettingsPayload> | undefined;
        if (!cancelled && settings) {
          setValues({
            minMarginPct: Number(settings.minMarginPct ?? 12),
            minProfitUsd: Number(settings.minProfitUsd ?? 1.5),
            maxShippingUsd: Number(settings.maxShippingUsd ?? 15),
            maxSellPriceUsd: Number(settings.maxSellPriceUsd ?? 45),
            minCostUsd: Number(settings.minCostUsd ?? 2),
          });
        }
        if (!cancelled && cleanupRes.data?.config) {
          setCleanupConfig(cleanupRes.data.config as CleanupConfig);
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

  async function previewImpact() {
    setLoadingPreview(true);
    try {
      const res = await api.get<{ ok: boolean; approved: number; rejected: number; total: number }>(
        '/api/cj-shopify-usa/config/preview-impact',
        { params: values },
      );
      if (res.data?.ok) setImpactPreview({ approved: res.data.approved, rejected: res.data.rejected, total: res.data.total });
    } catch { /* preview is best-effort */ }
    finally { setLoadingPreview(false); }
  }

  async function saveSettings() {
    // Guard: reject if any field is NaN before sending (avoids backend reset to defaults)
    const hasNaN = Object.values(values).some((v) => !isFinite(v as number));
    if (hasNaN) {
      setError('Uno o más campos tienen un valor inválido. Usa punto (.) como separador decimal.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/api/cj-shopify-usa/config', values);
      await api.patch('/api/cj-shopify-usa/cleanup/config', cleanupConfig);
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
    <div className="space-y-4 max-w-5xl">
      <CommercialPageHeader
        title="Configuracion comercial"
        description="Ajusta pricing, shipping maximo, utilidad minima y revisa impacto antes de cambiar reglas de publicacion."
      />

      <ActionPriorityBand
        tone={impactPreview && impactPreview.rejected > 0 ? 'amber' : 'cyan'}
        title={impactPreview ? `${impactPreview.approved} productos quedarian aprobados y ${impactPreview.rejected} rechazados.` : 'Primero previsualiza impacto antes de guardar cambios.'}
        description="El preview evita que una regla de margen o shipping bloquee productos buenos o deje pasar productos con riesgo."
        primaryLabel="Preview impacto"
        onPrimary={() => void previewImpact()}
        secondaryLabel="Guardar"
        onSecondary={() => void saveSettings()}
        disabled={saving || loadingPreview}
        meta={[
          `margen ${values.minMarginPct}%`,
          `profit min $${values.minProfitUsd}`,
          `shipping max $${values.maxShippingUsd}`,
          `rotacion ${cleanupConfig.noTractionDays}d`,
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard label="Aprobados preview" value={impactPreview?.approved ?? '-'} detail="pasarian reglas actuales" tone="emerald" />
        <CommercialMetricCard label="Rechazados preview" value={impactPreview?.rejected ?? '-'} detail="requieren revisar" tone={impactPreview && impactPreview.rejected > 0 ? 'amber' : 'slate'} />
        <CommercialMetricCard label="Total analizado" value={impactPreview?.total ?? '-'} detail="evaluaciones existentes" tone="cyan" />
        <CommercialMetricCard label="Utilidad minima" value={`$${values.minProfitUsd}`} detail="guardrail por producto" tone="violet" />
      </div>

      <div className="rounded-xl border border-cyan-500/25 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100">Higiene comercial y Sales Intelligence</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Días sin tracción</span>
            <input
              type="number"
              min={3}
              max={90}
              value={cleanupConfig.noTractionDays}
              onChange={(e) => setCleanupConfig((prev) => ({ ...prev, noTractionDays: parseNumericInput(e.target.value, prev.noTractionDays) }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Mín. vistas para decidir</span>
            <input
              type="number"
              min={0}
              value={cleanupConfig.minViewsToDecide}
              onChange={(e) => setCleanupConfig((prev) => ({ ...prev, minViewsToDecide: parseNumericInput(e.target.value, prev.minViewsToDecide) }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Mín. add-to-cart</span>
            <input
              type="number"
              min={0}
              value={cleanupConfig.minAddToCart}
              onChange={(e) => setCleanupConfig((prev) => ({ ...prev, minAddToCart: parseNumericInput(e.target.value, prev.minAddToCart) }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={cleanupConfig.autoPauseEnabled}
              onChange={(e) => setCleanupConfig((prev) => ({ ...prev, autoPauseEnabled: e.target.checked }))}
            />
            Auto-pausar sin tracción
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={cleanupConfig.archiveEnabled}
              onChange={(e) => setCleanupConfig((prev) => ({ ...prev, archiveEnabled: e.target.checked }))}
            />
            Archivo conservador
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          El modo profesional mide primero. Auto-pausar queda apagado por defecto; al activarlo solo pausa productos sin venta, sin señales y fuera de la ventana de aprendizaje.
        </p>
      </div>

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
              onChange={(e) => setValues((prev) => ({ ...prev, maxShippingUsd: parseNumericInput(e.target.value, prev.maxShippingUsd) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Max sell price USD</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={values.maxSellPriceUsd}
              onChange={(e) => setValues((prev) => ({ ...prev, maxSellPriceUsd: parseNumericInput(e.target.value, prev.maxSellPriceUsd) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Min cost USD</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.minCostUsd}
              onChange={(e) => setValues((prev) => ({ ...prev, minCostUsd: parseNumericInput(e.target.value, prev.minCostUsd) }))}
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
              onChange={(e) => setValues((prev) => ({ ...prev, minMarginPct: parseNumericInput(e.target.value, prev.minMarginPct) }))}
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
              onChange={(e) => setValues((prev) => ({ ...prev, minProfitUsd: parseNumericInput(e.target.value, prev.minProfitUsd) }))}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {/* Impact preview */}
        {impactPreview && (
          <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Con estas reglas: <strong>{impactPreview.approved}</strong> productos aprobados,{' '}
              <strong>{impactPreview.rejected}</strong> rechazados de {impactPreview.total} evaluados.
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void previewImpact()}
            disabled={loadingPreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
            Ver impacto
          </button>
          <button
            type="button"
            onClick={() => void saveSettings()}
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
