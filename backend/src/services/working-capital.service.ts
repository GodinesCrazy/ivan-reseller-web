/**
 * Working Capital Service
 *
 * Modelo de gesti�n de capital de trabajo: capital comprometido vs capital disponible real.
 * Permite compras mientras exista capital libre suficiente (freeCapital >= orderCost).
 * No requiere saldo igual al total publicado.
 * Con ALLOW_PURCHASE_WHEN_LOW_BALANCE=true, permite compras aunque el saldo PayPal sea bajo
 * (PayPal puede usar la tarjeta asociada como respaldo).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';
import { env } from '../config/env';
import { getPayPalBalance } from './balance-verification.service';

/** Estados de Order que representan capital comprometido (a�n no ejecutado o en proceso) */
const COMMITTED_STATUSES = ['CREATED', 'PAID', 'PURCHASING'] as const;

export interface WorkingCapitalSnapshot {
  realAvailableBalance: number;
  committedCapital: number;
  freeWorkingCapital: number;
  currency: string;
  source?: string;
}

/**
 * Saldo real disponible (PayPal API v�a balance-verification).
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
    source: 'source' in balance ? balance.source : undefined,
  };
}

/**
 * Capital comprometido: suma de price de �rdenes con status CREATED, PAID o PURCHASING.
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
 * Si el saldo real no se puede obtener, la compra se bloquea hasta revisión manual.
 */
export async function hasSufficientFreeCapital(orderCost: number): Promise<{
  sufficient: boolean;
  freeWorkingCapital: number;
  required: number;
  snapshot: WorkingCapitalSnapshot;
  error?: string;
}> {
  const snapshot = await getFreeWorkingCapital();
  const balanceUnavailable = snapshot.realAvailableBalance === 0 && snapshot.source === undefined;
  if (balanceUnavailable) {
    logger.warn('[WORKING-CAPITAL] Real balance unavailable; blocking purchase until operator review');
    return {
      sufficient: false,
      freeWorkingCapital: snapshot.freeWorkingCapital,
      required: orderCost,
      snapshot,
      error: 'Real working capital balance is unavailable. Manual operator review required before purchase.',
    };
  }
  const sufficient = snapshot.freeWorkingCapital >= orderCost;
  return {
    sufficient,
    freeWorkingCapital: snapshot.freeWorkingCapital,
    required: orderCost,
    snapshot,
    error: sufficient ? undefined : `Insufficient free working capital: ${snapshot.freeWorkingCapital.toFixed(2)} < ${orderCost.toFixed(2)} (committed: ${snapshot.committedCapital.toFixed(2)}, real balance: ${snapshot.realAvailableBalance.toFixed(2)})`,
  };
}
