import nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import { WebClient } from '@slack/web-api';
import axios from 'axios';

export interface NotificationConfig {
  email: {
    enabled: boolean;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    from: string;
    templates: {
      opportunity: string;
      sale: string;
      error: string;
      modeChange: string;
    };
  };
  sms: {
    enabled: boolean;
    twilio: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
  };
  slack: {
    enabled: boolean;
    botToken: string;
    channel: string;
  };
  discord: {
    enabled: boolean;
    webhookUrl: string;
  };
  push: {
    enabled: boolean;
    vapidKeys: {
      publicKey: string;
      privateKey: string;
    };
  };
}

export interface NotificationData {
  type: 'opportunity' | 'sale' | 'error' | 'mode_change' | 'order_completed' | 'purchase_confirmation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  userId?: string;
}

export interface SaleNotification {
  orderId: string;
  product: string;
  customer?: string;
  amount: number;
  timestamp: Date;
}

export interface OpportunityNotification {
  opportunityId: string;
  product: string;
  marketplace: string;
  listingId: string;
  expectedProfit: number;
  confidence: number;
}

export interface ErrorNotification {
  type: string;
  error: string;
  context?: any;
}

export interface ModeChangeNotification {
  mode: 'manual' | 'automatic';
  environment: 'sandbox' | 'production';
  timestamp: Date;
}

export class NotificationService {
  private config: NotificationConfig;
  private emailTransporter: nodemailer.Transporter | null = null;
  private twilioClient: Twilio | null = null;
  private slackClient: WebClient | null = null;
  private notificationQueue: NotificationData[] = [];
  private rateLimits = new Map<string, { count: number; resetTime: number }>();

  constructor(config?: Partial<NotificationConfig>) {
    this.config = {
      email: {
        enabled: false,
        smtp: {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
          }
        },
        from: process.env.SMTP_FROM || 'noreply@ivanreseller.com',
        templates: {
          opportunity: 'Nueva oportunidad detectada: {{product}} - Ganancia esperada: ${{profit}}',
          sale: '🎉 ¡Nueva venta! {{product}} - Cliente: {{customer}} - Monto: ${{amount}}',
          error: '❌ Error en el sistema: {{error}}',
          modeChange: '⚙️ Modo cambiado a: {{mode}} ({{environment}})'
        }
      },
      sms: {
        enabled: false,
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          fromNumber: process.env.TWILIO_FROM_NUMBER || ''
        }
      },
      slack: {
        enabled: false,
        botToken: process.env.SLACK_BOT_TOKEN || '',
        channel: process.env.SLACK_CHANNEL || '#ivan-reseller'
      },
      discord: {
        enabled: false,
        webhookUrl: process.env.DISCORD_WEBHOOK_URL || ''
      },
      push: {
        enabled: false,
        vapidKeys: {
          publicKey: process.env.VAPID_PUBLIC_KEY || '',
          privateKey: process.env.VAPID_PRIVATE_KEY || ''
        }
      },
      ...config
    };

    this.initializeServices();
  }

  /**
   * Inicializar servicios de notificación
   */
  private async initializeServices(): Promise<void> {
    try {
      // Configurar email
      if (this.config.email.enabled && this.config.email.smtp.auth.user) {
        this.emailTransporter = nodemailer.createTransporter({
          host: this.config.email.smtp.host,
          port: this.config.email.smtp.port,
          secure: this.config.email.smtp.secure,
          auth: this.config.email.smtp.auth
        });

        // Verificar conexión
        await this.emailTransporter.verify();
        console.log('✅ Servicio de email inicializado');
      }

      // Configurar Twilio
      if (this.config.sms.enabled && this.config.sms.twilio.accountSid) {
        this.twilioClient = new Twilio(
          this.config.sms.twilio.accountSid,
          this.config.sms.twilio.authToken
        );
        console.log('✅ Servicio de SMS inicializado');
      }

      // Configurar Slack
      if (this.config.slack.enabled && this.config.slack.botToken) {
        this.slackClient = new WebClient(this.config.slack.botToken);
        console.log('✅ Servicio de Slack inicializado');
      }

    } catch (error) {
      console.error('⚠️ Error inicializando servicios de notificación:', error);
    }
  }

  /**
   * Enviar notificación de nueva venta
   */
  async sendSaleNotification(sale: SaleNotification): Promise<void> {
    const notification: NotificationData = {
      type: 'sale',
      priority: 'high',
      title: '🎉 Nueva Venta Recibida',
      message: `Producto: ${sale.product}\nCliente: ${sale.customer || 'N/A'}\nMonto: $${sale.amount}\nHora: ${sale.timestamp.toLocaleString()}`,
      data: sale,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Enviar notificación de oportunidad exitosa
   */
  async sendOpportunitySuccess(opportunity: OpportunityNotification): Promise<void> {
    const notification: NotificationData = {
      type: 'opportunity',
      priority: 'medium',
      title: '🎯 Oportunidad Publicada',
      message: `Producto: ${opportunity.product}\nMarketplace: ${opportunity.marketplace}\nGanancia esperada: $${opportunity.expectedProfit}\nConfianza IA: ${opportunity.confidence}%`,
      data: opportunity,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Enviar notificación de error
   */
  async sendError(error: ErrorNotification): Promise<void> {
    const notification: NotificationData = {
      type: 'error',
      priority: 'critical',
      title: '❌ Error del Sistema',
      message: `Tipo: ${error.type}\nError: ${error.error}\nContexto: ${JSON.stringify(error.context, null, 2)}`,
      data: error,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Enviar notificación de cambio de modo
   */
  async sendModeChange(modeChange: ModeChangeNotification): Promise<void> {
    const notification: NotificationData = {
      type: 'mode_change',
      priority: 'medium',
      title: '⚙️ Cambio de Modo',
      message: `Nuevo modo: ${modeChange.mode}\nEntorno: ${modeChange.environment}\nTiempo: ${modeChange.timestamp.toLocaleString()}`,
      data: modeChange,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Enviar confirmación de compra automática
   */
  async sendPurchaseConfirmation(data: {
    orderId: string;
    supplierOrderId: string;
    estimatedDelivery: Date;
    trackingNumber: string;
  }): Promise<void> {
    const notification: NotificationData = {
      type: 'purchase_confirmation',
      priority: 'high',
      title: '🛒 Compra Automática Realizada',
      message: `Orden: ${data.orderId}\nProveedor: ${data.supplierOrderId}\nEntrega estimada: ${data.estimatedDelivery.toLocaleDateString()}\nTracking: ${data.trackingNumber}`,
      data,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Enviar notificación de orden completada
   */
  async sendOrderCompleted(data: {
    orderId: string;
    profit: number;
    totalRevenue: number;
    processingTime: number;
  }): Promise<void> {
    const notification: NotificationData = {
      type: 'order_completed',
      priority: 'high',
      title: '✅ Orden Completada Exitosamente',
      message: `Orden: ${data.orderId}\nGanancia: $${data.profit.toFixed(2)}\nIngresos totales: $${data.totalRevenue.toFixed(2)}\nTiempo procesamiento: ${Math.round(data.processingTime / 1000)}s`,
      data,
      timestamp: new Date()
    };

    await this.sendNotification(notification);
  }

  /**
   * Método principal para enviar notificaciones
   */
  private async sendNotification(notification: NotificationData): Promise<void> {
    try {
      // Verificar rate limiting
      if (!this.checkRateLimit(notification.type)) {
        console.warn(`⚠️ Rate limit alcanzado para tipo: ${notification.type}`);
        return;
      }

      // Agregar a cola
      this.notificationQueue.push(notification);

      // Enviar por todos los canales habilitados
      const promises: Promise<void>[] = [];

      if (this.config.email.enabled) {
        promises.push(this.sendEmailNotification(notification));
      }

      if (this.config.sms.enabled && notification.priority === 'critical') {
        promises.push(this.sendSMSNotification(notification));
      }

      if (this.config.slack.enabled) {
        promises.push(this.sendSlackNotification(notification));
      }

      if (this.config.discord.enabled) {
        promises.push(this.sendDiscordNotification(notification));
      }

      // Ejecutar todas las notificaciones en paralelo
      await Promise.allSettled(promises);

      console.log(`📱 Notificación enviada: ${notification.title}`);

    } catch (error) {
      console.error('❌ Error enviando notificación:', error);
    }
  }

  /**
   * Enviar notificación por email
   */
  private async sendEmailNotification(notification: NotificationData): Promise<void> {
    if (!this.emailTransporter) return;

    try {
      const mailOptions = {
        from: this.config.email.from,
        to: process.env.NOTIFICATION_EMAIL || 'admin@ivanreseller.com',
        subject: `[Ivan Reseller] ${notification.title}`,
        text: notification.message,
        html: this.generateEmailHTML(notification)
      };

      await this.emailTransporter.sendMail(mailOptions);
    } catch (error) {
      console.error('❌ Error enviando email:', error);
    }
  }

  /**
   * Enviar notificación por SMS
   */
  private async sendSMSNotification(notification: NotificationData): Promise<void> {
    if (!this.twilioClient) return;

    try {
      await this.twilioClient.messages.create({
        body: `${notification.title}\n\n${notification.message.substring(0, 140)}...`,
        from: this.config.sms.twilio.fromNumber,
        to: process.env.NOTIFICATION_PHONE || '+1234567890' // Configurar número destino
      });
    } catch (error) {
      console.error('❌ Error enviando SMS:', error);
    }
  }

  /**
   * Enviar notificación a Slack
   */
  private async sendSlackNotification(notification: NotificationData): Promise<void> {
    if (!this.slackClient) return;

    try {
      const color = this.getSlackColor(notification.priority);
      
      await this.slackClient.chat.postMessage({
        channel: this.config.slack.channel,
        text: notification.title,
        attachments: [{
          color,
          fields: [{
            title: notification.title,
            value: notification.message,
            short: false
          }],
          footer: 'Ivan Reseller System',
          ts: Math.floor(notification.timestamp.getTime() / 1000).toString()
        }]
      });
    } catch (error) {
      console.error('❌ Error enviando a Slack:', error);
    }
  }

  /**
   * Enviar notificación a Discord
   */
  private async sendDiscordNotification(notification: NotificationData): Promise<void> {
    if (!this.config.discord.webhookUrl) return;

    try {
      const color = this.getDiscordColor(notification.priority);
      
      await axios.post(this.config.discord.webhookUrl, {
        embeds: [{
          title: notification.title,
          description: notification.message,
          color,
          timestamp: notification.timestamp.toISOString(),
          footer: {
            text: 'Ivan Reseller System'
          }
        }]
      });
    } catch (error) {
      console.error('❌ Error enviando a Discord:', error);
    }
  }

  /**
   * Verificar rate limiting
   */
  private checkRateLimit(type: string): boolean {
    const now = Date.now();
    const key = `notification_${type}`;
    const limit = this.rateLimits.get(key);

    // Límites por tipo (por minuto)
    const limits = {
      sale: 10,
      opportunity: 20,
      error: 5,
      mode_change: 2,
      order_completed: 10,
      purchase_confirmation: 10
    };

    const maxCount = limits[type as keyof typeof limits] || 5;

    if (!limit || now > limit.resetTime) {
      // Resetear contador
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + 60000 // 1 minuto
      });
      return true;
    }

    if (limit.count >= maxCount) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Generar HTML para email
   */
  private generateEmailHTML(notification: NotificationData): string {
    const priorityColors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#fd7e14',
      critical: '#dc3545'
    };

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
          <h1>🤖 Ivan Reseller System</h1>
        </div>
        
        <div style="padding: 20px; border: 1px solid #ddd;">
          <div style="background: ${priorityColors[notification.priority]}; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin: 0;">${notification.title}</h2>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid ${priorityColors[notification.priority]};">
            <pre style="white-space: pre-wrap; font-family: inherit;">${notification.message}</pre>
          </div>
          
          <div style="margin-top: 20px; text-align: center; color: #666;">
            <small>Enviado el ${notification.timestamp.toLocaleString()}</small>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #666;">
          Ivan Reseller Automated System - ${new Date().getFullYear()}
        </div>
      </div>
    `;
  }

  /**
   * Obtener color para Slack
   */
  private getSlackColor(priority: string): string {
    const colors = {
      low: 'good',
      medium: 'warning',
      high: '#ff9500',
      critical: 'danger'
    };
    return colors[priority as keyof typeof colors] || 'good';
  }

  /**
   * Obtener color para Discord
   */
  private getDiscordColor(priority: string): number {
    const colors = {
      low: 0x28a745,    // Verde
      medium: 0xffc107, // Amarillo
      high: 0xfd7e14,   // Naranja
      critical: 0xdc3545 // Rojo
    };
    return colors[priority as keyof typeof colors] || 0x28a745;
  }

  /**
   * Obtener historial de notificaciones
   */
  getNotificationHistory(limit: number = 50): NotificationData[] {
    return this.notificationQueue
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Obtener estadísticas de notificaciones
   */
  getNotificationStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    const recentNotifications = this.notificationQueue.filter(
      n => (now - n.timestamp.getTime()) < oneHour
    );

    const todayNotifications = this.notificationQueue.filter(
      n => (now - n.timestamp.getTime()) < oneDay
    );

    const byType = this.notificationQueue.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    const byPriority = this.notificationQueue.reduce((acc, n) => {
      acc[n.priority] = (acc[n.priority] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return {
      total: this.notificationQueue.length,
      lastHour: recentNotifications.length,
      today: todayNotifications.length,
      byType,
      byPriority,
      rateLimits: Array.from(this.rateLimits.entries()).map(([key, value]) => ({
        type: key,
        count: value.count,
        resetTime: new Date(value.resetTime)
      }))
    };
  }

  /**
   * Limpiar notificaciones antiguas
   */
  cleanupOldNotifications(olderThanDays: number = 7): void {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const initialLength = this.notificationQueue.length;
    
    this.notificationQueue = this.notificationQueue.filter(
      n => n.timestamp.getTime() > cutoffTime
    );

    const removed = initialLength - this.notificationQueue.length;
    if (removed > 0) {
      console.log(`🧹 Limpiadas ${removed} notificaciones antiguas`);
    }
  }

  /**
   * Configurar canales de notificación
   */
  async updateConfig(newConfig: Partial<NotificationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.initializeServices();
    console.log('⚙️ Configuración de notificaciones actualizada');
  }
}