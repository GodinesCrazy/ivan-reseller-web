import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, Truck, BadgeDollarSign, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';

type ManualListDraft = {
  aliexpressItemId: string;
  aliexpressUrl: string;
  title: string;
  description: string;
  category: string | null;
  images: string[];
  pricing: {
    aliexpressCostUsd: number;
    shippingCostUsd: number;
    importTaxUsd: number;
    estimatedEbayFeeUsd: number;
    landedCostBeforeFeesUsd: number;
    totalEstimatedCostUsd: number;
    targetMarginMultiplier: number;
    suggestedPriceUsd: number;
  };
  compliance: {
    supplierRatingFive: number | null;
    supplierPositivePercent: number | null;
    minimumRequiredRatingFive: number;
    hasValidInternationalTracking: boolean;
    selectedShippingService: string | null;
    selectedShippingEtaDays: number | null;
    canPublish: boolean;
    blockers: string[];
  };
  ebayPolicyPreview: {
    country: string;
    location: string;
    shippingService: string;
    dispatchTimeMax: number;
  };
};

type ConfirmResult = {
  productId: number;
  publishResult?: {
    listingId?: string;
    listingUrl?: string;
    error?: string;
  };
};

export default function ManualList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialItemId = searchParams.get('aliexpress_item_id') || '';

  const [aliexpressItemId, setAliExpressItemId] = useState(initialItemId);
  const [targetMarginMultiplier, setTargetMarginMultiplier] = useState(1.2);
  const [draft, setDraft] = useState<ManualListDraft | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const canConfirm = useMemo(
    () => Boolean(draft && draft.compliance.canPublish && !publishing),
    [draft, publishing]
  );

  const loadDraft = async (itemId: string, margin: number) => {
    const cleanItemId = String(itemId || '').trim();
    if (!cleanItemId) {
      toast.error('Ingresa un aliexpress_item_id válido');
      return;
    }

    setLoadingDraft(true);
    setConfirmResult(null);
    try {
      const { data } = await api.get(
        `/api/publisher/manual-list/${encodeURIComponent(cleanItemId)}`,
        {
          params: {
            targetMarginMultiplier: margin,
          },
        }
      );
      setDraft((data?.data || null) as ManualListDraft | null);
      setSearchParams({ aliexpress_item_id: cleanItemId });
      toast.success('Costos precargados correctamente');
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || error?.message || 'No se pudo precargar el artículo.';
      setDraft(null);
      toast.error(msg);
    } finally {
      setLoadingDraft(false);
    }
  };

  const onSubmitLoad = async (e: FormEvent) => {
    e.preventDefault();
    await loadDraft(aliexpressItemId, targetMarginMultiplier);
  };

  const onConfirmAndPublish = async () => {
    if (!draft) return;
    setPublishing(true);
    setConfirmResult(null);
    try {
      const { data } = await api.post('/api/publisher/manual-list/confirm-and-publish', {
        aliexpressItemId: draft.aliexpressItemId,
        targetMarginMultiplier,
      });
      setConfirmResult(data as ConfirmResult);
      toast.success('Publicado en eBay US correctamente');
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || error?.message || 'No se pudo publicar en eBay.';
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (initialItemId) {
      void loadDraft(initialItemId, targetMarginMultiplier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Manual List eBay US</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Precarga costos reales desde AliExpress y publica con cumplimiento China - eBay USA.
        </p>
      </div>

      <form onSubmit={onSubmitLoad} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">AliExpress Item ID o URL</span>
            <input
              type="text"
              value={aliexpressItemId}
              onChange={(e) => setAliExpressItemId(e.target.value)}
              placeholder="1005001234567890"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Margen objetivo</span>
            <input
              type="number"
              min={1.01}
              step={0.01}
              value={targetMarginMultiplier}
              onChange={(e) => setTargetMarginMultiplier(Number(e.target.value) || 1.2)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loadingDraft}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {loadingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeDollarSign className="w-4 h-4" />}
          Precargar costos
        </button>
      </form>

      {draft && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{draft.title}</h2>
            <p className="text-xs text-slate-500 mt-1 break-all">{draft.aliexpressUrl}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Costo Ali</p>
              <p className="text-lg font-semibold">${draft.pricing.aliexpressCostUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Shipping</p>
              <p className="text-lg font-semibold">${draft.pricing.shippingCostUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Impuesto USA 10%</p>
              <p className="text-lg font-semibold">${draft.pricing.importTaxUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Fee eBay estimado</p>
              <p className="text-lg font-semibold">${draft.pricing.estimatedEbayFeeUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Precio sugerido</p>
              <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                ${draft.pricing.suggestedPriceUsd.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-medium mb-2">
                <ShieldCheck className="w-4 h-4" />
                Validación Anti-Rechazo
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Rating proveedor:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {draft.compliance.supplierPositivePercent != null
                    ? `${draft.compliance.supplierPositivePercent.toFixed(2)}%`
                    : 'Sin evidencia'}
                </span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Tracking internacional:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {draft.compliance.hasValidInternationalTracking ? 'Válido' : 'No válido'}
                </span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Shipping seleccionado:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {draft.compliance.selectedShippingService || 'No disponible'}
                </span>
              </p>
              {draft.compliance.blockers.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-red-600 dark:text-red-400">
                  {draft.compliance.blockers.map((blocker) => (
                    <li key={blocker}>- {blocker}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-medium mb-2">
                <Truck className="w-4 h-4" />
                Payload eBay (compliance)
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Country: <span className="font-medium text-slate-900 dark:text-slate-100">{draft.ebayPolicyPreview.country}</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Location: <span className="font-medium text-slate-900 dark:text-slate-100">{draft.ebayPolicyPreview.location}</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                ShippingService:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{draft.ebayPolicyPreview.shippingService}</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                DispatchTimeMax:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{draft.ebayPolicyPreview.dispatchTimeMax}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onConfirmAndPublish}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Confirm and Publish
          </button>
        </div>
      )}

      {confirmResult && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 text-sm">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
            Publicación completada. Producto #{confirmResult.productId}
          </p>
          {confirmResult.publishResult?.listingId && (
            <p className="mt-1 text-emerald-800 dark:text-emerald-200">
              Listing ID: {confirmResult.publishResult.listingId}
            </p>
          )}
          {confirmResult.publishResult?.listingUrl && (
            <a
              href={confirmResult.publishResult.listingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-emerald-800 dark:text-emerald-200 underline"
            >
              Ver publicación
            </a>
          )}
        </div>
      )}
    </div>
  );
}
