import { ceoAgent } from './services/ceo-agent.service';
import { aiLearningSystem } from './services/ai-learning.service';
import { autopilotSystem } from './services/autopilot.service';
import { logger } from './config/logger';

/**
 * Initialize CEO Agent System
 * 
 * Sets up event listeners and starts the strategic analysis cycle
 */
export async function initializeCEOAgent(): Promise<void> {
  try {
    logger.info('CEO Agent: Starting initialization...');

    // Event: Started
    ceoAgent.on('started', (data) => {
      logger.info('CEO Agent: System started', data);
    });

    // Event: Stopped
    ceoAgent.on('stopped', (data) => {
      logger.warn('CEO Agent: System stopped', data);
    });

    // Event: Analysis Started
    ceoAgent.on('analysis:started', (data) => {
      logger.info('CEO Agent: Strategic analysis started', data);
    });

    // Event: Analysis Completed
    ceoAgent.on('analysis:completed', (data) => {
      logger.info('CEO Agent: Strategic analysis completed', {
        performanceScore: data.performance.salesCount,
        decisionsCount: data.decisions.length,
        timestamp: data.timestamp
      });

      // Log AI insights
      if (data.aiInsights) {
        logger.info('CEO Agent: AI Insights received', {
          analysis: data.aiInsights.analysis.substring(0, 100) + '...',
          priority: data.aiInsights.priority
        });
      }

      // Log decisions
      data.decisions.forEach(decision => {
        logger.info('CEO Agent: Decision suggested', {
          type: decision.type,
          priority: decision.priority,
          description: decision.description
        });
      });
    });

    // Event: Analysis Failed
    ceoAgent.on('analysis:failed', (data) => {
      logger.error('CEO Agent: Strategic analysis failed', {
        error: data.error,
        timestamp: data.timestamp
      });
    });

    // Event: Decision Implemented
    ceoAgent.on('decision:implemented', (data) => {
      logger.info('CEO Agent: Decision implemented successfully', {
        type: data.decision.type,
        description: data.decision.description,
        timestamp: data.timestamp
      });
    });

    // Event: Decision Failed
    ceoAgent.on('decision:failed', (data) => {
      logger.error('CEO Agent: Decision implementation failed', {
        type: data.decision.type,
        error: data.error,
        timestamp: data.timestamp
      });
    });

    // Start CEO Agent with default configuration
    await ceoAgent.start();

    logger.info('CEO Agent: Initialization completed successfully');
  } catch (error) {
    logger.error('CEO Agent: Initialization failed', { error });
    throw error;
  }
}

/**
 * Initialize AI Learning System
 * 
 * Sets up event listeners for learning from sales
 */
export async function initializeAILearning(): Promise<void> {
  try {
    logger.info('AI Learning System: Starting initialization...');

    // Event: Initialized
    aiLearningSystem.on('initialized', (data) => {
      logger.info('AI Learning System: Initialized successfully', data);
    });

    // Event: Sale Learned
    aiLearningSystem.on('sale:learned', (data) => {
      logger.debug('AI Learning System: Learned from sale', {
        success: data.feedback.actualSuccess,
        sku: data.feedback.productSku,
        aiScore: data.feedback.aiPredictionScore
      });
    });

    // Event: Optimization Started
    aiLearningSystem.on('optimization:started', (data) => {
      logger.info('AI Learning System: Model optimization started', data);
    });

    // Event: Optimization Completed
    aiLearningSystem.on('optimization:completed', (data) => {
      logger.info('AI Learning System: Model optimization completed', {
        patternsFound: Object.keys(data.patterns).length,
        timestamp: data.timestamp
      });

      // Log learned patterns
      const patterns = data.patterns;
      if (patterns.priceRange) {
        logger.info('AI Learning System: Price pattern', {
          range: patterns.priceRange.best,
          successRate: (patterns.priceRange.successRate * 100).toFixed(1) + '%'
        });
      }

      if (patterns.category) {
        logger.info('AI Learning System: Category pattern', {
          best: patterns.category.best,
          successRate: (patterns.category.successRate * 100).toFixed(1) + '%'
        });
      }
    });

    // Event: Optimization Failed
    aiLearningSystem.on('optimization:failed', (data) => {
      logger.error('AI Learning System: Model optimization failed', {
        error: data.error
      });
    });

    // Event: Data Reset
    aiLearningSystem.on('reset', (data) => {
      logger.warn('AI Learning System: Learning data was reset', data);
    });

    // Event: Data Imported
    aiLearningSystem.on('data:imported', (data) => {
      logger.info('AI Learning System: Data imported successfully', data);
    });

    // Get current stats
    const stats = aiLearningSystem.getLearningStats();
    logger.info('AI Learning System: Current statistics', {
      totalAnalyzed: stats.totalProductsAnalyzed,
      successfulSales: stats.successfulSales,
      accuracyRate: (stats.accuracyRate * 100).toFixed(1) + '%',
      optimizations: stats.optimizationCount
    });

    // Get learned patterns
    const patterns = aiLearningSystem.getLearnedPatterns();
    if (Object.keys(patterns).length > 0) {
      logger.info('AI Learning System: Learned patterns available', {
        patterns: Object.keys(patterns)
      });
    }

    logger.info('AI Learning System: Initialization completed successfully');
  } catch (error) {
    logger.error('AI Learning System: Initialization failed', { error });
    throw error;
  }
}

/**
 * Initialize both CEO Agent and AI Learning System
 * 
 * This ensures both systems work together for optimal decision-making
 */
export async function initializeStrategicSystems(): Promise<void> {
  try {
    logger.info('Strategic Systems: Starting initialization...');

    // Initialize AI Learning first (CEO Agent depends on it)
    await initializeAILearning();

    // Then initialize CEO Agent
    await initializeCEOAgent();

    // Connect systems
    setupSystemIntegration();

    logger.info('Strategic Systems: All systems initialized and connected');
  } catch (error) {
    logger.error('Strategic Systems: Initialization failed', { error });
    throw error;
  }
}

/**
 * Setup integration between CEO Agent and AI Learning System
 */
function setupSystemIntegration(): void {
  // When AI Learning completes optimization, trigger CEO analysis
  aiLearningSystem.on('optimization:completed', async () => {
    logger.info('Strategic Systems: AI optimization completed, triggering CEO analysis...');
    
    try {
      // CEO Agent will automatically use updated learning stats
      await ceoAgent.runStrategicAnalysis();
      
      logger.info('Strategic Systems: CEO analysis triggered by AI optimization');
    } catch (error) {
      logger.error('Strategic Systems: Error triggering CEO analysis', { error });
    }
  });

  // When CEO Agent implements decisions, log to learning system
  ceoAgent.on('decision:implemented', (data) => {
    logger.info('Strategic Systems: CEO decision implemented', {
      type: data.decision.type,
      expectedImpact: data.decision.expectedImpact
    });
  });

  // Connect with Autopilot System if available
  if (autopilotSystem) {
    autopilotSystem.on('cycle:completed', async (data) => {
      // If autopilot found profitable products, learn from them
      if (data.results.opportunitiesFound > 0) {
        logger.info('Strategic Systems: Learning from autopilot opportunities', {
          count: data.results.opportunitiesFound
        });

        // This will be handled by the autopilot service when it publishes products
      }
    });
  }

  logger.info('Strategic Systems: Integration setup completed');
}

/**
 * Shutdown CEO Agent gracefully
 */
export async function shutdownCEOAgent(): Promise<void> {
  try {
    logger.info('CEO Agent: Shutting down...');
    await ceoAgent.stop();
    logger.info('CEO Agent: Shutdown completed');
  } catch (error) {
    logger.error('CEO Agent: Error during shutdown', { error });
  }
}

/**
 * Get system health status
 */
export function getSystemHealth(): {
  ceoAgent: {
    running: boolean;
    lastAnalysis: string | null;
  };
  aiLearning: {
    initialized: boolean;
    accuracy: number;
    totalSales: number;
  };
} {
  const learningStats = aiLearningSystem.getLearningStats();

  return {
    ceoAgent: {
      running: true, // Always true if initialized
      lastAnalysis: learningStats.lastOptimization
    },
    aiLearning: {
      initialized: true,
      accuracy: learningStats.accuracyRate * 100,
      totalSales: learningStats.totalProductsAnalyzed
    }
  };
}
