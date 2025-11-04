import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import prisma from '../config/database';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Learning Database Structure
 */
export interface LearningData {
  productPatterns: Record<string, any>;
  salesFeedback: SaleFeedback[];
  learningStats: LearningStats;
  metadata: {
    version: string;
    createdAt: string;
    lastUpdated: string;
  };
}

/**
 * Sale Feedback for Learning
 */
export interface SaleFeedback {
  timestamp: string;
  productSku: string;
  salePrice: number;
  profitMargin: number;
  aiPredictionScore: number;
  actualSuccess: boolean;
  category?: string;
  marketplace?: string;
  daysToSell?: number;
}

/**
 * Learning Statistics
 */
export interface LearningStats {
  totalProductsAnalyzed: number;
  successfulSales: number;
  failedPredictions: number;
  accuracyRate: number;
  lastOptimization: string | null;
  optimizationCount: number;
  patterns: Record<string, any>;
}

/**
 * Product Features for Prediction
 */
export interface ProductFeatures {
  price: number;
  profit: number;
  aiScore: number;
  category?: string;
  rating?: number;
  orders?: number;
}

/**
 * Learned Patterns
 */
export interface LearnedPatterns {
  priceRange?: {
    best: string;
    successRate: number;
  };
  category?: {
    best: string;
    successRate: number;
  };
  keywords?: {
    best: string[];
    successRate: number;
  };
  marketplace?: {
    best: string;
    successRate: number;
  };
  timing?: {
    bestDayOfWeek: string;
    bestHourOfDay: number;
  };
}

/**
 * AI Learning System
 * 
 * Continuous learning system that:
 * - Tracks sales performance
 * - Learns from successful/failed products
 * - Identifies profitable patterns
 * - Optimizes prediction accuracy
 * - Provides data-driven recommendations
 */
export class AILearningSystem extends EventEmitter {
  private learningData: LearningData;
  private dbPath: string;
  private optimizationInterval: number = 3600000; // 1 hour
  private lastOptimization: number = 0;
  private isInitialized: boolean = false;

  constructor() {
    super();
    
    this.dbPath = path.join(process.cwd(), 'data', 'learning_db.json');
    this.learningData = this.createDefaultData();
    
    this.initialize();
  }

  /**
   * Initialize the learning system
   */
  private async initialize(): Promise<void> {
    try {
      await this.loadLearningData();
      this.isInitialized = true;
      
      logger.info('AI Learning System: Initialized successfully');
      this.emit('initialized', { timestamp: new Date() });
    } catch (error) {
      logger.error('AI Learning System: Initialization failed', { error });
      this.emit('initialization:failed', { error });
    }
  }

  /**
   * Create default learning data structure
   */
  private createDefaultData(): LearningData {
    return {
      productPatterns: {},
      salesFeedback: [],
      learningStats: {
        totalProductsAnalyzed: 0,
        successfulSales: 0,
        failedPredictions: 0,
        accuracyRate: 0.0,
        lastOptimization: null,
        optimizationCount: 0,
        patterns: {}
      },
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Load learning data from file
   */
  private async loadLearningData(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to read existing data
      try {
        const fileContent = await fs.readFile(this.dbPath, 'utf-8');
        this.learningData = JSON.parse(fileContent);
        
        // Validate and migrate if necessary
        this.learningData = this.validateAndMigrate(this.learningData);
        
        logger.info('AI Learning System: Data loaded from file', {
          feedbackCount: this.learningData.salesFeedback.length
        });
      } catch (error) {
        // File doesn't exist or is corrupt, use default data
        logger.info('AI Learning System: Creating new learning database');
        this.learningData = this.createDefaultData();
        await this.saveLearningData();
      }
    } catch (error) {
      logger.error('AI Learning System: Error loading data', { error });
      throw error;
    }
  }

  /**
   * Validate and migrate data structure
   */
  private validateAndMigrate(data: any): LearningData {
    const defaultData = this.createDefaultData();

    // Merge with defaults
    const migrated: LearningData = {
      productPatterns: data.productPatterns || defaultData.productPatterns,
      salesFeedback: data.salesFeedback || defaultData.salesFeedback,
      learningStats: {
        ...defaultData.learningStats,
        ...data.learningStats
      },
      metadata: {
        ...defaultData.metadata,
        ...data.metadata,
        lastUpdated: new Date().toISOString()
      }
    };

    return migrated;
  }

  /**
   * Save learning data to file
   */
  private async saveLearningData(): Promise<void> {
    try {
      this.learningData.metadata.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(
        this.dbPath,
        JSON.stringify(this.learningData, null, 2),
        'utf-8'
      );

      logger.debug('AI Learning System: Data saved to file');
    } catch (error) {
      logger.error('AI Learning System: Error saving data', { error });
    }
  }

  /**
   * Learn from a sale
   */
  public async learnFromSale(saleData: {
    sku?: string;
    price: number;
    profit: number;
    aiScore: number;
    sold: boolean;
    category?: string;
    marketplace?: string;
    daysToSell?: number;
  }): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        logger.warn('AI Learning System: Not initialized yet');
        return false;
      }

      const feedback: SaleFeedback = {
        timestamp: new Date().toISOString(),
        productSku: saleData.sku || 'unknown',
        salePrice: saleData.price,
        profitMargin: saleData.profit,
        aiPredictionScore: saleData.aiScore,
        actualSuccess: saleData.sold,
        category: saleData.category,
        marketplace: saleData.marketplace,
        daysToSell: saleData.daysToSell
      };

      // Add feedback
      this.learningData.salesFeedback.push(feedback);

      // Update stats
      this.updateStats(feedback.actualSuccess);

      // Save data
      await this.saveLearningData();

      // Check if optimization is needed
      if (Date.now() - this.lastOptimization > this.optimizationInterval) {
        await this.optimizeModel();
      }

      logger.info('AI Learning System: Learned from sale', {
        success: feedback.actualSuccess,
        sku: feedback.productSku
      });

      this.emit('sale:learned', { feedback });

      return true;
    } catch (error) {
      logger.error('AI Learning System: Error learning from sale', { error });
      return false;
    }
  }

  /**
   * Update learning statistics
   */
  private updateStats(success: boolean): void {
    const stats = this.learningData.learningStats;

    stats.totalProductsAnalyzed++;

    if (success) {
      stats.successfulSales++;
    } else {
      stats.failedPredictions++;
    }

    // Calculate accuracy rate
    const total = stats.successfulSales + stats.failedPredictions;
    if (total > 0) {
      stats.accuracyRate = stats.successfulSales / total;
    }
  }

  /**
   * Optimize the learning model
   */
  private async optimizeModel(): Promise<void> {
    try {
      logger.info('AI Learning System: Starting model optimization...');

      this.emit('optimization:started', { timestamp: new Date() });

      // Extract patterns from sales feedback
      const patterns = this.extractPatterns();

      // Update learning stats
      this.learningData.learningStats.patterns = patterns;
      this.learningData.learningStats.lastOptimization = new Date().toISOString();
      this.learningData.learningStats.optimizationCount++;

      this.lastOptimization = Date.now();

      // Save updated data
      await this.saveLearningData();

      logger.info('AI Learning System: Model optimization completed', {
        patternsFound: Object.keys(patterns).length
      });

      this.emit('optimization:completed', { 
        patterns, 
        timestamp: new Date() 
      });

    } catch (error) {
      logger.error('AI Learning System: Error optimizing model', { error });
      this.emit('optimization:failed', { error });
    }
  }

  /**
   * Extract patterns from sales data
   */
  private extractPatterns(): Record<string, any> {
    const feedback = this.learningData.salesFeedback;
    const successfulSales = feedback.filter(f => f.actualSuccess);

    if (successfulSales.length < 5) {
      return {
        message: 'Insufficient data for pattern extraction'
      };
    }

    const patterns: any = {};

    // Price range pattern
    const successfulPrices = successfulSales.map(s => s.salePrice);
    const avgSuccessPrice = successfulPrices.reduce((a, b) => a + b, 0) / successfulPrices.length;
    const minPrice = Math.min(...successfulPrices);
    const maxPrice = Math.max(...successfulPrices);

    patterns.priceRange = {
      best: `$${minPrice.toFixed(0)}-$${maxPrice.toFixed(0)}`,
      average: avgSuccessPrice.toFixed(2),
      successRate: successfulSales.length / feedback.length
    };

    // Category pattern
    const categoryStats: Record<string, { success: number; total: number }> = {};
    
    for (const sale of feedback) {
      const cat = sale.category || 'unknown';
      if (!categoryStats[cat]) {
        categoryStats[cat] = { success: 0, total: 0 };
      }
      categoryStats[cat].total++;
      if (sale.actualSuccess) {
        categoryStats[cat].success++;
      }
    }

    const bestCategory = Object.keys(categoryStats).reduce((best, cat) => {
      const rate = categoryStats[cat].success / categoryStats[cat].total;
      const bestRate = categoryStats[best]?.success / categoryStats[best]?.total || 0;
      return rate > bestRate ? cat : best;
    }, Object.keys(categoryStats)[0]);

    if (bestCategory && categoryStats[bestCategory]) {
      patterns.category = {
        best: bestCategory,
        successRate: categoryStats[bestCategory].success / categoryStats[bestCategory].total
      };
    }

    // Marketplace pattern
    const marketplaceStats: Record<string, { success: number; total: number }> = {};
    
    for (const sale of feedback) {
      const mp = sale.marketplace || 'unknown';
      if (!marketplaceStats[mp]) {
        marketplaceStats[mp] = { success: 0, total: 0 };
      }
      marketplaceStats[mp].total++;
      if (sale.actualSuccess) {
        marketplaceStats[mp].success++;
      }
    }

    const bestMarketplace = Object.keys(marketplaceStats).reduce((best, mp) => {
      const rate = marketplaceStats[mp].success / marketplaceStats[mp].total;
      const bestRate = marketplaceStats[best]?.success / marketplaceStats[best]?.total || 0;
      return rate > bestRate ? mp : best;
    }, Object.keys(marketplaceStats)[0]);

    if (bestMarketplace && marketplaceStats[bestMarketplace]) {
      patterns.marketplace = {
        best: bestMarketplace,
        successRate: marketplaceStats[bestMarketplace].success / marketplaceStats[bestMarketplace].total
      };
    }

    // Profit margin pattern
    const successfulProfits = successfulSales.map(s => s.profitMargin);
    const avgProfit = successfulProfits.reduce((a, b) => a + b, 0) / successfulProfits.length;

    patterns.profitMargin = {
      average: avgProfit.toFixed(2),
      minimum: Math.min(...successfulProfits).toFixed(2),
      maximum: Math.max(...successfulProfits).toFixed(2),
      recommendation: avgProfit * 1.1 // Suggest 10% higher
    };

    // Time to sell pattern
    const salesWithTime = successfulSales.filter(s => s.daysToSell);
    if (salesWithTime.length > 0) {
      const avgDaysToSell = salesWithTime.reduce((sum, s) => sum + (s.daysToSell || 0), 0) / salesWithTime.length;
      
      patterns.timing = {
        averageDaysToSell: avgDaysToSell.toFixed(1),
        recommendation: avgDaysToSell < 7 ? 'Fast-moving products' : 'Consider inventory turnover'
      };
    }

    return patterns;
  }

  /**
   * Calculate enhanced opportunity score
   */
  public calculateOpportunityScore(product: ProductFeatures): number {
    const baseScore = product.aiScore || 50;

    // Apply learned patterns if available
    const patterns = this.learningData.learningStats.patterns;

    let adjustedScore = baseScore;

    // Price adjustment
    if (patterns.priceRange) {
      const avgPrice = parseFloat(patterns.priceRange.average);
      if (Math.abs(product.price - avgPrice) < avgPrice * 0.2) {
        adjustedScore += 10; // Within 20% of successful average
      }
    }

    // Category adjustment
    if (patterns.category && product.category === patterns.category.best) {
      adjustedScore += patterns.category.successRate * 15;
    }

    // Profit adjustment
    if (patterns.profitMargin) {
      const recommendedProfit = parseFloat(patterns.profitMargin.recommendation);
      if (product.profit >= recommendedProfit) {
        adjustedScore += 10;
      }
    }

    // Normalize to 0-100
    return Math.min(Math.max(adjustedScore, 0), 100);
  }

  /**
   * Predict success probability
   */
  public predictSuccessProbability(product: ProductFeatures): number {
    const score = this.calculateOpportunityScore(product);
    const accuracy = this.learningData.learningStats.accuracyRate;

    // Combine score with historical accuracy
    const probability = (score / 100) * (0.7 + accuracy * 0.3);

    return Math.min(Math.max(probability, 0), 1);
  }

  /**
   * Get learning statistics
   */
  public getLearningStats(): LearningStats {
    return { ...this.learningData.learningStats };
  }

  /**
   * Get learned patterns
   */
  public getLearnedPatterns(): LearnedPatterns {
    const patterns = this.learningData.learningStats.patterns;

    if (this.learningData.learningStats.successfulSales < 5) {
      return {};
    }

    return {
      priceRange: patterns.priceRange,
      category: patterns.category,
      marketplace: patterns.marketplace,
      keywords: patterns.keywords,
      timing: patterns.timing
    };
  }

  /**
   * Get recent feedback
   */
  public getRecentFeedback(limit: number = 10): SaleFeedback[] {
    return this.learningData.salesFeedback.slice(-limit);
  }

  /**
   * Force model optimization
   */
  public async forceOptimization(): Promise<void> {
    logger.info('AI Learning System: Forcing model optimization...');
    await this.optimizeModel();
  }

  /**
   * Reset learning data
   */
  public async resetLearning(): Promise<void> {
    logger.warn('AI Learning System: Resetting learning data...');

    this.learningData = this.createDefaultData();
    await this.saveLearningData();

    logger.info('AI Learning System: Learning data reset to initial state');
    this.emit('reset', { timestamp: new Date() });
  }

  /**
   * Get learning insights
   */
  public getLearningInsights(): {
    totalSales: number;
    successRate: number;
    averageAccuracy: number;
    topPatterns: string[];
    recommendations: string[];
  } {
    const stats = this.learningData.learningStats;
    const patterns = stats.patterns;

    const recommendations: string[] = [];

    // Generate recommendations based on patterns
    if (patterns.priceRange) {
      recommendations.push(
        `Focus on products in the ${patterns.priceRange.best} price range (${(patterns.priceRange.successRate * 100).toFixed(1)}% success rate)`
      );
    }

    if (patterns.category) {
      recommendations.push(
        `Prioritize ${patterns.category.best} category (${(patterns.category.successRate * 100).toFixed(1)}% success rate)`
      );
    }

    if (patterns.marketplace) {
      recommendations.push(
        `${patterns.marketplace.best} shows best performance (${(patterns.marketplace.successRate * 100).toFixed(1)}% success rate)`
      );
    }

    if (stats.successfulSales < 20) {
      recommendations.push('Continue collecting data to improve prediction accuracy');
    }

    if (stats.accuracyRate < 0.7) {
      recommendations.push('Model accuracy is below 70% - consider adjusting business rules');
    }

    return {
      totalSales: stats.totalProductsAnalyzed,
      successRate: stats.accuracyRate,
      averageAccuracy: stats.accuracyRate * 100,
      topPatterns: Object.keys(patterns),
      recommendations
    };
  }

  /**
   * Export learning data
   */
  public async exportData(): Promise<string> {
    return JSON.stringify(this.learningData, null, 2);
  }

  /**
   * Import learning data
   */
  public async importData(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData);
      this.learningData = this.validateAndMigrate(data);
      await this.saveLearningData();

      logger.info('AI Learning System: Data imported successfully');
      this.emit('data:imported', { timestamp: new Date() });

      return true;
    } catch (error) {
      logger.error('AI Learning System: Error importing data', { error });
      return false;
    }
  }
}

// Singleton instance
export const aiLearningSystem = new AILearningSystem();
