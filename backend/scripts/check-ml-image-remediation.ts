#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { runMercadoLibreImageRemediationPipeline } from '../src/services/mercadolibre-image-remediation.service';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);
  const shouldPersist = process.argv.includes('--persist');

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      title: true,
      images: true,
      productData: true,
      status: true,
      isPublished: true,
    },
  });

  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }

  const remediation = await runMercadoLibreImageRemediationPipeline({
    userId: product.userId,
    productId: product.id,
    title: product.title,
    images: product.images,
    productData: product.productData,
  });

  if (shouldPersist) {
    const currentMeta =
      typeof product.productData === 'string'
        ? (() => {
            try {
              return JSON.parse(product.productData);
            } catch {
              return {};
            }
          })()
        : product.productData && typeof product.productData === 'object'
          ? (product.productData as Record<string, unknown>)
          : {};

    const mergedMeta = {
      ...currentMeta,
      mlChileImageCompliance: remediation.complianceProof,
      mlChileImageRemediation: remediation.metadataPatch.mlChileImageRemediation,
      mlChileAssetPack: remediation.metadataPatch.mlChileAssetPack,
      mlChileCanonicalPipeline: remediation.metadataPatch.mlChileCanonicalPipeline,
      preventivePublish: {
        ...((currentMeta as Record<string, any>).preventivePublish || {}),
        mlChileImageCompliance: remediation.complianceProof,
        mlChileImageRemediation: remediation.metadataPatch.mlChileImageRemediation,
        mlChileAssetPack: remediation.metadataPatch.mlChileAssetPack,
        mlChileCanonicalPipeline: remediation.metadataPatch.mlChileCanonicalPipeline,
        policyComplianceReady: remediation.publishSafe,
      },
    };

    await prisma.product.update({
      where: { id: product.id },
      data: {
        productData: JSON.stringify(mergedMeta),
      },
    });
  }

  const canon = remediation.metadataPatch.mlChileCanonicalPipeline as Record<string, unknown> | undefined;
  const trace = canon?.trace as Record<string, unknown> | undefined;

  console.log(
    JSON.stringify(
      {
        productId: product.id,
        title: product.title,
        status: product.status,
        isPublished: product.isPublished,
        persisted: shouldPersist,
        p77Summary: {
          integrationLayerOutcome: (remediation.metadataPatch.mlChileImageRemediation as { integrationLayerOutcome?: string })
            ?.integrationLayerOutcome,
          rejectHardStalePackOverrideActive: (remediation.metadataPatch.mlChileImageRemediation as {
            rejectHardStalePackOverrideActive?: boolean;
          })?.rejectHardStalePackOverrideActive,
          canonicalExecuted: canon?.executed === true,
          traceFinalOutcome: trace?.finalOutcome ?? null,
          candidateInventoryCount: Array.isArray(trace?.candidateInventory) ? (trace.candidateInventory as unknown[]).length : null,
          rankedCount: Array.isArray(trace?.rankedCandidates) ? (trace.rankedCandidates as unknown[]).length : null,
          directGateRows: Array.isArray(trace?.directPathGateEvaluations)
            ? (trace.directPathGateEvaluations as unknown[]).length
            : null,
          remediationAttempts: Array.isArray(trace?.remediationAttempts) ? (trace.remediationAttempts as unknown[]).length : null,
          winningRecipeId: trace?.winningRecipeId ?? null,
          winningRemediationCandidateUrl: trace?.winningRemediationCandidateUrl ?? null,
          remediationSimulationRows: Array.isArray(trace?.remediationSimulation)
            ? (trace.remediationSimulation as unknown[]).length
            : null,
          remediationSimulationWinner: trace?.remediationSimulationWinner ?? null,
          remediationSimulationAllWeak: trace?.remediationSimulationAllWeak ?? null,
          remediationSimulationHiFiInvoked: trace?.remediationSimulationHiFiInvoked ?? null,
          remediationSimulationHiFiRowCount: trace?.remediationSimulationHiFiRowCount ?? null,
          finalCoverPreferenceEnabled: trace?.finalCoverPreferenceEnabled ?? null,
          finalCoverPreferenceMaxFinalists: trace?.finalCoverPreferenceMaxFinalists ?? null,
          finalCoverPreferencePlanSlots: trace?.finalCoverPreferencePlanSlots ?? null,
          finalCoverPreferenceFinalistsCount: Array.isArray(trace?.finalCoverPreferenceFinalists)
            ? (trace.finalCoverPreferenceFinalists as unknown[]).length
            : null,
          finalCoverPreferenceWinner: trace?.finalCoverPreferenceWinner ?? null,
          finalCoverPreferenceBeatReasons: trace?.finalCoverPreferenceBeatReasons ?? null,
          finalCoverProvisionalWinner: trace?.finalCoverProvisionalWinner ?? null,
          commercialFinalistFloorEnabled: trace?.commercialFinalistFloorEnabled ?? null,
          commercialFinalistFloorPass: trace?.commercialFinalistFloorPass ?? null,
          commercialFinalistFloorFailureReasons: trace?.commercialFinalistFloorFailureReasons ?? null,
          chosenDirectUrl: trace?.chosenDirectUrl ?? null,
        },
        remediation: {
          decision: remediation.decision,
          remediationPathSelected: remediation.remediationPathSelected,
          executor: remediation.executor,
          publishSafe: remediation.publishSafe,
          compliantPackPresent: remediation.compliantPackPresent,
          reviewedProofState: remediation.reviewedProofState,
          blockingReasons: remediation.blockingReasons,
          rawAudit: remediation.rawAudit,
          assetPack: remediation.assetPack,
          complianceProof: remediation.complianceProof,
          mlChileCanonicalPipeline: remediation.metadataPatch.mlChileCanonicalPipeline,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
