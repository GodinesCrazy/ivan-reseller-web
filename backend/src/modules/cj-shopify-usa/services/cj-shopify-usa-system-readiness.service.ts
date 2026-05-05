import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import { CredentialsManager } from '../../../services/credentials-manager.service';
import { CJ_SHOPIFY_USA_CJ_API_CREDENTIAL_NAME } from '../cj-shopify-usa.constants';
import { cjShopifyUsaAuthService } from './cj-shopify-usa-auth.service';
import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';

export interface SystemReadinessCheck {
  id: string;
  name: string;
  status: 'PENDING' | 'PASS' | 'FAIL' | 'WARNING';
  message?: string;
  hint?: string;
}

export interface SystemReadinessResult {
  ready: boolean;
  checks: SystemReadinessCheck[];
}

function pushCheck(
  checks: SystemReadinessCheck[],
  input: {
    id: string;
    name: string;
    status: SystemReadinessCheck['status'];
    message?: string;
    hint?: string;
  },
) {
  checks.push(input);
}

export class CjShopifyUsaSystemReadinessService {
  async evaluateForUser(userId: number): Promise<SystemReadinessResult> {
    const checks: SystemReadinessCheck[] = [];

    pushCheck(checks, {
      id: 'env.enable_cj_shopify_usa_module',
      name: 'Module Flag',
      status: env.ENABLE_CJ_SHOPIFY_USA_MODULE ? 'PASS' : 'FAIL',
      message: env.ENABLE_CJ_SHOPIFY_USA_MODULE
        ? 'ENABLE_CJ_SHOPIFY_USA_MODULE is true.'
        : 'ENABLE_CJ_SHOPIFY_USA_MODULE is false.',
      hint: env.ENABLE_CJ_SHOPIFY_USA_MODULE
        ? undefined
        : 'Set ENABLE_CJ_SHOPIFY_USA_MODULE=true in backend env and restart.',
    });

    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1 as n`;
      dbOk = true;
      pushCheck(checks, {
        id: 'database.connection',
        name: 'Database',
        status: 'PASS',
        message: 'Prisma database connectivity is working.',
      });
    } catch (error) {
      pushCheck(checks, {
        id: 'database.connection',
        name: 'Database',
        status: 'FAIL',
        message: `Database connectivity failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    let hasPaypalCheckoutCredentials = Boolean(
      String(env.PAYPAL_CLIENT_ID || '').trim() &&
        String(env.PAYPAL_CLIENT_SECRET || '').trim(),
    );
    if (!hasPaypalCheckoutCredentials) {
      const paypalEntry = await CredentialsManager.getCredentialEntry(userId, 'paypal', 'production').catch(() => null);
      hasPaypalCheckoutCredentials = Boolean(
        String(
          paypalEntry?.credentials?.clientId ||
            paypalEntry?.credentials?.PAYPAL_PRODUCTION_CLIENT_ID ||
            paypalEntry?.credentials?.PAYPAL_CLIENT_ID ||
            '',
        ).trim() &&
          String(
            paypalEntry?.credentials?.clientSecret ||
              paypalEntry?.credentials?.PAYPAL_PRODUCTION_CLIENT_SECRET ||
              paypalEntry?.credentials?.PAYPAL_CLIENT_SECRET ||
              '',
          ).trim(),
      );
    }
    pushCheck(checks, {
      id: 'account_settings',
      name: 'Pricing Settings',
      status: settings.minMarginPct ? 'PASS' : 'WARNING',
      message: settings.minMarginPct
        ? 'Pricing settings are present.'
        : 'Using default pricing settings. Review margins before publishing.',
    });

    let hasCj = false;
    try {
      const cj = await CredentialsManager.getCredentials(
        userId,
        CJ_SHOPIFY_USA_CJ_API_CREDENTIAL_NAME,
        'production',
      );
      hasCj = String(cj?.apiKey || '').trim().length > 0;
    } catch {
      hasCj = false;
    }

    pushCheck(checks, {
      id: 'credentials.cj_dropshipping',
      name: 'CJ Credentials',
      status: hasCj ? 'PASS' : 'FAIL',
      message: hasCj
        ? 'CJ apiKey is available.'
        : 'CJ apiKey is missing for this user.',
      hint: hasCj ? undefined : 'Configure cj-dropshipping production credentials before order placement.',
    });

    const settingsValidation = await cjShopifyUsaConfigService.validateSettingsReady(userId);
    pushCheck(checks, {
      id: 'shopify.config',
      name: 'Shopify Config',
      status: settingsValidation.ready ? 'PASS' : 'FAIL',
      message: settingsValidation.ready
        ? 'Shopify client credentials and shop domain are configured.'
        : settingsValidation.reason,
      hint: settingsValidation.ready
        ? undefined
        : 'Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_SHOP or save shopifyStoreUrl.',
    });

    const shopifyTest = settingsValidation.ready
      ? await cjShopifyUsaAuthService.testConnection(userId)
      : { ok: false, error: settingsValidation.reason };

    if (!shopifyTest.ok) {
      pushCheck(checks, {
        id: 'shopify.auth',
        name: 'Shopify Auth',
        status: 'FAIL',
        message: shopifyTest.error,
      });
    } else {
      pushCheck(checks, {
        id: 'shopify.auth',
        name: 'Shopify Auth',
        status: 'PASS',
        message: `Connected to ${shopifyTest.shopData!.name} via client_credentials.`,
      });

      pushCheck(checks, {
        id: 'shopify.scopes',
        name: 'Shopify Scopes',
        status: (shopifyTest.missingScopes?.length || 0) === 0 ? 'PASS' : 'FAIL',
        message:
          (shopifyTest.missingScopes?.length || 0) === 0
            ? 'Required Shopify scopes are granted.'
            : `Missing scopes: ${shopifyTest.missingScopes!.join(', ')}`,
        hint:
          (shopifyTest.missingScopes?.length || 0) === 0
            ? undefined
            : 'Update app version scopes in Shopify Dev Dashboard, release it, and reinstall/approve if required.',
      });

      pushCheck(checks, {
        id: 'shopify.currency',
        name: 'Store Currency',
        status: shopifyTest.shopData!.currency === 'USD' ? 'PASS' : 'FAIL',
        message:
          shopifyTest.shopData!.currency === 'USD'
            ? 'Store currency is USD.'
            : `Store currency is ${shopifyTest.shopData!.currency}; CJ → Shopify USA expects USD.`,
      });

      const locationConfigured = Boolean(
        settings.shopifyLocationId ||
          shopifyTest.locations?.some((location) => location.isActive && location.fulfillsOnlineOrders) ||
          shopifyTest.locations?.some((location) => location.isActive),
      );
      pushCheck(checks, {
        id: 'shopify.location',
        name: 'Inventory Location',
        status: locationConfigured ? 'PASS' : 'FAIL',
        message: locationConfigured
          ? 'A Shopify inventory location is available for publish/inventory sync.'
          : 'No active Shopify location is available for inventory sync.',
      });

      const publicationConfigured = Boolean(
        shopifyTest.publications?.find((publication) => publication.name.toLowerCase().includes('online store')) ||
          shopifyTest.publications?.length,
      );
      pushCheck(checks, {
        id: 'shopify.publication',
        name: 'Publication Target',
        status: publicationConfigured ? 'PASS' : 'FAIL',
        message: publicationConfigured
          ? 'At least one Shopify publication is available.'
          : 'No Shopify publication is available for product publishing.',
      });

      const webhookTopics = new Set((shopifyTest.webhookSubscriptions || []).map((entry) => entry.topic));
      const requiredTopics = ['ORDERS_CREATE', 'APP_UNINSTALLED'];
      const missingWebhookTopics = requiredTopics.filter((topic) => !webhookTopics.has(topic));
      pushCheck(checks, {
        id: 'shopify.webhooks',
        name: 'Webhook Automation',
        status: missingWebhookTopics.length === 0 ? 'PASS' : 'WARNING',
        message:
          missingWebhookTopics.length === 0
            ? 'Required Shopify webhooks are registered.'
            : `Missing webhook topics: ${missingWebhookTopics.join(', ')}`,
        hint:
          missingWebhookTopics.length === 0
            ? undefined
            : 'Run POST /api/cj-shopify-usa/webhooks/register after BACKEND_URL is correct.',
      });

      pushCheck(checks, {
        id: 'shopify.payments_reality',
        name: 'Checkout / Payments Reality',
        status: shopifyTest.shopData!.country === 'CL' && !hasPaypalCheckoutCredentials ? 'WARNING' : 'PASS',
        message:
          shopifyTest.shopData!.country === 'CL' && hasPaypalCheckoutCredentials
            ? 'Chile-based operator detected; PayPal checkout credentials are configured, so Shopify Payments is not assumed.'
            : shopifyTest.shopData!.country === 'CL'
              ? 'Chile-based operator detected. Configure PayPal or another third-party checkout gateway; do not assume Shopify Payments.'
              : 'Verify payout / gateway availability for your operator geography.',
        hint:
          shopifyTest.shopData!.country === 'CL'
            ? 'Confirm PayPal is active in Shopify Admin > Settings > Payments. Shopify does not expose payment-gateway activation through CLI/Admin API.'
            : undefined,
      });
    }

    const ready = checks.every((check) => check.status !== 'FAIL') && dbOk && env.ENABLE_CJ_SHOPIFY_USA_MODULE;
    return { ready, checks };
  }
}

export const cjShopifyUsaSystemReadinessService = new CjShopifyUsaSystemReadinessService();
