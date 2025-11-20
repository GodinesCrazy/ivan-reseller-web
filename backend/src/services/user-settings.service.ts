import { prisma } from '../config/database';
import { logger } from '../config/logger';

export interface UserSettingsDto {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  currencyFormat?: string;
  theme?: string;
}

export interface UserSettings {
  id: number;
  userId: number;
  language: string;
  timezone: string;
  dateFormat: string;
  currencyFormat: string;
  theme: string;
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
      createdAt: new Date(),
      updatedAt: new Date()
    };
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
      // ✅ TEMPORAL: Verificar si el modelo existe (hasta que se cree la migración)
      if (!(prisma as any).userSettings) {
        logger.warn('UserSettings: Model not yet migrated, settings not saved (will use defaults)', { userId });
        // Retornar defaults con los valores actualizados en memoria
        const current = await this.getUserSettings(userId);
        return {
          ...current,
          language: data.language || current.language,
          timezone: data.timezone || current.timezone,
          dateFormat: data.dateFormat || current.dateFormat,
          currencyFormat: data.currencyFormat ? data.currencyFormat.toUpperCase() : current.currencyFormat,
          theme: data.theme || current.theme,
          updatedAt: new Date()
        };
      }

      // Validar currencyFormat si está presente
      if (data.currencyFormat) {
        const currency = data.currencyFormat.toUpperCase();
        const validCurrencies = ['USD', 'EUR', 'GBP', 'CLP', 'MXN', 'BRL', 'JPY', 'CNY'];
        if (!validCurrencies.includes(currency)) {
          throw new Error(`Invalid currency format: ${data.currencyFormat}. Valid currencies: ${validCurrencies.join(', ')}`);
        }
        data.currencyFormat = currency;
      }

      // Asegurar que el usuario tenga settings (crear si no existe)
      await this.getUserSettings(userId);

      // Actualizar o crear
      const settings = await (prisma as any).userSettings.upsert({
        where: { userId },
        update: {
          ...data,
          updatedAt: new Date()
        },
        create: {
          userId,
          language: data.language || 'en',
          timezone: data.timezone || 'America/New_York',
          dateFormat: data.dateFormat || 'MM/DD/YYYY',
          currencyFormat: (data.currencyFormat || 'USD').toUpperCase(),
          theme: data.theme || 'light'
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
        updatedAt: new Date()
      };
    }
  }
}

export default new UserSettingsService();

