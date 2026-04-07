import { describe, expect, it } from 'vitest';
import { resolveOperationalLifecycleStage } from './operational-lifecycle';

describe('resolveOperationalLifecycleStage', () => {
  it('prioritizes aborted pilot control state', () => {
    const stage = resolveOperationalLifecycleStage({
      product: { status: 'APPROVED' },
      pilotControl: { state: 'aborted' } as any,
    });
    expect(stage.key).toBe('aborted');
    expect(stage.tone).toBe('danger');
  });

  it('returns preflight blocked when publishAllowed is false', () => {
    const stage = resolveOperationalLifecycleStage({
      product: { status: 'VALIDATED_READY' },
      preflight: {
        publishAllowed: false,
        publishIntent: 'production',
        overallState: 'blocked_physical_package',
        nextAction: 'Complete package data',
        blockers: ['physical_package:missing_dimensions'],
      } as any,
    });
    expect(stage.key).toBe('preflight_blocked');
    expect(stage.detail).toContain('physical_package');
  });

  it('returns pilot ready when pilot preflight is allowed', () => {
    const stage = resolveOperationalLifecycleStage({
      product: { status: 'VALIDATED_READY' },
      preflight: {
        publishAllowed: true,
        publishIntent: 'pilot',
        modeResolved: 'international',
        pilotReadiness: { pilotAllowed: true },
      } as any,
    });
    expect(stage.key).toBe('pilot_ready');
    expect(stage.tone).toBe('success');
  });

  it('returns completed when realized profit evidence exists', () => {
    const stage = resolveOperationalLifecycleStage({
      product: { status: 'PUBLISHED' },
      operationsTruth: {
        realizedProfitObtained: true,
      } as any,
    });
    expect(stage.key).toBe('completed');
  });

  it('resolves listed_active before order evidence', () => {
    const stage = resolveOperationalLifecycleStage({
      operationsTruth: {
        externalMarketplaceState: 'active',
      } as any,
    });
    expect(stage.key).toBe('listed_active');
  });

  it('resolves post-publish flow from order ingested to fulfillment evidence', () => {
    const orderReceived = resolveOperationalLifecycleStage({
      operationsTruth: {
        orderIngested: true,
      } as any,
    });
    expect(orderReceived.key).toBe('order_received');

    const inFulfillment = resolveOperationalLifecycleStage({
      operationsTruth: {
        orderIngested: true,
        supplierPurchaseProved: true,
      } as any,
    });
    expect(inFulfillment.key).toBe('fulfillment_in_progress');

    const shipped = resolveOperationalLifecycleStage({
      operationsTruth: {
        orderIngested: true,
        supplierPurchaseProved: true,
        trackingAttached: true,
      } as any,
    });
    expect(shipped.key).toBe('shipped');
  });
});
