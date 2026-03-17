/**
 * Phase 26 — Task 2: Listing Classification Engine
 * Classifies each listing into GOOD | NEEDS_OPTIMIZATION | BROKEN | REJECTED | INACTIVE | LOW_PERFORMANCE | NOT_EXISTING.
 */
import { trace } from '../utils/boot-trace';
trace('loading listing-classification-engine.service');

import type {
  ListingAuditRecord,
  ListingClassification,
  ClassificationInput,
} from './full-listing-recovery.types';

const DEFAULT_MIN_IMPRESSIONS = 1;
const DEFAULT_MIN_SALES = 0;
const DEFAULT_ZERO_IMPRESSIONS_DAYS = 14;

export class ListingClassificationEngine {
  /**
   * Classify a single audit record.
   */
  classify(input: ClassificationInput): ListingClassification {
    const {
      record,
      minImpressionsThreshold = DEFAULT_MIN_IMPRESSIONS,
      minSalesThreshold = DEFAULT_MIN_SALES,
      zeroImpressionsDaysThreshold = DEFAULT_ZERO_IMPRESSIONS_DAYS,
    } = input;

    const mp = record.marketplace?.toLowerCase() ?? '';

    // NOT_EXISTING: reconciliation says item not found on marketplace
    if (record.reconciliationResult === 'NOT_FOUND' || record.status === 'not_found') {
      return 'NOT_EXISTING';
    }

    // REJECTED: recent marketplace_rejection or validation_error
    const hasRejection = record.recentErrors?.some(
      (e) => e.errorType === 'marketplace_rejection' || e.errorType === 'validation_error'
    );
    if (hasRejection && (record.status === 'failed_publish' || record.reconciliationResult === 'ERROR')) {
      return 'REJECTED';
    }

    // INACTIVE: paused or closed on marketplace
    if (record.reconciliationResult === 'PAUSED' || record.status === 'paused') {
      return 'INACTIVE';
    }

    // BROKEN: needs fix (missing attributes, policy issues, category wrong) and not yet fixed
    const hasStructuralIssues =
      record.policyIssues.length > 0 ||
      record.missingAttributes.length > 0 ||
      record.categoryCorrectness !== 'ok' ||
      !record.hasRequiredMedia;
    if (hasStructuralIssues && record.pendingAuditActions > 0) {
      return 'BROKEN';
    }
    if (hasStructuralIssues) {
      return 'BROKEN';
    }

    // LOW_PERFORMANCE: no impressions/clicks/sales over the period (real metrics only)
    const noTraffic = record.impressions < minImpressionsThreshold && record.clicks < 1 && record.sales < 1;
    if (noTraffic && record.metricsDays >= zeroImpressionsDaysThreshold) {
      return 'LOW_PERFORMANCE';
    }

    // NEEDS_OPTIMIZATION: has traffic but low conversion or pending optimization actions
    if (record.pendingAuditActions > 0 || (record.impressions > 0 && record.clicks === 0 && record.sales === 0)) {
      return 'NEEDS_OPTIMIZATION';
    }

    // GOOD: active, compliant, has some engagement
    if (record.reconciliationResult === 'ACTIVE' || record.status === 'active') {
      return 'GOOD';
    }

    // Fallback: treat as NEEDS_OPTIMIZATION if we're not sure
    return 'NEEDS_OPTIMIZATION';
  }

  /**
   * Classify many audit records and attach classification to each.
   */
  classifyBatch(
    records: ListingAuditRecord[],
    options?: Partial<ClassificationInput>
  ): ListingAuditRecord[] {
    return records.map((record) => {
      const classification = this.classify({ ...options, record });
      return { ...record, classification };
    });
  }
}

export const listingClassificationEngine = new ListingClassificationEngine();
