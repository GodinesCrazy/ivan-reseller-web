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
   * Create PayPalPayoutService from environment variables
   */
  static fromEnv(): PayPalPayoutService | null {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const environment = (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

    if (!clientId || !clientSecret) {
      logger.warn('PayPal credentials not configured');
      return null;
    }

    return new PayPalPayoutService({ clientId, clientSecret, environment });
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

      // Obtener credenciales del usuario
      const entry = await CredentialsManager.getCredentialEntry(userId, 'paypal', targetEnv);
      
      if (!entry || !entry.isActive || !entry.credentials) {
        logger.debug('PayPal credentials not found in database, trying environment variables', {
          userId,
          environment: targetEnv
        });
        // Fallback a variables de entorno
        return this.fromEnv();
      }

      const creds = entry.credentials as any;
      const clientId = creds.clientId || creds.PAYPAL_CLIENT_ID;
      const clientSecret = creds.clientSecret || creds.PAYPAL_CLIENT_SECRET;
      const env = creds.environment || creds.PAYPAL_ENVIRONMENT || creds.PAYPAL_MODE || targetEnv;

      if (!clientId || !clientSecret) {
        logger.warn('PayPal credentials incomplete in database, trying environment variables', {
          userId,
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret
        });
        // Fallback a variables de entorno
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
   * 1. Wallet API (/v1/wallet/balance) - Más preciso, requiere permisos wallet:read
   * 2. Reporting API - Estima desde transacciones recientes (menos preciso)
   * 3. Retorna null para usar validación de capital interno como fallback
   */
  async checkPayPalBalance(): Promise<{ available: number; currency: string; source?: string } | null> {
    try {
      await this.ensureAccessToken();
      if (!this.accessToken) {
        throw new Error('No access token available');
      }

      // Método 1: Wallet API (más preciso si está disponible)
      try {
        const response = await this.apiClient.get('/v1/wallet/balance', {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });
        
        if (response.data && response.data.available_balance) {
          const balance = {
            available: parseFloat(response.data.available_balance.value || '0'),
            currency: response.data.available_balance.currency || 'USD',
            source: 'wallet_api'
          };
          
          logger.info('PayPal balance retrieved successfully from Wallet API', {
            available: balance.available,
            currency: balance.currency,
            environment: this.credentials.environment
          });
          
          return balance;
        }
      } catch (walletError: any) {
        // Wallet API no disponible o sin permisos (normal en muchos casos)
        if (walletError.response?.status !== 404 && walletError.response?.status !== 403) {
          logger.debug('PayPal Wallet API error (continuando con alternativas)', {
            error: walletError.message,
            status: walletError.response?.status
          });
        }
      }
      
      // Método 2: Reporting API - Estimar desde transacciones (menos preciso pero útil)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();
        
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

        // Calcular balance estimado desde transacciones
        const transactions = response.data?.transaction_details || [];
        let estimatedBalance = 0;

        transactions.forEach((tx: any) => {
          const amount = parseFloat(tx.transaction_info?.transaction_amount?.value || 0);
          const eventCode = tx.transaction_info?.transaction_event_code || '';
          
          // Sumar ingresos (payments received: T00, T01, T1107)
          if (eventCode.includes('T00') || eventCode.includes('T01') || eventCode.includes('T1107')) {
            estimatedBalance += amount;
          }
          // Restar gastos (payouts sent: T11, T03, T1106)
          else if (eventCode.includes('T11') || eventCode.includes('T03') || eventCode.includes('T1106')) {
            estimatedBalance -= amount;
          }
        });

        logger.info('PayPal balance estimado desde Reporting API', {
          estimatedBalance: Math.max(0, estimatedBalance),
          transactionCount: transactions.length,
          environment: this.credentials.environment
        });

        return {
          available: Math.max(0, estimatedBalance), // No permitir negativo
          currency: 'USD',
          source: 'reporting_api_estimated'
        };

      } catch (reportingError: any) {
        logger.debug('PayPal Reporting API no disponible', {
          error: reportingError.message,
          status: reportingError.response?.status
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
