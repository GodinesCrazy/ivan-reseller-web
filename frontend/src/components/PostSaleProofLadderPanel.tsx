import { CheckCircle2, CircleDashed, PackageCheck, Receipt, Truck, Wallet } from 'lucide-react';
import type { OperationsTruthSummary } from '@/types/operations';

interface PostSaleProofLadderPanelProps {
  summary: OperationsTruthSummary['proofCounts'];
  title?: string;
  subtitle?: string;
}

const STEPS = [
  { key: 'orderIngested', label: 'Order ingested', icon: Receipt },
  { key: 'supplierPurchaseProved', label: 'Supplier purchase proved', icon: PackageCheck },
  { key: 'trackingAttached', label: 'Tracking attached', icon: Truck },
  { key: 'deliveredTruthObtained', label: 'Delivered truth', icon: CheckCircle2 },
  { key: 'releasedFundsObtained', label: 'Released funds', icon: Wallet },
  { key: 'realizedProfitObtained', label: 'Realized profit', icon: CheckCircle2 },
] as const;

export default function PostSaleProofLadderPanel({
  summary,
  title = 'Commercial Proof Ladder',
  subtitle = 'Missing proof stays missing until the backend records it.',
}: PostSaleProofLadderPanelProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const value = summary[step.key] ?? 0;
          return (
            <div key={step.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
              <div className="flex items-center gap-2">
                {value > 0 ? (
                  <Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.label}</span>
              </div>
              <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {value > 0 ? 'Backend proof present' : 'Missing / pending proof'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
