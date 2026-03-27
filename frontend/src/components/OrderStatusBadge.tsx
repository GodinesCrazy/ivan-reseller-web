/**
 * Order status badge - CREATED (gray), PAID (blue), PURCHASING (yellow + spinner), PURCHASED (green), FAILED (red)
 * Shows spinner when status = PURCHASING (order being fulfilled on AliExpress)
 */

import { Badge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PURCHASING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PURCHASED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  SIMULATED: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  MANUAL_ACTION_REQUIRED: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200',
  FULFILLMENT_BLOCKED: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Creado',
  PAID: 'Por comprar',
  PURCHASING: 'Comprando',
  PURCHASED: 'Comprado',
  FAILED: 'Fallido',
  SIMULATED: 'Simulado',
  MANUAL_ACTION_REQUIRED: 'Acción manual',
  FULFILLMENT_BLOCKED: 'Fulfillment bloqueado',
};

export default function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.CREATED;
  const label = STATUS_LABELS[status] || status;
  const isPurchasing = status === 'PURCHASING';

  return (
    <Badge variant="secondary" className={`${style} flex items-center gap-1.5`}>
      {isPurchasing && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {label}
    </Badge>
  );
}
