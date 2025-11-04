import { autoRecoverySystem, RecoveryAction } from './services/auto-recovery.service';
import { proxyManager } from './services/proxy-manager.service';
import { selectorAdapter } from './services/selector-adapter.service';
import { logger } from './config/logger';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Initialize Auto Recovery System with all services
 */
export async function initializeAutoRecovery(): Promise<void> {
  logger.info('Initializing Auto Recovery System...');

  // Register Database Service
  autoRecoverySystem.registerService(
    'database',
    async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (error) {
        logger.error('Database health check failed:', error);
        return false;
      }
    },
    {
      type: 'database',
      provider: 'postgresql',
    }
  );

  // Register Proxy Manager Service
  autoRecoverySystem.registerService(
    'proxy_manager',
    async () => {
      try {
        const stats = proxyManager.getStats();
        // Healthy if we have at least 1 active proxy
        return stats.activeProxies > 0;
      } catch (error) {
        logger.error('Proxy Manager health check failed:', error);
        return false;
      }
    },
    {
      type: 'service',
      component: 'proxy-manager',
    }
  );

  // Register Selector Adapter Service
  autoRecoverySystem.registerService(
    'selector_adapter',
    async () => {
      try {
        const stats = selectorAdapter.getPatternStats();
        // Healthy if we have patterns loaded
        return Object.keys(stats).length > 0;
      } catch (error) {
        logger.error('Selector Adapter health check failed:', error);
        return false;
      }
    },
    {
      type: 'service',
      component: 'selector-adapter',
    }
  );

  // Register Scraper Service
  autoRecoverySystem.registerService(
    'scraper',
    async () => {
      try {
        // Check if scraping modules are available
        const { stealthScrapingService } = await import('./services/stealth-scraping.service');
        return stealthScrapingService !== undefined;
      } catch (error) {
        logger.error('Scraper health check failed:', error);
        return false;
      }
    },
    {
      type: 'service',
      component: 'scraper',
    }
  );

  // Register API Handler Service (external APIs)
  autoRecoverySystem.registerService(
    'api_handler',
    async () => {
      try {
        // Check if required API keys are present
        const groqApiKey = process.env.GROQ_API_KEY;
        const scraperApiKey = process.env.SCRAPERAPI_KEY;

        // At least one API should be configured
        return !!(groqApiKey || scraperApiKey);
      } catch (error) {
        logger.error('API Handler health check failed:', error);
        return false;
      }
    },
    {
      type: 'service',
      component: 'api-handler',
    }
  );

  // Register HTTP Server Service
  autoRecoverySystem.registerService(
    'http_server',
    async () => {
      try {
        const port = process.env.PORT || 3000;
        const response = await axios.get(`http://localhost:${port}/health`, {
          timeout: 5000,
        });
        return response.status === 200;
      } catch (error) {
        logger.debug('HTTP Server health check failed (may not be started yet)');
        return false;
      }
    },
    {
      type: 'server',
      component: 'express',
    }
  );

  // Add custom recovery rules with specific actions

  // Database reconnection rule
  autoRecoverySystem.addRecoveryRule({
    ruleId: 'database_reconnect',
    serviceName: 'database',
    condition: 'errorCount > 3',
    action: RecoveryAction.RESTART,
    maxAttempts: 5,
    cooldown: 30,
    enabled: true,
    priority: 1,
    onRecovery: async (serviceName) => {
      logger.info(`Custom recovery: reconnecting database`);
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        return true;
      } catch (error) {
        logger.error('Database reconnection failed:', error);
        return false;
      }
    },
  });

  // Proxy Manager refresh rule
  autoRecoverySystem.addRecoveryRule({
    ruleId: 'proxy_manager_refresh',
    serviceName: 'proxy_manager',
    condition: 'status === "FAILED"',
    action: RecoveryAction.RELOAD_CONFIG,
    maxAttempts: 3,
    cooldown: 60,
    enabled: true,
    priority: 2,
    onRecovery: async (serviceName) => {
      logger.info(`Custom recovery: refreshing proxy manager`);
      try {
        await proxyManager.healthCheckAll();
        return true;
      } catch (error) {
        logger.error('Proxy Manager refresh failed:', error);
        return false;
      }
    },
  });

  // Selector Adapter reload rule
  autoRecoverySystem.addRecoveryRule({
    ruleId: 'selector_adapter_reload',
    serviceName: 'selector_adapter',
    condition: 'status === "FAILED"',
    action: RecoveryAction.RELOAD_CONFIG,
    maxAttempts: 2,
    cooldown: 120,
    enabled: true,
    priority: 3,
    onRecovery: async (serviceName) => {
      logger.info(`Custom recovery: reloading selector patterns`);
      try {
        // Reset all patterns if needed
        // In a real implementation, you'd reload from file or reset
        return true;
      } catch (error) {
        logger.error('Selector Adapter reload failed:', error);
        return false;
      }
    },
  });

  // Setup event listeners
  autoRecoverySystem.on('service:recovered', (serviceName, previousStatus) => {
    logger.info(`✅ Service recovered: ${serviceName} (was ${previousStatus})`);
  });

  autoRecoverySystem.on('service:degraded', (serviceName) => {
    logger.warn(`⚠️  Service degraded: ${serviceName}`);
  });

  autoRecoverySystem.on('service:alert', (serviceName, health) => {
    logger.error(`🚨 ALERT: Service ${serviceName} has ${health.errorCount} consecutive failures`);
    // In production: send email, Slack notification, etc.
  });

  autoRecoverySystem.on('recovery:started', (serviceName, action) => {
    logger.info(`🔄 Recovery started: ${serviceName} → ${action}`);
  });

  autoRecoverySystem.on('recovery:success', (serviceName, action) => {
    logger.info(`✅ Recovery successful: ${serviceName} → ${action}`);
  });

  autoRecoverySystem.on('recovery:failed', (serviceName, action) => {
    logger.warn(`❌ Recovery failed: ${serviceName} → ${action}`);
  });

  autoRecoverySystem.on('recovery:escalate', (serviceName, health) => {
    logger.error(
      `🚨🚨 ESCALATION: Service ${serviceName} requires manual intervention!`,
      {
        errorCount: health.errorCount,
        lastError: health.lastError,
        recoveryAttempts: health.recoveryAttempts,
      }
    );
    // In production: page on-call engineer, create incident ticket, etc.
  });

  autoRecoverySystem.on('recovery:max-attempts', (serviceName, health) => {
    logger.error(
      `🛑 Max recovery attempts reached for ${serviceName}`,
      {
        maxAttempts: health.recoveryAttempts,
        lastError: health.lastError,
      }
    );
  });

  // Start the auto recovery system
  autoRecoverySystem.start();

  logger.info('✅ Auto Recovery System initialized and started');
}

/**
 * Shutdown Auto Recovery System
 */
export async function shutdownAutoRecovery(): Promise<void> {
  logger.info('Shutting down Auto Recovery System...');

  autoRecoverySystem.stop();
  autoRecoverySystem.cleanup();

  logger.info('✅ Auto Recovery System shut down');
}

/**
 * Get recovery system status
 */
export function getRecoveryStatus(): {
  running: boolean;
  stats: ReturnType<typeof autoRecoverySystem.getStats>;
  services: ReturnType<typeof autoRecoverySystem.getAllServicesHealth>;
  recentEvents: ReturnType<typeof autoRecoverySystem.getRecoveryHistory>;
} {
  return {
    running: true, // autoRecoverySystem is always running if initialized
    stats: autoRecoverySystem.getStats(),
    services: autoRecoverySystem.getAllServicesHealth(),
    recentEvents: autoRecoverySystem.getRecoveryHistory(20),
  };
}
