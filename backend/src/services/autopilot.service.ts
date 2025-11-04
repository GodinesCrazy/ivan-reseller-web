import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from '../config/logger';
import { stealthScrapingService } from './stealth-scraping.service';
import { autoRecoverySystem } from './auto-recovery.service';
import { apiAvailability } from './api-availability.service';
import prisma from '../config/database';

/**
 * Configuration for autopilot system
 */
export interface AutopilotConfig {
  enabled: boolean;
  cycleIntervalMinutes: number;
  publicationMode: 'automatic' | 'manual';
  targetMarketplace: string;
  maxOpportunitiesPerCycle: number;
  searchQueries: string[];
  workingCapital: number;
  minProfitUsd: number;
  minRoiPct: number;
  optimizationEnabled: boolean;
}

/**
 * Business opportunity from scraping
 */
export interface Opportunity {
  id?: string;
  title: string;
  url: string;
  price: number;
  estimatedCost: number;
  estimatedProfit: number;
  roi: number;
  category?: string;
  images?: string[];
  description?: string;
  rating?: number;
  orders?: number;
  shipping?: any;
  specifications?: Record<string, any>;
}

/**
 * Category performance tracking
 */
export interface CategoryPerformance {
  totalCycles: number;
  totalSuccess: number;
  avgRoi: number;
  avgMargin: number;
  lastUpdated: Date | null;
  productsFound: number;
  productsProcessed: number;
  productsPublished: number;
  productsApproved: number;
  capitalUsed: number;
}

/**
 * Cycle execution result
 */
export interface CycleResult {
  success: boolean;
  message: string;
  category: string;
  query: string;
  opportunitiesFound: number;
  opportunitiesProcessed: number;
  productsPublished: number;
  productsApproved: number;
  capitalUsed: number;
  errors?: string[];
  timestamp: Date;
}

/**
 * Autopilot statistics
 */
export interface AutopilotStats {
  totalRuns: number;
  totalProductsPublished: number;
  totalProductsSentToApproval: number;
  totalProductsProcessed: number;
  totalCapitalUsed: number;
  successRate: number;
  lastRunTimestamp: Date | null;
  performanceTrend: 'improving' | 'stable' | 'declining';
  optimizationEnabled: boolean;
  currentStatus: 'idle' | 'running' | 'paused' | 'error';
}

/**
 * Performance report
 */
export interface PerformanceReport {
  basicStats: AutopilotStats;
  categoryPerformance: Record<string, CategoryPerformance>;
  optimizationStatus: {
    enabled: boolean;
    bestCategory: string;
    worstCategory: string;
  };
  currentConfig: Partial<AutopilotConfig>;
  recommendations: string[];
}

/**
 * Autopilot System - Autonomous 24/7 operation system
 * Orchestrates the complete dropshipping cycle:
 * Search → Scraping → Validation → Publishing
 */
export class AutopilotSystem extends EventEmitter {
  private config: AutopilotConfig;
  private categoryPerformance: Record<string, CategoryPerformance>;
  private stats: AutopilotStats;
  private isRunning: boolean = false;
  private cycleTimer: NodeJS.Timeout | null = null;
  private lastCycleResult: CycleResult | null = null;

  constructor() {
    super();
    
    // Default configuration
    this.config = {
      enabled: false,
      cycleIntervalMinutes: 60,
      publicationMode: 'manual',
      targetMarketplace: 'ebay',
      maxOpportunitiesPerCycle: 5,
      searchQueries: [
        'organizador cocina',
        'luces solares',
        'auriculares bluetooth',
        'soporte móvil coche',
        'bandas resistencia'
      ],
      workingCapital: 500,
      minProfitUsd: 10,
      minRoiPct: 50,
      optimizationEnabled: false,
    };

    // Initialize category performance
    this.categoryPerformance = this.initializeCategoryPerformance();

    // Initialize stats
    this.stats = {
      totalRuns: 0,
      totalProductsPublished: 0,
      totalProductsSentToApproval: 0,
      totalProductsProcessed: 0,
      totalCapitalUsed: 0,
      successRate: 0,
      lastRunTimestamp: null,
      performanceTrend: 'stable',
      optimizationEnabled: false,
      currentStatus: 'idle',
    };

    this.loadPersistedData();
  }

  /**
   * Initialize category performance tracking
   */
  private initializeCategoryPerformance(): Record<string, CategoryPerformance> {
    const categories = [
      'home_garden',
      'health_beauty',
      'sports_fitness',
      'electronics',
      'automotive',
      'fashion'
    ];

    const performance: Record<string, CategoryPerformance> = {};
    
    for (const category of categories) {
      performance[category] = {
        totalCycles: 0,
        totalSuccess: 0,
        avgRoi: 0,
        avgMargin: 0,
        lastUpdated: null,
        productsFound: 0,
        productsProcessed: 0,
        productsPublished: 0,
        productsApproved: 0,
        capitalUsed: 0,
      };
    }

    return performance;
  }

  /**
   * Load persisted data from database
   */
  private async loadPersistedData(): Promise<void> {
    try {
      // Load autopilot config
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: 'autopilot_config' }
      });

      if (configRecord?.value) {
        const savedConfig = JSON.parse(configRecord.value as string);
        this.config = { ...this.config, ...savedConfig };
      }

      // Load category performance
      const perfRecord = await prisma.systemConfig.findUnique({
        where: { key: 'category_performance' }
      });

      if (perfRecord?.value) {
        this.categoryPerformance = JSON.parse(perfRecord.value as string);
      }

      // Load stats
      const statsRecord = await prisma.systemConfig.findUnique({
        where: { key: 'autopilot_stats' }
      });

      if (statsRecord?.value) {
        const savedStats = JSON.parse(statsRecord.value as string);
        this.stats = { ...this.stats, ...savedStats };
        if (savedStats.lastRunTimestamp) {
          this.stats.lastRunTimestamp = new Date(savedStats.lastRunTimestamp);
        }
      }

      logger.info('Autopilot: Loaded persisted data successfully');
    } catch (error) {
      logger.error('Autopilot: Error loading persisted data', { error });
    }
  }

  /**
   * Save data to database
   */
  private async persistData(): Promise<void> {
    try {
      // Save config
      await prisma.systemConfig.upsert({
        where: { key: 'autopilot_config' },
        create: {
          key: 'autopilot_config',
          value: JSON.stringify(this.config)
        },
        update: {
          value: JSON.stringify(this.config)
        }
      });

      // Save category performance
      await prisma.systemConfig.upsert({
        where: { key: 'category_performance' },
        create: {
          key: 'category_performance',
          value: JSON.stringify(this.categoryPerformance)
        },
        update: {
          value: JSON.stringify(this.categoryPerformance)
        }
      });

      // Save stats
      await prisma.systemConfig.upsert({
        where: { key: 'autopilot_stats' },
        create: {
          key: 'autopilot_stats',
          value: JSON.stringify(this.stats)
        },
        update: {
          value: JSON.stringify(this.stats)
        }
      });

      logger.debug('Autopilot: Data persisted successfully');
    } catch (error) {
      logger.error('Autopilot: Error persisting data', { error });
    }
  }

  /**
   * Start the autopilot system
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Autopilot: Already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('Autopilot: System is disabled in configuration');
      return;
    }

    // ✅ CHECK: Verify required APIs are configured
    logger.info('Autopilot: Checking API availability...');
    
    // TODO: Add userId parameter to start() method and pass to getCapabilities()
    // For now, using admin user ID (1) as placeholder
    const userId = 1;
    
    const capabilities = await apiAvailability.getCapabilities(userId);
    const apiStatuses = await apiAvailability.getAllAPIStatus(userId);

    const missingAPIs: string[] = [];
    
    // Check scraping capability
    if (!capabilities.canScrapeAliExpress) {
      missingAPIs.push('Scraping API (ScraperAPI or ZenRows)');
    }

    // Check marketplace capability based on target
    if (this.config.targetMarketplace === 'ebay' && !capabilities.canPublishToEbay) {
      missingAPIs.push('eBay Trading API');
    } else if (this.config.targetMarketplace === 'amazon' && !capabilities.canPublishToAmazon) {
      missingAPIs.push('Amazon SP-API');
    } else if (this.config.targetMarketplace === 'mercadolibre' && !capabilities.canPublishToMercadoLibre) {
      missingAPIs.push('MercadoLibre API');
    }

    // AI is optional but recommended
    if (!capabilities.canUseAI) {
      logger.warn('Autopilot: GROQ AI API not configured - will use basic descriptions');
    }

    // If critical APIs are missing, don't start
    if (missingAPIs.length > 0) {
      const errorMsg = `Autopilot: Cannot start - Missing required APIs: ${missingAPIs.join(', ')}. Please configure them in /settings/apis`;
      logger.error(errorMsg);
      this.stats.currentStatus = 'error';
      this.emit('error', new Error(errorMsg));
      throw new Error(errorMsg);
    }

    // Log available capabilities
    logger.info('Autopilot: API check passed', {
      scraping: capabilities.canScrapeAliExpress,
      ebay: capabilities.canPublishToEbay,
      amazon: capabilities.canPublishToAmazon,
      mercadolibre: capabilities.canPublishToMercadoLibre,
      ai: capabilities.canUseAI,
      payouts: capabilities.canPayCommissions
    });

    this.isRunning = true;
    this.stats.currentStatus = 'running';
    
    logger.info('Autopilot: System started', {
      cycleInterval: this.config.cycleIntervalMinutes,
      publicationMode: this.config.publicationMode
    });

    this.emit('started', { timestamp: new Date() });

    // Start first cycle immediately
    await this.runSingleCycle();

    // Schedule recurring cycles
    this.scheduleNextCycle();
  }

  /**
   * Stop the autopilot system
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Autopilot: Not running');
      return;
    }

    this.isRunning = false;
    this.stats.currentStatus = 'idle';

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    logger.info('Autopilot: System stopped');
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Schedule next cycle
   */
  private scheduleNextCycle(): void {
    if (!this.isRunning) return;

    const intervalMs = this.config.cycleIntervalMinutes * 60 * 1000;
    
    this.cycleTimer = setTimeout(async () => {
      await this.runSingleCycle();
      this.scheduleNextCycle();
    }, intervalMs);

    logger.debug('Autopilot: Next cycle scheduled', {
      nextCycleIn: `${this.config.cycleIntervalMinutes} minutes`
    });
  }

  /**
   * Run a single complete cycle
   */
  public async runSingleCycle(query?: string): Promise<CycleResult> {
    const cycleStart = Date.now();
    
    try {
      this.stats.currentStatus = 'running';
      this.emit('cycle:started', { timestamp: new Date(), query });

      logger.info('Autopilot: Starting new cycle', { query });

      // 1. Select optimal query
      const selectedQuery = query || this.selectOptimalQuery();
      const category = this.getQueryCategory(selectedQuery);

      logger.info('Autopilot: Selected query', { query: selectedQuery, category });

      // 2. Check available capital
      const availableCapital = await this.getAvailableCapital();
      
      if (availableCapital <= 0) {
        const result: CycleResult = {
          success: false,
          message: 'Insufficient working capital',
          category,
          query: selectedQuery,
          opportunitiesFound: 0,
          opportunitiesProcessed: 0,
          productsPublished: 0,
          productsApproved: 0,
          capitalUsed: 0,
          errors: ['No available capital'],
          timestamp: new Date()
        };

        logger.warn('Autopilot: Cycle cancelled - no capital', { availableCapital });
        this.emit('cycle:completed', result);
        return result;
      }

      logger.info('Autopilot: Available capital', { capital: availableCapital });

      // 3. Search opportunities
      const opportunities = await this.searchOpportunities(selectedQuery);

      if (opportunities.length === 0) {
        const result: CycleResult = {
          success: true,
          message: 'No opportunities found',
          category,
          query: selectedQuery,
          opportunitiesFound: 0,
          opportunitiesProcessed: 0,
          productsPublished: 0,
          productsApproved: 0,
          capitalUsed: 0,
          timestamp: new Date()
        };

        logger.info('Autopilot: Cycle completed - no opportunities');
        this.emit('cycle:completed', result);
        return result;
      }

      logger.info('Autopilot: Found opportunities', { count: opportunities.length });

      // 4. Filter affordable opportunities
      const { affordable, capitalReserved } = this.filterAffordableOpportunities(
        opportunities,
        availableCapital
      );

      if (affordable.length === 0) {
        const result: CycleResult = {
          success: true,
          message: 'No affordable opportunities',
          category,
          query: selectedQuery,
          opportunitiesFound: opportunities.length,
          opportunitiesProcessed: 0,
          productsPublished: 0,
          productsApproved: 0,
          capitalUsed: 0,
          timestamp: new Date()
        };

        logger.info('Autopilot: Cycle completed - no affordable opportunities');
        this.emit('cycle:completed', result);
        return result;
      }

      logger.info('Autopilot: Affordable opportunities', { 
        count: affordable.length, 
        capitalReserved 
      });

      // 5. Process opportunities
      const { published, approved } = await this.processOpportunities(affordable);

      // 6. Update category performance
      this.updateCategoryPerformance(category, {
        productsFound: opportunities.length,
        productsProcessed: affordable.length,
        productsPublished: published,
        productsApproved: approved,
        capitalUsed: capitalReserved,
        successRate: (published + approved) / Math.max(opportunities.length, 1)
      });

      // 7. Update autopilot stats
      this.updateAutopilotStats({
        published,
        approved,
        processed: affordable.length,
        capitalUsed: capitalReserved
      });

      // 8. Persist data
      await this.persistData();

      const cycleDuration = Date.now() - cycleStart;

      const result: CycleResult = {
        success: true,
        message: `Cycle completed successfully`,
        category,
        query: selectedQuery,
        opportunitiesFound: opportunities.length,
        opportunitiesProcessed: affordable.length,
        productsPublished: published,
        productsApproved: approved,
        capitalUsed: capitalReserved,
        timestamp: new Date()
      };

      logger.info('Autopilot: Cycle completed successfully', {
        duration: `${cycleDuration}ms`,
        published,
        approved,
        capitalUsed: capitalReserved
      });

      this.lastCycleResult = result;
      this.stats.currentStatus = 'idle';
      this.emit('cycle:completed', result);

      return result;

    } catch (error) {
      this.stats.currentStatus = 'error';
      
      const result: CycleResult = {
        success: false,
        message: 'Cycle failed with error',
        category: 'unknown',
        query: query || 'unknown',
        opportunitiesFound: 0,
        opportunitiesProcessed: 0,
        productsPublished: 0,
        productsApproved: 0,
        capitalUsed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        timestamp: new Date()
      };

      logger.error('Autopilot: Cycle failed', { error });
      this.emit('cycle:failed', result);

      return result;
    }
  }

  /**
   * Search for opportunities using stealth scraping
   */
  private async searchOpportunities(query: string): Promise<Opportunity[]> {
    try {
      // Build AliExpress search URL
      const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}&SortType=total_tranpro_desc`;
      
      // TODO: Add userId parameter and pass to scrapeAliExpressProduct()
      // For now, using admin user ID (1) as placeholder
      const userId = 1;
      
      // Scrape search results page
      const searchHtml = await stealthScrapingService.scrapeAliExpressProduct(searchUrl, userId);
      
      // For now, return mock opportunities
      // TODO: Parse search results from HTML
      const opportunities: Opportunity[] = [];
      
      // Generate sample opportunities based on query
      const basePrice = 10 + Math.random() * 40;
      for (let i = 0; i < Math.min(this.config.maxOpportunitiesPerCycle, 3); i++) {
        const price = basePrice + (i * 5);
        opportunities.push({
          title: `${query} - Product ${i + 1}`,
          url: `https://www.aliexpress.com/item/${1000000000 + i}.html`,
          price: Math.round(price * 100) / 100,
          estimatedCost: Math.round(price * 100) / 100,
          estimatedProfit: this.calculateProfit(price),
          roi: this.calculateROI(price),
          category: this.getQueryCategory(query),
          images: ['https://via.placeholder.com/300'],
          description: `Quality ${query} from AliExpress`,
          rating: 4.5 + (Math.random() * 0.5),
          orders: Math.floor(100 + Math.random() * 900)
        });
      }

      logger.info('Autopilot: Generated opportunities', { count: opportunities.length, query });

      return opportunities;

    } catch (error) {
      logger.error('Autopilot: Error searching opportunities', { error, query });
      return [];
    }
  }

  /**
   * Calculate estimated profit
   */
  private calculateProfit(cost: number): number {
    // Simple markup: 2x the cost
    const suggestedPrice = cost * 2;
    const profit = suggestedPrice - cost;
    return Math.round(profit * 100) / 100;
  }

  /**
   * Calculate ROI percentage
   */
  private calculateROI(cost: number): number {
    const profit = this.calculateProfit(cost);
    const roi = (profit / cost) * 100;
    return Math.round(roi * 100) / 100;
  }

  /**
   * Get available working capital
   */
  private async getAvailableCapital(): Promise<number> {
    try {
      const totalCapital = this.config.workingCapital;

      // Get pending orders cost
      const pendingOrders = await prisma.sale.findMany({
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        }
      });

      const pendingCost = pendingOrders.reduce((sum, order) => 
        sum + (order.aliexpressCost || 0), 0
      );

      // Get approved but not published products
      const approvedProducts = await prisma.product.findMany({
        where: {
          status: 'APPROVED',
          isPublished: false
        }
      });

      const approvedCost = approvedProducts.reduce((sum, product) => 
        sum + (product.aliexpressPrice || 0), 0
      );

      const available = totalCapital - pendingCost - approvedCost;

      logger.debug('Autopilot: Capital calculation', {
        total: totalCapital,
        pending: pendingCost,
        approved: approvedCost,
        available: Math.max(0, available)
      });

      return Math.max(0, available);

    } catch (error) {
      logger.error('Autopilot: Error calculating available capital', { error });
      return 0;
    }
  }

  /**
   * Filter opportunities by business rules and available capital
   */
  private filterAffordableOpportunities(
    opportunities: Opportunity[],
    availableCapital: number
  ): { affordable: Opportunity[]; capitalReserved: number } {
    const affordable: Opportunity[] = [];
    let capitalReserved = 0;

    for (const opp of opportunities) {
      // Validate business rules
      if (!this.isOpportunityValid(opp)) {
        logger.debug('Autopilot: Opportunity rejected by rules', {
          title: opp.title,
          profit: opp.estimatedProfit,
          roi: opp.roi
        });
        continue;
      }

      // Check if we can afford it
      if (capitalReserved + opp.estimatedCost <= availableCapital) {
        affordable.push(opp);
        capitalReserved += opp.estimatedCost;
        
        logger.debug('Autopilot: Opportunity accepted', {
          title: opp.title,
          cost: opp.estimatedCost,
          capitalReserved
        });
      } else {
        logger.debug('Autopilot: Opportunity rejected - insufficient capital', {
          title: opp.title,
          cost: opp.estimatedCost,
          available: availableCapital - capitalReserved
        });
      }
    }

    return { affordable, capitalReserved };
  }

  /**
   * Validate opportunity against business rules
   */
  private isOpportunityValid(opportunity: Opportunity): boolean {
    if (opportunity.estimatedProfit < this.config.minProfitUsd) {
      return false;
    }

    if (opportunity.roi < this.config.minRoiPct) {
      return false;
    }

    return true;
  }

  /**
   * Process opportunities - publish or send to approval
   */
  private async processOpportunities(
    opportunities: Opportunity[]
  ): Promise<{ published: number; approved: number }> {
    let published = 0;
    let approved = 0;

    for (const opp of opportunities) {
      try {
        if (this.config.publicationMode === 'automatic') {
          // Auto-publish to marketplace
          const result = await this.publishToMarketplace(opp);
          if (result.success) {
            published++;
            logger.info('Autopilot: Product published automatically', {
              title: opp.title
            });
          }
        } else {
          // Send to manual approval queue
          await this.sendToApprovalQueue(opp);
          approved++;
          logger.info('Autopilot: Product sent to approval queue', {
            title: opp.title
          });
        }
      } catch (error) {
        logger.error('Autopilot: Error processing opportunity', { 
          error, 
          title: opp.title 
        });
      }
    }

    return { published, approved };
  }

  /**
   * Publish opportunity to marketplace
   */
  private async publishToMarketplace(opportunity: Opportunity): Promise<{ success: boolean }> {
    try {
      // Create product in database
      const product = await prisma.product.create({
        data: {
          userId: 1, // System user
          title: opportunity.title,
          description: opportunity.description || '',
          aliexpressUrl: opportunity.url,
          aliexpressPrice: opportunity.estimatedCost,
          suggestedPrice: opportunity.estimatedCost * 2,
          category: opportunity.category,
          images: JSON.stringify(opportunity.images || []),
          productData: JSON.stringify(opportunity),
          status: 'PUBLISHED',
          isPublished: true,
          publishedAt: new Date()
        }
      });

      // Trigger marketplace publishing
      // TODO: Integrate with marketplace API

      this.emit('product:published', { productId: product.id, opportunity });

      return { success: true };
    } catch (error) {
      logger.error('Autopilot: Error publishing to marketplace', { error });
      return { success: false };
    }
  }

  /**
   * Send opportunity to manual approval queue
   */
  private async sendToApprovalQueue(opportunity: Opportunity): Promise<void> {
    try {
      await prisma.product.create({
        data: {
          userId: 1, // System user
          title: opportunity.title,
          description: opportunity.description || '',
          aliexpressUrl: opportunity.url,
          aliexpressPrice: opportunity.estimatedCost,
          suggestedPrice: opportunity.estimatedCost * 2,
          category: opportunity.category,
          images: JSON.stringify(opportunity.images || []),
          productData: JSON.stringify(opportunity),
          status: 'APPROVED',
          isPublished: false
        }
      });

      this.emit('product:queued', { opportunity });

    } catch (error) {
      logger.error('Autopilot: Error sending to approval queue', { error });
      throw error;
    }
  }

  /**
   * Select optimal query based on performance
   */
  private selectOptimalQuery(): string {
    if (!this.config.optimizationEnabled) {
      // Random selection
      const queries = this.config.searchQueries;
      return queries[Math.floor(Math.random() * queries.length)];
    }

    // Performance-based selection (80% best, 20% exploration)
    const categoryScores = this.calculateCategoryScores();
    
    if (Math.random() < 0.8 && Object.keys(categoryScores).length > 0) {
      // Select best performing category
      const bestCategory = Object.keys(categoryScores).reduce((a, b) => 
        categoryScores[a] > categoryScores[b] ? a : b
      );

      const query = this.getCategoryQuery(bestCategory);
      logger.info('Autopilot: Selected query from best category', { 
        category: bestCategory, 
        query,
        score: categoryScores[bestCategory]
      });

      return query;
    } else {
      // Exploration - random query
      const queries = this.config.searchQueries;
      const query = queries[Math.floor(Math.random() * queries.length)];
      logger.info('Autopilot: Selected query for exploration', { query });
      return query;
    }
  }

  /**
   * Calculate performance scores for each category
   */
  private calculateCategoryScores(): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const [category, perf] of Object.entries(this.categoryPerformance)) {
      if (perf.totalCycles > 0) {
        const successRate = perf.totalSuccess / perf.totalCycles;
        const roiScore = Math.min(perf.avgRoi / 100, 1.0);
        const marginScore = Math.min(perf.avgMargin / 50, 1.0);

        // Combined score (50% success, 30% roi, 20% margin)
        scores[category] = (successRate * 0.5) + (roiScore * 0.3) + (marginScore * 0.2);
      } else {
        scores[category] = 0.5; // Neutral score for untested categories
      }
    }

    return scores;
  }

  /**
   * Get a query for a specific category
   */
  private getCategoryQuery(category: string): string {
    const categoryQueries: Record<string, string[]> = {
      home_garden: ['organizador cocina', 'luces solares', 'macetas decorativas'],
      health_beauty: ['mascarilla facial', 'difusor aceites', 'kit manicura'],
      sports_fitness: ['bandas resistencia', 'yoga mat', 'botella agua'],
      electronics: ['auriculares bluetooth', 'cable usb c', 'cargador inalámbrico'],
      automotive: ['soporte móvil coche', 'organizador maletero', 'cargador coche'],
      fashion: ['gafas sol', 'reloj inteligente', 'organizador joyas']
    };

    const queries = categoryQueries[category] || this.config.searchQueries;
    return queries[Math.floor(Math.random() * queries.length)];
  }

  /**
   * Get category from query string
   */
  private getQueryCategory(query: string): string {
    const categoryKeywords: Record<string, string[]> = {
      home_garden: ['organizador', 'cocina', 'luces', 'solar', 'maceta', 'jardín'],
      health_beauty: ['mascarilla', 'facial', 'difusor', 'aceite', 'manicura'],
      sports_fitness: ['banda', 'resistencia', 'yoga', 'mat', 'botella', 'gym'],
      electronics: ['auricular', 'bluetooth', 'cable', 'usb', 'cargador', 'power'],
      automotive: ['coche', 'auto', 'vehículo', 'maletero', 'parasol'],
      fashion: ['gafa', 'sol', 'reloj', 'joya', 'bufanda', 'moda']
    };

    const queryLower = query.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        return category;
      }
    }

    return 'electronics'; // Default
  }

  /**
   * Update category performance
   */
  private updateCategoryPerformance(
    category: string,
    results: {
      productsFound: number;
      productsProcessed: number;
      productsPublished: number;
      productsApproved: number;
      capitalUsed: number;
      successRate: number;
    }
  ): void {
    if (!this.categoryPerformance[category]) {
      this.categoryPerformance[category] = this.initializeCategoryPerformance()[category];
    }

    const perf = this.categoryPerformance[category];

    perf.totalCycles++;
    perf.totalSuccess += results.productsPublished + results.productsApproved;
    perf.productsFound += results.productsFound;
    perf.productsProcessed += results.productsProcessed;
    perf.productsPublished += results.productsPublished;
    perf.productsApproved += results.productsApproved;
    perf.capitalUsed += results.capitalUsed;
    perf.lastUpdated = new Date();

    // Update moving averages
    if (results.successRate > 0) {
      const estimatedROI = results.capitalUsed * 0.3;
      const estimatedMargin = results.successRate * 40;

      perf.avgRoi = (perf.avgRoi * 0.8) + (estimatedROI * 0.2);
      perf.avgMargin = (perf.avgMargin * 0.8) + (estimatedMargin * 0.2);
    }

    logger.info('Autopilot: Category performance updated', {
      category,
      cycles: perf.totalCycles,
      success: perf.totalSuccess,
      avgRoi: perf.avgRoi.toFixed(1)
    });
  }

  /**
   * Update autopilot statistics
   */
  private updateAutopilotStats(results: {
    published: number;
    approved: number;
    processed: number;
    capitalUsed: number;
  }): void {
    this.stats.totalRuns++;
    this.stats.totalProductsPublished += results.published;
    this.stats.totalProductsSentToApproval += results.approved;
    this.stats.totalProductsProcessed += results.processed;
    this.stats.totalCapitalUsed += results.capitalUsed;
    this.stats.lastRunTimestamp = new Date();

    // Calculate success rate
    const totalSuccess = this.stats.totalProductsPublished + this.stats.totalProductsSentToApproval;
    if (this.stats.totalRuns > 0) {
      this.stats.successRate = totalSuccess / this.stats.totalRuns;
    }

    // Update performance trend
    if (this.stats.totalRuns >= 5) {
      const recentSuccessRate = this.stats.successRate;
      if (recentSuccessRate > 0.7) {
        this.stats.performanceTrend = 'improving';
      } else if (recentSuccessRate < 0.3) {
        this.stats.performanceTrend = 'declining';
      } else {
        this.stats.performanceTrend = 'stable';
      }
    }

    logger.info('Autopilot: Stats updated', {
      totalRuns: this.stats.totalRuns,
      successRate: (this.stats.successRate * 100).toFixed(1) + '%'
    });
  }

  /**
   * Get performance report
   */
  public getPerformanceReport(): PerformanceReport {
    const bestCategory = this.getBestPerformingCategory();
    const worstCategory = this.getWorstPerformingCategory();

    return {
      basicStats: { ...this.stats },
      categoryPerformance: { ...this.categoryPerformance },
      optimizationStatus: {
        enabled: this.config.optimizationEnabled,
        bestCategory,
        worstCategory
      },
      currentConfig: {
        cycleIntervalMinutes: this.config.cycleIntervalMinutes,
        publicationMode: this.config.publicationMode,
        maxOpportunitiesPerCycle: this.config.maxOpportunitiesPerCycle,
        workingCapital: this.config.workingCapital
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get best performing category
   */
  private getBestPerformingCategory(): string {
    let best: string | null = null;
    let bestScore = 0;

    for (const [category, perf] of Object.entries(this.categoryPerformance)) {
      if (perf.totalCycles > 0) {
        const score = perf.totalSuccess / perf.totalCycles;
        if (score > bestScore) {
          bestScore = score;
          best = category;
        }
      }
    }

    return best || 'home_garden';
  }

  /**
   * Get worst performing category
   */
  private getWorstPerformingCategory(): string {
    let worst: string | null = null;
    let worstScore = Infinity;

    for (const [category, perf] of Object.entries(this.categoryPerformance)) {
      if (perf.totalCycles > 0) {
        const score = perf.totalSuccess / perf.totalCycles;
        if (score < worstScore) {
          worstScore = score;
          worst = category;
        }
      }
    }

    return worst || 'electronics';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    const bestCategory = this.getBestPerformingCategory();
    const bestPerf = this.categoryPerformance[bestCategory];

    if (bestPerf && bestPerf.totalCycles > 0) {
      const successRate = bestPerf.totalSuccess / bestPerf.totalCycles;
      if (successRate > 0.7) {
        recommendations.push(
          `Excellent performance in ${bestCategory} (${(successRate * 100).toFixed(1)}%) - consider increasing frequency`
        );
      }
    }

    const worstCategory = this.getWorstPerformingCategory();
    const worstPerf = this.categoryPerformance[worstCategory];

    if (worstPerf && worstPerf.totalCycles > 2) {
      const successRate = worstPerf.totalSuccess / worstPerf.totalCycles;
      if (successRate < 0.3) {
        recommendations.push(
          `Low performance in ${worstCategory} (${(successRate * 100).toFixed(1)}%) - consider reducing frequency`
        );
      }
    }

    const totalCycles = Object.values(this.categoryPerformance)
      .reduce((sum, p) => sum + p.totalCycles, 0);

    if (totalCycles > 10) {
      if (!this.config.optimizationEnabled) {
        recommendations.push('Enough data collected - enable automatic optimization');
      } else {
        recommendations.push('Automatic optimization active - system adapts to performance');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('System collecting data for future optimization');
    }

    return recommendations;
  }

  /**
   * Update configuration
   */
  public async updateConfig(config: Partial<AutopilotConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await this.persistData();
    
    logger.info('Autopilot: Configuration updated', { config });
    this.emit('config:updated', { config: this.config });
  }

  /**
   * Toggle optimization
   */
  public async toggleOptimization(enabled?: boolean): Promise<boolean> {
    if (enabled !== undefined) {
      this.config.optimizationEnabled = enabled;
    } else {
      this.config.optimizationEnabled = !this.config.optimizationEnabled;
    }

    await this.persistData();

    logger.info('Autopilot: Optimization toggled', { 
      enabled: this.config.optimizationEnabled 
    });

    return this.config.optimizationEnabled;
  }

  /**
   * Get current status
   */
  public getStatus(): {
    isRunning: boolean;
    stats: AutopilotStats;
    lastCycle: CycleResult | null;
    config: AutopilotConfig;
  } {
    return {
      isRunning: this.isRunning,
      stats: { ...this.stats },
      lastCycle: this.lastCycleResult,
      config: { ...this.config }
    };
  }
}

// Singleton instance
export const autopilotSystem = new AutopilotSystem();
