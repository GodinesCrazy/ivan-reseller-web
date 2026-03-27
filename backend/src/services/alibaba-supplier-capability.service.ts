import fs from 'fs';
import path from 'path';
import { CredentialsManager } from './credentials-manager.service';

export interface AlibabaCodeSignals {
  settingsCredentialSlot: boolean;
  automatedBusinessSearchSignal: boolean;
  advancedScraperSignal: boolean;
  docsRoadmapSignal: boolean;
}

export interface AlibabaSupplierCapabilityReport {
  supplierTarget: 'alibaba';
  codeSignals: AlibabaCodeSignals;
  credentialState: 'missing' | 'present';
  discoveryCapability: 'present' | 'missing';
  skuStockTruth: 'present' | 'missing';
  destinationShippingTruth: 'present' | 'missing';
  shippingCostTruth: 'present' | 'missing';
  stableProductIdentity: 'partial' | 'missing' | 'present';
  supplierAvailabilityTruth: 'partial' | 'missing' | 'present';
  orderPlacementTruth: 'present' | 'missing';
  productionSafe: boolean;
  blockers: string[];
  credentialLookupError?: string;
  currentState:
    | 'promising_but_blocked_by_credentials_env'
    | 'unsafe_or_incomplete'
    | 'production_usable_now';
}

function repoRootPath(...parts: string[]) {
  return path.resolve(process.cwd(), '..', ...parts);
}

function fileContains(relativePath: string, needle: string): boolean {
  const filePath = repoRootPath(relativePath);
  if (!fs.existsSync(filePath)) return false;
  try {
    return fs.readFileSync(filePath, 'utf8').toLowerCase().includes(needle.toLowerCase());
  } catch {
    return false;
  }
}

export function assessAlibabaCapability(params: {
  credentialState: 'missing' | 'present';
  codeSignals: AlibabaCodeSignals;
  credentialLookupError?: string;
}): AlibabaSupplierCapabilityReport {
  const blockers: string[] = [];

  if (params.credentialLookupError) {
    blockers.push(`Alibaba credential lookup failed: ${params.credentialLookupError}`);
  }
  if (params.credentialState === 'missing') {
    blockers.push('No active Alibaba credentials were found in the real credential store.');
  }
  blockers.push('No SKU-level Alibaba stock truth path is implemented in the current codebase.');
  blockers.push('No destination-aware Alibaba shipping truth path is implemented in the current codebase.');
  blockers.push('No Alibaba shipping-cost truth path is implemented in the current codebase.');
  blockers.push('No Alibaba order-placement truth path is implemented in the current codebase.');

  const discoverySignals =
    params.codeSignals.settingsCredentialSlot ||
    params.codeSignals.automatedBusinessSearchSignal ||
    params.codeSignals.advancedScraperSignal ||
    params.codeSignals.docsRoadmapSignal;

  return {
    supplierTarget: 'alibaba',
    codeSignals: params.codeSignals,
    credentialState: params.credentialState,
    discoveryCapability: discoverySignals ? 'present' : 'missing',
    skuStockTruth: 'missing',
    destinationShippingTruth: 'missing',
    shippingCostTruth: 'missing',
    stableProductIdentity: discoverySignals ? 'partial' : 'missing',
    supplierAvailabilityTruth: discoverySignals ? 'partial' : 'missing',
    orderPlacementTruth: 'missing',
    productionSafe: false,
    blockers,
    credentialLookupError: params.credentialLookupError,
    currentState:
      params.credentialState === 'missing'
        ? 'promising_but_blocked_by_credentials_env'
        : 'unsafe_or_incomplete',
  };
}

export async function getAlibabaSupplierCapability(
  userId: number
): Promise<AlibabaSupplierCapabilityReport> {
  let productionCreds: unknown = null;
  let sandboxCreds: unknown = null;
  let credentialLookupError: string | undefined;
  try {
    [productionCreds, sandboxCreds] = await Promise.all([
      CredentialsManager.getCredentials(userId, 'alibaba', 'production'),
      CredentialsManager.getCredentials(userId, 'alibaba', 'sandbox'),
    ]);
  } catch (error: any) {
    credentialLookupError = error?.message || String(error);
  }

  return assessAlibabaCapability({
    credentialState: productionCreds || sandboxCreds ? 'present' : 'missing',
    credentialLookupError,
    codeSignals: {
      settingsCredentialSlot:
        fileContains('backend/src/routes/settings.routes.ts', 'developer.alibaba.com') ||
        fileContains('backend/src/routes/settings.routes.old.ts', 'developer.alibaba.com'),
      automatedBusinessSearchSignal: fileContains(
        'backend/src/services/automated-business.service.ts',
        "findSuppliers(productTitle, 'alibaba')"
      ),
      advancedScraperSignal:
        fileContains('backend/src/services/advanced-scraper.service.ts', 'api.mgsearch.alibaba.com') ||
        fileContains('backend/src/services/advanced-scraper.service.ts', 'login.alibaba.com'),
      docsRoadmapSignal:
        fileContains('docs/DEPLOYMENT_REPAIR_AND_PHASE2.md', 'Add a second supplier') ||
        fileContains('docs/DOMINANT_SAAS_EVOLUTION_ANALYSIS.md', 'Supplier connectors'),
    },
  });
}

export default {
  getAlibabaSupplierCapability,
  assessAlibabaCapability,
};
