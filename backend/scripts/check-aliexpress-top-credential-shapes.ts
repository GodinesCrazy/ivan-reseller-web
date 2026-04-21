import '../src/config/env';
import crypto from 'crypto';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { classifyAliExpressFreightCompatibility } from '../src/utils/aliexpress-freight-compatibility';
import { buildAliExpressCapabilitySnapshot } from '../src/utils/aliexpress-capability-model';
import { resolveAliExpressCapabilityRoute } from '../src/utils/aliexpress-capability-routing';

function summarize(name: string, creds: Record<string, unknown> | null) {
  const appKey = String(creds?.appKey || creds?.clientId || '').trim();
  const appSecret = String(creds?.appSecret || creds?.clientSecret || '').trim();
  const accessToken = String(creds?.accessToken || creds?.access_token || '').trim();
  const refreshToken = String(creds?.refreshToken || creds?.refresh_token || '').trim();
  return {
    apiName: name,
    present: Boolean(creds),
    appKeyPrefix: appKey ? `${appKey.slice(0, 6)}...` : null,
    appSecretFingerprint: appSecret
      ? crypto.createHash('sha256').update(appSecret, 'utf8').digest('hex').slice(0, 12)
      : null,
    appSecretLength: appSecret.length,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
  };
}

function classifySecretConsistency(
  creds: Record<string, unknown> | null,
): 'secret_consistent' | 'secret_suspect' | 'unknown' {
  const appKey = String(creds?.appKey || creds?.clientId || '').trim();
  const appSecret = String(creds?.appSecret || creds?.clientSecret || '').trim();
  const envAppKey = String(process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim();
  const envAppSecret = String(process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim();
  if (!appKey || !appSecret || !envAppKey || !envAppSecret) return 'unknown';
  const loadedSecretFingerprint = crypto.createHash('sha256').update(appSecret, 'utf8').digest('hex').slice(0, 12);
  const envSecretFingerprint = crypto.createHash('sha256').update(envAppSecret, 'utf8').digest('hex').slice(0, 12);
  return appKey === envAppKey && loadedSecretFingerprint === envSecretFingerprint
    ? 'secret_consistent'
    : 'secret_suspect';
}

async function main() {
  const userId = Number(process.argv[2] || 1);
  const affiliateEntry = await CredentialsManager.getCredentialEntry(
    userId,
    'aliexpress-affiliate',
    'production',
  );
  const dropshippingEntry = await CredentialsManager.getCredentialEntry(
    userId,
    'aliexpress-dropshipping',
    'production',
  );
  const affiliate = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-affiliate',
    'production',
  )) as Record<string, unknown> | null;
  const dropshipping = (await CredentialsManager.getCredentials(
    userId,
    'aliexpress-dropshipping',
    'production',
  )) as Record<string, unknown> | null;

  const affiliateSummary = summarize('aliexpress-affiliate', affiliate);
  const dropshippingSummary = summarize('aliexpress-dropshipping', dropshipping);
  const preferred = dropshippingSummary.hasAccessToken ? dropshippingSummary : affiliateSummary;
  const compatibility = classifyAliExpressFreightCompatibility({
    appFamily:
      preferred.apiName === 'aliexpress-dropshipping'
        ? 'dropshipping'
        : preferred.apiName === 'aliexpress-affiliate'
      ? 'affiliate'
      : 'unknown',
    tokenFamily: preferred.hasAccessToken ? 'dropshipping_session' : 'none',
    hasAccessToken: preferred.hasAccessToken,
    hasRefreshToken: preferred.hasRefreshToken,
    lastFailureReason: preferred.hasAccessToken
      ? 'freight_quote_not_attempted_in_shape_probe'
      : 'missing_session_for_freight_call',
    secretConsistency: classifySecretConsistency(dropshipping),
    sessionBindingConsistency:
      preferred.apiName === 'aliexpress-dropshipping' && preferred.hasAccessToken
        ? 'session_binding_consistent'
        : preferred.hasAccessToken
          ? 'session_binding_suspect'
          : 'unknown',
  });
  const capabilitySnapshot = buildAliExpressCapabilitySnapshot({
    affiliateAppPresent: affiliateSummary.present,
    affiliateHasSession: affiliateSummary.hasAccessToken,
    dropshippingAppPresent: dropshippingSummary.present,
    dropshippingHasSession: dropshippingSummary.hasAccessToken,
    freightCompatibility: compatibility.freightCredentialCompatibility,
    freightLastFailureReason: compatibility.freightLastFailureReason,
  });
  const canonicalRoutes = {
    affiliateDiscoveryCapability: resolveAliExpressCapabilityRoute('affiliateDiscoveryCapability', {
      affiliateAppPresent: affiliateSummary.present,
      affiliateHasSession: affiliateSummary.hasAccessToken,
      dropshippingAppPresent: dropshippingSummary.present,
      dropshippingHasSession: dropshippingSummary.hasAccessToken,
    }),
    dropshippingProductCapability: resolveAliExpressCapabilityRoute('dropshippingProductCapability', {
      affiliateAppPresent: affiliateSummary.present,
      affiliateHasSession: affiliateSummary.hasAccessToken,
      dropshippingAppPresent: dropshippingSummary.present,
      dropshippingHasSession: dropshippingSummary.hasAccessToken,
    }),
    dropshippingOrderCapability: resolveAliExpressCapabilityRoute('dropshippingOrderCapability', {
      affiliateAppPresent: affiliateSummary.present,
      affiliateHasSession: affiliateSummary.hasAccessToken,
      dropshippingAppPresent: dropshippingSummary.present,
      dropshippingHasSession: dropshippingSummary.hasAccessToken,
    }),
    freightQuoteCapability: resolveAliExpressCapabilityRoute('freightQuoteCapability', {
      affiliateAppPresent: affiliateSummary.present,
      affiliateHasSession: affiliateSummary.hasAccessToken,
      dropshippingAppPresent: dropshippingSummary.present,
      dropshippingHasSession: dropshippingSummary.hasAccessToken,
    }),
  };

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        userId,
        affiliate: {
          ...affiliateSummary,
          scope: affiliateEntry?.scope ?? null,
          entryId: affiliateEntry?.id ?? null,
        },
        dropshipping: {
          ...dropshippingSummary,
          scope: dropshippingEntry?.scope ?? null,
          entryId: dropshippingEntry?.id ?? null,
          secretConsistency: classifySecretConsistency(dropshipping),
          envAppKeyPrefix: String(process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim()
            ? `${String(process.env.ALIEXPRESS_DROPSHIPPING_APP_KEY || '').trim().slice(0, 6)}...`
            : null,
          envAppSecretFingerprint: String(process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim()
            ? crypto
                .createHash('sha256')
                .update(String(process.env.ALIEXPRESS_DROPSHIPPING_APP_SECRET || '').trim(), 'utf8')
                .digest('hex')
                .slice(0, 12)
            : null,
        },
        freightAppFamily: compatibility.freightAppFamily,
        freightTokenFamily: compatibility.freightTokenFamily,
        freightCredentialCompatibility: compatibility.freightCredentialCompatibility,
        freightLastFailureReason: compatibility.freightLastFailureReason,
        capabilitySnapshot,
        canonicalRoutes,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[check-aliexpress-top-credential-shapes] failed', error);
  process.exit(1);
});
