import { AlertTriangle, ExternalLink, Package, ShieldAlert, X } from 'lucide-react';

export type CjEbayListingDetail = {
  lastError: string | null;
  draftPayload: unknown;
  status: string;
  reconcileAttempts?: number | null;
  reconcileRetryAfter?: string | null;
  qualityWarnings?: Array<{ code: string; message: string }>;
};

export type CjEbayListingDrawerRow = {
  id: number;
  status: string;
  productTitle: string;
  cjProductId: string;
  listedPriceUsd: number | null;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  ebaySku: string | null;
  variantCjSku: string | null;
  variantCjVid: string | null;
  handlingTimeDays: number | null;
  quantity: number | null;
  publishedAt: string | null;
  updatedAt: string;
};

type Props = {
  open: boolean;
  listing: CjEbayListingDrawerRow | null;
  detail: CjEbayListingDetail | null;
  loading?: boolean;
  onClose: () => void;
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function date(value: string | null | undefined) {
  if (!value) return '--';
  return new Date(value).toLocaleString('es-CL');
}

function draftRecord(detail: CjEbayListingDetail | null): Record<string, unknown> {
  return detail?.draftPayload && typeof detail.draftPayload === 'object'
    ? (detail.draftPayload as Record<string, unknown>)
    : {};
}

export default function CjEbayListingDetailDrawer({ open, listing, detail, loading, onClose }: Props) {
  if (!open || !listing) return null;

  const draft = draftRecord(detail);
  const images = Array.isArray(draft.images) ? (draft.images as string[]).slice(0, 8) : [];
  const title = typeof draft.title === 'string' ? draft.title : listing.productTitle;
  const policyBlocked = detail?.status === 'ACCOUNT_POLICY_BLOCK' || listing.status === 'ACCOUNT_POLICY_BLOCK';
  const reconcileState = ['OFFER_ALREADY_EXISTS', 'RECONCILE_PENDING', 'RECONCILE_FAILED'].includes(detail?.status || listing.status);

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Cerrar detalle" className="absolute inset-0 bg-slate-950/55" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-700 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">Listing eBay #{listing.id}</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {listing.ebaySku || listing.variantCjSku || 'SKU pendiente'} · {money(listing.listedPriceUsd)} · {listing.status}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
              Cargando verdad operacional eBay...
            </div>
          )}

          {policyBlocked && (
            <section className="rounded-lg border border-amber-700 bg-amber-950/35 px-4 py-3 text-sm text-amber-100">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4" />
                Bloqueo de cuenta eBay
              </div>
              <p className="mt-2 text-amber-100/90">
                eBay rechazó el publish por política de overseas warehouse / ship-from China. El draft se conserva; no es un problema de título, precio ni descripción.
              </p>
            </section>
          )}

          {reconcileState && (
            <section className="rounded-lg border border-violet-700 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Reconciliación offer/listing
              </div>
              <p className="mt-2 text-violet-100/90">
                Offer ID: <span className="font-mono">{listing.ebayOfferId || '--'}</span> · Listing ID:{' '}
                <span className="font-mono">{listing.ebayListingId || '--'}</span> · intentos {detail?.reconcileAttempts ?? '--'}
              </p>
              {detail?.reconcileRetryAfter && (
                <p className="mt-1 text-xs text-violet-200">Reintentar después de {date(detail.reconcileRetryAfter)}</p>
              )}
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="Precio eBay" value={money(listing.listedPriceUsd)} />
            <Metric label="Cantidad" value={listing.quantity ?? '--'} />
            <Metric label="Handling" value={listing.handlingTimeDays == null ? '--' : `${listing.handlingTimeDays} dias`} />
            <Metric label="CJ Product" value={listing.cjProductId} mono />
            <Metric label="CJ SKU" value={listing.variantCjSku || '--'} mono />
            <Metric label="CJ VID" value={listing.variantCjVid || '--'} mono />
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4 text-cyan-300" />
                Verdad eBay
              </div>
              {listing.ebayListingId && (
                <a
                  href={`https://www.ebay.com/itm/${listing.ebayListingId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                >
                  Abrir eBay <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="grid gap-3 px-4 py-3 text-xs text-slate-300 sm:grid-cols-2">
              <Info label="Estado local" value={detail?.status || listing.status} />
              <Info label="Offer ID" value={listing.ebayOfferId || '--'} mono />
              <Info label="Listing ID" value={listing.ebayListingId || '--'} mono />
              <Info label="Publicado" value={date(listing.publishedAt)} />
              <Info label="Actualizado" value={date(listing.updatedAt)} />
              <Info label="SKU eBay" value={listing.ebaySku || '--'} mono />
            </div>
          </section>

          {images.length > 0 && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <p className="mb-3 text-sm font-semibold">Imagenes adaptadas para eBay</p>
              <div className="grid grid-cols-4 gap-2">
                {images.map((src) => (
                  <img key={src} src={src} alt="" className="aspect-square rounded-md border border-slate-800 object-cover" loading="lazy" />
                ))}
              </div>
            </section>
          )}

          {detail?.qualityWarnings && detail.qualityWarnings.length > 0 && (
            <section className="rounded-lg border border-amber-800 bg-amber-950/25 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-100">Avisos de calidad</p>
              <div className="mt-2 space-y-1 text-xs text-amber-200">
                {detail.qualityWarnings.map((warning) => (
                  <p key={warning.code}>
                    <span className="font-mono text-amber-300">[{warning.code}]</span> {warning.message}
                  </p>
                ))}
              </div>
            </section>
          )}

          {detail?.lastError && (
            <section className="rounded-lg border border-rose-800 bg-rose-950/25 px-4 py-3 text-sm">
              <p className="font-semibold text-rose-100">Ultimo error</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-rose-200">{detail.lastError}</pre>
            </section>
          )}

          <details className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs">
            <summary className="cursor-pointer text-slate-300">Draft payload JSON</summary>
            <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-950 p-3 text-slate-300">
              {JSON.stringify(detail?.draftPayload ?? null, null, 2)}
            </pre>
          </details>
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
