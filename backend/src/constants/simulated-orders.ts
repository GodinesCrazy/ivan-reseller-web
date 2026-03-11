/**
 * Simulated order IDs - exclude from real financial reports.
 * Sales linked to Orders with these aliexpressOrderId values are test/simulated, not real purchases.
 */
export const SIMULATED_ORDER_IDS = [
  'SIMULATED_ORDER_ID',
  'TEST_SIMULATED',
  'REAL_PAYOUT_TEST',
  'FINAL_PAYOUT_TEST',
] as const;

export function isSimulatedOrderId(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const upper = value.toUpperCase();
  if (SIMULATED_ORDER_IDS.includes(upper as (typeof SIMULATED_ORDER_IDS)[number])) return true;
  if (upper.includes('SIMULAT') || upper.includes('TEST')) return true;
  return false;
}
