/**
 * Purchase Retry Service — Attempt sequence when AliExpress purchase fails.
 * 1) AliExpress primary
 * 2) AliExpress mirror listing
 * 3) External supplier API (ScraperAPI/ZenRows)
 * 4) Local warehouse flag
 * Max 5 retries, exponential backoff, logs to PurchaseAttemptLog.
 */

import logger from '../config/logger';
import { prisma } from '../config/database';
import { aliexpressCheckoutService } from './aliexpress-checkout.service';

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

export interface PurchaseAttempt {
  success: boolean;
  orderId?: string;
  error?: string;
  attempt: number;
  source: 'original' | 'alternative' | 'external' | 'local_warehouse';
}

export interface PurchaseRetryResult {
  success: boolean;
  orderId?: string;
  attempts: PurchaseAttempt[];
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PurchaseRetryService {
  async attemptPurchase(
    productUrl: string,
    quantity: number,
    maxPrice: number,
    shippingAddress: Record<string, string>,
    alternatives?: string[],
    orderId?: string,
    userId?: number
  ): Promise<PurchaseRetryResult> {
    const attempts: PurchaseAttempt[] = [];
    const urlsToTry = [productUrl, ...(alternatives || []).filter(Boolean)];
    const maxAttempts = Math.min(MAX_RETRIES, Math.max(urlsToTry.length, 3) + 2);

    for (let i = 0; i < Math.min(urlsToTry.length, maxAttempts); i++) {
      const url = urlsToTry[i];
      const attemptNum = i + 1;
      const source = i === 0 ? 'original' : i === 1 ? 'alternative' : 'external';
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, i);
      if (i > 0) await sleep(backoffMs);

      console.log(`[PURCHASE-RETRY] ATTEMPT ${attemptNum}/${maxAttempts}`, {
        source,
        url: url?.substring(0, 60) + '...',
      });
      logger.info('[PURCHASE-RETRY] ATTEMPT', {
        attempt: attemptNum,
        source,
        urlPrefix: url?.substring(0, 80),
      });

      try {
        const result = await aliexpressCheckoutService.placeOrder(
          {
            productUrl: url,
            quantity,
            maxPrice,
            shippingAddress: {
              fullName: shippingAddress.fullName || '',
              addressLine1: shippingAddress.addressLine1 || '',
              addressLine2: shippingAddress.addressLine2 || '',
              city: shippingAddress.city || '',
              state: shippingAddress.state || '',
              zipCode: shippingAddress.zipCode || '',
              country: shippingAddress.country || 'US',
              phoneNumber: shippingAddress.phoneNumber || '',
            },
          },
          userId
        );

        const attemptSuccess = result.success && !!result.orderId && result.orderId !== 'SIMULATED_ORDER_ID';
        attempts.push({
          success: attemptSuccess,
          orderId: result.orderId,
          error: result.error,
          attempt: attemptNum,
          source,
        });

        if (orderId) {
          try {
            await prisma.purchaseAttemptLog.create({
              data: {
                orderId,
                provider: source,
                success: attemptSuccess,
                error: result.error ?? null,
              },
            });
          } catch (e) {
            logger.warn('[PURCHASE-RETRY] Failed to log attempt', { error: (e as Error)?.message });
          }
        }

        if (result.success && result.orderId && result.orderId !== 'SIMULATED_ORDER_ID') {
          console.log('[PURCHASE-RETRY] SUCCESS', { attemptNum, orderId: result.orderId });
          logger.info('[PURCHASE-RETRY] SUCCESS', { attempt: attemptNum, orderId: result.orderId });
          return {
            success: true,
            orderId: result.orderId,
            attempts,
          };
        }

        if (result.orderId === 'SIMULATED_ORDER_ID') {
          attempts[attempts.length - 1].success = false;
          attempts[attempts.length - 1].error = 'Simulated order (not real)';
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        attempts.push({
          success: false,
          error: msg,
          attempt: attemptNum,
          source,
        });
        if (orderId) {
          try {
            await prisma.purchaseAttemptLog.create({
              data: { orderId, provider: source, success: false, error: msg },
            });
          } catch (e) {
            logger.warn('[PURCHASE-RETRY] Failed to log attempt', { error: (e as Error)?.message });
          }
        }
        logger.warn('[PURCHASE-RETRY] Attempt failed', { attempt: attemptNum, error: msg });
      }
    }

    if (!attempts.some((a) => a.success) && process.env.EXTERNAL_SUPPLIER_API_URL && attempts.length < maxAttempts) {
      const attemptNum = attempts.length + 1;
      await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempts.length));
      try {
        console.log(`[PURCHASE-RETRY] ATTEMPT ${attemptNum}/${maxAttempts}`, { source: 'external' });
        const externalResult = await this.tryExternalSupplier(
          productUrl,
          quantity,
          maxPrice,
          shippingAddress
        );
        if (externalResult.success && externalResult.orderId) {
          attempts.push({
            success: true,
            orderId: externalResult.orderId,
            attempt: attemptNum,
            source: 'external',
          });
          if (orderId) {
            try {
              await prisma.purchaseAttemptLog.create({
                data: { orderId, provider: 'external', success: true, error: null },
              });
            } catch (e) {
              logger.warn('[PURCHASE-RETRY] Failed to log attempt', { error: (e as Error)?.message });
            }
          }
          console.log('[PURCHASE-RETRY] SUCCESS', { attempt: attemptNum, source: 'external' });
          return { success: true, orderId: externalResult.orderId, attempts };
        }
        if (orderId) {
          try {
            await prisma.purchaseAttemptLog.create({
              data: { orderId, provider: 'external', success: false, error: 'No orderId returned' },
            });
          } catch (e) {
            logger.warn('[PURCHASE-RETRY] Failed to log attempt', { error: (e as Error)?.message });
          }
        }
      } catch (e) {
        const msg = (e as Error)?.message || 'External supplier failed';
        attempts.push({
          success: false,
          error: msg,
          attempt: attemptNum,
          source: 'external',
        });
        if (orderId) {
          try {
            await prisma.purchaseAttemptLog.create({
              data: { orderId, provider: 'external', success: false, error: msg },
            });
          } catch (err) {
            logger.warn('[PURCHASE-RETRY] Failed to log attempt', { error: (err as Error)?.message });
          }
        }
      }
    }

    console.log('[PURCHASE-RETRY] FINAL FAILURE', { attempts: attempts.length });
    logger.error('[PURCHASE-RETRY] FINAL FAILURE', { attempts: attempts.length });

    return {
      success: false,
      attempts,
      error: attempts[attempts.length - 1]?.error || 'All purchase attempts failed',
    };
  }

  private async tryExternalSupplier(
    _productUrl: string,
    _quantity: number,
    _maxPrice: number,
    _shippingAddress: Record<string, string>
  ): Promise<{ success: boolean; orderId?: string }> {
    const apiUrl = process.env.EXTERNAL_SUPPLIER_API_URL;
    if (!apiUrl) return { success: false };
    const axios = (await import('axios')).default;
    const res = await axios.post(
      apiUrl,
      {
        productUrl: _productUrl,
        quantity: _quantity,
        maxPrice: _maxPrice,
        shippingAddress: _shippingAddress,
      },
      { timeout: 30000 }
    );
    return {
      success: !!res.data?.success,
      orderId: res.data?.orderId,
    };
  }
}

export const purchaseRetryService = new PurchaseRetryService();
