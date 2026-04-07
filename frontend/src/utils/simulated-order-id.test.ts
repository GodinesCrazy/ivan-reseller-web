import { describe, expect, it } from 'vitest';
import { isSimulatedSupplierOrderId } from './simulated-order-id';

describe('isSimulatedSupplierOrderId', () => {
  it('returns true for known stub ids', () => {
    expect(isSimulatedSupplierOrderId('SIMULATED_ORDER_ID')).toBe(true);
    expect(isSimulatedSupplierOrderId('test_simulated')).toBe(true);
  });

  it('returns false for empty', () => {
    expect(isSimulatedSupplierOrderId('')).toBe(false);
    expect(isSimulatedSupplierOrderId(undefined)).toBe(false);
  });

  it('returns false for plausible real-looking ids', () => {
    expect(isSimulatedSupplierOrderId('8123456789012345')).toBe(false);
  });
});
