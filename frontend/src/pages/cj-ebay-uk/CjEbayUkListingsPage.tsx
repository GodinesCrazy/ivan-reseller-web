import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Listing = {
  id: number;
  status: string;
  listedPriceGbp?: number;
  ebaySku?: string;
  ebayListingId?: string;
  publishError?: string;
  updatedAt: string;
  product?: { title: string; cjProductId: string };
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  ACCOUNT_POLICY_BLOCK: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  PUBLISHING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

export default function CjEbayUkListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ ok: boolean; listings: Listing[] }>('/api/cj-ebay-uk/listings')
      .then((r) => { if (r.data?.ok) setListings(r.data.listings); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Cargando listings UK…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          eBay UK Authorization Pending
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
          Publishing to eBay UK (ebay.co.uk) requires an eBay UK seller account connected with EBAY_GB scope.
          Drafts can be created now. Connect your eBay UK account in API Settings to enable publish.
        </p>
      </div>

      {listings.length === 0 ? (
        <p className="text-sm text-slate-500">No listings yet. Evaluate a product and create a draft.</p>
      ) : (
        <div className="space-y-2">
          {listings.map((l) => (
            <div key={l.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {l.product?.title || l.ebaySku || `Listing #${l.id}`}
                  </p>
                  {l.ebaySku && <p className="text-xs text-slate-400 mt-0.5">SKU: {l.ebaySku}</p>}
                  {l.listedPriceGbp != null && (
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mt-1">
                      £{Number(l.listedPriceGbp).toFixed(2)} GBP
                    </p>
                  )}
                  {l.publishError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{l.publishError}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l.status] || STATUS_COLORS.DRAFT}`}>
                    {l.status}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(l.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
