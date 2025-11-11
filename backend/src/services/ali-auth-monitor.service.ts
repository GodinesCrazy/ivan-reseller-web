import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AdvancedMarketplaceScraper } from './advanced-scraper.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import { marketplaceAuthStatusService } from './marketplace-auth-status.service';
import ManualAuthService from './manual-auth.service';
import notificationService from './notification.service';

interface RefreshOptions {
  force?: boolean;
  reason?: string;
}

const REFRESH_INTERVAL_MS = parseInt(process.env.ALIEXPRESS_REFRESH_INTERVAL_MS || '', 10) || 30 * 60 * 1000;
const ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const HEALTH_REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000;

class AliExpressAuthMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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

