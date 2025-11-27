/**
 * PayPal REST API Service
 * Servicio para obtener información de cuenta incluyendo balance
 * 
 * Nota: PayPal REST API no tiene endpoint directo de balance en Payouts API.
 * Este servicio intenta usar diferentes métodos para obtener información de balance.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface AccountBalance {
  totalBalance: number;
  availableBalance: number;
  currency: string;
  pendingBalance?: number;
  source: 'api' | 'estimated' | 'unavailable';
}

export class PayPalRestService {
  private credentials: PayPalCredentials;
  private apiClient: AxiosInstance;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(credentials: PayPalCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.environment === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
    
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create PayPalRestService from user credentials
   */
  static async fromUserCredentials(userId: number): Promise<PayPalRestService | null> {
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const { workflowConfigService } = await import('./workflow-config.service');

      const targetEnv = await workflowConfigService.getUserEnvironment(userId);
      const entry = await CredentialsManager.getCredentialEntry(userId, 'paypal', targetEnv);
      
      if (!entry || !entry.isActive || !entry.credentials) {
        logger.debug('PayPal credentials not found in database', { userId, environment: targetEnv });
        return null;
      }

      const creds = entry.credentials as any;
      const clientId = creds.clientId || creds.PAYPAL_CLIENT_ID;
      const clientSecret = creds.clientSecret || creds.PAYPAL_CLIENT_SECRET;
      const env = creds.environment || creds.PAYPAL_ENVIRONMENT || creds.PAYPAL_MODE || targetEnv;

      if (!clientId || !clientSecret) {
        logger.warn('PayPal credentials incomplete', { userId });
        return null;
      }

      return new PayPalRestService({
        clientId: String(clientId),
        clientSecret: String(clientSecret),
        environment: (env === 'live' || env === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
      });

    } catch (error: any) {
      logger.error('Error creating PayPal REST service', { userId, error: error.message });
      return null;
    }
  }

  /**
   * Obtener access token OAuth2
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${this.credentials.clientId}:${this.credentials.clientSecret}`
      ).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 32400; // Default 9 hours
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000); // 5 min buffer

      return this.accessToken;
    } catch (error: any) {
      logger.error('Error obteniendo access token de PayPal', { error: error.message });
      throw new AppError('Failed to authenticate with PayPal', 500);
    }
  }

  /**
   * Intentar obtener balance usando PayPal Reporting API
   * 
   * Nota: PayPal no expone directamente el balance de cuenta.
   * Este método intenta estimarlo usando transacciones recientes.
   */
  async getAccountBalance(): Promise<AccountBalance> {
    try {
      const token = await this.getAccessToken();

      // Método 1: Intentar usar Reporting API (si está disponible con permisos apropiados)
      try {
        // Obtener transacciones recientes para estimar balance
        const response = await axios.get(
          `${this.baseUrl}/v1/reporting/transactions`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            params: {
              start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              end_date: new Date().toISOString(),
              page_size: 100,
            },
            timeout: 10000,
          }
        );

        // Calcular balance estimado desde transacciones
        // Esto es solo una estimación, no el balance real
        const transactions = response.data?.transaction_details || [];
        let estimatedBalance = 0;

        transactions.forEach((tx: any) {
          const amount = parseFloat(tx.transaction_info?.transaction_amount?.value || 0);
          const type = tx.transaction_info?.transaction_event_code || '';
          
          // Sumar ingresos, restar gastos
          if (type.includes('T00') || type.includes('T01')) { // Payments received
            estimatedBalance += amount;
          } else if (type.includes('T11') || type.includes('T03')) { // Payouts sent
            estimatedBalance -= amount;
          }
        });

        logger.info('Balance estimado desde transacciones PayPal', {
          estimatedBalance,
          transactionCount: transactions.length
        });

        return {
          totalBalance: estimatedBalance,
          availableBalance: estimatedBalance, // Asumir que todo está disponible
          currency: 'USD',
          source: 'estimated',
        };

      } catch (reportingError: any) {
        logger.warn('Reporting API no disponible o sin permisos', {
          error: reportingError.message,
          status: reportingError.response?.status
        });
      }

      // Método 2: Retornar "unavailable" ya que no hay endpoint directo
      logger.warn('PayPal REST API no puede obtener balance directamente. Usar validación de capital interno.');

      return {
        totalBalance: 0,
        availableBalance: 0,
        currency: 'USD',
        source: 'unavailable',
      };

    } catch (error: any) {
      logger.error('Error obteniendo balance de PayPal', {
        error: error.message,
        status: error.response?.status
      });

      throw new AppError(
        'No se pudo obtener balance de PayPal. Usar validación de capital de trabajo interno.',
        500
      );
    }
  }

  /**
   * Validar si hay suficiente balance para un monto dado
   * 
   * Nota: Como no podemos obtener el balance real, este método
   * siempre retorna false si el balance no está disponible,
   * forzando el uso de validación de capital interno.
   */
  async hasSufficientBalance(amount: number): Promise<{
    hasBalance: boolean;
    availableBalance?: number;
    reason: string;
  }> {
    try {
      const balance = await this.getAccountBalance();

      if (balance.source === 'unavailable') {
        return {
          hasBalance: false,
          reason: 'Balance no disponible desde PayPal API. Usar validación de capital interno.',
        };
      }

      return {
        hasBalance: balance.availableBalance >= amount,
        availableBalance: balance.availableBalance,
        reason: balance.availableBalance >= amount
          ? 'Balance suficiente'
          : `Balance insuficiente: ${balance.availableBalance} < ${amount}`,
      };

    } catch (error: any) {
      logger.error('Error validando balance de PayPal', { error: error.message });
      
      return {
        hasBalance: false,
        reason: `Error validando balance: ${error.message}. Usar validación de capital interno.`,
      };
    }
  }
}

