/**
 * ListingDetailDrawer — Slide-over panel for listing details
 * Premium right-panel overlay with pricing breakdown, status, and actions.
 */
import { Fragment } from 'react';
import {
  X,
  ExternalLink,
  DollarSign,
  Package,
  Truck,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
} from 'lucide-react';

type ListingDrawerProps = {
  listing: {
    id: number;
    status: string;
    shopifyProductId: string | null;
    shopifyHandle: string | null;
    storefrontUrl: string | null;
    listedPriceUsd: number | null;
    publishedAt: string | null;
    lastError: string | null;
    updatedAt: string;
    publishTruth?: {
      buyerFacingVerified?: boolean;
      shopify?: {
        adminStatus: string | null;
        publishedOnPublication: boolean | null;
        inventoryQuantity: number | null;
        handle: string | null;
      };
      storefront?: {
        passwordGate: boolean | null;
        hasAddToCart: boolean | null;
        hasPrice: boolean | null;
      };
      reasons?: string[];
    };
    draftPayload?: {
      title?: string | null;
      handle?: string | null;
      images?: string[];
      pricingSnapshot?: {
        supplierCostUsd?: number | null;
        shippingCostUsd?: number | null;
        paymentProcessingFeeUsd?: number | null;
        targetProfitUsd?: number | null;
        suggestedSellPriceUsd?: number | null;
        netMarginPct?: number | null;
      };
      shippingSnapshot?: {
        serviceName?: string | null;
        carrier?: string | null;
        estimatedMinDays?: number | null;
        estimatedMaxDays?: number | null;
        originCountryCode?: string | null;
      } | null;
    } | null;
    product: { id: number; cjProductId: string; title: string } | null;
    variant: {
      id: number;
      cjSku: string | null;
      unitCostUsd?: number | string | null;
      stockLastKnown?: number | null;
    } | null;
  } | null;
  open: boolean;
  onClose: () => void;
};

function usd(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-500',
  PUBLISHING: 'bg-blue-500',
  ACTIVE: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  PAUSED: 'bg-amber-500',
  ARCHIVED: 'bg-slate-400',
  RECONCILE_PENDING: 'bg-violet-500',
};

export function ListingDetailDrawer({ listing, open, onClose }: ListingDrawerProps) {
  if (!open || !listing) return null;

  const pricing = listing.draftPayload?.pricingSnapshot;
  const shipping = listing.draftPayload?.shippingSnapshot;
  const images = listing.draftPayload?.images ?? [];
  const title = listing.draftPayload?.title ?? listing.product?.title ?? `Listing #${listing.id}`;
  const truth = listing.publishTruth;

  return (
    <Fragment>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto bg-white shadow-2xl dark:bg-slate-900 transform transition-transform duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[listing.status] ?? 'bg-slate-400'}`} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Listing #{listing.id} · {listing.status}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Gallery */}
        {images.length > 0 && (
          <div className="px-5 pt-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.slice(0, 5).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${title} ${i + 1}`}
                  className="h-24 w-24 rounded-xl object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
                />
              ))}
            </div>
          </div>
        )}

        <div className="px-5 py-4 space-y-5">
          {/* Pricing Breakdown */}
          {pricing && (
            <section>
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Desglose de Precios
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
                {[
                  ['Costo CJ', usd(pricing.supplierCostUsd)],
                  ['Envío', usd(pricing.shippingCostUsd)],
                  ['Fee procesamiento', usd(pricing.paymentProcessingFeeUsd)],
                  ['Profit objetivo', usd(pricing.targetProfitUsd)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-slate-100 dark:border-slate-700/50 last:border-b-0">
                    <span className="text-slate-600 dark:text-slate-400">{label}</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">Precio de venta</span>
                  <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {usd(pricing.suggestedSellPriceUsd ?? listing.listedPriceUsd)}
                  </span>
                </div>
                {pricing.netMarginPct != null && (
                  <div className="px-4 py-2 text-center">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Margen: {Number(pricing.netMarginPct).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Shipping */}
          {shipping && (
            <section>
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Envío
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
                {shipping.originCountryCode && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${shipping.originCountryCode === 'US' ? 'bg-blue-500/90 text-white' : 'bg-slate-600 text-slate-200'}`}>
                      {shipping.originCountryCode === 'US' ? '🇺🇸 USA' : `🇨🇳 ${shipping.originCountryCode}`}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">{shipping.serviceName ?? shipping.carrier ?? '—'}</span>
                  </div>
                )}
                {(shipping.estimatedMinDays || shipping.estimatedMaxDays) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Entrega estimada: {shipping.estimatedMinDays ?? '?'}–{shipping.estimatedMaxDays ?? '?'} días hábiles
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Shopify Truth */}
          {truth && (
            <section>
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Estado Shopify
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <CheckItem label="Admin Status" ok={truth.shopify?.adminStatus === 'ACTIVE'} value={truth.shopify?.adminStatus ?? '—'} />
                  <CheckItem label="Publicación" ok={truth.shopify?.publishedOnPublication === true} value={truth.shopify?.publishedOnPublication ? 'Online Store' : 'No publicado'} />
                  <CheckItem label="Verificado" ok={truth.buyerFacingVerified === true} value={truth.buyerFacingVerified ? 'Buyer ready' : 'Pendiente'} />
                  <CheckItem label="Inventario" ok={(truth.shopify?.inventoryQuantity ?? 0) > 0} value={String(truth.shopify?.inventoryQuantity ?? '—')} />
                </div>
                {truth.reasons && truth.reasons.length > 0 && (
                  <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 p-2.5">
                    <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 mb-1">Notas de reconciliación</p>
                    <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                      {truth.reasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Variant/SKU Details */}
          {listing.variant && (
            <section>
              <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Variante
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">SKU</span>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{listing.variant.cjSku ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Stock</span>
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">{listing.variant.stockLastKnown ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Costo unitario</span>
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">{usd(Number(listing.variant.unitCostUsd ?? 0))}</span>
                </div>
              </div>
            </section>
          )}

          {/* Error */}
          {listing.lastError && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">Error</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{listing.lastError}</p>
              </div>
            </div>
          )}

          {/* Links */}
          <div className="flex flex-wrap gap-2 pt-1">
            {listing.storefrontUrl && (
              <a
                href={listing.storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800/50 hover:bg-primary-100 dark:hover:bg-primary-950/50 transition"
              >
                <Eye className="w-3.5 h-3.5" /> Ver en tienda
              </a>
            )}
            {listing.shopifyProductId && (
              <a
                href={`https://admin.shopify.com/store/ivanreseller/products/${listing.shopifyProductId.replace('gid://shopify/Product/', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Shopify Admin
              </a>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 pt-2">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(listing.updatedAt).toLocaleString()}</span>
            {listing.publishedAt && (
              <span>Publicado: {new Date(listing.publishedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>
    </Fragment>
  );
}

function CheckItem({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 px-3 py-2">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase text-slate-400">{label}</p>
        <p className={`text-xs font-medium truncate ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>{value}</p>
      </div>
    </div>
  );
}
