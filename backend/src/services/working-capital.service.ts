/**
 * Working Capital Service
 *
 * Modelo de gestión de capital de trabajo: capital comprometido vs capital disponible real.
 * Permite compras mientras exista capital libre suficiente (freeCapital >= orderCost).
 * No requiere saldo igual al total publicado.
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { getPayPalBalance } from './balance-verification.service';

/** Estados de Order que representan capital comprometido (aún no ejecutado o en proceso) */
const COMMITTED_STATUSES = ['CREATED', 'PAID', 'PURCHASING'] as const;

export interface WorkingCapitalSnapshot {
  realAvailableBalance: number;
  committedCapital: number;
  freeWorkingCapital: number;
  currency: string;
  source?: string;
}

/**
 * Saldo real disponible (PayPal API vía balance-verification).
 */
export async function getRealAvailableBalance(): Promise<{ available: number; currency: string; source?: string }> {
  const balance = await getPayPalBalance();
  if (balance == null) {
    logger.warn('[WORKING-CAPITAL] getRealAvailableBalance: could not retrieve real balance');
    return { available: 0, currency: 'USD', source: undefined };
  }
  return {
    available: balance.available,
    currency: balance.currency || 'USD',
    source: balance.source,
  };
}

/**
 * Capital comprometido: suma de price de órdenes con status CREATED, PAID o PURCHASING.
 * Cuando Order pasa a PURCHASED, FAILED (o CANCELLED si existiera), deja de contar.
 */
export async function getCommittedCapital(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { status: { in: [...COMMITTED_STATUSES] } },
    select: { price: true },
  });
  let sum = 0;
  for (const o of orders) {
    const p = Number(o.price);
    if (!Number.isNaN(p) && p > 0) sum += p;
  }
  return sum;
}

/**
 * Capital libre = saldo real ? capital comprometido.
 * Es el monto disponible para nuevas compras sin necesidad de tener saldo = total publicado.
 */
export async function getFreeWorkingCapital(): Promise<WorkingCapitalSnapshot> {
  const [balanceResult, committed] = await Promise.all([
    getRealAvailableBalance(),
    getCommittedCapital(),
  ]);
  const realAvailableBalance = balanceResult.available;
  const freeWorkingCapital = Math.max(0, realAvailableBalance - committed);
  return {
    realAvailableBalance,
    committedCapital: committed,
    freeWorkingCapital,
    currency: balanceResult.currency || 'USD',
    source: balanceResult.source,
  };
}

/**
 * Verifica si hay capital libre suficiente para un coste de compra.
 * Mantiene la protección: no permitir compra si freeCapital < orderCost.
 */
export async function hasSufficientFreeCapital(orderCost: number): Promise<{
  sufficient: boolean;
  freeWorkingCapital: number;
  required: number;
  snapshot: WorkingCapitalSnapshot;
  error?: string;
}> {
  const snapshot = await getFreeWorkingCapital();
  const sufficient = snapshot.freeWorkingCapital >= orderCost;
  return {
    sufficient,
    freeWorkingCapital: snapshot.freeWorkingCapital,
    required: orderCost,
    snapshot,
    error: sufficient ? undefined : `Insufficient free working capital: ${snapshot.freeWorkingCapital.toFixed(2)} < ${orderCost.toFixed(2)} (committed: ${snapshot.committedCapital.toFixed(2)}, real balance: ${snapshot.realAvailableBalance.toFixed(2)})`,
  };
}
