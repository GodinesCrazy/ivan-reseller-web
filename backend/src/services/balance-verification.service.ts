/**
 * Balance Verification Service
 *
 * Verificación obligatoria de saldo real antes de compra en AliExpress o payout.
 * Usa PayPal API y Payoneer API (cuando esté disponible).
 * El sistema NO debe depender de workingCapital para decisiones financieras reales.
 */

import logger from '../config/logger';

export interface BalanceResult {
  available: number;
  currency: string;
  source: 'paypal' | 'payoneer' | 'paypal_estimated';
}

export interface VerificationResult {
  sufficient: boolean;
  available: number;
  required: number;
  currency: string;
  source?: string;
  error?: string;
}

let _paypalService: any = null;
let _payoneerService: any = null;

function getPayPalService(): any {
  if (_paypalService === null) {
    try {
      const { PayPalPayoutService } = require('./paypal-payout.service');
      _paypalService = PayPalPayoutService.fromEnv();
    } catch (e) {
      logger.warn('[BALANCE-VERIFY] PayPal service not available', { error: (e as Error).message });
    }
  }
  return _paypalService;
}

function getPayoneerService(): any {
  if (_payoneerService === null) {
    try {
      const { PayoneerService } = require('./payoneer.service');
      _payoneerService = PayoneerService.fromEnv();
    } catch (e) {
      logger.warn('[BALANCE-VERIFY] Payoneer service not available', { error: (e as Error).message });
    }
  }
  return _payoneerService;
}

/**
 * Obtener saldo real de la cuenta PayPal (plataforma) vía API.
 * Usa Wallet API o Reporting API según disponibilidad.
 */
export async function getPayPalBalance(): Promise<BalanceResult | null> {
  const service = getPayPalService();
  if (!service) {
    logger.warn('[BALANCE-VERIFY] getPayPalBalance: PayPal not configured');
    return null;
  }
  try {
    const result = await service.checkPayPalBalance();
    if (result && typeof result.available === 'number') {
      return {
        available: result.available,
        currency: result.currency || 'USD',
        source: result.source === 'wallet_api' ? 'paypal' : 'paypal_estimated',
      };
    }
    return null;
  } catch (e) {
    logger.error('[BALANCE-VERIFY] getPayPalBalance failed', { error: (e as Error).message });
    return null;
  }
}

/**
 * Obtener saldo real de Payoneer cuando la API esté implementada.
 * Actualmente Payoneer getBalance puede ser stub; retorna null si no disponible.
 */
export async function getPayoneerBalance(): Promise<BalanceResult | null> {
  const service = getPayoneerService();
  if (!service) return null;
  try {
    const res = await service.getBalance();
    if (res && res.success && typeof res.balance === 'number') {
      return {
        available: res.balance,
        currency: res.currency || 'USD',
        source: 'payoneer',
      };
    }
    return null;
  } catch (e) {
    logger.warn('[BALANCE-VERIFY] getPayoneerBalance failed', { error: (e as Error).message });
    return null;
  }
}

/**
 * Verificar si hay saldo suficiente para ejecutar una compra (p. ej. AliExpress).
 * Usa saldo PayPal real. Si no se puede obtener saldo, retorna insufficient por seguridad.
 */
export async function hasSufficientBalanceForPurchase(requiredAmountUsd: number): Promise<VerificationResult> {
  const balance = await getPayPalBalance();
  if (balance == null) {
    return {
      sufficient: false,
      available: 0,
      required: requiredAmountUsd,
      currency: 'USD',
      error: 'Could not retrieve real PayPal balance. Purchase blocked for safety.',
    };
  }
  const sufficient = balance.available >= requiredAmountUsd;
  return {
    sufficient,
    available: balance.available,
    required: requiredAmountUsd,
    currency: balance.currency,
    source: balance.source,
    error: sufficient ? undefined : `Insufficient balance: ${balance.available} < ${requiredAmountUsd}`,
  };
}

/**
 * Verificar si hay saldo suficiente para ejecutar payout(s) desde la cuenta plataforma.
 * Usa saldo PayPal real. Si no se puede obtener saldo, retorna insufficient por seguridad.
 */
export async function hasSufficientBalanceForPayout(requiredAmountUsd: number): Promise<VerificationResult> {
  const balance = await getPayPalBalance();
  if (balance == null) {
    return {
      sufficient: false,
      available: 0,
      required: requiredAmountUsd,
      currency: 'USD',
      error: 'Could not retrieve real PayPal balance. Payout skipped for safety.',
    };
  }
  const sufficient = balance.available >= requiredAmountUsd;
  return {
    sufficient,
    available: balance.available,
    required: requiredAmountUsd,
    currency: balance.currency,
    source: balance.source,
    error: sufficient ? undefined : `Insufficient balance for payout: ${balance.available} < ${requiredAmountUsd}`,
  };
}
