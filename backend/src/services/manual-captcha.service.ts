/**
 * Servicio para manejo de resolución manual de CAPTCHA
 * 
 * Cuando AliExpress o cualquier marketplace detecta un bot y muestra CAPTCHA,
 * este servicio abre una página web para que el usuario lo resuelva manualmente.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { getChromiumLaunchConfig } from '../utils/chromium';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';

puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();

export interface ManualCaptchaSession {
  id: number;
  userId: number;
  token: string;
  captchaUrl: string;
  pageUrl: string;
  status: 'pending' | 'solved' | 'expired' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
  solvedAt?: Date;
}

export class ManualCaptchaService {
  private static activeSessions: Map<string, { browser: Browser; page: Page; userId: number }> = new Map();

  /**
   * Iniciar sesión de resolución manual de CAPTCHA
   * Abre un navegador con la página que tiene el CAPTCHA
   */
  static async startSession(
    userId: number,
    captchaUrl: string,
    pageUrl: string
  ): Promise<{ token: string; browserUrl: string; expiresAt: Date }> {
    // Expirar sesiones antiguas
    await this.expireOldSessions();

    // Generar token único
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutos

    // Guardar sesión en BD
    const session = await prisma.manualAuthSession.create({
      data: {
        userId,
        provider: 'captcha',
        token,
        expiresAt,
        metadata: JSON.stringify({
          captchaUrl,
          pageUrl,
          type: 'manual_captcha',
        }) as any, // Type assertion - metadata field exists in schema
      } as any,
    });

    // En producción (Railway), no podemos abrir navegador visible
    // En su lugar, creamos una URL única que el usuario puede abrir en su navegador
    const isProduction = process.env.NODE_ENV === 'production';
    const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
    const captchaPageUrl = `${frontendUrl}/resolve-captcha/${token}`;

    if (isProduction) {
      // En producción: solo crear la sesión y notificar al usuario
      logger.info(`Manual CAPTCHA session created for user ${userId} (production mode)`, {
        token,
        captchaUrl,
        pageUrl,
        captchaPageUrl,
      });

      // Enviar notificación al usuario con la URL para resolver
      await notificationService.sendToUser(userId, {
        type: 'USER_ACTION',
        title: 'CAPTCHA detectado - Resolución manual requerida',
        message: `AliExpress requiere que resuelvas un CAPTCHA para continuar con la búsqueda de oportunidades. Haz clic en el botón para abrir la página de resolución.`,
        priority: 'HIGH',
        category: 'SYSTEM',
        data: {
          source: 'aliexpress',
          step: 'captcha',
          token,
          captchaUrl: pageUrl || captchaUrl,
          pageUrl: captchaPageUrl,
        },
        actions: [
          {
            id: 'open_captcha_page',
            label: 'Resolver CAPTCHA',
            url: captchaPageUrl,
            variant: 'primary',
          },
          {
            id: 'check_captcha_status',
            label: 'Verificar estado',
            url: `/api/manual-captcha/status/${token}`,
            variant: 'secondary',
          },
        ],
      });

      return {
        token,
        browserUrl: captchaPageUrl, // URL de la página frontend
        expiresAt,
      };
    } else {
      // En desarrollo: intentar abrir navegador visible
      try {
        const { executablePath, args: chromiumArgs } = await getChromiumLaunchConfig([
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
        ]);

        const browser = await puppeteer.launch({
          headless: false, // Modo visible solo en desarrollo
          args: ['--no-sandbox', ...chromiumArgs],
          ignoreDefaultArgs: ['--enable-automation'],
          executablePath,
          defaultViewport: { width: 1920, height: 1080 },
        });

        const page = await browser.newPage();
        
        // Navegar a la página con CAPTCHA
        await page.goto(pageUrl || captchaUrl, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });

        // Guardar sesión activa
        this.activeSessions.set(token, { browser, page, userId });

        logger.info(`Manual CAPTCHA session started for user ${userId} (development mode)`, {
          token,
          captchaUrl,
          pageUrl,
        });

        return {
          token,
          browserUrl: pageUrl || captchaUrl,
          expiresAt,
        };
      } catch (error: any) {
        logger.warn('Error opening browser in development, falling back to web page', { error: error.message });
        // Fallback a página web
        return {
          token,
          browserUrl: captchaPageUrl,
          expiresAt,
        };
      }
    }
  }

  /**
   * Verificar si el CAPTCHA fue resuelto
   * En producción, verifica el estado desde la BD (el usuario marca manualmente)
   * En desarrollo, monitorea la página de Puppeteer
   */
  static async checkCaptchaSolved(token: string): Promise<boolean> {
    // Verificar en BD primero (para producción)
    const dbSession = await prisma.manualAuthSession.findUnique({
      where: { token },
    });

    if (!dbSession) {
      return false;
    }

    // Si está marcado como completado, está resuelto
    if (dbSession.status === 'completed') {
      return true;
    }

    // Si está expirado, no está resuelto
    if (dbSession.status === 'expired' || dbSession.expiresAt < new Date()) {
      return false;
    }

    // En desarrollo, verificar con Puppeteer si hay sesión activa
    const session = this.activeSessions.get(token);
    if (session) {
      try {
        const { page } = session;
        const currentUrl = page.url();

        // Verificar si la página cambió (indicando que el CAPTCHA fue resuelto)
        const captchaSolved = await page.evaluate(() => {
          // Buscar indicadores de que el CAPTCHA fue resuelto
          const captchaIframes = document.querySelectorAll('iframe[src*="captcha"], iframe[src*="recaptcha"]');
          if (captchaIframes.length === 0) {
            return true; // No hay iframes de CAPTCHA, probablemente fue resuelto
          }

          // Verificar si hay mensajes de éxito
          const successMessages = document.querySelectorAll('[class*="success"], [id*="success"]');
          if (successMessages.length > 0) {
            return true;
          }

          // Verificar si la URL cambió a una página de éxito
          if (window.location.href.includes('success') || window.location.href.includes('verified')) {
            return true;
          }

          return false;
        });

        if (captchaSolved) {
          await this.completeSession(token);
          return true;
        }
      } catch (error: any) {
        logger.error('Error checking CAPTCHA status with Puppeteer', { error: error.message, token });
      }
    }

    return false;
  }

  /**
   * Completar sesión de CAPTCHA
   */
  static async completeSession(token: string): Promise<void> {
    // Cerrar navegador si existe (solo en desarrollo)
    const session = this.activeSessions.get(token);
    if (session) {
      try {
        await session.browser.close();
        this.activeSessions.delete(token);
      } catch (error) {
        // Ignorar errores al cerrar
      }
    }

    // Actualizar sesión en BD
    try {
      const dbSession = await prisma.manualAuthSession.findUnique({
        where: { token },
      });

      if (dbSession) {
        await prisma.manualAuthSession.update({
          where: { token },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

        // Notificar al usuario
        await notificationService.sendToUser(dbSession.userId, {
          type: 'JOB_COMPLETED',
          title: 'CAPTCHA resuelto exitosamente',
          message: 'El CAPTCHA fue resuelto. El sistema continuará automáticamente con la búsqueda de oportunidades.',
          priority: 'NORMAL',
          category: 'SYSTEM',
        });

        logger.info(`Manual CAPTCHA session completed for user ${dbSession.userId}`, { token });
      }
    } catch (error: any) {
      logger.error('Error completing CAPTCHA session', { error: error.message, token });
    }
  }

  /**
   * Cancelar sesión de CAPTCHA
   */
  static async cancelSession(token: string): Promise<void> {
    const session = this.activeSessions.get(token);
    if (session) {
      try {
        await session.browser.close();
      } catch (error) {
        // Ignorar errores al cerrar
      }
      this.activeSessions.delete(token);
    }

    const dbSession = await prisma.manualAuthSession.findUnique({
      where: { token },
    });

    if (dbSession) {
      await prisma.manualAuthSession.update({
        where: { token },
        data: { status: 'cancelled' },
      });
    }
  }

  /**
   * Obtener sesión activa
   */
  static async getActiveSession(userId: number): Promise<ManualCaptchaSession | null> {
    await this.expireOldSessions();

    const session = await prisma.manualAuthSession.findFirst({
      where: {
        userId,
        provider: 'captcha',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return null;
    }

    // Parse metadata - handle both metadata field and cookies field
    let metadata: any = {};
    try {
      const sessionAny = session as any;
      if (sessionAny.metadata) {
        metadata = JSON.parse(sessionAny.metadata);
      } else if (session.cookies && typeof session.cookies === 'string') {
        metadata = JSON.parse(session.cookies);
      } else if (session.cookies && typeof session.cookies === 'object') {
        metadata = session.cookies as any;
      }
    } catch (error) {
      // Ignore parse errors
    }

    return {
      id: session.id,
      userId: session.userId,
      token: session.token,
      captchaUrl: metadata.captchaUrl || '',
      pageUrl: metadata.pageUrl || '',
      status: session.status as any,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      solvedAt: session.completedAt || undefined,
    };
  }

  /**
   * Expirar sesiones antiguas
   */
  static async expireOldSessions(): Promise<void> {
    // Expirar en BD
    await prisma.manualAuthSession.updateMany({
      where: {
        provider: 'captcha',
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });

    // Cerrar navegadores de sesiones expiradas
    for (const [token, session] of this.activeSessions.entries()) {
      const dbSession = await prisma.manualAuthSession.findUnique({
        where: { token },
      });

      if (dbSession && (dbSession.status === 'expired' || dbSession.expiresAt < new Date())) {
        try {
          await session.browser.close();
        } catch (error) {
          // Ignorar errores
        }
        this.activeSessions.delete(token);
      }
    }
  }

  /**
   * Esperar a que el usuario resuelva el CAPTCHA
   * Polling cada 2 segundos hasta que sea resuelto o expire
   */
  static async waitForCaptchaResolution(
    token: string,
    maxWaitTime: number = 20 * 60 * 1000 // 20 minutos por defecto
  ): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 segundos

    while (Date.now() - startTime < maxWaitTime) {
      const solved = await this.checkCaptchaSolved(token);
      if (solved) {
        return true;
      }

      // Verificar si la sesión expiró
      const dbSession = await prisma.manualAuthSession.findUnique({
        where: { token },
      });

      if (!dbSession || dbSession.status !== 'pending' || dbSession.expiresAt < new Date()) {
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }
}

export default ManualCaptchaService;

