import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { api } from '@/services/api';

type NullableNum = number | null;

type PricingBreakdownJson = {
  supplierCostUsd: NullableNum;
  shippingUsd: NullableNum;
  ebayFeeUsd: NullableNum;
  paymentFeeUsd: NullableNum;
  incidentBufferUsd: NullableNum;
  totalCostUsd: NullableNum;
  listPriceUsd: NullableNum;
  netProfitUsd: NullableNum;
  netMarginPct: NullableNum;
  suggestedPriceUsd: NullableNum;
  minimumAllowedPriceUsd: NullableNum;
  feeDefaultsApplied: Record<string, number>;
};

type ShippingSnippet = {
  cost: number;
  method: string;
  estimatedDays: number | null;
};

type QualificationReason = {
  rule: string;
  code: string;
  message: string;
  severity: string;
};

type PreviewOk = {
  ok: true;
  breakdown: PricingBreakdownJson;
  shipping: ShippingSnippet;
  product: { cjProductId: string; title: string };
  variant: { cjSku: string; cjVid?: string; stockLive: number; unitCostUsd: number | null };
  riskScore: number;
};

type EvaluateOk = PreviewOk & {
  decision: 'APPROVED' | 'REJECTED' | 'PENDING';
  reasons: QualificationReason[];
  ids: {
    productDbId: number;
    variantDbId: number;
    shippingQuoteId: number;
    evaluationId: number;
  };
};

function fmtUsd(n: NullableNum): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function fmtPct(n: NullableNum): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function DecisionPill({ decision }: { decision: EvaluateOk['decision'] }) {
  const styles: Record<EvaluateOk['decision'], string> = {
    APPROVED:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800',
    REJECTED:
      'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100 border-rose-200 dark:border-rose-800',
    PENDING:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 border-amber-200 dark:border-amber-800',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[decision]}`}
    >
      {decision}
    </span>
  );
}

export default function CjEbayProductsPage() {
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [destPostalCode, setDestPostalCode] = useState('90210');

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingEvaluate, setLoadingEvaluate] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftListingId, setDraftListingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [evaluate, setEvaluate] = useState<EvaluateOk | null>(null);

  const body = () => ({
    productId: productId.trim(),
    variantId: variantId.trim(),
    quantity: Math.max(1, Math.floor(quantity)),
    destPostalCode: destPostalCode.trim() || undefined,
  });

  async function runPreview() {
    setError(null);
    setPreview(null);
    setEvaluate(null);
    setLoadingPreview(true);
    try {
      const res = await api.post<PreviewOk>('/api/cj-ebay/pricing/preview', body());
      if (res.data?.ok) {
        setPreview(res.data);
      }
    } catch (e: unknown) {
      let msg = 'Error en vista previa.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { error?: string; message?: string };
        if (d.error === 'NO_UNIT_COST') {
          msg = 'La variante no tiene costo unitario usable (NO_UNIT_COST).';
        } else if (d.message) {
          msg = d.message;
        } else if (d.error) {
          msg = d.error;
        }
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setError(msg);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function runEvaluate() {
    setError(null);
    setEvaluate(null);
    setLoadingEvaluate(true);
    try {
      const res = await api.post<EvaluateOk>('/api/cj-ebay/evaluate', body());
      if (res.data?.ok) {
        setEvaluate(res.data);
      }
    } catch (e: unknown) {
      let msg = 'Error al evaluar.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { error?: string; message?: string };
        if (d.message) msg = d.message;
        else if (d.error) msg = d.error;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setError(msg);
    } finally {
      setLoadingEvaluate(false);
    }
  }

  async function runDraft() {
    setError(null);
    setDraftListingId(null);
    setLoadingDraft(true);
    try {
      const res = await api.post<{
        ok: boolean;
        listingId: number;
        policyNote?: string;
      }>('/api/cj-ebay/listings/draft', body());
      if (res.data?.ok && typeof res.data.listingId === 'number') {
        setDraftListingId(res.data.listingId);
      }
    } catch (e: unknown) {
      let msg = 'Error al crear draft.';
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
        const d = e.response.data as { message?: string; error?: string };
        msg = d.message || d.error || msg;
      } else if (e instanceof Error) msg = e.message;
      setError(msg);
    } finally {
      setLoadingDraft(false);
    }
  }

  const showBreakdown = preview ?? evaluate;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        FASE 3C–3D: evaluación/pricing y borrador de listing (requiere APPROVED + imágenes HTTPS). Los datos se escriben en{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">cj_ebay_shipping_quotes</code>{' '}
        y{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">
          cj_ebay_product_evaluations
        </code>{' '}
        con <strong>Evaluar y persistir</strong>. El draft (FASE 3D) va a{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">cj_ebay_listings</code>.
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Entrada</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            productId (CJ)
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={productId}
              onChange={(ev) => setProductId(ev.target.value)}
              placeholder="p.ej. identificador de producto CJ"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            variantId (vid o SKU)
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={variantId}
              onChange={(ev) => setVariantId(ev.target.value)}
              placeholder="vid preferido"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            quantity
            <input
              type="number"
              min={1}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={quantity}
              onChange={(ev) => setQuantity(Number(ev.target.value))}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            destPostalCode (USA)
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm"
              value={destPostalCode}
              onChange={(ev) => setDestPostalCode(ev.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loadingPreview || !productId.trim() || !variantId.trim()}
            className="rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-4 py-2 disabled:opacity-50"
            onClick={() => void runPreview()}
          >
            {loadingPreview ? 'Vista previa…' : 'Vista previa pricing'}
          </button>
          <button
            type="button"
            disabled={loadingEvaluate || !productId.trim() || !variantId.trim()}
            className="rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium px-4 py-2 disabled:opacity-50"
            onClick={() => void runEvaluate()}
          >
            {loadingEvaluate ? 'Evaluando…' : 'Evaluar y persistir'}
          </button>
          <button
            type="button"
            disabled={
              loadingDraft ||
              evaluate?.decision !== 'APPROVED' ||
              !productId.trim() ||
              !variantId.trim()
            }
            className="rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium px-4 py-2 text-emerald-800 dark:text-emerald-200 disabled:opacity-50"
            onClick={() => void runDraft()}
            title="Requiere última evaluación APPROVED para esta variante en BD"
          >
            {loadingDraft ? 'Draft…' : 'Crear draft listing'}
          </button>
        </div>
        {draftListingId != null && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Draft guardado: listing local #{draftListingId}.{' '}
            <Link to="/cj-ebay/listings" className="underline font-medium">
              Ir a Listings → Publicar
            </Link>
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-900 dark:text-rose-100">
          {error}
        </div>
      )}

      {evaluate && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Decisión</h2>
            <DecisionPill decision={evaluate.decision} />
            <span className="text-xs text-slate-500">riskScore: {evaluate.riskScore}</span>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>
              productDbId {evaluate.ids.productDbId} · variantDbId {evaluate.ids.variantDbId} ·
              shippingQuoteId {evaluate.ids.shippingQuoteId} · evaluationId {evaluate.ids.evaluationId}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">Razones</h3>
            <ul className="space-y-2 text-sm">
              {evaluate.reasons.map((r) => (
                <li
                  key={`${r.code}-${r.message}`}
                  className="rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 px-3 py-2"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {r.rule} · {r.code}
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-700 dark:text-slate-300">{r.message}</span>
                  <span className="ml-2 text-xs uppercase text-slate-400">{r.severity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showBreakdown && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Desglose de pricing
          </h2>
          {'product' in showBreakdown && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">{showBreakdown.product.title}</span>
              <span className="text-slate-400"> · </span>
              stock en vivo {showBreakdown.variant.stockLive}
              <span className="text-slate-400"> · </span>
              costo unitario{' '}
              {showBreakdown.variant.unitCostUsd != null
                ? fmtUsd(showBreakdown.variant.unitCostUsd)
                : '—'}
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Envío CJ: {fmtUsd(showBreakdown.shipping.cost)} ({showBreakdown.shipping.method})
            {showBreakdown.shipping.estimatedDays != null
              ? ` · ~${showBreakdown.shipping.estimatedDays} d`
              : ' · plazo desconocido'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <Row label="Costo proveedor (línea)" v={showBreakdown.breakdown.supplierCostUsd} />
            <Row label="Shipping" v={showBreakdown.breakdown.shippingUsd} />
            <Row label="Fee eBay (est.)" v={showBreakdown.breakdown.ebayFeeUsd} />
            <Row label="Fee pago (est.)" v={showBreakdown.breakdown.paymentFeeUsd} />
            <Row label="Buffer incidentes" v={showBreakdown.breakdown.incidentBufferUsd} />
            <Row label="Costo total @ list price" v={showBreakdown.breakdown.totalCostUsd} />
            <Row label="Precio lista (sugerido)" v={showBreakdown.breakdown.listPriceUsd} />
            <Row label="Utilidad neta" v={showBreakdown.breakdown.netProfitUsd} />
            <div className="sm:col-span-2">
              Margen neto:{' '}
              <span className="font-semibold tabular-nums">
                {fmtPct(showBreakdown.breakdown.netMarginPct)}
              </span>
            </div>
            <Row label="Precio sugerido" v={showBreakdown.breakdown.suggestedPriceUsd} />
            <Row label="Precio mínimo permitido" v={showBreakdown.breakdown.minimumAllowedPriceUsd} />
          </div>
          {Object.keys(showBreakdown.breakdown.feeDefaultsApplied || {}).length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              Fees por defecto aplicados (configura cuenta):{' '}
              {JSON.stringify(showBreakdown.breakdown.feeDefaultsApplied)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, v }: { label: string; v: NullableNum }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 py-1">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{fmtUsd(v)}</span>
    </div>
  );
}
