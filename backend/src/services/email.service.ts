import { trace } from '../utils/boot-trace';
trace('loading email.service');

import nodemailer from 'nodemailer';
import { logger } from '../config/logger';

/**
 * Servicio simple para envío de emails usando Nodemailer
 * Usa las variables de entorno SMTP_* para configuración
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isInitialized = false;

  /**
   * Inicializar el transporter de email
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized && this.transporter) {
      return;
    }

    try {
      const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587');
      const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
      const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
      const smtpFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@ivanreseller.com';
      const smtpFromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Ivan Reseller';
      const smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true';

      // Verificar que tenemos configuración mínima
      if (!smtpHost || !smtpUser || !smtpPass) {
        logger.warn('Email service: SMTP configuration incomplete. Email sending will be disabled.', {
          hasHost: !!smtpHost,
          hasUser: !!smtpUser,
          hasPass: !!smtpPass
        });
        this.isInitialized = true; // Marcar como inicializado para no intentar de nuevo
        return;
      }

      // Crear transporter
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true para 465, false para otros puertos
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        // Opciones adicionales para mejor compatibilidad
        tls: {
          rejectUnauthorized: false // En producción, considerar true
        }
      });

      // Verificar conexión
      await this.transporter.verify();
      
      logger.info('Email service initialized successfully', {
        host: smtpHost,
        port: smtpPort,
        from: smtpFrom
      });

      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize email service', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.transporter = null;
      this.isInitialized = true; // Marcar como inicializado para no intentar de nuevo
    }
  }

  /**
   * Enviar email genérico
   */
  async sendEmail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{
      filename: string;
      content?: Buffer | string;
      path?: string;
      contentType?: string;
    }>;
  }): Promise<boolean> {
    try {
      // Inicializar si es necesario
      await this.initialize();

      if (!this.transporter) {
        logger.warn('Email service: Transporter not available. Email not sent.', {
          to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
          subject: options.subject
        });
        return false;
      }

      const smtpFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'noreply@ivanreseller.com';
      const smtpFromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Ivan Reseller';

      const mailOptions = {
        from: `${smtpFromName} <${smtpFrom}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text || this.htmlToText(options.html),
        html: options.html,
        attachments: options.attachments
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        messageId: info.messageId
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject
      });
      return false;
    }
  }

  /**
   * Enviar email de reset de contraseña
   */
  async sendPasswordResetEmail(email: string, resetLink: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
          .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Restablecer Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Has solicitado restablecer tu contraseña en <strong>Ivan Reseller</strong>.</p>
            <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Restablecer Contraseña</a>
            </p>
            <p>O copia y pega este enlace en tu navegador:</p>
            <p style="word-break: break-all; color: #4F46E5;">${resetLink}</p>
            <div class="warning">
              <strong>⚠️ Importante:</strong> Este enlace expirará en 1 hora por seguridad.
            </div>
            <p>Si no solicitaste este cambio, puedes ignorar este email de forma segura.</p>
            <p>Saludos,<br><strong>Equipo Ivan Reseller</strong></p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: '🔐 Restablecer Contraseña - Ivan Reseller',
      html
    });
  }

  /**
   * Enviar email de bienvenida con credenciales
   */
  async sendWelcomeEmail(email: string, credentials: {
    username: string;
    temporaryPassword: string;
    accessUrl: string;
  }): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .credentials { background-color: white; border: 2px solid #E5E7EB; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .credential-item { margin: 10px 0; }
          .credential-label { font-weight: bold; color: #6b7280; }
          .credential-value { font-family: monospace; font-size: 16px; color: #111827; background-color: #F3F4F6; padding: 8px; border-radius: 3px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
          .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
          ol { padding-left: 20px; }
          li { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Bienvenido a Ivan Reseller!</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu cuenta ha sido creada exitosamente. Aquí están tus credenciales de acceso:</p>
            
            <div class="credentials">
              <div class="credential-item">
                <div class="credential-label">Usuario:</div>
                <div class="credential-value">${credentials.username}</div>
              </div>
              <div class="credential-item">
                <div class="credential-label">Contraseña temporal:</div>
                <div class="credential-value">${credentials.temporaryPassword}</div>
              </div>
            </div>

            <div class="warning">
              <strong>⚠️ IMPORTANTE:</strong> Por seguridad, cambia tu contraseña en el primer inicio de sesión.
            </div>

            <p style="text-align: center;">
              <a href="${credentials.accessUrl}" class="button">Acceder al Sistema</a>
            </p>

            <h3>¿Cómo usar el sistema?</h3>
            <ol>
              <li>Accede al link proporcionado</li>
              <li>Inicia sesión con tus credenciales</li>
              <li>Cambia tu contraseña temporal</li>
              <li>Explora el dashboard y sus funcionalidades</li>
              <li>Configura tus APIs de marketplace (opcional)</li>
            </ol>

            <p>Si tienes preguntas, contacta al administrador.</p>
            <p>¡Éxito en tus ventas!</p>
            <p><strong>Equipo Ivan Reseller</strong></p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: '🎉 Bienvenido a Ivan Reseller - Tus Credenciales de Acceso',
      html
    });
  }

  /**
   * Enviar email con reporte adjunto
   */
  async sendReportEmail(
    recipients: string[],
    reportType: string,
    reportName: string,
    buffer: Buffer,
    format: 'excel' | 'pdf'
  ): Promise<boolean> {
    const fileExtension = format === 'excel' ? 'xlsx' : 'pdf';
    const mimeType = format === 'excel' 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Reporte Generado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu reporte programado ha sido generado exitosamente.</p>
            <p><strong>Tipo de reporte:</strong> ${reportType}</p>
            <p><strong>Formato:</strong> ${format.toUpperCase()}</p>
            <p>El archivo adjunto contiene los datos solicitados.</p>
            <p>Saludos,<br><strong>Equipo Ivan Reseller</strong></p>
          </div>
          <div class="footer">
            <p>Este es un email automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: recipients,
      subject: `📊 Reporte ${reportType} - ${new Date().toLocaleDateString()}`,
      html,
      attachments: [{
        filename: `${reportName}.${fileExtension}`,
        content: buffer,
        contentType: mimeType
      }]
    });
  }

  /**
   * Convertir HTML a texto plano (simple)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export default new EmailService();

