/**
 * Platform Config Service ? Commission % and admin PayPal email.
 * Only ADMIN can update (enforced in routes).
 */

import { prisma } from '../config/database';
import logger from '../config/logger';

const DEFAULT_COMMISSION_PCT = 10;
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';

export class PlatformConfigService {
  /**
   * Get platform commission percentage (default 10).
   */
  async getCommissionPct(): Promise<number> {
    try {
      const row = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
      return row ? Number(row.platformCommissionPct) : DEFAULT_COMMISSION_PCT;
    } catch (e: any) {
      logger.warn('[PLATFORM-CONFIG] getCommissionPct failed', { error: e?.message });
      return DEFAULT_COMMISSION_PCT;
    }
  }

  /**
   * Get admin PayPal email for commission payouts.
   */
  async getAdminPaypalEmail(): Promise<string> {
    try {
      const row = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
      return (row?.adminPaypalEmail as string) || DEFAULT_ADMIN_EMAIL;
    } catch (e: any) {
      logger.warn('[PLATFORM-CONFIG] getAdminPaypalEmail failed', { error: e?.message });
      return DEFAULT_ADMIN_EMAIL;
    }
  }

  /**
   * Update platform config (ADMIN only).
   */
  async update(config: { platformCommissionPct?: number; adminPaypalEmail?: string }): Promise<void> {
    const data: { platformCommissionPct?: number; adminPaypalEmail?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (config.platformCommissionPct != null) data.platformCommissionPct = config.platformCommissionPct;
    if (config.adminPaypalEmail != null) data.adminPaypalEmail = config.adminPaypalEmail;
    await prisma.platformConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        platformCommissionPct: config.platformCommissionPct ?? DEFAULT_COMMISSION_PCT,
        adminPaypalEmail: config.adminPaypalEmail ?? DEFAULT_ADMIN_EMAIL,
        updatedAt: new Date(),
      },
      update: data,
    });
  }
}

export const platformConfigService = new PlatformConfigService();
