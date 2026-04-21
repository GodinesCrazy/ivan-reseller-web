/**
 * e2e-ebay-dropshipping-cycle.ts
 *
 * End-to-end dropshipping cycle script:
 *   1. Search for an opportunity (via AliExpress or opportunity finder)
 *   2. Create product in the system
 *   3. Approve it
 *   4. Publish to eBay USA
 *
 * Run: npx tsx backend/scripts/e2e-ebay-dropshipping-cycle.ts
 */

import 'dotenv/config';
import { prisma } from '../src/config/database';
import { logger } from '../src/config/logger';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   E2E Dropshipping Cycle: AliExpress → eBay USA            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();

  // ── Step 0: Verify credentials ─────────────────────────────────────────────
  console.log('🔑 Step 0: Checking credentials...');

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, username: true },
  });
  if (!user) {
    console.error('❌ No active user found. Run seed first.');
    process.exit(1);
  }
  const userId = user.id;
  console.log(`   ✅ User: ${user.username} (id=${userId})`);

  // Check eBay credentials
  const { CredentialsManager } = await import('../src/services/credentials-manager.service');
  const ebayEntry = await CredentialsManager.getCredentialEntry(userId, 'ebay', 'production');
  const ebayCreds = (ebayEntry?.credentials || {}) as Record<string, any>;
  const hasEbayToken = !!(ebayCreds.token || ebayCreds.refreshToken || process.env.EBAY_REFRESH_TOKEN);
  const hasEbayAppId = !!(ebayCreds.appId || process.env.EBAY_APP_ID);
  console.log(`   eBay token: ${hasEbayToken ? '✅' : '❌'}`);
  console.log(`   eBay appId: ${hasEbayAppId ? '✅' : '❌'}`);

  // Check AliExpress credentials (optional for opportunity search)
  const aliEntry = await CredentialsManager.getCredentialEntry(userId, 'aliexpress-dropshipping', 'production');
  const aliCreds = (aliEntry?.credentials || {}) as Record<string, any>;
  const hasAliToken = !!(aliCreds.accessToken || process.env.ALIEXPRESS_DROPSHIPPING_ACCESS_TOKEN);
  console.log(`   AliExpress DS token: ${hasAliToken ? '✅' : '⚠️ (will use basic search)'}`);

  if (!hasEbayToken && !hasEbayAppId) {
    console.error('\n❌ No eBay credentials found. Cannot publish.');
    console.log('   Configure eBay credentials in Settings → API Settings → eBay');
    process.exit(1);
  }

  // ── Step 1: Find an opportunity ────────────────────────────────────────────
  console.log('\n🔍 Step 1: Searching for an opportunity...');

  const keyword = process.argv[2] || 'phone accessories';
  console.log(`   Keyword: "${keyword}"`);

  const opportunityFinder = (await import('../src/services/opportunity-finder.service')).default;

  let opportunity: any = null;
  try {
    const result = await opportunityFinder.findOpportunitiesWithDiagnostics(userId, {
      query: keyword,
      maxItems: 5,
      skipTrendsValidation: true,
    });

    if (result.opportunities.length > 0) {
      // Find cheapest under $12
      opportunity = result.opportunities
        .filter((o: any) => Number(o.costUsd || 0) > 0 && Number(o.costUsd) <= 12)
        .sort((a: any, b: any) => (a.costUsd || 0) - (b.costUsd || 0))[0]
        || result.opportunities[0];

      console.log(`   ✅ Found ${result.opportunities.length} opportunities`);
      console.log(`   Selected: "${opportunity.title}"`);
      console.log(`   Cost: $${Number(opportunity.costUsd || 0).toFixed(2)} USD`);
      console.log(`   Suggested Price: $${Number(opportunity.suggestedPriceUsd || 0).toFixed(2)} USD`);

      const images = Array.isArray(opportunity.images)
        ? opportunity.images
        : (opportunity.image ? [opportunity.image] : []);
      console.log(`   Images: ${images.length}`);
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Opportunity search failed: ${err.message}`);
  }

  // Fallback: if no real opportunity found, create a minimal test product
  if (!opportunity) {
    console.log('   ⚠️ No opportunities found. Using minimal test product...');
    opportunity = {
      title: `Test Phone Case ${keyword} ${Date.now()}`,
      description: `High quality ${keyword} - test product for eBay dropshipping cycle`,
      aliexpressUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
      productUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
      costUsd: 5.99,
      suggestedPriceUsd: 11.99,
      category: 'Cell Phones & Accessories',
      images: ['https://placehold.co/800x800.png?text=Test+Product'],
    };
    console.log(`   Using fallback: "${opportunity.title}" at $${opportunity.costUsd}`);
  }

  // ── Step 2: Create product in system ───────────────────────────────────────
  console.log('\n📦 Step 2: Creating product in system...');

  const { ProductService } = await import('../src/services/product.service');
  const productService = new ProductService();

  const rawImages = Array.isArray(opportunity.images)
    ? opportunity.images.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
    : (opportunity.image ? [opportunity.image] : []);
  const images = rawImages.length > 0 ? rawImages.slice(0, 12) : ['https://placehold.co/800x800.png?text=Product'];

  const product = await productService.createProduct(userId, {
    title: opportunity.title,
    description: opportunity.description || `${opportunity.title} - Direct from manufacturer`,
    aliexpressUrl: opportunity.aliexpressUrl || opportunity.productUrl || 'https://www.aliexpress.com/item/0.html',
    aliexpressPrice: opportunity.costUsd,
    suggestedPrice: opportunity.suggestedPriceUsd || opportunity.costUsd * 2,
    imageUrls: images,
    category: opportunity.category || 'General',
    currency: 'USD',
  });
  console.log(`   ✅ Product created: ID=${product.id}`);

  // ── Step 3: Approve product ────────────────────────────────────────────────
  console.log('\n✅ Step 3: Approving product...');
  await productService.updateProductStatusSafely(product.id, 'APPROVED', userId, 'E2E: auto-approved for eBay publish');
  console.log(`   ✅ Product approved`);

  // ── Step 4: Publish to eBay USA ────────────────────────────────────────────
  console.log('\n🚀 Step 4: Publishing to eBay USA...');

  const { default: MarketplaceService } = await import('../src/services/marketplace.service');
  const marketplaceService = new MarketplaceService();

  // Prepare title (max 80 chars for eBay)
  const baseTitle = String(opportunity.title || `Product-${product.id}`)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 75);
  const uniqueTitle = `${baseTitle} P${product.id}`.slice(0, 80);

  // Calculate price with margin
  const cost = Number(opportunity.costUsd || 5);
  const shippingCost = 0; // Included in AliExpress Standard
  const importTax = (cost + shippingCost) * 0.10; // Section 122
  const costBase = cost + shippingCost + importTax;
  const ebayFees = costBase * 0.135 + 0.40;
  const totalCost = costBase + ebayFees;
  const margin = 1.20; // 20% margin
  let finalPrice = totalCost * margin;

  // Round to .99
  finalPrice = Math.floor(finalPrice) + 0.99;
  if (finalPrice < 4.99) finalPrice = 4.99;

  console.log(`   Title: "${uniqueTitle}"`);
  console.log(`   Cost breakdown:`);
  console.log(`     Item: $${cost.toFixed(2)}`);
  console.log(`     Import tax (10%): $${importTax.toFixed(2)}`);
  console.log(`     eBay fees (~13.5%+$0.40): $${ebayFees.toFixed(2)}`);
  console.log(`     Total cost: $${totalCost.toFixed(2)}`);
  console.log(`     Final price (20% margin): $${finalPrice.toFixed(2)}`);

  try {
    const publishResult = await marketplaceService.publishProduct(
      userId,
      {
        productId: product.id,
        marketplace: 'ebay',
        customData: {
          title: uniqueTitle,
          price: finalPrice,
          quantity: 1,
          categoryId: '20349', // Cell Phone Accessories (safe default)
        } as any,
      },
      'production'
    );

    if (publishResult.success) {
      console.log(`\n   🎉 PUBLISHED SUCCESSFULLY!`);
      console.log(`   Listing ID: ${publishResult.listingId}`);
      console.log(`   URL: ${publishResult.listingUrl}`);

      // Update product status
      await productService.updateProductStatusSafely(product.id, 'PUBLISHED', true, userId);
      const verified = await prisma.product.findUnique({
        where: { id: product.id },
        select: { status: true, isPublished: true, publishedAt: true },
      });
      console.log(`   DB Status: ${verified?.status}, isPublished: ${verified?.isPublished}`);
    } else {
      console.error(`\n   ❌ Publish failed: ${publishResult.error}`);
    }
  } catch (publishErr: any) {
    console.error(`\n   ❌ Publish error: ${publishErr.message}`);

    // Provide actionable diagnostics
    const msg = (publishErr.message || '').toLowerCase();
    if (msg.includes('credentials not found') || msg.includes('falta token')) {
      console.log('\n   💡 Fix: Configure eBay credentials:');
      console.log('      1. Go to Settings → API Settings → eBay');
      console.log('      2. Complete OAuth authorization');
    } else if (msg.includes('fulfillment') || msg.includes('shipping') || msg.includes('lsas')) {
      console.log('\n   💡 Fix: Configure eBay shipping:');
      console.log('      1. Go to eBay Seller Hub → Business Policies → Shipping');
      console.log('      2. Create a policy with Standard International from China');
    } else if (msg.includes('location')) {
      console.log('\n   💡 Fix: Configure eBay location:');
      console.log('      1. Go to eBay Seller Hub → Inventory → Locations');
      console.log('      2. Create a location in China (CN)');
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`\n⏱️  Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
