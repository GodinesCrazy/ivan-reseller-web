import {
  getWebhookEventProof,
  type WebhookProofLevel,
} from './webhook-event-proof.service';
import { getFastApiStatusesForUser } from './api-status-fast-path.service';
import { resolveEbayWebhookEndpoint } from './ebay-webhook.service';

export type MarketplaceConnector = 'ebay' | 'mercadolibre' | 'amazon';

export interface WebhookStatusEntry {
  configured: boolean;
  endpointConfigured?: boolean;
  verificationTokenConfigured?: boolean;
  signatureValidationMode?: 'ebay_public_key' | 'shared_secret_hmac' | 'none';
  verified?: boolean;
  proofLevel?: WebhookProofLevel;
  destinationRegistered?: boolean;
  subscriptionRegistered?: boolean;
  inboundEventSeen?: boolean;
  matchedDestinationId?: string | null;
  matchedSubscriptionIds?: string[];
  matchedSubscriptionTopics?: string[];
  eventFlowReady?: boolean;
  lastWebhookEventAt?: string | null;
  lastWebhookVerificationAt?: string | null;
  lastEventType?: string | null;
}

export interface ConnectorReadinessEntry {
  marketplace: MarketplaceConnector;
  configured: boolean;
  authenticated: boolean;
  operationalApiReachable: boolean;
  webhookReady: boolean;
  eventFlowReady: boolean;
  automationReady: boolean;
  operationMode: 'automation_ready' | 'manual_or_polling_partial' | 'blocked';
  issues: string[];
}

export interface ConnectorReadinessSummary {
  webhookStatus: Record<MarketplaceConnector, WebhookStatusEntry>;
  connectors: Record<MarketplaceConnector, ConnectorReadinessEntry>;
  automationReadyCount: number;
  operationalCount: number;
  configuredCount: number;
  blockingIssues: string[];
}

export function deriveWebhookProofLevel(params: {
  configured: boolean;
  endpointConfigured?: boolean;
  verified?: boolean;
  destinationRegistered?: boolean;
  subscriptionRegistered?: boolean;
  inboundEventSeen?: boolean;
  eventFlowReady?: boolean;
}): WebhookProofLevel {
  if (params.eventFlowReady) return 'event-ready';
  if (params.inboundEventSeen) return 'inbound-event-seen';
  if (params.subscriptionRegistered) return 'subscription-registered';
  if (params.destinationRegistered) return 'destination-registered';
  if (params.verified) return 'verified';
  if (params.endpointConfigured) return 'endpoint-configured';
  if (params.configured) return 'code-ready';
  return 'not-configured';
}

export function getWebhookStatus(): Record<MarketplaceConnector, WebhookStatusEntry> {
  const ebayVerificationTokenConfigured = !!(
    process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN?.trim() ||
    process.env.WEBHOOK_SECRET_EBAY?.trim()
  );
  const ebayEndpointConfigured = !!resolveEbayWebhookEndpoint();
  return {
    ebay: {
      configured: ebayVerificationTokenConfigured,
      endpointConfigured: ebayEndpointConfigured,
      verificationTokenConfigured: ebayVerificationTokenConfigured,
      signatureValidationMode: 'ebay_public_key',
      proofLevel: deriveWebhookProofLevel({
        configured: ebayVerificationTokenConfigured,
        endpointConfigured: ebayEndpointConfigured,
      }),
      destinationRegistered: false,
      subscriptionRegistered: false,
      inboundEventSeen: false,
      matchedDestinationId: null,
      matchedSubscriptionIds: [],
      matchedSubscriptionTopics: [],
      verified: false,
      eventFlowReady: false,
      lastWebhookEventAt: null,
      lastWebhookVerificationAt: null,
      lastEventType: null,
    },
    mercadolibre: {
      configured: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
      endpointConfigured: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
      verificationTokenConfigured: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
      signatureValidationMode: 'shared_secret_hmac',
      proofLevel: deriveWebhookProofLevel({
        configured: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
        endpointConfigured: !!process.env.WEBHOOK_SECRET_MERCADOLIBRE?.trim(),
      }),
      destinationRegistered: false,
      subscriptionRegistered: false,
      inboundEventSeen: false,
      matchedDestinationId: null,
      matchedSubscriptionIds: [],
      matchedSubscriptionTopics: [],
      verified: false,
      eventFlowReady: false,
      lastWebhookEventAt: null,
      lastWebhookVerificationAt: null,
      lastEventType: null,
    },
    amazon: {
      configured: !!process.env.WEBHOOK_SECRET_AMAZON?.trim(),
      endpointConfigured: !!process.env.WEBHOOK_SECRET_AMAZON?.trim(),
      verificationTokenConfigured: !!process.env.WEBHOOK_SECRET_AMAZON?.trim(),
      signatureValidationMode: 'shared_secret_hmac',
      proofLevel: deriveWebhookProofLevel({
        configured: !!process.env.WEBHOOK_SECRET_AMAZON?.trim(),
        endpointConfigured: !!process.env.WEBHOOK_SECRET_AMAZON?.trim(),
      }),
      destinationRegistered: false,
      subscriptionRegistered: false,
      inboundEventSeen: false,
      matchedDestinationId: null,
      matchedSubscriptionIds: [],
      matchedSubscriptionTopics: [],
      verified: false,
      eventFlowReady: false,
      lastWebhookEventAt: null,
      lastWebhookVerificationAt: null,
      lastEventType: null,
    },
  };
}

export async function getWebhookStatusWithProof(): Promise<Record<MarketplaceConnector, WebhookStatusEntry>> {
  const base = getWebhookStatus();
  const [ebay, mercadolibre, amazon] = await Promise.all([
    getWebhookEventProof('ebay'),
    getWebhookEventProof('mercadolibre'),
    getWebhookEventProof('amazon'),
  ]);

  return {
    ebay: {
      ...base.ebay,
      proofLevel: deriveWebhookProofLevel({
        configured: base.ebay.configured,
        endpointConfigured: base.ebay.endpointConfigured,
        verified: ebay.webhookVerified,
        destinationRegistered: ebay.destinationRegistered,
        subscriptionRegistered: ebay.subscriptionRegistered,
        inboundEventSeen: ebay.inboundEventSeen,
        eventFlowReady: ebay.eventFlowReady,
      }),
      destinationRegistered: ebay.destinationRegistered,
      subscriptionRegistered: ebay.subscriptionRegistered,
      inboundEventSeen: ebay.inboundEventSeen,
      matchedDestinationId: ebay.matchedDestinationId,
      matchedSubscriptionIds: ebay.matchedSubscriptionIds,
      matchedSubscriptionTopics: ebay.matchedSubscriptionTopics,
      verified: ebay.webhookVerified,
      eventFlowReady: ebay.eventFlowReady,
      lastWebhookEventAt: ebay.lastWebhookEventAt,
      lastWebhookVerificationAt: ebay.lastWebhookVerificationAt,
      lastEventType: ebay.lastEventType,
    },
    mercadolibre: {
      ...base.mercadolibre,
      proofLevel: deriveWebhookProofLevel({
        configured: base.mercadolibre.configured,
        endpointConfigured: base.mercadolibre.endpointConfigured,
        verified: mercadolibre.webhookVerified,
        destinationRegistered: mercadolibre.destinationRegistered,
        subscriptionRegistered: mercadolibre.subscriptionRegistered,
        inboundEventSeen: mercadolibre.inboundEventSeen,
        eventFlowReady: mercadolibre.eventFlowReady,
      }),
      destinationRegistered: mercadolibre.destinationRegistered,
      subscriptionRegistered: mercadolibre.subscriptionRegistered,
      inboundEventSeen: mercadolibre.inboundEventSeen,
      matchedDestinationId: mercadolibre.matchedDestinationId,
      matchedSubscriptionIds: mercadolibre.matchedSubscriptionIds,
      matchedSubscriptionTopics: mercadolibre.matchedSubscriptionTopics,
      verified: mercadolibre.webhookVerified,
      eventFlowReady: mercadolibre.eventFlowReady,
      lastWebhookEventAt: mercadolibre.lastWebhookEventAt,
      lastWebhookVerificationAt: mercadolibre.lastWebhookVerificationAt,
      lastEventType: mercadolibre.lastEventType,
    },
    amazon: {
      ...base.amazon,
      proofLevel: deriveWebhookProofLevel({
        configured: base.amazon.configured,
        endpointConfigured: base.amazon.endpointConfigured,
        verified: amazon.webhookVerified,
        destinationRegistered: amazon.destinationRegistered,
        subscriptionRegistered: amazon.subscriptionRegistered,
        inboundEventSeen: amazon.inboundEventSeen,
        eventFlowReady: amazon.eventFlowReady,
      }),
      destinationRegistered: amazon.destinationRegistered,
      subscriptionRegistered: amazon.subscriptionRegistered,
      inboundEventSeen: amazon.inboundEventSeen,
      matchedDestinationId: amazon.matchedDestinationId,
      matchedSubscriptionIds: amazon.matchedSubscriptionIds,
      matchedSubscriptionTopics: amazon.matchedSubscriptionTopics,
      verified: amazon.webhookVerified,
      eventFlowReady: amazon.eventFlowReady,
      lastWebhookEventAt: amazon.lastWebhookEventAt,
      lastWebhookVerificationAt: amazon.lastWebhookVerificationAt,
      lastEventType: amazon.lastEventType,
    },
  };
}

export function summarizeConnectorReadinessFromStatuses(
  statuses: any[],
  webhookStatus = getWebhookStatus()
): ConnectorReadinessSummary {
  const marketplaces: MarketplaceConnector[] = ['ebay', 'mercadolibre', 'amazon'];
  const connectors = {} as Record<MarketplaceConnector, ConnectorReadinessEntry>;
  const blockingIssues: string[] = [];

  for (const marketplace of marketplaces) {
    const relevant = (Array.isArray(statuses) ? statuses : []).filter(
      (status) => String(status?.apiName || '').toLowerCase() === marketplace
    );
    const configured = relevant.some((status) => status?.isConfigured === true);
    const operationalApiReachable = relevant.some(
      (status) => status?.isConfigured === true && status?.isAvailable === true
    );
    const authenticated = operationalApiReachable;
    const webhookReady = webhookStatus[marketplace].configured;
    const webhookVerified = webhookStatus[marketplace].verified === true;
    const eventFlowReady =
      operationalApiReachable &&
      webhookReady &&
      webhookVerified &&
      webhookStatus[marketplace].eventFlowReady === true;
    const automationReady = eventFlowReady;
    const issues: string[] = [];

    if (configured && !authenticated) issues.push('configured_but_not_authenticated');
    if (configured && authenticated && !webhookReady) issues.push('webhook_not_configured');
    if (configured && authenticated && webhookReady && !webhookVerified) issues.push('webhook_event_not_verified');
    if (!configured) issues.push('not_configured');

    let operationMode: ConnectorReadinessEntry['operationMode'] = 'blocked';
    if (automationReady) {
      operationMode = 'automation_ready';
    } else if (operationalApiReachable) {
      operationMode = 'manual_or_polling_partial';
    }

    connectors[marketplace] = {
      marketplace,
      configured,
      authenticated,
      operationalApiReachable,
      webhookReady,
      eventFlowReady,
      automationReady,
      operationMode,
      issues,
    };

    if (configured && !automationReady) {
      blockingIssues.push(`${marketplace}: ${issues.join(', ') || 'not automation ready'}`);
    }
  }

  return {
    webhookStatus,
    connectors,
    automationReadyCount: marketplaces.filter((mp) => connectors[mp].automationReady).length,
    operationalCount: marketplaces.filter((mp) => connectors[mp].operationalApiReachable).length,
    configuredCount: marketplaces.filter((mp) => connectors[mp].configured).length,
    blockingIssues,
  };
}

export async function getConnectorReadinessForUser(userId: number): Promise<ConnectorReadinessSummary> {
  const { statuses } = await getFastApiStatusesForUser(userId);
  return summarizeConnectorReadinessFromStatuses(statuses, await getWebhookStatusWithProof());
}
