import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import { marketplaceAuthStatusService } from './marketplace-auth-status.service';
import type { MarketplaceAuthState } from './marketplace-auth-status.service';
import ManualAuthService from './manual-auth.service';
import notificationService from './notification.service';
import { CredentialsManager } from './credentials-manager.service';

interface RefreshOptions {
  force?: boolean;
  reason?: string;
}

const REFRESH_INTERVAL_MS = parseInt(process.env.ALIEXPRESS_REFRESH_INTERVAL_MS || '', 10) || 30 * 60 * 1000;
const ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const HEALTH_REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000;
const COOKIE_WARNING_THRESHOLD_HOURS = parseInt(process.env.ALIEXPRESS_COOKIE_WARNING_HOURS || '48', 10);
const COOKIE_CRITICAL_THRESHOLD_HOURS = parseInt(process.env.ALIEXPRESS_COOKIE_CRITICAL_HOURS || '6', 10);
const COOKIE_WARNING_COOLDOWN_HOURS = parseInt(process.env.ALIEXPRESS_COOKIE_WARNING_COOLDOWN_HOURS || '12', 10);
const COOKIE_EXPIRED_COOLDOWN_HOURS = parseInt(process.env.ALIEXPRESS_COOKIE_EXPIRED_COOLDOWN_HOURS || '6', 10);
const COOKIE_WARNING_THRESHOLD_MS = COOKIE_WARNING_THRESHOLD_HOURS * 60 * 60 * 1000;
const COOKIE_CRITICAL_THRESHOLD_MS = COOKIE_CRITICAL_THRESHOLD_HOURS * 60 * 60 * 1000;
const COOKIE_WARNING_COOLDOWN_MS = COOKIE_WARNING_COOLDOWN_HOURS * 60 * 60 * 1000;
const COOKIE_EXPIRED_COOLDOWN_MS = COOKIE_EXPIRED_COOLDOWN_HOURS * 60 * 60 * 1000;
const DEFAULT_MANUAL_LOGIN_URL = process.env.ALIEXPRESS_LOGIN_URL || 'https://www.aliexpress.com/';

type CookieNotificationKind = 'warning' | 'expired';

interface CookieNotificationState {
  warningSentAt?: number;
  expiredSentAt?: number;
}

interface CookieHealthDecision {
  status: 'healthy' | 'expiring' | 'expired' | 'missing';
  expiresAt?: Date;
  manualRequired: boolean;
  message?: string;
}

class AliExpressAuthMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private cookieAlerts = new Map<number, CookieNotificationState>();

  start() {
    if (this.timer) {
      return;
    }
    logger.info('AliExpressAuthMonitor: starting background monitor');
    this.executeCycle('startup').catch((error) => {
      logger.warn('AliExpressAuthMonitor: startup cycle failed', { error: error?.message || error });
    });
    this.timer = setInterval(() => {
      this.executeCycle('interval').catch((error) => {
        logger.error('AliExpressAuthMonitor: interval cycle failed', { error: error?.message || error });
      });
    }, REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('AliExpressAuthMonitor: stopped background monitor');
  }

  async refreshNow(userId: number, options: RefreshOptions = {}) {
    return this.handleUser(userId, 'manual', options);
  }

  private async executeCycle(source: 'startup' | 'interval') {
    if (this.running) {
      logger.warn('AliExpressAuthMonitor: cycle skipped (already running)');
      return;
    }
    this.running = true;
    try {
      const credentials = await prisma.apiCredential.findMany({
        where: {
          apiName: 'aliexpress',
          isActive: true,
          scope: 'user',
        },
        select: {
          userId: true,
        },
      });

      for (const credential of credentials) {
        // eslint-disable-next-line no-await-in-loop
        await this.handleUser(credential.userId, source).catch((error) => {
          logger.error('AliExpressAuthMonitor: failed to refresh user', {
            userId: credential.userId,
            error: error?.message || error,
          });
        });
      }
    } finally {
      this.running = false;
    }
  }

  private async handleUser(userId: number, source: 'startup' | 'interval' | 'manual', options: RefreshOptions = {}) {
    const status = await marketplaceAuthStatusService.getStatus(userId, 'aliexpress');

    const cookieHealth = await this.evaluateCookieHealth(userId, status?.status as MarketplaceAuthState | undefined);
    if (cookieHealth.manualRequired) {
      logger.info('AliExpressAuthMonitor: user requires manual intervention due to cookie health', {
        userId,
        reason: cookieHealth.status,
      });
      return {
        skipped: true,
        reason: cookieHealth.status,
        message: cookieHealth.message,
      };
    }

    if (status?.status === 'manual_required' && !options.force) {
      logger.info('AliExpressAuthMonitor: skipping user (manual intervention pending)', { userId });
      return { skipped: true, reason: 'manual_required' as const };
    }

    const now = Date.now();
    if (!options.force) {
      if (status?.status === 'refreshing' && status.updatedAt) {
        const diff = now - new Date(status.updatedAt).getTime();
        if (diff < ERROR_COOLDOWN_MS) {
          logger.debug('AliExpressAuthMonitor: skipping user (refresh cooldown)', { userId });
          return { skipped: true, reason: 'cooldown' as const };
        }
      }

      if (status?.status === 'healthy' && status.lastAutomaticSuccess) {
        const diff = now - new Date(status.lastAutomaticSuccess).getTime();
        if (diff < HEALTH_REFRESH_THRESHOLD_MS) {
          logger.debug('AliExpressAuthMonitor: user session still fresh', { userId });
          return { skipped: true, reason: 'fresh' as const };
        }
      }
    }

    await marketplaceAuthStatusService.markRefreshing(
      userId,
      'Renovando sesión de AliExpress en segundo plano'
    );

    const scraper = new AdvancedMarketplaceScraper();

    try {
      const success = await scraper.ensureAliExpressSession(userId);
      if (success) {
        await marketplaceAuthStatusService.markHealthy(
          userId,
          'aliexpress',
          'Sesión renovada automáticamente'
        );
        return { success: true };
      }

      await marketplaceAuthStatusService.markError(
        userId,
        'aliexpress',
        'No se pudo confirmar la sesión después del intento automático',
        { lastAutomaticAttempt: new Date() }
      );
      return { success: false };
    } catch (error: any) {
      if (error instanceof ManualAuthRequiredError) {
        const manualSession = await ManualAuthService.startSession(
          userId,
          'aliexpress',
          error.loginUrl
        );

        await marketplaceAuthStatusService.markManualRequired(
          userId,
          'aliexpress',
          'La sesión requiere autenticación manual'
        );

        await this.notifyUserManualRequired(userId, manualSession.token, manualSession.loginUrl);
        return { manualRequired: true };
      }

      await marketplaceAuthStatusService.markError(
        userId,
        'aliexpress',
        error?.message || 'Error desconocido intentando renovar la sesión',
        { lastAutomaticAttempt: new Date() }
      );
      throw error;
    }
  }

  private async evaluateCookieHealth(
    userId: number,
    currentStatus?: MarketplaceAuthState
  ): Promise<CookieHealthDecision> {
    try {
      const entry = await CredentialsManager.getCredentialEntry(userId, 'aliexpress', 'production', {
        includeGlobal: false,
      });

      if (!entry || !entry.credentials) {
        return await this.handleMissingCookies(userId, currentStatus);
      }

      const credentials = entry.credentials as Record<string, any>;
      const cookies = Array.isArray(credentials.cookies) ? credentials.cookies : [];

      if (!cookies.length) {
        return await this.handleMissingCookies(userId, currentStatus);
      }

      const soonestExpiry = this.getSoonestCookieExpiry(cookies);

      if (!soonestExpiry) {
        return await this.handleMissingCookies(userId, currentStatus, {
          reason: 'No se pudo determinar la fecha de expiración de las cookies.',
        });
      }

      const msUntilExpiry = soonestExpiry.getTime() - Date.now();

      if (msUntilExpiry <= 0) {
        return await this.handleExpiredCookies(userId, soonestExpiry, currentStatus);
      }

      if (msUntilExpiry <= COOKIE_CRITICAL_THRESHOLD_MS) {
        const hoursLeft = Math.max(msUntilExpiry / (60 * 60 * 1000), 0.5);
        const message = `Tu sesión manual de AliExpress vencerá en ~${hoursLeft.toFixed(
          1
        )} horas. Guarda nuevas cookies para evitar interrupciones.`;

        await this.updateStatusMessage(userId, currentStatus, message);
        await this.sendCookieWarning(userId, soonestExpiry, true);

        return {
          status: 'expiring',
          expiresAt: soonestExpiry,
          manualRequired: false,
          message,
        };
      }

      if (msUntilExpiry <= COOKIE_WARNING_THRESHOLD_MS) {
        await this.sendCookieWarning(userId, soonestExpiry, false);
        const message = `Tu sesión manual de AliExpress caduca el ${this.formatDate(soonestExpiry)}.`;
        await this.updateStatusMessage(userId, currentStatus, message);

        return {
          status: 'healthy',
          expiresAt: soonestExpiry,
          manualRequired: false,
          message,
        };
      }

      return {
        status: 'healthy',
        expiresAt: soonestExpiry,
        manualRequired: false,
      };
    } catch (error) {
      logger.warn('AliExpressAuthMonitor: error evaluating cookie health', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      return {
        status: 'healthy',
        manualRequired: false,
      };
    }
  }

  private async handleMissingCookies(
    userId: number,
    currentStatus?: MarketplaceAuthState,
    options: { reason?: string } = {}
  ): Promise<CookieHealthDecision> {
    const message =
      options.reason ||
      'No encontramos cookies manuales vigentes para AliExpress. Debes subir nuevas cookies para continuar.';

    const session = await ManualAuthService.startSession(userId, 'aliexpress', DEFAULT_MANUAL_LOGIN_URL);
    await marketplaceAuthStatusService.setStatus(userId, 'aliexpress', 'manual_required', {
      message,
      requiresManual: true,
    });

    if (this.shouldSendCookieNotification(userId, 'expired')) {
      await notificationService.sendToUser(userId, {
        type: 'USER_ACTION',
        title: 'Necesitamos tus cookies de AliExpress',
        message,
        priority: 'HIGH',
        category: 'USER',
        actions: [
          {
            id: 'open_manual_login',
            label: 'Actualizar cookies',
            url: `/manual-login/${session.token}`,
            variant: 'primary',
          },
          {
            id: 'open_api_settings',
            label: 'Ver instrucciones',
            url: '/app/api-settings',
            variant: 'secondary',
          },
        ],
        data: {
          provider: 'aliexpress',
          expiresAt: null,
          sessionToken: session.token,
        },
      });
    }

    return {
      status: 'missing',
      manualRequired: true,
      message,
    };
  }

  private async handleExpiredCookies(
    userId: number,
    expiresAt: Date,
    currentStatus?: MarketplaceAuthState
  ): Promise<CookieHealthDecision> {
    const message = `Las cookies manuales de AliExpress expiraron el ${this.formatDate(
      expiresAt
    )}. Debes ingresar nuevamente.`;
    const session = await ManualAuthService.startSession(userId, 'aliexpress', DEFAULT_MANUAL_LOGIN_URL);

    await marketplaceAuthStatusService.setStatus(userId, 'aliexpress', 'manual_required', {
      message,
      requiresManual: true,
    });

    if (this.shouldSendCookieNotification(userId, 'expired')) {
      await notificationService.sendToUser(userId, {
        type: 'USER_ACTION',
        title: 'Las cookies de AliExpress caducaron',
        message,
        priority: 'URGENT',
        category: 'USER',
        actions: [
          {
            id: 'open_manual_login',
            label: 'Actualizar cookies ahora',
            url: `/manual-login/${session.token}`,
            variant: 'primary',
          },
          {
            id: 'view_instructions',
            label: 'Ver instrucciones',
            url: '/app/api-settings',
            variant: 'secondary',
          },
        ],
        data: {
          provider: 'aliexpress',
          expiresAt: expiresAt.toISOString(),
          sessionToken: session.token,
        },
      });
    }

    return {
      status: 'expired',
      expiresAt,
      manualRequired: true,
      message,
    };
  }

  private shouldSendCookieNotification(userId: number, kind: CookieNotificationKind): boolean {
    const now = Date.now();
    const record = this.cookieAlerts.get(userId) ?? {};
    const lastTimestamp =
      kind === 'warning' ? record.warningSentAt ?? 0 : record.expiredSentAt ?? 0;
    const cooldown = kind === 'warning' ? COOKIE_WARNING_COOLDOWN_MS : COOKIE_EXPIRED_COOLDOWN_MS;

    if (now - lastTimestamp < cooldown) {
      return false;
    }

    if (kind === 'warning') {
      record.warningSentAt = now;
    } else {
      record.expiredSentAt = now;
    }

    this.cookieAlerts.set(userId, record);
    return true;
  }

  private getSoonestCookieExpiry(cookies: Array<Record<string, any>>): Date | null {
    let soonest: number | null = null;

    for (const cookie of cookies) {
      const expiry = this.resolveCookieExpiry(cookie);
      if (!expiry) {
        continue;
      }

      if (soonest === null || expiry < soonest) {
        soonest = expiry;
      }
    }

    return soonest ? new Date(soonest) : null;
  }

  private resolveCookieExpiry(cookie: Record<string, any>): number | null {
    if (!cookie) {
      return null;
    }

    const candidates = [
      cookie.expires,
      cookie.expirationDate,
      cookie.expiry,
      cookie.expire,
      cookie.expireAt,
    ];

    for (const candidate of candidates) {
      if (!candidate && candidate !== 0) {
        continue;
      }

      if (typeof candidate === 'number') {
        if (candidate <= 0) {
          continue;
        }

        // Chrome exports expirationDate in seconds
        if (candidate < 1_000_000_000_000) {
          return candidate * 1000;
        }
        return candidate;
      }

      if (typeof candidate === 'string') {
        const parsed = Date.parse(candidate);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private async sendCookieWarning(userId: number, expiresAt: Date, urgent: boolean): Promise<void> {
    const shouldSend = this.shouldSendCookieNotification(userId, 'warning');
    if (!shouldSend) {
      return;
    }

    const message = urgent
      ? `Tus cookies de AliExpress caducarán en menos de ${COOKIE_CRITICAL_THRESHOLD_HOURS} horas.`
      : `Tus cookies de AliExpress caducarán el ${this.formatDate(expiresAt)}.`;

    await notificationService.sendToUser(userId, {
      type: urgent ? 'USER_ACTION' : 'SYSTEM_ALERT',
      title: urgent ? 'Actualiza tus cookies de AliExpress' : 'Tus cookies de AliExpress caducan pronto',
      message,
      priority: urgent ? 'HIGH' : 'NORMAL',
      category: 'USER',
      actions: [
        {
          id: 'open_api_settings',
          label: 'Ver instrucciones',
          url: '/app/api-settings',
          variant: 'primary',
        },
      ],
      data: {
        provider: 'aliexpress',
        expiresAt: expiresAt.toISOString(),
        urgency: urgent ? 'urgent' : 'warning',
      },
    });
  }

  private async updateStatusMessage(
    userId: number,
    currentStatus: MarketplaceAuthState | undefined,
    message: string
  ): Promise<void> {
    const statusToPersist: MarketplaceAuthState = currentStatus ?? 'healthy';
    await marketplaceAuthStatusService.setStatus(userId, 'aliexpress', statusToPersist, {
      message,
      requiresManual: statusToPersist === 'manual_required',
    });
  }

  private formatDate(date: Date): string {
    try {
      return new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(date);
    } catch (error) {
      return date.toISOString();
    }
  }

  private async notifyUserManualRequired(userId: number, token: string, loginUrl: string) {
    try {
      await notificationService.sendToUser(userId, {
        type: 'USER_ACTION',
        title: 'Necesitamos que confirmes tu inicio de sesión en AliExpress',
        message: 'Abriremos automáticamente la ventana de autenticación para que completes el proceso. Sigue las instrucciones y vuelve a la plataforma cuando termines.',
        priority: 'HIGH',
        category: 'AUTH',
        actions: [
          { id: 'manual_login', label: 'Iniciar sesión ahora', url: `/manual-login/${token}`, variant: 'primary' },
        ],
        data: {
          provider: 'aliexpress',
          token,
          loginUrl,
        },
      } as any);
    } catch (error: any) {
      logger.warn('AliExpressAuthMonitor: failed to send manual login notification', {
        userId,
        error: error?.message || error,
      });
    }
  }
}

export const aliExpressAuthMonitor = new AliExpressAuthMonitor();

