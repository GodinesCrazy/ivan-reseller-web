import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import { Loader2, Save, Settings, ShieldCheck } from 'lucide-react';

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
};

type FormState = Record<keyof Omit<CjEbaySettings, 'rejectOnUnknownShipping' | 'cjPostCreateCheckoutMode'>, string> & {
  rejectOnUnknownShipping: boolean;
  cjPostCreateCheckoutMode: 'MANUAL' | 'AUTO_CONFIRM_PAY';
};

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
  monthlyListingLimit: '',
  monthlyAmountLimitUsd: '',
  cjPostCreateCheckoutMode: 'MANUAL',
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
  };
}

export default function CjEbaySettingsPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; settings: CjEbaySettings }>('/api/cj-ebay/config');
      if (res.data?.settings) setForm(toForm(res.data.settings));
    } catch (e) {
      setError(apiError(e, 'No se pudo cargar la configuracion CJ-eBay.'));
    } finally {
      setLoading(false);
    }
  }, []);

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
      };
      const res = await api.post<{ ok: boolean; settings: CjEbaySettings }>('/api/cj-ebay/config', payload);
      if (res.data?.settings) setForm(toForm(res.data.settings));
      setMessage('Configuracion CJ-eBay guardada.');
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar la configuracion.'));
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuracion CJ-eBay...
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Configuracion CJ → eBay USA</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reglas de margen, fees, riesgo, fulfillment y cuotas mensuales usadas antes de publicar en eBay.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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
            {input('monthlyListingLimit', 'Max publicaciones eBay por mes', { min: 1, step: '1' })}
            {input('monthlyAmountLimitUsd', 'Max monto eBay por mes (USD)', { min: 0.01 })}
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
          </div>
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
    </div>
  );
}
