import { AlertCircle, Clock3, ExternalLink, ShieldAlert } from 'lucide-react';
import type { OperationsTruthResponse } from '@/types/operations';

function formatStateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'unknown';
  return raw.replace(/_/g, ' ');
}

interface OperationsTruthSummaryPanelProps {
  data: OperationsTruthResponse;
}

export default function OperationsTruthSummaryPanel({ data }: OperationsTruthSummaryPanelProps) {
  const topBlocked = data.items.filter((item) => item.blockerCode).slice(0, 4);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Canonical Listing Truth</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Live listing state, blockers, evidence times, and source labels from the backend truth contract.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
            <p className="text-xs text-green-700 dark:text-green-300 uppercase font-semibold">Active</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{data.summary.liveStateCounts.active}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300 uppercase font-semibold">Under review</p>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{data.summary.liveStateCounts.under_review}</p>
          </div>
          <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3">
            <p className="text-xs text-orange-700 dark:text-orange-300 uppercase font-semibold">Paused</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{data.summary.liveStateCounts.paused}</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-xs text-red-700 dark:text-red-300 uppercase font-semibold">Failed publish</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-300">{data.summary.liveStateCounts.failed_publish}</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold">Unknown</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.summary.liveStateCounts.unknown}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Current Blockers</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The UI now stays fail-closed and shows exact blockers instead of optimistic published states.
          </p>
        </div>
        {topBlocked.length === 0 ? (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-300">
            No canonical blockers detected in the current truth sample.
          </div>
        ) : (
          <div className="space-y-3">
            {topBlocked.map((item) => (
              <div key={item.productId} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {item.productTitle}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatStateLabel(item.externalMarketplaceState)}
                      {item.externalMarketplaceSubStatus.length > 0 && ` · ${item.externalMarketplaceSubStatus.join(', ')}`}
                    </p>
                  </div>
                  {item.listingUrl && (
                    <a
                      href={item.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Listing
                    </a>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-1 text-red-700 dark:text-red-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {item.blockerCode}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-gray-700 dark:text-gray-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {item.sourceLabels.blocker}
                  </span>
                  {item.lastMarketplaceSyncAt && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-gray-700 dark:text-gray-300">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(item.lastMarketplaceSyncAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {item.blockerMessage && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{item.blockerMessage}</p>
                )}
                {item.nextAction && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Next action: {item.nextAction}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
