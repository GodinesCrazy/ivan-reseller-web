/**
 * Order status badge - CREATED (gray), PAID (blue), PURCHASING (yellow), PURCHASED (green), FAILED (red)
 */

import { Badge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PURCHASING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PURCHASED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function OrderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.CREATED;
  return (
    <Badge variant="secondary" className={style}>
      {status}
    </Badge>
  );
}
