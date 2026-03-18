#!/usr/bin/env npx tsx
/**
 * Fetch a single eBay order by ID from the eBay Sell Fulfillment API.
 * Uses stored credentials (Ajustes → APIs) to verify we can rescue order data.
 * Usage: npx tsx scripts/fetch-ebay-order-api.ts [userId] [ebayOrderId]
 * Example: npx tsx scripts/fetch-ebay-order-api.ts 1 17-11370-63716
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import MarketplaceService from '../src/services/marketplace.service';
import { EbayService, EbayCredentials } from '../src/services/ebay.service';

const DEFAULT_ORDER_ID = '17-11370-63716';

async function getFirstUserIdWithEbayProduction(): Promise<number | null> {
  const row = await prisma.apiCredential.findFirst({
    where: { apiName: 'ebay', isActive: true, environment: 'production' },
    select: { userId: true },
    orderBy: { updatedAt: 'desc' },
  });
  return row?.userId ?? null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--list' && a !== '--by-id');
  const argvUserId = args[0]?.trim();
  const ebayOrderId = (args[1]?.trim() || DEFAULT_ORDER_ID).trim();
  if (!ebayOrderId) {
    console.error('Usage: npx tsx scripts/fetch-ebay-order-api.ts [userId] [ebayOrderId] [--list]');
    process.exit(1);
  }

  let userId: number;
  if (argvUserId) {
    const parsed = parseInt(argvUserId, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      console.error('Invalid userId. Usage: npx tsx scripts/fetch-ebay-order-api.ts [userId] [ebayOrderId] [--list]');
      process.exit(1);
    }
    userId = parsed;
  } else {
    const first = await getFirstUserIdWithEbayProduction();
    if (first == null) {
      console.error('No user with active eBay production credentials found. Connect eBay in Ajustes → APIs first.');
      process.exit(1);
    }
    userId = first;
  }

  const marketplaceService = new MarketplaceService();
  const credsResult = await marketplaceService.getCredentials(userId, 'ebay', 'production');
  if (!credsResult?.isActive || !credsResult?.credentials) {
    console.error('eBay production credentials not found or inactive for user', userId, '. Connect your eBay account in Ajustes → APIs.');
    process.exit(1);
  }

  const ebayService = new EbayService({
    ...(credsResult.credentials as EbayCredentials),
    sandbox: false,
  });

  const listFirst = process.argv.includes('--list');
  const byId = process.argv.includes('--by-id');
  if (byId) {
    try {
      const listRes = await ebayService.getOrdersByOrderIds([ebayOrderId]);
      const orders = listRes?.orders ?? [];
      if (orders.length > 0) {
        console.log(JSON.stringify(orders[0], null, 2));
      } else {
        console.error('Order not found in getOrders(orderIds) response.');
        process.exit(1);
      }
    } catch (e: any) {
      console.error('eBay API error:', e?.message ?? e);
      if (e?.response?.data) console.error('eBay response:', JSON.stringify(e.response.data, null, 2));
      process.exit(1);
    }
    await prisma.$disconnect();
    return;
  }
  if (listFirst) {
    const listRes = await ebayService.getOrders({ limit: 20, offset: 0, noFilter: true });
    console.log('Orders from getOrders (first 20), orderIds:', listRes.orders?.map((o) => o.orderId) ?? []);
    console.log('Total from API:', listRes.total ?? 'n/a');
    if ((listRes.orders?.length ?? 0) > 0) {
      const match = listRes.orders?.find((o) => o.orderId === ebayOrderId || String(o.orderId).includes(ebayOrderId) || ebayOrderId.includes(String(o.orderId)));
      if (match) console.log('Match for', ebayOrderId, ':', JSON.stringify(match, null, 2));
    }
    await prisma.$disconnect();
    return;
  }

  try {
    const order = await ebayService.getOrderById(ebayOrderId);
    console.log(JSON.stringify(order, null, 2));
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('eBay API error:', msg);
    const body = err?.response?.data;
    if (body && typeof body === 'object') {
      console.error('eBay response:', JSON.stringify(body, null, 2));
    } else if (body != null) {
      console.error('eBay response:', body);
    }
    process.exit(1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
