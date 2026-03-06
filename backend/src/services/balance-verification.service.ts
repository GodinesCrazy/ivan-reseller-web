/**
 * Balance Verification Service
 *
 * Verificaci?n obligatoria de saldo real antes de compra en AliExpress o payout.
 * Usa PayPal API y Payoneer API (cuando est? disponible).
 * El sistema NO debe depender de workingCapital para decisiones financieras reales.
 */

import logger from '../config/logger';

export interface BalanceResult {
  available: number;
  currency: string;
  source: 'paypal' | 'payoneer' | 'paypal_estimated';
}

/** When PayPal balance cannot be retrieved; allows UI to show a specific message. */
export interface PayPalUnavailableResult {
  available: 0;
  currency: string;
  unavailableReason: 'no_credentials' | 'api_failed';
}

export type PayPalBalanceResult = BalanceResult | PayPalUnavailableResult | null;

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
 * Obtener saldo real de la cuenta PayPal (plataforma) via API.
 * Usa Wallet API o Reporting API segun disponibilidad.
 * @param environment When provided (e.g. from Finance Dashboard), uses that env for user credentials; otherwise uses getUserEnvironment(userId).
 */
export async function getPayPalBalance(
  userId?: number,
  environment?: 'sandbox' | 'production'
): Promise<PayPalBalanceResult> {
  let service: any = null;

  if (userId != null) {
    logger.info('[BALANCE-VERIFY] getPayPalBalance: trying user credentials', { userId, environment });
    try {
      const { PayPalPayoutService } = require('./paypal-payout.service');
      service = await PayPalPayoutService.fromUserCredentials(userId, environment);
      if (!service) {
        logger.warn('[BALANCE-VERIFY] getPayPalBalance fromUserCredentials returned null, falling back to env');
      }
    } catch (e) {
      logger.warn('[BALANCE-VERIFY] getPayPalBalance fromUserCredentials failed, falling back to env', {
        userId,
        error: (e as Error).message,
      });
    }
  }

  if (!service) {
    service = getPayPalService();
  }

  if (!service) {
    logger.warn('[BALANCE-VERIFY] getPayPalBalance: PayPal not configured (user and env)');
    return { available: 0, currency: 'USD', unavailableReason: 'no_credentials' };
  }

  try {
    const result = await service.checkPayPalBalance();
    if (result && typeof result.available === 'number') {
      logger.info('[BALANCE-VERIFY] getPayPalBalance success', {
        source: result.source === 'wallet_api' ? 'paypal' : 'paypal_estimated',
        available: result.available,
      });
      return {
        available: result.available,
        currency: result.currency || 'USD',
        source: result.source === 'wallet_api' ? 'paypal' : 'paypal_estimated',
      };
    }
    logger.warn('[BALANCE-VERIFY] getPayPalBalance: checkPayPalBalance returned null');
    return { available: 0, currency: 'USD', unavailableReason: 'api_failed' };
  } catch (e: any) {
    logger.error('[BALANCE-VERIFY] getPayPalBalance failed', {
      error: e?.message,
      responseStatus: e?.response?.status,
    });
    return null;
  }
}

/**
 * Obtener saldo real de Payoneer cuando la API est? implementada.
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
 * Si no se puede obtener saldo (PayPal no configurado o API fallida), permite la compra (degraded mode).
 */
export async function hasSufficientBalanceForPurchase(requiredAmountUsd: number): Promise<VerificationResult> {
  const balance = await getPayPalBalance();
  if (balance == null || ('unavailableReason' in balance && balance.unavailableReason)) {
    logger.warn('[BALANCE-VERIFY] Real PayPal balance unavailable; allowing purchase (degraded mode)');
    return {
      sufficient: true,
      available: 0,
      required: requiredAmountUsd,
      currency: 'USD',
      source: undefined,
      error: undefined,
    };
  }
  const sufficient = balance.available >= requiredAmountUsd;
  return {
    sufficient,
    available: balance.available,
    required: requiredAmountUsd,
    currency: balance.currency,
    source: 'source' in balance ? balance.source : undefined,
    error: sufficient ? undefined : `Insufficient balance: ${balance.available} < ${requiredAmountUsd}`,
  };
}

/**
 * Verificar si hay saldo suficiente para ejecutar payout(s) desde la cuenta plataforma.
 * Usa saldo PayPal real. Si no se puede obtener saldo (PayPal no configurado o API fallida),
 * permite el payout para no romper funcionalidad existente (degraded mode).
 */
export async function hasSufficientBalanceForPayout(requiredAmountUsd: number): Promise<VerificationResult> {
  const balance = await getPayPalBalance();
  if (balance == null || ('unavailableReason' in balance && balance.unavailableReason)) {
    logger.warn('[BALANCE-VERIFY] Real PayPal balance unavailable; allowing payout (degraded mode)');
    return {
      sufficient: true,
      available: 0,
      required: requiredAmountUsd,
      currency: 'USD',
      source: undefined,
      error: undefined,
    };
  }
  const sufficient = balance.available >= requiredAmountUsd;
  return {
    sufficient,
    available: balance.available,
    required: requiredAmountUsd,
    currency: balance.currency,
    source: 'source' in balance ? balance.source : undefined,
    error: sufficient ? undefined : `Insufficient balance for payout: ${balance.available} < ${requiredAmountUsd}`,
  };
}
