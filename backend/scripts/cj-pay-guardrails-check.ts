/**
 * Read-only: evaluates CJ pay guardrails for an existing Order (no CJ payBalance call).
 *
 * Usage:
 *   CJ_PAY_CHECK_ORDER_ID=<cuid> tsx scripts/cj-pay-guardrails-check.ts
 */
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { evaluateCjPayConfirmToken, evaluateCjPayExecutionSafety } from '../src/services/cj-pay-safety';

async function main(): Promise<void> {
  const id = String(process.env.CJ_PAY_CHECK_ORDER_ID || '').trim();
  if (!id) {
    console.error('Set CJ_PAY_CHECK_ORDER_ID');
    process.exit(2);
  }
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, price: true, supplierOrderId: true, supplierPaymentStatus: true },
  });
  if (!order) {
    console.error('Order not found');
    process.exit(2);
  }
  const safety = evaluateCjPayExecutionSafety({ id: order.id, price: order.price });
  const token = evaluateCjPayConfirmToken(process.env.CJ_PAY_CHECK_CONFIRM_TOKEN || '');
  console.log(
    JSON.stringify(
      {
        orderId: order.id,
        hasSupplierOrderId: Boolean(order.supplierOrderId),
        safety,
        confirmToken: token,
        allowPayEnv: String(process.env.CJ_PHASE_D_ALLOW_PAY || '').toLowerCase() === 'true',
      },
      null,
      2
    )
  );
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
