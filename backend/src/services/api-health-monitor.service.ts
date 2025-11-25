/**
 * API Health Monitor Service
 * Proactively monitors API health and detects issues before they affect users
 */

import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { apiAvailability } from './api-availability.service';
import { circuitBreakerManager } from './circuit-breaker.service';

export interface HealthMonitorConfig {
  checkInterval: number;        // Interval between checks (ms)
  enabled: boolean;            // Enable/disable monitoring
  checkAllUsers: boolean;      // Check all users or just active ones
  apisToMonitor: string[];     // APIs to monitor (empty = all)
}

export class APIHealthMonitorService extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private config: HealthMonitorConfig;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    super();
    this.config = {
      checkInterval: config.checkInterval ?? 15 * 60 * 1000, // 15 minutes
      enabled: config.enabled ?? true,
      checkAllUsers: config.checkAllUsers ?? false,
      apisToMonitor: config.apisToMonitor ?? [],
    };
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('API Health Monitor is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('API Health Monitor is disabled');
      return;
    }

    this.isRunning = true;
    logger.info('Starting API Health Monitor', {
      interval: `${this.config.checkInterval / 1000}s`,
      checkAllUsers: this.config.checkAllUsers,
    });

    // Perform initial check
    await this.performHealthChecks();

    // Schedule periodic checks
    this.intervalId = setInterval(
      () => this.performHealthChecks(),
      this.config.checkInterval
    );
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    logger.info('API Health Monitor stopped');
  }

  /**
   * Perform health checks for all users
   */
  private async performHealthChecks(): Promise<void> {
    try {
      logger.debug('Performing scheduled API health checks');

      // Get users to check with timeout protection
      const users = await Promise.race([
        this.getUsersToCheck(),
        new Promise<number[]>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout getting users')), 5000)
        )
      ]) as number[];
      
      if (users.length === 0) {
        logger.debug('No users to check');
        return;
      }

      logger.info(`Checking API health for ${users.length} users`);

      // ✅ FIX SIGSEGV: Serializar checks de usuarios para evitar operaciones en paralelo
      // El problema era: operaciones crypto nativas + queries Prisma + HTTP requests ejecutándose simultáneamente
      // causaban segmentation fault en Railway.
      // Solución: ejecutar checks en serie con pequeños delays entre usuarios.
      const results: PromiseSettledResult<void>[] = [];
      for (const userId of users) {
        try {
          const result = await Promise.race([
            this.checkUserAPIs(userId),
            new Promise<void>((_, reject) => 
              setTimeout(() => reject(new Error(`Timeout checking APIs for user ${userId}`)), 15000)
            )
          ]);
          results.push({ status: 'fulfilled' as const, value: result });
          // Pequeño delay entre usuarios para no saturar recursos (crypto, Prisma, HTTP)
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          results.push({ 
            status: 'rejected' as const, 
            reason: error 
          });
          logger.warn(`API health check failed for user ${userId}`, { error: error.message });
          // Continuar con el siguiente usuario incluso si falla
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Count results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info(`Health checks completed: ${successful} successful, ${failed} failed`);

      // Emit event
      this.emit('health-checks-completed', {
        total: users.length,
        successful,
        failed,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error performing health checks', { error });
      this.emit('error', error);
    }
  }

  /**
   * Get users to check
   */
  private async getUsersToCheck(): Promise<number[]> {
    if (this.config.checkAllUsers) {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return users.map(u => u.id);
    } else {
      // Only check users who have used the system recently (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { lastLoginAt: { gte: sevenDaysAgo } },
            { createdAt: { gte: sevenDaysAgo } },
          ],
        },
        select: { id: true },
        take: 100, // Limit to 100 users per check
      });
      return users.map(u => u.id);
    }
  }

  /**
   * Check APIs for a specific user
   */
  private async checkUserAPIs(userId: number): Promise<void> {
    try {
      // Get all API statuses with error handling
      let statuses;
      try {
        statuses = await apiAvailability.getAllAPIStatus(userId);
      } catch (error: any) {
        logger.warn(`Error getting API statuses for user ${userId}:`, error.message);
        return; // Skip this user if we can't get statuses
      }

      // Filter APIs to monitor if configured
      const apisToCheck = this.config.apisToMonitor.length > 0
        ? statuses.filter(s => this.config.apisToMonitor.includes(s.apiName))
        : statuses;

      // Check each API that is configured
      // ✅ FIX SIGSEGV: NO forzar health checks reales (HTTP requests) en startup
      // Solo validar credenciales sin hacer llamadas HTTP, para evitar saturar recursos
      for (const status of apisToCheck) {
        if (!status.isConfigured) {
          continue; // Skip unconfigured APIs
        }

        // ✅ NO forzar health checks reales durante monitor automático (solo validar credenciales)
        // Force health check solo se debe usar en tests manuales (/api/system/test-apis)
        try {
          let newStatus;
          
          switch (status.apiName) {
            case 'ebay':
              newStatus = await apiAvailability.checkEbayAPI(
                userId,
                status.environment || 'production',
                false // ✅ NO forzar health check real - solo validar credenciales
              );
              break;
            case 'amazon':
              newStatus = await apiAvailability.checkAmazonAPI(
                userId,
                status.environment || 'production'
              );
              break;
            case 'mercadolibre':
              newStatus = await apiAvailability.checkMercadoLibreAPI(
                userId,
                status.environment || 'production'
              );
              break;
            default:
              // For other APIs, just refresh status
              continue;
          }

          // Detect status changes
          if (newStatus && status.isAvailable !== newStatus.isAvailable) {
            this.emit('api-status-changed', {
              userId,
              apiName: status.apiName,
              environment: status.environment,
              previousStatus: status.isAvailable,
              newStatus: newStatus.isAvailable,
              error: newStatus.error,
              timestamp: new Date(),
            });

            logger.warn(`API status changed for user ${userId}`, {
              apiName: status.apiName,
              environment: status.environment,
              previous: status.isAvailable ? 'available' : 'unavailable',
              current: newStatus.isAvailable ? 'available' : 'unavailable',
              error: newStatus.error,
            });
          }
        } catch (error: any) {
          logger.warn(`Error checking ${status.apiName} for user ${userId}`, {
            error: error.message,
          });
        }
      }
    } catch (error: any) {
      logger.error(`Error checking APIs for user ${userId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get circuit breaker stats for all monitored APIs
   */
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    const breakers = circuitBreakerManager.getAllBreakers();

    for (const [name, breaker] of breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Manually trigger health checks
   */
  async triggerHealthCheck(userId?: number): Promise<void> {
    if (userId) {
      await this.checkUserAPIs(userId);
    } else {
      await this.performHealthChecks();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const apiHealthMonitor = new APIHealthMonitorService();

