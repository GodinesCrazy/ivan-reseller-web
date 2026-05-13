import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Save, Settings, ShieldCheck } from 'lucide-react';

type NullableNum = number | null;

type CjEbaySettings = {
  minMarginPct: NullableNum;
  minProfitUsd: NullableNum;
  maxShippingUsd: NullableNum;
  handlingBufferDays: number;
  minStock: number;
  rejectOnUnknownShipping: boolean;
  maxRiskScore: NullableNum;
  priceChangePctReevaluate: NullableNum;
  incidentBufferPct: NullableNum;
  defaultEbayFeePct: NullableNum;
  defaultPaymentFeePct: NullableNum;
  defaultPaymentFixedFeeUsd: NullableNum;
  monthlyListingLimit: NullableNum;
  monthlyAmountLimitUsd: NullableNum;
  cjPostCreateCheckoutMode: 'MANUAL' | 'AUTO_CONFIRM_PAY';
  marketNiche: 'PET_SUPPLIES';
  requirePetCategory: boolean;
};

type FormState = Record<keyof Omit<CjEbaySettings, 'rejectOnUnknownShipping' | 'cjPostCreateCheckoutMode' | 'marketNiche' | 'requirePetCategory'>, string> & {
  rejectOnUnknownShipping: boolean;
  cjPostCreateCheckoutMode: 'MANUAL' | 'AUTO_CONFIRM_PAY';
  marketNiche: 'PET_SUPPLIES';
  requirePetCategory: boolean;
};

type PreviewImpact = {
  summary: {
    activeExposureUsd: number;
    belowMarginCount: number;
    policyBlockedCount: number;
    draftPublishableCount: number;
    quotaConfigured: boolean;
    remainingListings: number | null;
    remainingAmountUsd: number | null;
  };
  issues: Array<{ type: string; severity: string; title: string; detail: string }>;
};

const DEFAULT_MONTHLY_LISTING_LIMIT = '10';
const DEFAULT_MONTHLY_AMOUNT_LIMIT_USD = '500';

const initialForm: FormState = {
  minMarginPct: '',
  minProfitUsd: '',
  maxShippingUsd: '',
  handlingBufferDays: '2',
  minStock: '1',
  rejectOnUnknownShipping: true,
  maxRiskScore: '',
  priceChangePctReevaluate: '',
  incidentBufferPct: '',
  defaultEbayFeePct: '',
  defaultPaymentFeePct: '',
  defaultPaymentFixedFeeUsd: '',
  monthlyListingLimit: DEFAULT_MONTHLY_LISTING_LIMIT,
  monthlyAmountLimitUsd: DEFAULT_MONTHLY_AMOUNT_LIMIT_USD,
  cjPostCreateCheckoutMode: 'MANUAL',
  marketNiche: 'PET_SUPPLIES',
  requirePetCategory: true,
};

function apiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
    const data = error.response.data as { message?: string; error?: string };
    return data.message || data.error || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function numberText(value: NullableNum | number | undefined): string {
  return value == null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInteger(value: string): number | null {
  const n = parseOptionalNumber(value);
  return n == null ? null : Math.trunc(n);
}

function toForm(settings: CjEbaySettings): FormState {
  return {
    minMarginPct: numberText(settings.minMarginPct),
    minProfitUsd: numberText(settings.minProfitUsd),
    maxShippingUsd: numberText(settings.maxShippingUsd),
    handlingBufferDays: numberText(settings.handlingBufferDays),
    minStock: numberText(settings.minStock),
    rejectOnUnknownShipping: Boolean(settings.rejectOnUnknownShipping),
    maxRiskScore: numberText(settings.maxRiskScore),
    priceChangePctReevaluate: numberText(settings.priceChangePctReevaluate),
    incidentBufferPct: numberText(settings.incidentBufferPct),
    defaultEbayFeePct: numberText(settings.defaultEbayFeePct),
    defaultPaymentFeePct: numberText(settings.defaultPaymentFeePct),
    defaultPaymentFixedFeeUsd: numberText(settings.defaultPaymentFixedFeeUsd),
    monthlyListingLimit: numberText(settings.monthlyListingLimit),
    monthlyAmountLimitUsd: numberText(settings.monthlyAmountLimitUsd),
    cjPostCreateCheckoutMode: settings.cjPostCreateCheckoutMode,
    marketNiche: 'PET_SUPPLIES',
    requirePetCategory: settings.requirePetCategory ?? true,
  };
}

export default function CjEbaySettingsPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewImpact | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; settings: CjEbaySettings }>('/api/cj-ebay/config');
      if (res.data?.settings) setForm(toForm(res.data.settings));
      void loadPreview();
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar la configuracion CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const res = await api.get<{ ok: boolean } & PreviewImpact>('/api/cj-ebay/config/preview-impact');
      setPreview(res.data);
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        minMarginPct: parseOptionalNumber(form.minMarginPct),
        minProfitUsd: parseOptionalNumber(form.minProfitUsd),
        maxShippingUsd: parseOptionalNumber(form.maxShippingUsd),
        handlingBufferDays: parseOptionalInteger(form.handlingBufferDays) ?? 2,
        minStock: parseOptionalInteger(form.minStock) ?? 1,
        rejectOnUnknownShipping: form.rejectOnUnknownShipping,
        maxRiskScore: parseOptionalInteger(form.maxRiskScore),
        priceChangePctReevaluate: parseOptionalNumber(form.priceChangePctReevaluate),
        incidentBufferPct: parseOptionalNumber(form.incidentBufferPct),
        defaultEbayFeePct: parseOptionalNumber(form.defaultEbayFeePct),
        defaultPaymentFeePct: parseOptionalNumber(form.defaultPaymentFeePct),
        defaultPaymentFixedFeeUsd: parseOptionalNumber(form.defaultPaymentFixedFeeUsd),
        monthlyListingLimit: parseOptionalInteger(form.monthlyListingLimit),
        monthlyAmountLimitUsd: parseOptionalNumber(form.monthlyAmountLimitUsd),
        cjPostCreateCheckoutMode: form.cjPostCreateCheckoutMode,
        marketNiche: 'PET_SUPPLIES',
        requirePetCategory: form.requirePetCategory,
      };
      const res = await api.post<{ ok: boolean; settings: CjEbaySettings }>('/api/cj-ebay/config', payload);
      if (res.data?.settings) setForm(toForm(res.data.settings));
      await loadPreview();
      setMessage('Configuracion CJ-eBay guardada.');
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar la configuracion.'));
    } finally {
      setSaving(false);
    }
  }

  async function resetOperationalData() {
    const ok = window.confirm('Esto limpia productos, drafts, listings, ordenes, alertas, logs y recomendaciones CJ-eBay para partir desde cero. No borra credenciales ni otros modulos. Continuar?');
    if (!ok) return;
    setResetting(true);
    setMessage(null);
    setError(null);
    try {
      await api.post('/api/cj-ebay/config/reset-operational-data', {
        confirm: 'RESET_CJ_EBAY_USA',
        keepSettings: true,
      });
      await load();
      setMessage('Datos operativos CJ-eBay limpiados. Nicho pet y guardrails USA quedaron activos.');
    } catch (e) {
      setError(apiError(e, 'No se pudo limpiar CJ-eBay.'));
    } finally {
      setResetting(false);
    }
  }

  const input = (key: keyof FormState, label: string, props?: { step?: string; min?: number; max?: number }) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="number"
        value={String(form[key])}
        min={props?.min}
        max={props?.max}
        step={props?.step ?? '0.01'}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );

  const applyDefaultSellingLimits = () => {
    setForm((prev) => ({
      ...prev,
      monthlyListingLimit: DEFAULT_MONTHLY_LISTING_LIMIT,
      monthlyAmountLimitUsd: DEFAULT_MONTHLY_AMOUNT_LIMIT_USD,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuracion CJ-eBay...
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Configuracion CJ → eBay USA</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reglas de margen, fees, riesgo, fulfillment y cuotas mensuales usadas antes de publicar en eBay.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.72fr_0.78fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pricing y evaluacion</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('minMarginPct', 'Margen neto minimo (%)', { min: 0, max: 100 })}
            {input('minProfitUsd', 'Utilidad minima (USD)', { min: 0 })}
            {input('maxShippingUsd', 'Flete maximo CJ→US (USD)', { min: 0 })}
            {input('minStock', 'Stock minimo variante', { min: 0, step: '1' })}
            {input('defaultEbayFeePct', 'Fee eBay default (%)', { min: 0, max: 100 })}
            {input('defaultPaymentFeePct', 'Fee pago default (%)', { min: 0, max: 100 })}
            {input('defaultPaymentFixedFeeUsd', 'Fee fijo pago (USD)', { min: 0 })}
            {input('incidentBufferPct', 'Buffer incidentes (%)', { min: 0, max: 100 })}
            {input('maxRiskScore', 'Riesgo maximo permitido', { min: 0, max: 100, step: '1' })}
            {input('priceChangePctReevaluate', 'Reevaluar si precio cambia (%)', { min: 0, max: 100 })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cuotas y fulfillment eBay</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              eBay no publica un limite universal: cada cuenta debe revisar Seller Hub → Overview → Monthly limits.
              Mientras no copies tus limites reales, este modulo usa un default conservador de 10 publicaciones y USD 500 al mes.
            </div>
            {input('monthlyListingLimit', 'Max publicaciones eBay por mes', { min: 1, step: '1' })}
            {input('monthlyAmountLimitUsd', 'Max monto eBay por mes (USD)', { min: 0.01 })}
            <button
              type="button"
              onClick={applyDefaultSellingLimits}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Usar default seguro: 10 / USD 500
            </button>
            {input('handlingBufferDays', 'Handling buffer dias', { min: 0, step: '1' })}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <span className="text-slate-700 dark:text-slate-200">Rechazar shipping desconocido</span>
              <input
                type="checkbox"
                checked={form.rejectOnUnknownShipping}
                onChange={(e) => setForm((prev) => ({ ...prev, rejectOnUnknownShipping: e.target.checked }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Checkout CJ post-publicacion</span>
              <select
                value={form.cjPostCreateCheckoutMode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    cjPostCreateCheckoutMode: e.target.value === 'AUTO_CONFIRM_PAY' ? 'AUTO_CONFIRM_PAY' : 'MANUAL',
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="MANUAL">Manual</option>
                <option value="AUTO_CONFIRM_PAY">Auto confirmar y pagar</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <span className="text-slate-700 dark:text-slate-200">Discovery solo Pet Supplies eBay USA</span>
              <input
                type="checkbox"
                checked={form.requirePetCategory}
                onChange={(e) => setForm((prev) => ({ ...prev, requirePetCategory: e.target.checked }))}
              />
            </label>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-200">
              Nicho activo: Pet Supplies USA. El agente prioriza articulos pet livianos, con warehouse CJ USA y margen protegido.
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preview de impacto</h2>
            </div>
            <button type="button" onClick={() => void loadPreview()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loadingPreview ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {preview ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-xs">
                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="text-slate-500">Exposición activa</span>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {preview.summary.activeExposureUsd.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Bajo margen" value={preview.summary.belowMarginCount} />
                  <Metric label="Policy block" value={preview.summary.policyBlockedCount} />
                  <Metric label="Publicables" value={preview.summary.draftPublishableCount} />
                  <Metric label="Cuota" value={preview.summary.quotaConfigured ? 'OK' : 'Falta'} />
                </div>
              </div>
              <div className="space-y-2">
                {preview.issues.slice(0, 4).map((issue) => (
                  <div key={`${issue.type}-${issue.title}`} className={`rounded-lg border px-3 py-2 text-xs ${
                    issue.severity === 'critical'
                      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200'
                      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
                  }`}>
                    <p className="font-semibold">{issue.title}</p>
                    <p className="mt-1">{issue.detail}</p>
                  </div>
                ))}
                {preview.issues.length === 0 && <p className="text-sm text-slate-500">Sin impactos críticos con la configuración actual.</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Preview no disponible todavía.</p>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuracion
        </button>
        {message && <span className="text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>

      <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-red-900 dark:text-red-100">Reset operativo CJ-eBay</h2>
            <p className="mt-1 text-xs text-red-700 dark:text-red-200">
              Limpia la verdad operativa del modulo para partir desde cero: productos, recomendaciones, listings, ordenes, alertas, profit y logs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void resetOperationalData()}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Limpiar CJ-eBay
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
