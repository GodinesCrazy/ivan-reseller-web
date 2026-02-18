import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

console.log('[ENV CHECK]', {
  SCRAPERAPI_KEY: !!process.env.SCRAPERAPI_KEY,
  ZENROWS_API_KEY: !!process.env.ZENROWS_API_KEY,
  EBAY_APP_ID: !!process.env.EBAY_APP_ID,
});

import { autopilotSystem } from './services/autopilot.service';
import { logger } from './config/logger';

/**
 * Initialize Autopilot System
 * 
 * This file handles the startup and configuration of the autonomous
 * 24/7 autopilot system that manages the complete dropshipping cycle:
 * Search → Scraping → Validation → Publishing
 */

/**
 * Initialize autopilot with default configuration
 */
const DEFAULT_AUTOPILOT_CONFIG = {
  enabled: false,
  cycleIntervalMinutes: 60,
  publicationMode: 'manual' as const,
  targetMarketplace: 'ebay',
  maxOpportunitiesPerCycle: 5,
  workingCapital: 500,
  minProfitUsd: 10,
  minRoiPct: 50,
  optimizationEnabled: false,
  searchQueries: [
    'organizador cocina',
    'luces solares jardin',
    'macetas decorativas',
    'mascarilla facial',
    'difusor aceites esenciales',
    'bandas resistencia fitness',
    'yoga mat antideslizante',
    'auriculares bluetooth',
    'cable usb c',
    'cargador inalambrico',
    'soporte movil coche',
    'organizador maletero',
    'gafas sol polarizadas',
    'reloj inteligente'
  ]
};

// ✅ FIX: Prevent double initialization
let AUTOPILOT_INIT_EXECUTED = false;

export async function initializeAutopilot(): Promise<void> {
  if (AUTOPILOT_INIT_EXECUTED) {
    console.log('[AUTOPILOT_INIT] Already executed, skipping');
    return;
  }
  AUTOPILOT_INIT_EXECUTED = true;
  
  try {
    logger.info('Autopilot: Initializing system...');

    // Load persisted config from DB; only apply defaults if none saved (do not overwrite live config)
    const { prisma } = await import('./config/database');
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: 'autopilot_config' },
    });
    let configLoaded = false;
    if (configRecord?.value) {
      try {
        const saved = JSON.parse(configRecord.value as string) as Record<string, unknown>;
        if (Object.keys(saved).length > 0) {
          await autopilotSystem.updateConfig(saved);
          console.log('Autopilot: Loaded persisted config (enabled=' + saved.enabled + ')');
          logger.info('Autopilot: Loaded persisted config (enabled=%s, cycleInterval=%s min)', saved.enabled, saved.cycleIntervalMinutes);
          setupEventListeners();
          configLoaded = true;
        }
      } catch {
        // fallback to defaults
      }
    }
    if (!configLoaded) {
      await autopilotSystem.updateConfig(DEFAULT_AUTOPILOT_CONFIG);
      setupEventListeners();
      logger.info('Autopilot: System initialized with defaults (enable via API or activate-live-profit-mode)');
    }

    const cfg = autopilotSystem.getStatus().config as { enabled?: boolean };
    if (cfg?.enabled) {
      const firstUser = await prisma.user.findFirst({
        where: { isActive: true, paypalPayoutEmail: { not: null } },
        select: { id: true },
      });
      if (firstUser) {
        console.log('[AUTOPILOT_START_TRIGGERED]', firstUser.id);
        await autopilotSystem.start(firstUser.id);
      }
    }
    logger.info('Autopilot: System initialized successfully');

  } catch (error) {
    logger.error('Autopilot: Failed to initialize', { error });
    throw error;
  }
}

/**
 * Setup event listeners for autopilot system
 */
function setupEventListeners(): void {
  // Cycle started
  autopilotSystem.on('started', (data) => {
    logger.info('Autopilot: System started', data);
  });

  // Cycle stopped
  autopilotSystem.on('stopped', (data) => {
    logger.info('Autopilot: System stopped', data);
  });

  // Cycle started
  autopilotSystem.on('cycle:started', (data) => {
    logger.info('Autopilot: Cycle started', data);
  });

  // Cycle completed
  autopilotSystem.on('cycle:completed', (result) => {
    logger.info('Autopilot: Cycle completed', {
      success: result.success,
      category: result.category,
      opportunitiesFound: result.opportunitiesFound,
      opportunitiesProcessed: result.opportunitiesProcessed,
      productsPublished: result.productsPublished,
      productsApproved: result.productsApproved,
      capitalUsed: result.capitalUsed
    });
  });

  // Cycle failed
  autopilotSystem.on('cycle:failed', (result) => {
    logger.error('Autopilot: Cycle failed', {
      message: result.message,
      errors: result.errors
    });
  });

  // Product published
  autopilotSystem.on('product:published', (data) => {
    logger.info('Autopilot: Product published automatically', {
      productId: data.productId,
      title: data.opportunity.title
    });
  });

  // Product queued for approval
  autopilotSystem.on('product:queued', (data) => {
    logger.info('Autopilot: Product queued for approval', {
      title: data.opportunity.title
    });
  });

  // Configuration updated
  autopilotSystem.on('config:updated', (data) => {
    logger.info('Autopilot: Configuration updated', { config: data.config });
  });

  logger.info('Autopilot: Event listeners registered');
}

/**
 * Start the autopilot system (uses first active user with PayPal email as runner)
 */
export async function startAutopilot(): Promise<void> {
  try {
    const { prisma } = await import('./config/database');
    const firstUser = await prisma.user.findFirst({
      where: { isActive: true, paypalPayoutEmail: { not: null } },
      select: { id: true },
    });
    if (!firstUser) {
      logger.warn('Autopilot: Cannot start - no active user with paypalPayoutEmail');
      return;
    }
    await autopilotSystem.start(firstUser.id);
    logger.info('Autopilot: System started successfully', { userId: firstUser.id });
  } catch (error) {
    logger.error('Autopilot: Failed to start', { error });
    throw error;
  }
}

/**
 * Stop the autopilot system
 */
export function stopAutopilot(): void {
  try {
    autopilotSystem.stop();
    logger.info('Autopilot: System stopped successfully');
  } catch (error) {
    logger.error('Autopilot: Failed to stop', { error });
    throw error;
  }
}

/**
 * Get autopilot status
 */
export function getAutopilotStatus() {
  return autopilotSystem.getStatus();
}

/**
 * Get performance report
 */
export function getPerformanceReport() {
  return autopilotSystem.getPerformanceReport();
}

/**
 * Run single cycle manually
 */
export async function runSingleCycle(query?: string) {
  try {
    logger.info('Autopilot: Running single cycle manually', { query });
    const result = await autopilotSystem.runSingleCycle(query);
    logger.info('Autopilot: Single cycle completed', { result });
    return result;
  } catch (error) {
    logger.error('Autopilot: Single cycle failed', { error });
    throw error;
  }
}

/**
 * Update autopilot configuration
 */
export async function updateAutopilotConfig(config: any) {
  try {
    await autopilotSystem.updateConfig(config);
    logger.info('Autopilot: Configuration updated', { config });
  } catch (error) {
    logger.error('Autopilot: Failed to update configuration', { error });
    throw error;
  }
}

/**
 * Toggle optimization
 */
export async function toggleOptimization(enabled?: boolean) {
  try {
    const result = await autopilotSystem.toggleOptimization(enabled);
    logger.info('Autopilot: Optimization toggled', { enabled: result });
    return result;
  } catch (error) {
    logger.error('Autopilot: Failed to toggle optimization', { error });
    throw error;
  }
}

/**
 * Shutdown autopilot system gracefully
 */
export async function shutdownAutopilot(): Promise<void> {
  try {
    logger.info('Autopilot: Shutting down...');
    
    // Stop the system
    autopilotSystem.stop();
    
    // Remove all listeners
    autopilotSystem.removeAllListeners();
    
    logger.info('Autopilot: Shutdown complete');
  } catch (error) {
    logger.error('Autopilot: Error during shutdown', { error });
    throw error;
  }
}
