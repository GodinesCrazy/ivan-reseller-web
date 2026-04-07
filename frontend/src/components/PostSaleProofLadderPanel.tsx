import { CheckCircle2, CircleDashed, PackageCheck, Receipt, Truck, Wallet } from 'lucide-react';
import type { OperationsTruthSummary } from '@/types/operations';

interface PostSaleProofLadderPanelProps {
  summary: OperationsTruthSummary['proofCounts'];
  title?: string;
  subtitle?: string;
}

const STEPS = [
  { key: 'orderIngested', label: 'Orden registrada', icon: Receipt },
  { key: 'supplierPurchaseProved', label: 'Compra proveedor', icon: PackageCheck },
  { key: 'trackingAttached', label: 'Tracking adjunto', icon: Truck },
  { key: 'deliveredTruthObtained', label: 'Entrega confirmada', icon: CheckCircle2 },
  { key: 'releasedFundsObtained', label: 'Fondos liberados', icon: Wallet },
  { key: 'realizedProfitObtained', label: 'Beneficio realizado', icon: CheckCircle2 },
] as const;

export default function PostSaleProofLadderPanel({
  summary,
  title = 'Escalera de Evidencia Post-venta',
  subtitle = 'La evidencia faltante permanece así hasta que el backend la registre.',
}: PostSaleProofLadderPanelProps) {
  return (
    <div className="ir-panel p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const value = summary[step.key] ?? 0;
          return (
            <div
              key={step.key}
              className={`rounded-lg border p-3 ${
                value > 0
                  ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/15'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {value > 0 ? (
                  <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{step.label}</span>
              </div>
              <p className={`mt-2 text-lg font-bold tabular-nums ${value > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                {value}
              </p>
              <p className={`text-[11px] mt-0.5 ${value > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>
                {value > 0 ? 'Evidencia presente' : 'Pendiente / sin evidencia'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
