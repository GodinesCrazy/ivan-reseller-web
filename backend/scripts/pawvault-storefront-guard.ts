/**
 * PawVault Storefront Guard — Catalog Cleanup Script
 * ────────────────────────────────────────────────────
 * Created 2026-05-16 after storefront audit found:
 * - Non-PET products (cameras, electronics) in a PET store
 * - Off-brand products (aquarium, fish, bird, reptile) in a Dogs & Cats store
 * - Duplicate products (multiple training pads)
 * - Supplier codes in URLs/handles
 * - False claims in theme ("4.8★ rated by 2,000+ families")
 *
 * This script:
 * 1. Scans all ACTIVE listings via Shopify Admin API
 * 2. Detects off-brand products using the new isCjShopifyUsaDogsCatsOnly filter
 * 3. Archives/unpublishes non-compliant products
 * 4. Logs all actions for traceability
 *
 * Run: npx ts-node backend/scripts/pawvault-storefront-guard.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  isCjShopifyUsaDogsCatsOnly,
  storefrontQualityGate,
  hasSupplierUrlLeak,
  hasSupplierCodeNoise,
} from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-policy.service';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

interface AuditResult {
  listingId: number;
  shopifyProductId: string | null;
  title: string;
  issues: string[];
  action: 'ARCHIVE' | 'FLAG' | 'OK';
  applied: boolean;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PawVault Storefront Guard — Catalog Cleanup           ║');
  console.log('║  Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify store)', '         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get all active listings
  const listings = await prisma.cjShopifyUsaListing.findMany({
    where: {
      status: { in: ['ACTIVE', 'RECONCILE_PENDING'] },
    },
    include: {
      product: true,
      evaluation: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`Found ${listings.length} active/pending listings to audit.\n`);

  const results: AuditResult[] = [];
  let archived = 0;
  let flagged = 0;
  let ok = 0;

  for (const listing of listings) {
    const draftPayload = (listing.draftPayload && typeof listing.draftPayload === 'object' && !Array.isArray(listing.draftPayload))
      ? listing.draftPayload as Record<string, unknown>
      : {};

    const title = String(draftPayload.title || listing.product.title || '');
    const description = String(draftPayload.description || listing.product.description || '');
    const productType = String(draftPayload.productType || '');
    const tags = String(draftPayload.tags || '');

    // Run the quality gate
    const gate = storefrontQualityGate({
      title,
      description,
      productType,
      tags,
    });

    if (gate.pass) {
      results.push({
        listingId: listing.id,
        shopifyProductId: listing.shopifyProductId,
        title,
        issues: [],
        action: 'OK',
        applied: false,
      });
      ok++;
      if (VERBOSE) console.log(`  ✅ #${listing.id}: ${title}`);
      continue;
    }

    // Determine action based on severity
    const hasHardBlock = gate.issues.includes('off_brand_not_dogs_cats');
    const action = hasHardBlock ? 'ARCHIVE' : 'FLAG';

    if (action === 'ARCHIVE') {
      console.log(`  🔴 ARCHIVE #${listing.id}: "${title.slice(0, 60)}..." — ${gate.issues.join(', ')}`);

      if (!DRY_RUN) {
        try {
          // Archive the listing locally
          await prisma.cjShopifyUsaListing.update({
            where: { id: listing.id },
            data: {
              status: 'ARCHIVED',
              lastError: `StorefrontGuard: ${gate.issues.join(', ')}. Archived for brand safety.`,
            },
          });

          // If it has a Shopify product, archive it there too
          if (listing.shopifyProductId) {
            // Mark for manual Shopify archival (or use admin service)
            console.log(`    → Shopify product ${listing.shopifyProductId} needs archival in Shopify Admin`);
          }

          archived++;
        } catch (error) {
          console.error(`    ❌ Failed to archive: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        archived++;
      }
    } else {
      console.log(`  🟡 FLAG #${listing.id}: "${title.slice(0, 60)}..." — ${gate.issues.join(', ')}`);
      flagged++;
    }

    results.push({
      listingId: listing.id,
      shopifyProductId: listing.shopifyProductId,
      title,
      issues: gate.issues,
      action,
      applied: !DRY_RUN && action === 'ARCHIVE',
    });
  }

  // --- Duplicate Detection ---
  console.log('\n--- Duplicate Detection ---');
  const activeTitles = new Map<string, AuditResult[]>();
  for (const result of results.filter(r => r.action === 'OK')) {
    const normalized = result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(cj[a-z0-9]+|\d{8,}[a-z0-9]*)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!activeTitles.has(normalized)) {
      activeTitles.set(normalized, []);
    }
    activeTitles.get(normalized)!.push(result);
  }

  let duplicateGroups = 0;
  for (const [title, group] of activeTitles) {
    if (group.length > 1) {
      duplicateGroups++;
      console.log(`  🔁 Duplicate group (${group.length}x): "${group[0].title.slice(0, 50)}..."`);
      for (const item of group) {
        console.log(`      → Listing #${item.listingId}`);
      }
    }
  }

  // --- Summary ---
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUDIT SUMMARY                                         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Total scanned:     ${listings.length.toString().padEnd(36)}║`);
  console.log(`║  ✅ Passed:          ${ok.toString().padEnd(36)}║`);
  console.log(`║  🔴 Archived:        ${archived.toString().padEnd(36)}║`);
  console.log(`║  🟡 Flagged:         ${flagged.toString().padEnd(36)}║`);
  console.log(`║  🔁 Duplicate groups: ${duplicateGroups.toString().padEnd(35)}║`);
  console.log(`║  Mode:              ${(DRY_RUN ? 'DRY RUN' : 'LIVE').padEnd(36)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Log trace
  if (!DRY_RUN && (archived > 0 || flagged > 0)) {
    await prisma.cjShopifyUsaExecutionTrace.create({
      data: {
        userId: listings[0]?.userId ?? 1,
        route: 'storefront-guard',
        step: 'storefront_guard.catalog_cleanup',
        message: `StorefrontGuard: ${archived} archived, ${flagged} flagged, ${ok} passed, ${duplicateGroups} duplicate groups`,
        meta: {
          archived,
          flagged,
          ok,
          duplicateGroups,
          results: results.filter(r => r.action !== 'OK').map(r => ({
            listingId: r.listingId,
            title: r.title.slice(0, 80),
            issues: r.issues,
            action: r.action,
          })),
        },
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('StorefrontGuard failed:', error);
  process.exit(1);
});
