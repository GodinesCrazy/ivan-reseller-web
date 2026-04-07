/**
 * Aligns with backend `constants/simulated-orders.ts` — supplier order IDs that must not be shown as real purchase proof.
 */
const SIMULATED_ORDER_IDS = [
  'SIMULATED_ORDER_ID',
  'TEST_SIMULATED',
  'REAL_PAYOUT_TEST',
  'FINAL_PAYOUT_TEST',
] as const;

export function isSimulatedSupplierOrderId(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const upper = value.toUpperCase().trim();
  if (SIMULATED_ORDER_IDS.includes(upper as (typeof SIMULATED_ORDER_IDS)[number])) return true;
  if (upper.includes('SIMULAT') || upper.includes('TEST')) return true;
  return false;
}
