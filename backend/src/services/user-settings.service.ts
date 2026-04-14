import { trace } from '../utils/boot-trace';
trace('loading user-settings.service');

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { PackageTier } from '../utils/opportunity-package-tier.utils';
import { parseAllowedPackageTiers } from '../utils/opportunity-package-tier.utils';

function decimalFromUnknown(value: unknown): Prisma.Decimal | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'object' && value !== null && 'toNumber' in value
    ? (value as { toNumber: () => number }).toNumber()
    : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return new Prisma.Decimal(String(n));
}

function numFromRow(d: unknown): number {
  if (d == null) return NaN;
  if (typeof d === 'object' && d !== null && typeof (d as { toNumber?: () => number }).toNumber === 'function') {
    return (d as { toNumber: () => number }).toNumber();
  }
  return Number(d);
}

function clampNum(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export interface UserSettingsDto {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  currencyFormat?: string;
  theme?: string;
  /** CSV: small, medium, large */
  opportunityAllowedPackageTiers?: string;
  opportunitySmallMaxPriceUsd?: number;
  opportunityMediumMaxPriceUsd?: number;
  defaultChinaUsShippingUsd?: number;
  /** Discovery supplier preference: aliexpress | cj | auto (omit to keep DB/env default). */
  opportunitySupplierPreference?: 'aliexpress' | 'cj' | 'auto';
}

export interface UserSettings {
  id: number;
  userId: number;
  language: string;
  timezone: string;
  dateFormat: string;
  currencyFormat: string;
  theme: string;
  opportunityAllowedPackageTiers?: string;
  opportunitySmallMaxPriceUsd?: unknown;
  opportunityMediumMaxPriceUsd?: unknown;
  defaultChinaUsShippingUsd?: unknown;
  opportunitySupplierPreference?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserSettingsService {
  /**
   * Obtener settings del usuario (crea defaults si no existen)
   */
  async getUserSettings(userId: number): Promise<UserSettings> {
    try {
      // ✅ TEMPORAL: Verificar si el modelo existe (hasta que se cree la migración)
      // Por ahora, retornar defaults seguros
      if (!(prisma as any).userSettings) {
        logger.debug('UserSettings: Model not yet migrated, using defaults', { userId });
        return this.getDefaultSettings(userId);
      }

      let settings = await (prisma as any).userSettings.findUnique({
        where: { userId }
      });

      // Si no existe, crear con defaults
      if (!settings) {
        settings = await (prisma as any).userSettings.create({
          data: {
            userId,
            language: 'en',
            timezone: 'America/New_York',
            dateFormat: 'MM/DD/YYYY',
            currencyFormat: 'USD', // ✅ Default seguro: USD
            theme: 'light'
          }
        });

        logger.debug('UserSettings: Created default settings', { userId });
      }

      return settings as UserSettings;
    } catch (error) {
      logger.warn('UserSettings: Error getting user settings (using defaults)', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      // ✅ Fallback seguro: retornar defaults sin crear en DB si hay error
      return this.getDefaultSettings(userId);
    }
  }

  /**
   * Retornar settings por defecto (fallback seguro)
   */
  private getDefaultSettings(userId: number): UserSettings {
    return {
      id: 0,
      userId,
      language: 'en',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      currencyFormat: 'USD', // ✅ Default seguro: USD
      theme: 'light',
      opportunityAllowedPackageTiers: 'small',
      opportunitySmallMaxPriceUsd: 45,
      opportunityMediumMaxPriceUsd: 120,
      defaultChinaUsShippingUsd: 5.99,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Envío China→USA (USD) cuando no hay cotización en el producto (publicación / márgenes).
   */
  async getDefaultChinaUsShippingUsd(userId: number): Promise<number> {
    const c = await this.getOpportunityCommerceSettings(userId);
    return c.defaultShippingUsd;
  }

  /**
   * Reglas de oportunidades: tamaños de paquete permitidos, umbrales de precio (USD), envío por defecto.
   */
  async getOpportunityCommerceSettings(userId: number): Promise<{
    allowedTiers: Set<PackageTier>;
    smallMaxPriceUsd: number;
    mediumMaxPriceUsd: number;
    defaultShippingUsd: number;
  }> {
    const s = await this.getUserSettings(userId);
    const allowedTiers = parseAllowedPackageTiers(
      typeof (s as any).opportunityAllowedPackageTiers === 'string'
        ? (s as any).opportunityAllowedPackageTiers
        : 'small'
    );
    const smallMax = clampNum(numFromRow((s as any).opportunitySmallMaxPriceUsd), 1, 500, 45);
    const mediumMax = clampNum(numFromRow((s as any).opportunityMediumMaxPriceUsd), smallMax + 1, 2000, 120);
    const defaultShippingUsd = clampNum(numFromRow((s as any).defaultChinaUsShippingUsd), 0, 200, 5.99);
    return { allowedTiers, smallMaxPriceUsd: smallMax, mediumMaxPriceUsd: mediumMax, defaultShippingUsd };
  }

  /**
   * Preferencia de proveedor para descubrimiento de oportunidades (Phase B).
   * DB `opportunitySupplierPreference` gana sobre env OPPORTUNITY_SUPPLIER_PREFERENCE.
   */
  async getOpportunitySupplierPreference(userId: number): Promise<'aliexpress' | 'cj' | 'auto'> {
    const s = await this.getUserSettings(userId);
    const raw = String(
      (s as { opportunitySupplierPreference?: string | null }).opportunitySupplierPreference || ''
    )
      .trim()
      .toLowerCase();
    if (raw === 'aliexpress' || raw === 'cj' || raw === 'auto') {
      return raw;
    }
    return env.OPPORTUNITY_SUPPLIER_PREFERENCE;
  }

  /**
   * Obtener moneda base del usuario (con fallback seguro a USD)
   */
  async getUserBaseCurrency(userId: number): Promise<string> {
    try {
      const settings = await this.getUserSettings(userId);
      const currency = (settings.currencyFormat || 'USD').toUpperCase();
      
      // ✅ Validar que sea una moneda válida conocida
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CLP', 'MXN', 'BRL', 'JPY', 'CNY'];
      if (!validCurrencies.includes(currency)) {
        logger.warn('UserSettings: Invalid currency format, using USD', {
          userId,
          currency,
          validCurrencies
        });
        return 'USD';
      }

      return currency;
    } catch (error) {
      logger.error('UserSettings: Error getting user base currency', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      // ✅ Fallback seguro a USD
      return 'USD';
    }
  }

  /**
   * Actualizar settings del usuario
   */
  async updateUserSettings(userId: number, data: UserSettingsDto): Promise<UserSettings> {
    try {
      if (data.currencyFormat) {
        const currency = data.currencyFormat.toUpperCase();
        const validCurrencies = ['USD', 'EUR', 'GBP', 'CLP', 'MXN', 'BRL', 'JPY', 'CNY'];
        if (!validCurrencies.includes(currency)) {
          throw new Error(`Invalid currency format: ${data.currencyFormat}. Valid currencies: ${validCurrencies.join(', ')}`);
        }
        data.currencyFormat = currency;
      }

      if (data.opportunityAllowedPackageTiers != null) {
        const raw = String(data.opportunityAllowedPackageTiers).toLowerCase();
        const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
        const valid = new Set(['small', 'medium', 'large']);
        const cleaned = parts.filter((p) => valid.has(p));
        if (cleaned.length === 0) {
          throw new Error('opportunityAllowedPackageTiers must include at least one of: small, medium, large');
        }
        data.opportunityAllowedPackageTiers = cleaned.join(',');
      }

      if (data.opportunitySupplierPreference != null) {
        const sp = String(data.opportunitySupplierPreference).trim().toLowerCase();
        if (sp !== 'aliexpress' && sp !== 'cj' && sp !== 'auto') {
          throw new Error('opportunitySupplierPreference must be aliexpress, cj, or auto');
        }
        data.opportunitySupplierPreference = sp as 'aliexpress' | 'cj' | 'auto';
      }

      // ✅ TEMPORAL: Verificar si el modelo existe (hasta que se cree la migración)
      if (!(prisma as any).userSettings) {
        logger.warn('UserSettings: Model not yet migrated, settings not saved (will use defaults)', { userId });
        const current = await this.getUserSettings(userId);
        return {
          ...current,
          language: data.language || current.language,
          timezone: data.timezone || current.timezone,
          dateFormat: data.dateFormat || current.dateFormat,
          currencyFormat: data.currencyFormat ? data.currencyFormat.toUpperCase() : current.currencyFormat,
          theme: data.theme || current.theme,
          ...(data.opportunityAllowedPackageTiers != null
            ? { opportunityAllowedPackageTiers: data.opportunityAllowedPackageTiers }
            : {}),
          ...(data.opportunitySmallMaxPriceUsd != null
            ? { opportunitySmallMaxPriceUsd: data.opportunitySmallMaxPriceUsd }
            : {}),
          ...(data.opportunityMediumMaxPriceUsd != null
            ? { opportunityMediumMaxPriceUsd: data.opportunityMediumMaxPriceUsd }
            : {}),
          ...(data.defaultChinaUsShippingUsd != null
            ? { defaultChinaUsShippingUsd: data.defaultChinaUsShippingUsd }
            : {}),
          ...(data.opportunitySupplierPreference != null
            ? { opportunitySupplierPreference: data.opportunitySupplierPreference }
            : {}),
          updatedAt: new Date()
        };
      }

      const patch: Record<string, unknown> = {};
      if (data.language != null) patch.language = data.language;
      if (data.timezone != null) patch.timezone = data.timezone;
      if (data.dateFormat != null) patch.dateFormat = data.dateFormat;
      if (data.currencyFormat != null) patch.currencyFormat = data.currencyFormat;
      if (data.theme != null) patch.theme = data.theme;
      if (data.opportunityAllowedPackageTiers != null) {
        patch.opportunityAllowedPackageTiers = data.opportunityAllowedPackageTiers;
      }
      const dSmall = decimalFromUnknown(data.opportunitySmallMaxPriceUsd);
      if (dSmall !== undefined) patch.opportunitySmallMaxPriceUsd = dSmall;
      const dMed = decimalFromUnknown(data.opportunityMediumMaxPriceUsd);
      if (dMed !== undefined) patch.opportunityMediumMaxPriceUsd = dMed;
      const dShip = decimalFromUnknown(data.defaultChinaUsShippingUsd);
      if (dShip !== undefined) patch.defaultChinaUsShippingUsd = dShip;
      if (data.opportunitySupplierPreference != null) {
        patch.opportunitySupplierPreference = data.opportunitySupplierPreference;
      }

      // Asegurar que el usuario tenga settings (crear si no existe)
      await this.getUserSettings(userId);

      // Actualizar o crear
      const settings = await (prisma as any).userSettings.upsert({
        where: { userId },
        update: {
          ...patch,
          updatedAt: new Date()
        },
        create: {
          userId,
          language: data.language || 'en',
          timezone: data.timezone || 'America/New_York',
          dateFormat: data.dateFormat || 'MM/DD/YYYY',
          currencyFormat: (data.currencyFormat || 'USD').toUpperCase(),
          theme: data.theme || 'light',
          ...(data.opportunityAllowedPackageTiers != null
            ? { opportunityAllowedPackageTiers: data.opportunityAllowedPackageTiers }
            : {}),
          ...(dSmall !== undefined ? { opportunitySmallMaxPriceUsd: dSmall } : {}),
          ...(dMed !== undefined ? { opportunityMediumMaxPriceUsd: dMed } : {}),
          ...(dShip !== undefined ? { defaultChinaUsShippingUsd: dShip } : {}),
          ...(data.opportunitySupplierPreference != null
            ? { opportunitySupplierPreference: data.opportunitySupplierPreference }
            : {}),
        }
      });

      logger.info('UserSettings: Updated user settings', {
        userId,
        currencyFormat: settings.currencyFormat
      });

      return settings as UserSettings;
    } catch (error) {
      logger.error('UserSettings: Error updating user settings', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      // ✅ En caso de error, retornar defaults con valores actualizados
      const current = await this.getUserSettings(userId);
      return {
        ...current,
        language: data.language || current.language,
        timezone: data.timezone || current.timezone,
        dateFormat: data.dateFormat || current.dateFormat,
        currencyFormat: data.currencyFormat ? data.currencyFormat.toUpperCase() : current.currencyFormat,
        theme: data.theme || current.theme,
        ...(data.opportunityAllowedPackageTiers != null
          ? { opportunityAllowedPackageTiers: data.opportunityAllowedPackageTiers }
          : {}),
        ...(data.opportunitySmallMaxPriceUsd != null
          ? { opportunitySmallMaxPriceUsd: data.opportunitySmallMaxPriceUsd }
          : {}),
        ...(data.opportunityMediumMaxPriceUsd != null
          ? { opportunityMediumMaxPriceUsd: data.opportunityMediumMaxPriceUsd }
          : {}),
        ...(data.defaultChinaUsShippingUsd != null
          ? { defaultChinaUsShippingUsd: data.defaultChinaUsShippingUsd }
          : {}),
        ...(data.opportunitySupplierPreference != null
          ? { opportunitySupplierPreference: data.opportunitySupplierPreference }
          : {}),
        updatedAt: new Date()
      };
    }
  }
}

export default new UserSettingsService();

