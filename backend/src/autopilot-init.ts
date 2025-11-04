import { autopilotSystem } from '../services/autopilot.service';
import { logger } from '../config/logger';

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
export async function initializeAutopilot(): Promise<void> {
  try {
    logger.info('Autopilot: Initializing system...');

    // Configure autopilot system
    await autopilotSystem.updateConfig({
      enabled: false, // Start disabled, enable via API
      cycleIntervalMinutes: 60, // Run every hour
      publicationMode: 'manual', // Manual approval by default
      targetMarketplace: 'ebay',
      maxOpportunitiesPerCycle: 5,
      workingCapital: 500, // $500 USD default
      minProfitUsd: 10, // Minimum $10 profit
      minRoiPct: 50, // Minimum 50% ROI
      optimizationEnabled: false, // Disable until enough data
      searchQueries: [
        // Home & Garden
        'organizador cocina',
        'luces solares jardin',
        'macetas decorativas',
        
        // Health & Beauty
        'mascarilla facial',
        'difusor aceites esenciales',
        
        // Sports & Fitness
        'bandas resistencia fitness',
        'yoga mat antideslizante',
        
        // Electronics
        'auriculares bluetooth',
        'cable usb c',
        'cargador inalambrico',
        
        // Automotive
        'soporte movil coche',
        'organizador maletero',
        
        // Fashion
        'gafas sol polarizadas',
        'reloj inteligente'
      ]
    });

    // Setup event listeners
    setupEventListeners();

    logger.info('Autopilot: System initialized successfully');
    logger.info('Autopilot: System is disabled - enable via API to start');

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
 * Start the autopilot system
 */
export async function startAutopilot(): Promise<void> {
  try {
    await autopilotSystem.start();
    logger.info('Autopilot: System started successfully');
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
