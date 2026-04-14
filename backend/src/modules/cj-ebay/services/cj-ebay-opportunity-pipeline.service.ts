/**
 * Orchestrates CJ evaluate → eBay listing draft → optional publish from Opportunities / Research UI.
 * Reuses qualification + listing services (no duplicate CJ/eBay HTTP).
 */

import { env } from '../../../config/env';
import logger from '../../../config/logger';
import { createCjSupplierAdapter } from '../adapters/cj-supplier.adapter';
import { cjEbayListingService } from './cj-ebay-listing.service';
import { cjEbayQualificationService } from './cj-ebay-qualification.service';
import { resolveCjVariantKeyForPipeline } from './cj-ebay-variant-resolution';

export interface CjOpportunityPipelineBody {
  productId: string;
  variantId?: string;
  quantity: number;
  destPostalCode?: string;
  /** If true, never publish even if `publish` is set. */
  draftOnly?: boolean;
  /** If true, publish after successful draft (unless `draftOnly` or BLOCK_NEW_PUBLICATIONS). */
  publish?: boolean;
}

export const cjEbayOpportunityPipelineService = {
  async run(input: {
    userId: number;
    body: CjOpportunityPipelineBody;
    correlationId?: string;
    route?: string;
  }): Promise<{
    ok: boolean;
    resolvedVariantId: string;
    variantResolution: 'client' | 'single_variant';
    evaluate: {
      decision: string;
      reasons?: unknown;
      breakdown: unknown;
      shipping: unknown;
      riskScore: number;
      ids?: unknown;
    };
    listing: null | {
      id: number;
      status: string;
      ebaySku: string | null;
      handlingTimeDays: number | null;
    };
    breakdown: unknown | null;
    draftPayload: unknown | null;
    policyNote: string | null;
    publish: null | { ebayListingId: string; listingUrl: string; offerId: string };
    publishSkippedReason: string | null;
  }> {
    const pid = String(input.body.productId || '').trim();
    const qty = Math.max(1, Math.floor(input.body.quantity || 1));
    const destPostalCode = input.body.destPostalCode?.trim() || undefined;
    const wantPublish =
      input.body.publish === true && input.body.draftOnly !== true;

    const adapter = createCjSupplierAdapter(input.userId);
    const detail = await adapter.getProductById(pid);
    const { variantKey, resolution } = resolveCjVariantKeyForPipeline(
      detail,
      input.body.variantId
    );

    logger.info('[cj-ebay] opportunity pipeline: resolved variant', {
      userId: input.userId,
      productIdLen: pid.length,
      resolution,
      correlationId: input.correlationId,
    });

    const evalOut = await cjEbayQualificationService.evaluate({
      userId: input.userId,
      body: {
        productId: pid,
        variantId: variantKey,
        quantity: qty,
        destPostalCode,
      },
      correlationId: input.correlationId,
      route: input.route,
    });

    const baseEvaluate = {
      decision: evalOut.decision,
      reasons: evalOut.reasons,
      breakdown: evalOut.breakdown,
      shipping: evalOut.shipping,
      riskScore: evalOut.riskScore,
      ids: evalOut.ids,
    };

    if (evalOut.decision !== 'APPROVED') {
      logger.info('[cj-ebay] opportunity pipeline: evaluate not approved — no draft', {
        userId: input.userId,
        decision: evalOut.decision,
        correlationId: input.correlationId,
      });
      return {
        ok: true,
        resolvedVariantId: variantKey,
        variantResolution: resolution,
        evaluate: baseEvaluate,
        listing: null,
        breakdown: null,
        draftPayload: null,
        policyNote: null,
        publish: null,
        publishSkippedReason:
          evalOut.decision === 'REJECTED'
            ? 'EVALUATION_REJECTED'
            : evalOut.decision === 'PENDING'
              ? 'EVALUATION_PENDING'
              : 'NOT_APPROVED',
      };
    }

    const draftOut = await cjEbayListingService.createOrUpdateDraft({
      userId: input.userId,
      body: {
        productId: pid,
        variantId: variantKey,
        quantity: qty,
        destPostalCode,
      },
      correlationId: input.correlationId,
      route: input.route,
    });

    let publish: { ebayListingId: string; listingUrl: string; offerId: string } | null = null;
    let publishSkippedReason: string | null = null;

    if (!wantPublish) {
      publishSkippedReason =
        input.body.draftOnly === true ? 'DRAFT_ONLY' : 'PUBLISH_NOT_REQUESTED';
    } else if (env.BLOCK_NEW_PUBLICATIONS) {
      publishSkippedReason = 'BLOCK_NEW_PUBLICATIONS';
      logger.warn('[cj-ebay] opportunity pipeline: publish skipped (block flag)', {
        userId: input.userId,
        listingId: draftOut.listing.id,
      });
    } else {
      try {
        const pub = await cjEbayListingService.publish({
          userId: input.userId,
          listingDbId: draftOut.listing.id,
          correlationId: input.correlationId,
          route: input.route,
        });
        publish = {
          ebayListingId: pub.listingId,
          listingUrl: pub.listingUrl,
          offerId: pub.offerId,
        };
        logger.info('[cj-ebay] opportunity pipeline: published', {
          userId: input.userId,
          localListingId: draftOut.listing.id,
          ebayListingId: pub.listingId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        publishSkippedReason = `PUBLISH_FAILED:${msg.slice(0, 200)}`;
        logger.warn('[cj-ebay] opportunity pipeline: publish failed', {
          userId: input.userId,
          listingId: draftOut.listing.id,
          message: msg.slice(0, 500),
        });
      }
    }

    return {
      ok: true,
      resolvedVariantId: variantKey,
      variantResolution: resolution,
      evaluate: baseEvaluate,
      listing: {
        id: draftOut.listing.id,
        status: draftOut.listing.status,
        ebaySku: draftOut.listing.ebaySku,
        handlingTimeDays: draftOut.listing.handlingTimeDays,
      },
      breakdown: draftOut.breakdown,
      draftPayload: draftOut.draftPayload,
      policyNote: draftOut.policyNote ?? null,
      publish,
      publishSkippedReason,
    };
  },
};
