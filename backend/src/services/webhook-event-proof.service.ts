import { prisma } from '../config/database';

export type WebhookMarketplace = 'ebay' | 'mercadolibre' | 'amazon';
export type WebhookProofLevel =
  | 'not-configured'
  | 'code-ready'
  | 'endpoint-configured'
  | 'verified'
  | 'destination-registered'
  | 'subscription-registered'
  | 'inbound-event-seen'
  | 'event-ready';

export interface WebhookEventProof {
  webhookVerified: boolean;
  eventFlowReady: boolean;
  inboundEventSeen: boolean;
  destinationRegistered: boolean;
  subscriptionRegistered: boolean;
  proofLevel: WebhookProofLevel;
  lastWebhookEventAt: string | null;
  lastWebhookVerificationAt: string | null;
  lastEventType: string | null;
  lastOrderReference: string | null;
  matchedDestinationId: string | null;
  matchedSubscriptionIds: string[];
  matchedSubscriptionTopics: string[];
  lastTopologySyncAt: string | null;
}

function configKey(marketplace: WebhookMarketplace): string {
  return `webhook_event_proof:${marketplace}`;
}

function proofLevelRank(level: WebhookProofLevel): number {
  switch (level) {
    case 'event-ready':
      return 7;
    case 'inbound-event-seen':
      return 6;
    case 'subscription-registered':
      return 5;
    case 'destination-registered':
      return 4;
    case 'verified':
      return 3;
    case 'endpoint-configured':
      return 2;
    case 'code-ready':
      return 1;
    default:
      return 0;
  }
}

function maxProofLevel(current: WebhookProofLevel, next: WebhookProofLevel): WebhookProofLevel {
  return proofLevelRank(next) > proofLevelRank(current) ? next : current;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function emptyProof(): WebhookEventProof {
  return {
    webhookVerified: false,
    eventFlowReady: false,
    inboundEventSeen: false,
    destinationRegistered: false,
    subscriptionRegistered: false,
    proofLevel: 'not-configured',
    lastWebhookEventAt: null,
    lastWebhookVerificationAt: null,
    lastEventType: null,
    lastOrderReference: null,
    matchedDestinationId: null,
    matchedSubscriptionIds: [],
    matchedSubscriptionTopics: [],
    lastTopologySyncAt: null,
  };
}

export async function recordWebhookEventProof(params: {
  marketplace: WebhookMarketplace;
  eventType: string;
  orderReference?: string | null;
  verified?: boolean;
}): Promise<void> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: configKey(params.marketplace) },
    select: { value: true },
  });

  let current: Record<string, unknown> = {};
  if (existing?.value) {
    try {
      current = JSON.parse(String(existing.value));
    } catch {
      current = {};
    }
  }

  const now = new Date().toISOString();
  const next = {
    ...current,
    marketplace: params.marketplace,
    webhookVerified: params.verified !== false,
    eventFlowReady: params.verified !== false,
    inboundEventSeen: true,
    destinationRegistered:
      current.destinationRegistered === true || !!current.matchedDestinationId,
    subscriptionRegistered:
      current.subscriptionRegistered === true ||
      (Array.isArray(current.matchedSubscriptionIds) && current.matchedSubscriptionIds.length > 0),
    proofLevel: 'event-ready',
    lastWebhookEventAt: now,
    lastWebhookVerificationAt: params.verified !== false ? now : (current.lastWebhookVerificationAt || null),
    lastEventType: params.eventType,
    lastOrderReference: params.orderReference || null,
    matchedDestinationId:
      typeof current.matchedDestinationId === 'string' ? current.matchedDestinationId : null,
    matchedSubscriptionIds: normalizeStringArray(current.matchedSubscriptionIds),
    matchedSubscriptionTopics: normalizeStringArray(current.matchedSubscriptionTopics),
    lastTopologySyncAt:
      typeof current.lastTopologySyncAt === 'string' ? current.lastTopologySyncAt : now,
  };

  await prisma.systemConfig.upsert({
    where: { key: configKey(params.marketplace) },
    create: {
      key: configKey(params.marketplace),
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });
}

export async function recordWebhookVerificationProof(params: {
  marketplace: WebhookMarketplace;
  eventType?: string | null;
}): Promise<void> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: configKey(params.marketplace) },
    select: { value: true },
  });

  let current: Record<string, unknown> = {};
  if (existing?.value) {
    try {
      current = JSON.parse(String(existing.value));
    } catch {
      current = {};
    }
  }

  const now = new Date().toISOString();
  const currentProofLevel =
    typeof current.proofLevel === 'string' ? (current.proofLevel as WebhookProofLevel) : 'not-configured';
  const next = {
    ...current,
    marketplace: params.marketplace,
    webhookVerified: true,
    eventFlowReady: current.eventFlowReady === true,
    inboundEventSeen: current.inboundEventSeen === true,
    destinationRegistered:
      current.destinationRegistered === true || !!current.matchedDestinationId,
    subscriptionRegistered:
      current.subscriptionRegistered === true ||
      (Array.isArray(current.matchedSubscriptionIds) && current.matchedSubscriptionIds.length > 0),
    proofLevel: maxProofLevel(currentProofLevel, 'verified'),
    lastWebhookEventAt: current.lastWebhookEventAt || null,
    lastWebhookVerificationAt: now,
    lastEventType:
      typeof params.eventType === 'string' && params.eventType.trim()
        ? params.eventType
        : current.lastEventType || null,
    lastOrderReference: current.lastOrderReference || null,
    matchedDestinationId:
      typeof current.matchedDestinationId === 'string' ? current.matchedDestinationId : null,
    matchedSubscriptionIds: normalizeStringArray(current.matchedSubscriptionIds),
    matchedSubscriptionTopics: normalizeStringArray(current.matchedSubscriptionTopics),
    lastTopologySyncAt:
      typeof current.lastTopologySyncAt === 'string' ? current.lastTopologySyncAt : now,
  };

  await prisma.systemConfig.upsert({
    where: { key: configKey(params.marketplace) },
    create: {
      key: configKey(params.marketplace),
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });
}

export async function recordWebhookTopologyProof(params: {
  marketplace: WebhookMarketplace;
  endpointConfigured: boolean;
  matchedDestinationId?: string | null;
  matchedSubscriptionIds?: string[];
  matchedSubscriptionTopics?: string[];
}): Promise<void> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: configKey(params.marketplace) },
    select: { value: true },
  });

  let current: Record<string, unknown> = {};
  if (existing?.value) {
    try {
      current = JSON.parse(String(existing.value));
    } catch {
      current = {};
    }
  }

  const now = new Date().toISOString();
  const matchedDestinationId =
    typeof params.matchedDestinationId === 'string' && params.matchedDestinationId.trim()
      ? params.matchedDestinationId.trim()
      : null;
  const matchedSubscriptionIds = normalizeStringArray(params.matchedSubscriptionIds);
  const matchedSubscriptionTopics = normalizeStringArray(params.matchedSubscriptionTopics);
  const destinationRegistered = !!matchedDestinationId;
  const subscriptionRegistered = matchedSubscriptionIds.length > 0;
  const topologyLevel: WebhookProofLevel = subscriptionRegistered
    ? 'subscription-registered'
    : destinationRegistered
      ? 'destination-registered'
      : params.endpointConfigured
        ? 'endpoint-configured'
        : 'code-ready';
  const currentProofLevel =
    typeof current.proofLevel === 'string' ? (current.proofLevel as WebhookProofLevel) : 'not-configured';

  const next = {
    ...current,
    marketplace: params.marketplace,
    webhookVerified: current.webhookVerified === true,
    eventFlowReady: current.eventFlowReady === true,
    inboundEventSeen: current.inboundEventSeen === true,
    destinationRegistered,
    subscriptionRegistered,
    proofLevel: maxProofLevel(currentProofLevel, topologyLevel),
    lastWebhookEventAt: current.lastWebhookEventAt || null,
    lastWebhookVerificationAt: current.lastWebhookVerificationAt || null,
    lastEventType: current.lastEventType || null,
    lastOrderReference: current.lastOrderReference || null,
    matchedDestinationId,
    matchedSubscriptionIds,
    matchedSubscriptionTopics,
    lastTopologySyncAt: now,
  };

  await prisma.systemConfig.upsert({
    where: { key: configKey(params.marketplace) },
    create: {
      key: configKey(params.marketplace),
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });
}

export async function getWebhookEventProof(
  marketplace: WebhookMarketplace
): Promise<WebhookEventProof> {
  const record = await prisma.systemConfig.findUnique({
    where: { key: configKey(marketplace) },
    select: { value: true },
  });

  if (!record?.value) {
    return emptyProof();
  }

  try {
    const parsed = JSON.parse(String(record.value)) as Partial<WebhookEventProof>;
    return {
      webhookVerified: parsed.webhookVerified === true,
      eventFlowReady: parsed.eventFlowReady === true,
      inboundEventSeen: parsed.inboundEventSeen === true,
      destinationRegistered: parsed.destinationRegistered === true,
      subscriptionRegistered: parsed.subscriptionRegistered === true,
      proofLevel:
        typeof parsed.proofLevel === 'string'
          ? (parsed.proofLevel as WebhookProofLevel)
          : parsed.eventFlowReady === true
            ? 'event-ready'
            : parsed.inboundEventSeen === true
              ? 'inbound-event-seen'
              : parsed.subscriptionRegistered === true
                ? 'subscription-registered'
                : parsed.destinationRegistered === true
                  ? 'destination-registered'
                  : parsed.webhookVerified === true
                    ? 'verified'
                    : 'not-configured',
      lastWebhookEventAt:
        typeof parsed.lastWebhookEventAt === 'string' ? parsed.lastWebhookEventAt : null,
      lastWebhookVerificationAt:
        typeof parsed.lastWebhookVerificationAt === 'string'
          ? parsed.lastWebhookVerificationAt
          : null,
      lastEventType: typeof parsed.lastEventType === 'string' ? parsed.lastEventType : null,
      lastOrderReference:
        typeof parsed.lastOrderReference === 'string' ? parsed.lastOrderReference : null,
      matchedDestinationId:
        typeof parsed.matchedDestinationId === 'string' ? parsed.matchedDestinationId : null,
      matchedSubscriptionIds: normalizeStringArray(parsed.matchedSubscriptionIds),
      matchedSubscriptionTopics: normalizeStringArray(parsed.matchedSubscriptionTopics),
      lastTopologySyncAt:
        typeof parsed.lastTopologySyncAt === 'string' ? parsed.lastTopologySyncAt : null,
    };
  } catch {
    return emptyProof();
  }
}
