import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import MarketplaceService from '../src/services/marketplace.service';
import { EbayWebhookService } from '../src/services/ebay-webhook.service';
import type { EbayCredentials } from '../src/services/ebay.service';
import {
  recordWebhookTopologyProof,
  recordWebhookVerificationProof,
  getWebhookEventProof,
} from '../src/services/webhook-event-proof.service';
import { deriveWebhookProofLevel } from '../src/services/webhook-readiness.service';

async function main(): Promise<void> {
  const userId = Number(process.argv[2] || 1);
  const topicId = String(process.env.EBAY_WEBHOOK_TOPIC_ID || '').trim();
  const alertEmail = String(process.env.EBAY_WEBHOOK_ALERT_EMAIL || '').trim();
  const attemptedActions: string[] = [];
  const actionErrors: Array<{ action: string; error: string }> = [];
  const marketplaceService = new MarketplaceService();
  const credentialsResult = await marketplaceService.getCredentials(userId, 'ebay', 'production');

  if (!credentialsResult?.isActive || !credentialsResult.credentials) {
    console.error(
      JSON.stringify(
        {
          success: false,
          blocker: 'ebay_credentials_unusable',
          message: 'No active eBay production credentials were found for the requested user.',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const service = new EbayWebhookService(
    {
      ...(credentialsResult.credentials as EbayCredentials),
      sandbox: false,
    },
    {
      onCredentialsUpdate: async (nextCredentials) => {
        await marketplaceService.saveCredentials(userId, 'ebay', {
          ...nextCredentials,
          scope: credentialsResult.scope || 'user',
        } as any);
      },
    }
  );

  let readiness = await service.checkReadiness();

  if (alertEmail && !readiness.alertEmailConfigured) {
    attemptedActions.push('update_config');
    try {
      await service.updateConfig(alertEmail);
      readiness = await service.checkReadiness();
    } catch (error: any) {
      actionErrors.push({
        action: 'update_config',
        error: error?.response?.data?.errors?.[0]?.message || error?.message || 'update_config_failed',
      });
    }
  }

  if (
    readiness.endpoint &&
    readiness.verificationTokenConfigured &&
    readiness.alertEmailConfigured &&
    !readiness.matchedDestinationId
  ) {
    attemptedActions.push('create_destination');
    try {
      await service.createDestination({
        endpoint: readiness.endpoint,
        verificationToken: process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN || process.env.WEBHOOK_SECRET_EBAY || '',
        status: 'ENABLED',
      });
      readiness = await service.checkReadiness();
    } catch (error: any) {
      actionErrors.push({
        action: 'create_destination',
        error: error?.response?.data?.errors?.[0]?.message || error?.message || 'create_destination_failed',
      });
    }
  }

  if (topicId && readiness.matchedDestinationId && readiness.subscriptionsReadable) {
    const topicPayload = await service.resolveTopicPayload(topicId);
    if (topicPayload && !readiness.matchedSubscriptionIds.length) {
      attemptedActions.push('create_subscription');
      try {
        await service.createSubscription({
          topicId: topicPayload.topicId,
          destinationId: readiness.matchedDestinationId,
          schemaVersion: topicPayload.schemaVersion,
          status: 'ENABLED',
        });
        readiness = await service.checkReadiness();
      } catch (error: any) {
        actionErrors.push({
          action: 'create_subscription',
          error:
            error?.response?.data?.errors?.[0]?.message ||
            error?.message ||
            'create_subscription_failed',
        });
      }
    }
  }

  if (readiness.matchedDestinationId) {
    await recordWebhookVerificationProof({
      marketplace: 'ebay',
      eventType: 'destination_verified',
    });
  }

  await recordWebhookTopologyProof({
    marketplace: 'ebay',
    endpointConfigured:
      !!readiness.endpoint && readiness.verificationTokenConfigured && readiness.alertEmailConfigured,
    matchedDestinationId: readiness.matchedDestinationId,
    matchedSubscriptionIds: readiness.matchedSubscriptionIds,
    matchedSubscriptionTopics: readiness.matchedSubscriptionTopics,
  });
  const storedProof = await getWebhookEventProof('ebay');
  const proofLevel = deriveWebhookProofLevel({
    configured: readiness.verificationTokenConfigured,
    endpointConfigured:
      !!readiness.endpoint && readiness.verificationTokenConfigured && readiness.alertEmailConfigured,
    verified: storedProof.webhookVerified,
    destinationRegistered: storedProof.destinationRegistered,
    subscriptionRegistered: storedProof.subscriptionRegistered,
    inboundEventSeen: storedProof.inboundEventSeen,
    eventFlowReady: storedProof.eventFlowReady,
  });

  console.log(
    JSON.stringify(
      {
        success: readiness.blockers.length === 0,
        proofLevel,
        attemptedActions,
        actionErrors,
        readiness,
        storedProof,
      },
      null,
      2
    )
  );

  process.exit(readiness.blockers.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
