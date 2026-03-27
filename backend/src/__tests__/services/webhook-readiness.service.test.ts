import {
  deriveWebhookProofLevel,
  summarizeConnectorReadinessFromStatuses,
} from '../../services/webhook-readiness.service';

describe('webhook-readiness.service', () => {
  it('derives granular webhook proof levels without inflating event readiness', () => {
    expect(
      deriveWebhookProofLevel({
        configured: true,
        endpointConfigured: true,
        verified: true,
        destinationRegistered: true,
        subscriptionRegistered: true,
        inboundEventSeen: false,
        eventFlowReady: false,
      })
    ).toBe('subscription-registered');

    expect(
      deriveWebhookProofLevel({
        configured: true,
        endpointConfigured: true,
        verified: true,
        destinationRegistered: true,
        subscriptionRegistered: true,
        inboundEventSeen: true,
        eventFlowReady: true,
      })
    ).toBe('event-ready');
  });

  it('marks configured connectors without webhooks as partial, not automation-ready', () => {
    const readiness = summarizeConnectorReadinessFromStatuses(
      [{ apiName: 'ebay', isConfigured: true, isAvailable: true }],
      {
        ebay: { configured: false },
        mercadolibre: { configured: false },
        amazon: { configured: false },
      }
    );

    expect(readiness.connectors.ebay.operationalApiReachable).toBe(true);
    expect(readiness.connectors.ebay.automationReady).toBe(false);
    expect(readiness.connectors.ebay.operationMode).toBe('manual_or_polling_partial');
  });

  it('marks connectors with API reachability and webhooks as automation-ready', () => {
    const readiness = summarizeConnectorReadinessFromStatuses(
      [{ apiName: 'mercadolibre', isConfigured: true, isAvailable: true }],
      {
        ebay: { configured: false },
        mercadolibre: { configured: true, verified: true, eventFlowReady: true },
        amazon: { configured: false },
      }
    );

    expect(readiness.connectors.mercadolibre.automationReady).toBe(true);
    expect(readiness.connectors.mercadolibre.eventFlowReady).toBe(true);
    expect(readiness.automationReadyCount).toBe(1);
  });

  it('keeps configured webhooks without verified events in partial mode', () => {
    const readiness = summarizeConnectorReadinessFromStatuses(
      [{ apiName: 'ebay', isConfigured: true, isAvailable: true }],
      {
        ebay: { configured: true, verified: false, eventFlowReady: false },
        mercadolibre: { configured: false },
        amazon: { configured: false },
      }
    );

    expect(readiness.connectors.ebay.webhookReady).toBe(true);
    expect(readiness.connectors.ebay.eventFlowReady).toBe(false);
    expect(readiness.connectors.ebay.automationReady).toBe(false);
    expect(readiness.connectors.ebay.issues).toContain('webhook_event_not_verified');
  });
});
