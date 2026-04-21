/**
 * Phase D.5 — Safe pay dry-run: calls paySupplierOrder with dryRun:true (no CJ payBalance).
 * Requires an order id that already has supplierOrderId (e.g. after phase-d create+confirm).
 *
 * Usage: CJ_PHASE_D_PAY_DRY_RUN_ORDER_ID=<cuid> tsx scripts/cj-phase-d5-pay-dry-run.ts
 */
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { supplierFulfillmentService } from '../src/services/supplier-fulfillment.service';

async function main(): Promise<void> {
  const orderId = String(process.env.CJ_PHASE_D_PAY_DRY_RUN_ORDER_ID || '').trim();
  if (!orderId) {
    console.error('NO-GO: set CJ_PHASE_D_PAY_DRY_RUN_ORDER_ID');
    process.exit(2);
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, supplierOrderId: true },
  });
  if (!order?.userId || !order.supplierOrderId) {
    console.error('NO-GO: order needs userId and supplierOrderId');
    process.exit(2);
  }
  const out = await supplierFulfillmentService.paySupplierOrder({
    orderId: order.id,
    userId: order.userId,
    dryRun: true,
    executePay: false,
  });
  console.log('[cj-phase-d5-pay-dry-run] OK', JSON.stringify(out.metadata, null, 2));
}

void main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
