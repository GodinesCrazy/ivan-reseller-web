#!/usr/bin/env tsx
import 'dotenv/config';

import { prisma } from '../src/config/database';
import { inspectMercadoLibreAssetPack } from '../src/services/mercadolibre-image-remediation.service';
import { MarketplaceService } from '../src/services/marketplace.service';
import { MercadoLibreService, type MLItemSnapshot } from '../src/services/mercadolibre.service';
import { productService } from '../src/services/product.service';


type Classification =
  | 'listing_active_policy_clean'
  | 'listing_under_review'
  | 'listing_still_blocked_by_policy'
  | 'listing_update_failed';

function summarizeSnapshot(snapshot: MLItemSnapshot | null) {
  if (!snapshot) return null;
  return {
    id: snapshot.id ?? null,
    title: snapshot.title ?? null,
    status: snapshot.status ?? null,
    sub_status: Array.isArray(snapshot.sub_status) ? snapshot.sub_status : [],
    health: typeof snapshot.health === 'number' ? snapshot.health : null,
    permalink: snapshot.permalink ?? null,
    pictures: Array.isArray(snapshot.pictures)
      ? snapshot.pictures.map((picture) => ({
          id: picture.id ?? null,
          url: picture.secure_url || picture.url || null,
          max_size: picture.max_size ?? null,
        }))
      : [],
  };
}

function classifyFinalState(snapshot: MLItemSnapshot | null, updateError?: string | null): Classification {
  if (updateError) {
    return 'listing_update_failed';
  }
  const status = String(snapshot?.status || '').toLowerCase();
  const subStatus = (snapshot?.sub_status || []).map((value) => String(value).toLowerCase());
  if (status === 'active' && subStatus.length === 0) {
    return 'listing_active_policy_clean';
  }
  if (status === 'under_review' || subStatus.some((value) => value.includes('review'))) {
    return 'listing_under_review';
  }
  if (status === 'paused' || status === 'inactive' || status === 'closed' || subStatus.length > 0) {
    return 'listing_still_blocked_by_policy';
  }
  return 'listing_update_failed';
}

async function main(): Promise<void> {
  const productId = Number(process.argv[2] || 32690);
  const listingIdArg = String(process.argv[3] || '').trim();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      isPublished: true,
    },
  });

  if (!product) {
    throw new Error(`product_${productId}_not_found`);
  }

  const listingRow = await prisma.marketplaceListing.findFirst({
    where: {
      productId,
      marketplace: 'mercadolibre',
      ...(listingIdArg ? { listingId: listingIdArg } : {}),
    },
    select: {
      id: true,
      listingId: true,
      listingUrl: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!listingRow?.listingId) {
    throw new Error(`mercadolibre_listing_not_found_for_product_${productId}`);
  }

  const assetPack = await inspectMercadoLibreAssetPack({ productId });
  const approvedAssets = ['cover_main', 'detail_mount_interface', 'usage_context_clean']
    .map((assetKey) => assetPack.assets.find((asset) => asset.assetKey === assetKey))
    .filter(
      (asset): asset is NonNullable<typeof asset> =>
        !!asset && !!asset.localPath && asset.approvalState === 'approved'
    );

  const requiredApproved = approvedAssets.filter((asset) => asset.required);
  if (!assetPack.packApproved || requiredApproved.length < 2) {
    throw new Error('ml_asset_pack_not_ready_for_reactivation');
  }

  const uploadOrder = approvedAssets.map((asset) => ({
    assetKey: asset.assetKey,
    path: asset.localPath,
    required: asset.required,
  }));

  const marketplaceService = new MarketplaceService();
  const credentials = await marketplaceService.getCredentials(product.userId, 'mercadolibre', 'production');
  if (!credentials?.isActive) {
    throw new Error('mercadolibre_credentials_not_available_for_reactivation');
  }

  const mlService = new MercadoLibreService(credentials.credentials as any);
  const before = await mlService.getItem(listingRow.listingId);

  let updateError: string | null = null;
  let activateError: string | null = null;
  let afterReplace: MLItemSnapshot | null = null;
  let finalSnapshot: MLItemSnapshot | null = null;

  try {
    afterReplace = await mlService.replaceListingPictures(
      listingRow.listingId,
      uploadOrder.map((asset) => asset.path!)
    );
    finalSnapshot = afterReplace;

    if (String(afterReplace?.status || '').toLowerCase() !== 'active') {
      try {
        finalSnapshot = await mlService.activateListing(listingRow.listingId);
      } catch (error: any) {
        activateError = error?.message || String(error);
        finalSnapshot = await mlService.getItem(listingRow.listingId);
      }
    }
  } catch (error: any) {
    updateError = error?.message || String(error);
    finalSnapshot = await mlService.getItem(listingRow.listingId);
  }

  const classification = classifyFinalState(finalSnapshot, updateError);

  await prisma.marketplaceListing.update({
    where: { id: listingRow.id },
    data: {
      status: finalSnapshot?.status || (classification === 'listing_update_failed' ? 'failed_publish' : listingRow.status),
      listingUrl: finalSnapshot?.permalink || listingRow.listingUrl,
      updatedAt: new Date(),
    },
  });

  if (classification === 'listing_active_policy_clean') {
    await productService.updateProductStatusSafely(productId, 'PUBLISHED', true, product.userId);
  }

  console.log(
    JSON.stringify(
      {
        productId,
        listingId: listingRow.listingId,
        replacementAssets: {
          packApproved: assetPack.packApproved,
          uploadOrder,
        },
        before: summarizeSnapshot(before),
        afterReplace: summarizeSnapshot(afterReplace),
        final: summarizeSnapshot(finalSnapshot),
        activateAttempted: !!afterReplace && String(afterReplace?.status || '').toLowerCase() !== 'active',
        updateError,
        activateError,
        classification,
        localSync: {
          marketplaceListingStatus: finalSnapshot?.status || listingRow.status,
          productStatus: classification === 'listing_active_policy_clean' ? 'PUBLISHED' : product.status,
          productIsPublished: classification === 'listing_active_policy_clean' ? true : product.isPublished,
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
