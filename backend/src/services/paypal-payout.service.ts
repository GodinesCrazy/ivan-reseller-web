import { trace } from '../utils/boot-trace';
trace('loading paypal-payout.service');

import axios, { AxiosInstance } from 'axios';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../config/logger';

/**
 * PayPal Payout Service - Real Implementation
 * Handles automatic commission payments to users via PayPal Payouts API
 */

export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface PayoutItem {
  recipientEmail: string;
  amount: number;
  currency: string;
  note?: string;
  senderItemId?: string; // Your internal ID (commission ID)
  recipientWallet?: 'PAYPAL' | 'VENMO';
}

export interface PayoutResponse {
  success: boolean;
  batchId?: string;
  batchStatus?: string;
  items?: Array<{
    payoutItemId: string;
    transactionId?: string;
    transactionStatus: string;
    recipientEmail: string;
    amount: number;
    errors?: string[];
  }>;
  error?: string;
}

export interface PayoutStatus {
  batchId: string;
  batchStatus: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'DENIED' | 'CANCELED';
  totalAmount: number;
  feesAmount: number;
  items: Array<{
    payoutItemId: string;
    transactionId?: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNCLAIMED' | 'RETURNED' | 'ONHOLD' | 'BLOCKED' | 'REFUNDED';
    recipientEmail: string;
    amount: number;
    errorMessage?: string;
  }>;
}

export class PayPalPayoutService {
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

    // Add request interceptor for authentication
    this.apiClient.interceptors.request.use(async (config) => {
      await this.ensureAccessToken();
      if (this.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  /**
   * Create PayPalPayoutService from environment variables.
   * @param environment When 'production', uses PAYPAL_PRODUCTION_CLIENT_ID/SECRET if set; otherwise PAYPAL_CLIENT_ID/SECRET and PAYPAL_ENVIRONMENT.
   */
  static fromEnv(environment?: 'sandbox' | 'production'): PayPalPayoutService | null {
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let env: 'sandbox' | 'production';

    if (environment === 'production') {
      const prodId = process.env.PAYPAL_PRODUCTION_CLIENT_ID;
      const prodSecret = process.env.PAYPAL_PRODUCTION_CLIENT_SECRET;
      if (prodId && prodSecret) {
        clientId = prodId;
        clientSecret = prodSecret;
        env = 'production';
      } else {
        clientId = process.env.PAYPAL_CLIENT_ID;
        clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        env = (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
      }
    } else {
      clientId = process.env.PAYPAL_CLIENT_ID;
      clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      env = (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    }

    logger.info('[PAYPAL_ENV_READY]', {
      requestedEnv: environment,
      usingEnv: env,
      clientIdPresent: !!clientId,
      secretPresent: !!clientSecret,
    });

    if (!clientId || !clientSecret) {
      logger.warn('PayPal credentials not configured');
      return null;
    }

    return new PayPalPayoutService({ clientId, clientSecret, environment: env });
  }

  /**
   * ✅ NUEVO: Create PayPalPayoutService from user credentials (desde base de datos)
   * Prioriza credenciales de usuario sobre variables de entorno
   */
  static async fromUserCredentials(userId: number, environment?: 'sandbox' | 'production'): Promise<PayPalPayoutService | null> {
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const { workflowConfigService } = await import('./workflow-config.service');

      // Determinar environment si no se especifica
      let targetEnv: 'sandbox' | 'production' = environment || 'production';
      if (!environment) {
        targetEnv = await workflowConfigService.getUserEnvironment(userId);
      }

      // Obtener credenciales del usuario (intentar targetEnv primero, luego el otro entorno)
      let entry = await CredentialsManager.getCredentialEntry(userId, 'paypal', targetEnv);
      let usedEnv = targetEnv;

      if (!entry || !entry.isActive || !entry.credentials) {
        const otherEnv: 'sandbox' | 'production' = targetEnv === 'sandbox' ? 'production' : 'sandbox';
        entry = await CredentialsManager.getCredentialEntry(userId, 'paypal', otherEnv);
        usedEnv = otherEnv;
      }

      if (!entry || !entry.isActive || !entry.credentials) {
        logger.debug('PayPal credentials not found in database (tried both envs), trying environment variables', {
          userId,
          environment: targetEnv
        });
        return this.fromEnv();
      }

      const creds = entry.credentials as any;
      const clientId = creds.clientId || creds.PAYPAL_CLIENT_ID;
      const clientSecret = creds.clientSecret || creds.PAYPAL_CLIENT_SECRET;
      const env = creds.environment || creds.PAYPAL_ENVIRONMENT || creds.PAYPAL_MODE || usedEnv;

      if (!clientId || !clientSecret) {
        logger.warn('PayPal credentials incomplete in database, trying environment variables', {
          userId,
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret
        });
        return this.fromEnv();
      }

      logger.info('PayPal service created from user credentials', {
        userId,
        environment: env,
        hasClientId: !!clientId
      });

      return new PayPalPayoutService({
        clientId: String(clientId),
        clientSecret: String(clientSecret),
        environment: (env === 'live' || env === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
      });

    } catch (error: any) {
      logger.error('Error creating PayPal service from user credentials', {
        userId,
        error: error.message
      });
      // Fallback a variables de entorno
      return this.fromEnv();
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAccessToken(): Promise<void> {
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return;
    }

    // Get new token
    await this.authenticate();
  }

  /**
   * Authenticate with PayPal OAuth2
   */
  private async authenticate(): Promise<void> {
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
      // Token expires in seconds, set expiry to current time + expires_in - 60 seconds buffer
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 60) * 1000);

      logger.info('PayPal authentication successful', {
        expiresIn,
        environment: this.credentials.environment
      });
    } catch (error: any) {
      logger.error('PayPal authentication failed', { error: error.message });
      throw new AppError(`PayPal authentication failed: ${error.message}`, 401);
    }
  }

  /**
   * ✅ CRÍTICO: Verificar saldo de PayPal antes de realizar compras
   * Usa PayPal REST API para obtener el saldo disponible real
   * Requiere permisos adicionales en la cuenta PayPal (wallet:read)
   */
  /**
   * ✅ MEJORADO: Check PayPal account balance
   * 
   * Intenta múltiples métodos:
   * 1. Balance Accounts API v2 (/v2/wallet/balance-accounts) - API actual de PayPal
   * 2. Wallet API v1 (/v1/wallet/balance) - Fallback, requiere permisos wallet:read
   * 3. Reporting API - Estima desde transacciones recientes (menos preciso)
   * 4. Retorna null para usar validación de capital interno como fallback
   */
  async checkPayPalBalance(): Promise<{ available: number; currency: string; source?: string } | null> {
    try {
      await this.ensureAccessToken();
      if (!this.accessToken) {
        throw new Error('No access token available');
      }

      // Método 1: Balance Accounts API v2 (API actual de PayPal)
      try {
        const response = await this.apiClient.get('/v2/wallet/balance-accounts', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });

        const data = response.data;
        if (data?.total_available?.value != null) {
          const balance = {
            available: parseFloat(String(data.total_available.value)),
            currency: data.total_available.currency_code || 'USD',
            source: 'wallet_api'
          };
          logger.info('PayPal balance retrieved successfully from Balance Accounts API v2', {
            available: balance.available,
            currency: balance.currency,
            environment: this.credentials.environment
          });
          return balance;
        }
        // Alternativa: sumar desde balance_accounts si total_available no viene
        const accounts = data?.balance_accounts;
        if (Array.isArray(accounts) && accounts.length > 0) {
          let total = 0;
          let currency = 'USD';
          for (const acc of accounts) {
            if (acc?.available?.value != null) {
              total += parseFloat(String(acc.available.value));
              if (acc.available.currency_code) currency = acc.available.currency_code;
            }
          }
          if (total >= 0) {
            logger.info('PayPal balance retrieved from Balance Accounts API v2 (balance_accounts)', {
              available: total,
              currency,
              environment: this.credentials.environment
            });
            return { available: total, currency, source: 'wallet_api' };
          }
        }
      } catch (v2Error: any) {
        logger.info('PayPal Balance API v2 falló', {
          status: v2Error.response?.status,
          paypalMessage: v2Error.response?.data?.message ?? v2Error.response?.data?.details?.[0]?.description,
          environment: this.credentials.environment
        });
      }

      // Método 2: Wallet API v1 (fallback, puede estar deprecado)
      try {
        const response = await this.apiClient.get('/v1/wallet/balance', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });

        if (response.data?.available_balance) {
          const balance = {
            available: parseFloat(response.data.available_balance.value || '0'),
            currency: response.data.available_balance.currency || 'USD',
            source: 'wallet_api'
          };
          logger.info('PayPal balance retrieved from Wallet API v1', {
            available: balance.available,
            currency: balance.currency,
            environment: this.credentials.environment
          });
          return balance;
        }
      } catch (walletError: any) {
        logger.info('PayPal Wallet API v1 falló', {
          status: walletError.response?.status,
          paypalMessage: walletError.response?.data?.message ?? walletError.response?.data?.details?.[0]?.description,
          environment: this.credentials.environment
        });
      }
      
      // Método 3: Reporting API - Estimar desde transacciones (menos preciso pero útil)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        const response = await this.apiClient.get('/v1/reporting/transactions', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
          params: {
            start_date: thirtyDaysAgo,
            end_date: now,
            page_size: 100,
          },
          timeout: 10000,
        });

        const data = response.data;
        const transactions = Array.isArray(data?.transaction_details) ? data.transaction_details : [];
        let estimatedBalance = 0;

        for (const tx of transactions) {
          const info = tx?.transaction_info;
          if (!info) continue;
          const amount = parseFloat(info.transaction_amount?.value ?? '0');
          const eventCode = String(info.transaction_event_code || '');
          if (eventCode.includes('T00') || eventCode.includes('T01') || eventCode.includes('T1107')) {
            estimatedBalance += amount;
          } else if (eventCode.includes('T11') || eventCode.includes('T03') || eventCode.includes('T1106')) {
            estimatedBalance -= amount;
          }
        }

        logger.info('PayPal balance estimado desde Reporting API', {
          estimatedBalance: Math.max(0, estimatedBalance),
          transactionCount: transactions.length,
          environment: this.credentials.environment
        });

        return {
          available: Math.max(0, estimatedBalance),
          currency: 'USD',
          source: 'reporting_api_estimated'
        };
      } catch (reportingError: any) {
        logger.info('PayPal Reporting API falló', {
          status: reportingError.response?.status,
          paypalMessage: reportingError.response?.data?.message ?? reportingError.response?.data?.details?.[0]?.description,
          environment: this.credentials.environment
        });
      }

      // Método 3: Fallback - usar validación de capital interno
      logger.info('PayPal balance check no disponible - usando validación de capital interno', {
        environment: this.credentials.environment,
        message: 'Para balance preciso, configurar permisos wallet:read en PayPal app'
      });
      
      return null;
    } catch (error: any) {
      logger.warn('PayPal balance check falló - usando validación de capital interno', {
        error: error.message,
        status: error.response?.status,
        message: 'El sistema usará validación de capital de trabajo como fallback'
      });
      
      return null;
    }
  }

  /**
   * Send single payout to a recipient
   */
  async sendPayout(item: PayoutItem): Promise<PayoutResponse> {
    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const payoutData = {
        sender_batch_header: {
          sender_batch_id: batchId,
          email_subject: 'You have a commission payment from Ivan Reseller',
          email_message: 'You have received a commission payment. Thank you for your business!',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: item.amount.toFixed(2),
              currency: item.currency || 'USD',
            },
            receiver: item.recipientEmail,
            note: item.note || 'Commission payment',
            sender_item_id: item.senderItemId || `item_${Date.now()}`,
            recipient_wallet: item.recipientWallet || 'PAYPAL',
          },
        ],
      };

      logger.info('Sending PayPal payout', {
        batchId,
        recipient: item.recipientEmail,
        amount: item.amount,
      });

      const response = await this.apiClient.post('/v1/payments/payouts', payoutData);

      const payoutBatchId = response.data.batch_header.payout_batch_id;

      logger.info('PayPal payout created', {
        batchId: payoutBatchId,
        status: response.data.batch_header.batch_status,
      });

      return {
        success: true,
        batchId: payoutBatchId,
        batchStatus: response.data.batch_header.batch_status,
        items: response.data.items?.map((item: any) => ({
          payoutItemId: item.payout_item_id,
          transactionId: item.transaction_id,
          transactionStatus: item.transaction_status,
          recipientEmail: item.payout_item.receiver,
          amount: parseFloat(item.payout_item.amount.value),
        })),
      };
    } catch (error: any) {
      logger.error('PayPal payout failed', {
        error: error.response?.data || error.message,
        recipient: item.recipientEmail,
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Send batch payout to multiple recipients
   */
  async sendBatchPayout(items: PayoutItem[]): Promise<PayoutResponse> {
    try {
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const payoutData = {
        sender_batch_header: {
          sender_batch_id: batchId,
          email_subject: 'You have a commission payment from Ivan Reseller',
          email_message: 'You have received a commission payment. Thank you for your business!',
        },
        items: items.map((item) => ({
          recipient_type: 'EMAIL',
          amount: {
            value: item.amount.toFixed(2),
            currency: item.currency || 'USD',
          },
          receiver: item.recipientEmail,
          note: item.note || 'Commission payment',
          sender_item_id: item.senderItemId || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          recipient_wallet: item.recipientWallet || 'PAYPAL',
        })),
      };

      logger.info('Sending PayPal batch payout', {
        batchId,
        recipientCount: items.length,
        totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      });

      const response = await this.apiClient.post('/v1/payments/payouts', payoutData);

      const payoutBatchId = response.data.batch_header.payout_batch_id;

      logger.info('PayPal batch payout created', {
        batchId: payoutBatchId,
        status: response.data.batch_header.batch_status,
      });

      return {
        success: true,
        batchId: payoutBatchId,
        batchStatus: response.data.batch_header.batch_status,
        items: response.data.items?.map((item: any) => ({
          payoutItemId: item.payout_item_id,
          transactionId: item.transaction_id,
          transactionStatus: item.transaction_status,
          recipientEmail: item.payout_item.receiver,
          amount: parseFloat(item.payout_item.amount.value),
        })),
      };
    } catch (error: any) {
      logger.error('PayPal batch payout failed', {
        error: error.response?.data || error.message,
        recipientCount: items.length,
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get payout batch status
   */
  async getPayoutStatus(batchId: string): Promise<PayoutStatus> {
    try {
      const response = await this.apiClient.get(`/v1/payments/payouts/${batchId}`);

      const batch = response.data.batch_header;
      const items = response.data.items || [];

      return {
        batchId: batch.payout_batch_id,
        batchStatus: batch.batch_status,
        totalAmount: parseFloat(batch.amount?.value || '0'),
        feesAmount: parseFloat(batch.fees?.value || '0'),
        items: items.map((item: any) => ({
          payoutItemId: item.payout_item_id,
          transactionId: item.transaction_id,
          status: item.transaction_status,
          recipientEmail: item.payout_item.receiver,
          amount: parseFloat(item.payout_item.amount.value),
          errorMessage: item.errors?.message,
        })),
      };
    } catch (error: any) {
      logger.error('Failed to get PayPal payout status', {
        error: error.response?.data || error.message,
        batchId,
      });

      throw new AppError(`Failed to get payout status: ${error.message}`, 400);
    }
  }

  /**
   * Get payout item details
   */
  async getPayoutItem(payoutItemId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/v1/payments/payouts-item/${payoutItemId}`);
      return response.data;
    } catch (error: any) {
      logger.error('Failed to get PayPal payout item', {
        error: error.response?.data || error.message,
        payoutItemId,
      });

      throw new AppError(`Failed to get payout item: ${error.message}`, 400);
    }
  }

  /**
   * Cancel unclaimed payout
   */
  async cancelPayoutItem(payoutItemId: string): Promise<boolean> {
    try {
      await this.apiClient.post(`/v1/payments/payouts-item/${payoutItemId}/cancel`);
      logger.info('PayPal payout item canceled', { payoutItemId });
      return true;
    } catch (error: any) {
      logger.error('Failed to cancel PayPal payout item', {
        error: error.response?.data || error.message,
        payoutItemId,
      });
      return false;
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.ensureAccessToken();
      return {
        success: true,
        message: 'PayPal connection successful',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

export default PayPalPayoutService;
