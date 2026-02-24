/**
 * Payoneer Service - Mass Payout API integration
 * Supports: receivePayment, withdrawFunds, getBalance
 * Requires: PAYONEER_PROGRAM_ID, PAYONEER_API_USERNAME, PAYONEER_API_PASSWORD
 * Optional: backend/security/payoneer.crt + payoneer.key for client TLS
 * Docs: https://developer.payoneer.com/docs/mass-payouts-v4-getting-started.html
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { logger } from '../config/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getPayoneerSecurityDir(): string {
  const baseDir = path.resolve(__dirname, '../../');
  return path.join(baseDir, 'security');
}

/** Ensure Payoneer certificate exists; auto-generate if missing (Node crypto, no OpenSSL) */
function ensurePayoneerCertificate(): void {
  const securityDir = getPayoneerSecurityDir();
  const certPath = path.join(securityDir, 'payoneer.crt');
  const keyPath = path.join(securityDir, 'payoneer.key');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
  try {
    const { generatePayoneerCertificate } = require('../utils/generatePayoneerCertificate');
    generatePayoneerCertificate(securityDir);
    logger.info('[PAYONEER] Certificate auto-generated', { certPath, keyPath });
  } catch (e) {
    logger.warn('[PAYONEER] Could not auto-generate certificate', { error: (e as Error).message });
  }
}

/** Create HTTPS agent with Payoneer client cert when files exist */
function createPayoneerHttpsAgent(): https.Agent | undefined {
  try {
    ensurePayoneerCertificate();
    const securityDir = getPayoneerSecurityDir();
    const certPath = path.join(securityDir, 'payoneer.crt');
    const keyPath = path.join(securityDir, 'payoneer.key');
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      });
    }
  } catch (e) {
    logger.warn('[PAYONEER] Could not load client certificate', { error: (e as Error).message });
  }
  return undefined;
}

export interface PayoneerPayoutItem {
  recipientEmail: string; // Payoneer account email
  amount: number;
  currency: string;
  note?: string;
  senderItemId?: string;
}

export interface PayoneerPayoutResponse {
  success: boolean;
  batchId?: string;
  transactionId?: string;
  error?: string;
}

export interface PayoneerBalanceResponse {
  success: boolean;
  balance?: number;
  currency?: string;
  error?: string;
}

export class PayoneerService {
  private programId: string;
  private apiUsername: string;
  private apiPassword: string;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  readonly httpsAgent: https.Agent | undefined;

  constructor(config: { programId: string; apiUsername: string; apiPassword: string; sandbox?: boolean }) {
    this.programId = config.programId;
    this.apiUsername = config.apiUsername;
    this.apiPassword = config.apiPassword;
    this.baseUrl =
      config.sandbox !== false
        ? 'https://api.sandbox.payoneer.com'
        : 'https://api.payoneer.com';
    this.httpsAgent = createPayoneerHttpsAgent();
  }

  /** Ensure certificate exists (auto-generate if missing). Call at startup/diagnostics. */
  static ensureCertificate(): void {
    ensurePayoneerCertificate();
  }

  /** Whether client certificate is loaded for TLS */
  static hasCertificate(): boolean {
    try {
      const baseDir = path.resolve(__dirname, '../../');
      const certPath = path.join(baseDir, 'security', 'payoneer.crt');
      const keyPath = path.join(baseDir, 'security', 'payoneer.key');
      return fs.existsSync(certPath) && fs.existsSync(keyPath);
    } catch {
      return false;
    }
  }

  /**
   * Create PayoneerService from environment variables
   */
  static fromEnv(): PayoneerService | null {
    const programId = process.env.PAYONEER_PROGRAM_ID?.trim();
    const apiUsername = process.env.PAYONEER_API_USERNAME?.trim();
    const apiPassword = process.env.PAYONEER_API_PASSWORD?.trim();
    if (!programId || !apiUsername || !apiPassword) {
      return null;
    }
    const sandbox = (process.env.PAYONEER_SANDBOX ?? 'true').toLowerCase() === 'true';
    return new PayoneerService({
      programId,
      apiUsername,
      apiPassword,
      sandbox,
    });
  }

  /**
   * Check if Payoneer is configured (env vars present)
   */
  static isConfigured(): boolean {
    return Boolean(
      process.env.PAYONEER_PROGRAM_ID?.trim() &&
        process.env.PAYONEER_API_USERNAME?.trim() &&
        process.env.PAYONEER_API_PASSWORD?.trim()
    );
  }

  private async ensureAccessToken(): Promise<string | null> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }
    // Payoneer Mass Payout API uses Basic Auth or OAuth - stub for now
    // Real implementation would call Payoneer token endpoint
    logger.warn('[PAYONEER] Token refresh not implemented - using placeholder');
    this.accessToken = 'stub';
    this.tokenExpiry = new Date(Date.now() + 3600 * 1000);
    return this.accessToken;
  }

  /**
   * Receive payment (incoming funds) - typically via Payoneer receiving accounts
   */
  async receivePayment(params: {
    amount: number;
    currency: string;
    reference?: string;
  }): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    if (!PayoneerService.isConfigured()) {
      return { success: false, error: 'Payoneer not configured' };
    }
    logger.info('[PAYONEER] receivePayment called (stub)', { amount: params.amount, currency: params.currency });
    return { success: false, error: 'Payoneer receivePayment API integration pending' };
  }

  /**
   * Withdraw / send payout to a Payoneer account
   */
  async withdrawFunds(item: PayoneerPayoutItem): Promise<PayoneerPayoutResponse> {
    if (!PayoneerService.isConfigured()) {
      return { success: false, error: 'Payoneer not configured' };
    }
    await this.ensureAccessToken();
    logger.info('[PAYONEER] withdrawFunds called (stub)', {
      recipientEmail: item.recipientEmail,
      amount: item.amount,
      currency: item.currency,
    });
    return { success: false, error: 'Payoneer Mass Payout API integration pending' };
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<PayoneerBalanceResponse> {
    if (!PayoneerService.isConfigured()) {
      return { success: false, error: 'Payoneer not configured' };
    }
    await this.ensureAccessToken();
    logger.info('[PAYONEER] getBalance called (stub)');
    return { success: false, error: 'Payoneer getBalance API integration pending' };
  }

  /**
   * Sync balance to PayoneerAccount in DB
   */
  async syncBalanceToDb(): Promise<void> {
    const res = await this.getBalance();
    if (!res.success || res.balance == null) return;
    try {
      await prisma.payoneerAccount.upsert({
        where: { accountId: this.programId },
        create: {
          accountId: this.programId,
          balance: res.balance,
          currency: res.currency || 'USD',
          isActive: true,
        },
        update: {
          balance: res.balance,
          currency: res.currency || 'USD',
          updatedAt: new Date(),
        },
      });
    } catch (e) {
      logger.warn('[PAYONEER] syncBalanceToDb failed', { error: (e as Error).message });
    }
  }
}

export default PayoneerService;
