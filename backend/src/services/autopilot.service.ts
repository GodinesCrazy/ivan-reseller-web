import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from '../config/logger';
import { stealthScrapingService } from './stealth-scraping.service';
import { autoRecoverySystem } from './auto-recovery.service';
import { apiAvailability } from './api-availability.service';
import { prisma } from '../config/database';
import { workflowConfigService } from './workflow-config.service';
import { publicationOptimizerService } from './publication-optimizer.service';
import MarketplaceService from './marketplace.service';
import { AppError, ErrorCode } from '../middleware/error.middleware';

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
  private currentUserId: number | null = null; // ✅ Usuario actual que está ejecutando el Autopilot

  constructor() {
    super();
    
    // ✅ ALTA PRIORIDAD: Inicializar MarketplaceService
    this.marketplaceService = new MarketplaceService();
    
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
   * @param userId - ID del usuario que inicia el Autopilot (OBLIGATORIO)
   */
  public async start(userId: number): Promise<void> {
    if (!userId || userId <= 0) {
      throw new Error('Autopilot: userId is required and must be greater than 0');
    }

    if (this.isRunning) {
      if (this.currentUserId === userId) {
        logger.warn('Autopilot: Already running for this user', { userId });
        return;
      } else {
        throw new Error(`Autopilot: Already running for user ${this.currentUserId}. Stop it first before starting for user ${userId}`);
      }
    }

    if (!this.config.enabled) {
      logger.warn('Autopilot: System is disabled in configuration');
      return;
    }

    // ✅ CHECK: Verify required APIs are configured
    logger.info('Autopilot: Checking API availability...', { userId });
    
    this.currentUserId = userId; // ✅ Guardar userId del usuario actual
    
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
      userId,
      cycleInterval: this.config.cycleIntervalMinutes,
      publicationMode: this.config.publicationMode
    });

    this.emit('started', { timestamp: new Date(), userId });

    // Start first cycle immediately with userId
    await this.runSingleCycle(undefined, userId);

    // Schedule recurring cycles
    this.scheduleNextCycle();
  }

  /**
   * Stop the autopilot system
   * @param userId - ID del usuario que detiene el Autopilot (opcional, para validación)
   */
  public stop(userId?: number): void {
    if (!this.isRunning) {
      logger.warn('Autopilot: Not running');
      return;
    }

    // ✅ Validar que el usuario que detiene es el mismo que lo inició (si se proporciona)
    if (userId && this.currentUserId !== userId) {
      throw new Error(`Autopilot: Cannot stop - running for user ${this.currentUserId}, not ${userId}`);
    }

    const stoppedUserId = this.currentUserId;
    this.isRunning = false;
    this.stats.currentStatus = 'idle';
    this.currentUserId = null;

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    logger.info('Autopilot: System stopped', { userId: stoppedUserId });
    this.emit('stopped', { timestamp: new Date(), userId: stoppedUserId });
  }

  /**
   * Schedule next cycle
   */
  private scheduleNextCycle(): void {
    if (!this.isRunning || !this.currentUserId) {
      return;
    }

    const intervalMs = this.config.cycleIntervalMinutes * 60 * 1000;
    
    this.cycleTimer = setTimeout(async () => {
      // ✅ Usar currentUserId del sistema cuando se ejecuta automáticamente
      await this.runSingleCycle(undefined, this.currentUserId!);
      this.scheduleNextCycle();
    }, intervalMs);

    logger.debug('Autopilot: Next cycle scheduled', {
      nextCycleIn: `${this.config.cycleIntervalMinutes} minutes`
    });
  }

  /**
   * Run a single complete cycle
   * @param query - Query de búsqueda opcional
   * @param userId - ID del usuario (OBLIGATORIO si Autopilot no está corriendo, opcional si ya está corriendo)
   * @param environment - Ambiente (sandbox/production), se obtiene del usuario si no se especifica
   */
  public async runSingleCycle(query?: string, userId?: number, environment?: 'sandbox' | 'production'): Promise<CycleResult> {
    const cycleStart = Date.now();
    
    // ✅ Obtener userId: usar el proporcionado, o el del sistema si está corriendo, o lanzar error
    let currentUserId: number;
    if (userId && userId > 0) {
      currentUserId = userId;
    } else if (this.isRunning && this.currentUserId) {
      currentUserId = this.currentUserId;
    } else {
      throw new Error('Autopilot: userId is required. Either provide userId parameter or start Autopilot first with start(userId)');
    }
    
    // ✅ Obtener environment del usuario si no se especifica
    let userEnvironment: 'sandbox' | 'production';
    if (environment) {
      userEnvironment = environment;
    } else {
      try {
        userEnvironment = await workflowConfigService.getUserEnvironment(currentUserId);
      } catch (error: any) {
        logger.warn('Autopilot: Could not get user environment, defaulting to sandbox', {
          userId: currentUserId,
          error: error?.message || String(error)
        });
        userEnvironment = 'sandbox';
      }
    }
    
    try {
      this.stats.currentStatus = 'running';
      this.emit('cycle:started', { timestamp: new Date(), query });

      logger.info('Autopilot: Starting new cycle', { query, userId: currentUserId, environment: userEnvironment });

      // 1. Select optimal query
      const selectedQuery = query || this.selectOptimalQuery();
      const category = this.getQueryCategory(selectedQuery);

      logger.info('Autopilot: Selected query', { query: selectedQuery, category, userId: currentUserId });

      // 2. Check available capital (con userId)
      const availableCapital = await this.getAvailableCapital(currentUserId);
      
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

      // ✅ Verificar etapa ANALYZE
      const analyzeMode = await workflowConfigService.getStageMode(currentUserId, 'analyze');
      if (analyzeMode === 'manual') {
        logger.info('Autopilot: Etapa ANALYZE en modo manual - pausando', { userId: currentUserId });
        return {
          success: false,
          message: 'Etapa ANALYZE en modo manual - requiere acción del usuario',
          category,
          query: selectedQuery,
          opportunitiesFound: 0,
          opportunitiesProcessed: 0,
          productsPublished: 0,
          productsApproved: 0,
          capitalUsed: 0,
          errors: ['ANALYZE stage is in manual mode'],
          timestamp: new Date()
        };
      }

      // 3. Search opportunities (con userId y environment)
      const opportunities = await this.searchOpportunities(selectedQuery, currentUserId, userEnvironment);

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

      // ✅ Verificar etapa PUBLISH
      const publishMode = await workflowConfigService.getStageMode(currentUserId, 'publish');
      if (publishMode === 'manual') {
        logger.info('Autopilot: Etapa PUBLISH en modo manual - pausando', { userId: currentUserId });
        return {
          success: true,
          message: 'Etapa PUBLISH en modo manual - oportunidades encontradas pero no publicadas',
          category,
          query: selectedQuery,
          opportunitiesFound: opportunities.length,
          opportunitiesProcessed: affordable.length,
          productsPublished: 0,
          productsApproved: 0,
          capitalUsed: capitalReserved,
          timestamp: new Date()
        };
      }

      // 5. Process opportunities (con userId y environment)
      const { published, approved } = await this.processOpportunities(affordable, currentUserId, userEnvironment, publishMode);

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
   * ✅ Search for opportunities using stealth scraping (con userId y environment)
   * @param query - Query de búsqueda
   * @param userId - ID del usuario (OBLIGATORIO)
   * @param environment - Ambiente (sandbox/production)
   */
  private async searchOpportunities(query: string, userId: number, environment?: 'sandbox' | 'production'): Promise<Opportunity[]> {
    if (!userId || userId <= 0) {
      throw new Error('searchOpportunities: userId is required and must be greater than 0');
    }
    
    try {
      // Build AliExpress search URL
      const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}&SortType=total_tranpro_desc`;
      
      // ✅ USAR SERVICIO REAL DE OPORTUNIDADES (con userId y environment)
      // Usar opportunity-finder service que hace scraping real
      const opportunityFinder = await import('./opportunity-finder.service');
      const foundItems = await opportunityFinder.default.findOpportunities(userId, {
        query,
        maxItems: this.config.maxOpportunitiesPerCycle,
        marketplaces: [this.config.targetMarketplace as 'ebay' | 'amazon' | 'mercadolibre'],
        region: 'us'
      });

      // Convertir items encontrados al formato Opportunity
      const opportunities: Opportunity[] = foundItems.map((item: any) => ({
        id: item.productId,
        title: item.title,
        url: item.aliexpressUrl,
        price: item.costUsd,
        estimatedCost: item.costUsd,
        estimatedProfit: (item.suggestedPriceUsd - item.costUsd) * (1 - item.profitMargin),
        roi: item.roiPercentage,
        category: this.getQueryCategory(query),
        images: item.image ? [item.image] : [],
        description: `Producto encontrado: ${item.title}`,
        rating: 0,
        orders: 0
      }));

      logger.info('Autopilot: Found real opportunities', { count: opportunities.length, query });

      return opportunities;

    } catch (error) {
      logger.error('Autopilot: Error searching opportunities', { error, query });
      return [];
    }
  }

  /**
   * Calculate estimated profit
   */
  /**
   * @deprecated Use financial-calculations.service.ts calculateProfit instead
   * Mantenido para compatibilidad
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
   * ✅ Get available working capital (con userId - desde UserWorkflowConfig)
   * @param userId - ID del usuario (OBLIGATORIO)
   */
  private async getAvailableCapital(userId: number): Promise<number> {
    if (!userId || userId <= 0) {
      throw new Error('getAvailableCapital: userId is required and must be greater than 0');
    }
    
    try {
      // ✅ Obtener capital del usuario desde UserWorkflowConfig
      const totalCapital = await workflowConfigService.getWorkingCapital(userId);

      // ✅ Get pending orders cost del usuario
      const pendingOrders = await prisma.sale.findMany({
        where: {
          userId: userId,
          status: {
            in: ['PENDING', 'PROCESSING']
          }
        }
      });

      const pendingCost = pendingOrders.reduce((sum, order) => 
        sum + (order.aliexpressCost || 0), 0
      );

      // ✅ Get approved but not published products del usuario
      const approvedProducts = await prisma.product.findMany({
        where: {
          userId: userId,
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
   * ✅ Process opportunities - publish or send to approval (con userId, environment y modo)
   */
  private async processOpportunities(
    opportunities: Opportunity[],
    userId: number,
    environment?: 'sandbox' | 'production',
    publishMode?: 'manual' | 'automatic' | 'guided'
  ): Promise<{ published: number; approved: number }> {
    if (!userId || userId <= 0) {
      throw new Error('processOpportunities: userId is required and must be greater than 0');
    }
    
    let published = 0;
    let approved = 0;
    const currentUserId = userId;
    const currentEnvironment = environment || 'sandbox';
    const currentPublishMode = publishMode || this.config.publicationMode;

    for (const opp of opportunities) {
      try {
        // ✅ Verificar modo de publicación
        if (currentPublishMode === 'automatic') {
          // Auto-publish to marketplace
          const result = await this.publishToMarketplace(opp, currentUserId, currentEnvironment);
          if (result.success) {
            published++;
            logger.info('Autopilot: Product published automatically', {
              title: opp.title
            });
          }
        } else if (currentPublishMode === 'guided') {
          // ✅ GUIDED MODE: Notificar y esperar confirmación antes de publicar
          const { notificationService } = await import('./notification.service');
          const actionId = `guided_publish_${opp.url}_${Date.now()}`;
          
          await notificationService.sendToUser(currentUserId, {
            type: 'USER_ACTION',
            category: 'PRODUCT', // ✅ FIX: Changed from 'ACTION_REQUIRED' to valid type
            title: 'Publicación guiada - Confirmación requerida',
            message: `Producto "${opp.title.substring(0, 50)}..." está listo para publicar. ¿Deseas proceder ahora? (Se publicará automáticamente en 5 minutos si no respondes)`,
            priority: 'HIGH',
            category: 'PRODUCT',
            data: {
              opportunity: opp,
              stage: 'publish',
              mode: 'guided',
              actionId,
              userId: currentUserId,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutos
            },
            actions: [
              { 
                id: `${actionId}_confirm`, 
                label: '✅ Confirmar y Publicar', 
                action: 'confirm_publish_guided', 
                variant: 'primary' 
              },
              { 
                id: `${actionId}_cancel`, 
                label: '❌ Cancelar', 
                action: 'cancel_publish_guided', 
                variant: 'danger' 
              }
            ]
          });

          // Programar publicación automática después de timeout
          setTimeout(async () => {
            // Verificar si ya se procesó
            const product = await prisma.product.findFirst({
              where: {
                userId: currentUserId,
                aliexpressUrl: opp.url
              }
            });

            if (!product || !product.isPublished) {
              // No hubo respuesta, publicar automáticamente
              logger.info('Autopilot: Guided publish - No response, executing automatically after timeout', {
                title: opp.title
              });
              const result = await this.publishToMarketplace(opp, currentUserId, currentEnvironment);
              if (result.success) {
                published++;
              }
            }
          }, 5 * 60 * 1000); // 5 minutos

          approved++; // Se cuenta como aprobado (pendiente de confirmación)
          logger.info('Autopilot: Product sent to guided approval', {
            title: opp.title
          });
        } else if (currentPublishMode === 'manual') {
          // ✅ Send to manual approval queue (con userId)
          await this.sendToApprovalQueue(opp, currentUserId);
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
   * ✅ Publish opportunity to marketplace (con userId y environment)
   * @param userId - ID del usuario (OBLIGATORIO)
   */
  private async publishToMarketplace(opportunity: Opportunity, userId: number, environment?: 'sandbox' | 'production'): Promise<{ success: boolean }> {
    if (!userId || userId <= 0) {
      throw new Error('publishToMarketplace: userId is required and must be greater than 0');
    }
    
    try {
      const currentUserId = userId;
      const currentEnvironment = environment || 'sandbox';
      
      // ✅ Verificar etapa PUBLISH antes de publicar
      const publishMode = await workflowConfigService.getStageMode(currentUserId, 'publish');
      if (publishMode === 'manual') {
        logger.info('Autopilot: Publicación en modo manual - enviando a cola de aprobación', { userId: currentUserId });
        await this.sendToApprovalQueue(opportunity, currentUserId);
        return { success: false }; // No publica, pero envía a aprobación
      }
      
      // ✅ Calcular tiempo óptimo de publicación basado en capital de trabajo
      const optimization = await publicationOptimizerService.calculateOptimalPublicationDuration(
        currentUserId,
        opportunity.estimatedCost,
        opportunity.estimatedProfit
      );

      logger.info('Autopilot: Publication duration optimized', {
        userId: currentUserId,
        productCost: opportunity.estimatedCost,
        durationDays: optimization.durationDays,
        reasoning: optimization.reasoning
      });

      // ✅ BAJA PRIORIDAD: Validar datos de oportunidad con Zod schema
      try {
        OpportunitySchema.parse(opportunity);
      } catch (validationError: any) {
        if (validationError instanceof z.ZodError) {
          logger.error('Autopilot: Invalid opportunity data (Zod validation)', { 
            service: 'autopilot',
            userId: currentUserId,
            errors: validationError.errors,
            opportunity
          });
          throw new AppError(
            'Invalid opportunity data: validation failed',
            400,
            ErrorCode.VALIDATION_ERROR,
            {
              validationErrors: validationError.errors,
              received: opportunity
            }
          );
        }
        throw validationError;
      }

      // ✅ P7: Validar que suggestedPrice sea mayor que aliexpressPrice antes de crear producto
      const calculatedSuggestedPrice = opportunity.estimatedCost * 2;
      if (calculatedSuggestedPrice <= opportunity.estimatedCost) {
        logger.error('Autopilot: Invalid price calculation, suggestedPrice must be greater than aliexpressPrice', {
          service: 'autopilot',
          userId: currentUserId,
          aliexpressPrice: opportunity.estimatedCost,
          suggestedPrice: calculatedSuggestedPrice,
          opportunityTitle: opportunity.title
        });
        throw new AppError(
          `Invalid price: suggested price (${calculatedSuggestedPrice}) must be greater than AliExpress price (${opportunity.estimatedCost}) to generate profit.`,
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      // ✅ LÍMITE DE PRODUCTOS PENDIENTES: Validar antes de crear
      const { pendingProductsLimitService } = await import('./pending-products-limit.service');
      await pendingProductsLimitService.ensurePendingLimitNotExceeded(currentUserId, false);

      // ✅ Usar transacción para crear producto y listing de forma atómica
      const product = await prisma.$transaction(async (tx) => {
        // Create product in database (con userId del usuario)
        // ✅ RESILIENCIA: Intentar crear producto con currency, si falla (migración no ejecutada), intentar sin currency
        let newProduct;
        try {
          newProduct = await tx.product.create({
            data: {
              userId: currentUserId, // ✅ Usar userId del usuario
              title: opportunity.title,
              description: opportunity.description || '',
              aliexpressUrl: opportunity.url,
              aliexpressPrice: opportunity.estimatedCost,
              suggestedPrice: calculatedSuggestedPrice,
              currency: (opportunity as any).currency || 'USD', // ✅ Guardar moneda original (si está disponible)
              category: opportunity.category,
              images: JSON.stringify(opportunity.images || []),
              productData: JSON.stringify({
                ...opportunity,
                optimalPublicationDuration: optimization.durationDays,
                optimizationReasoning: optimization.reasoning
              }),
              status: 'PENDING', // ✅ Cambiar a PENDING inicialmente
              isPublished: false, // ✅ Cambiar a false hasta que se publique exitosamente
            }
          });
        } catch (error: any) {
          // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
          if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
            logger.warn('[AUTOPILOT] Currency field not found in database, creating product without currency field (migration may not be executed)', {
              error: error?.message?.substring(0, 200),
              userId: currentUserId
            });
            // Intentar sin el campo currency
            newProduct = await tx.product.create({
              data: {
                userId: currentUserId,
                title: opportunity.title,
                description: opportunity.description || '',
                aliexpressUrl: opportunity.url,
                aliexpressPrice: opportunity.estimatedCost,
                suggestedPrice: calculatedSuggestedPrice,
                // currency: omitido temporalmente hasta que se ejecute la migración
                category: opportunity.category,
                images: JSON.stringify(opportunity.images || []),
                productData: JSON.stringify({
                  ...opportunity,
                  optimalPublicationDuration: optimization.durationDays,
                  optimizationReasoning: optimization.reasoning
                }),
                status: 'PENDING',
                isPublished: false,
              }
            });
          } else {
            // Re-lanzar el error si no es por currency
            throw error;
          }
        }

        // ✅ Crear registro de oportunidad para tracking
        await tx.opportunity.create({
          data: {
            userId: currentUserId,
            sourceMarketplace: 'aliexpress',
            title: opportunity.title,
            costUsd: opportunity.estimatedCost,
            suggestedPriceUsd: opportunity.estimatedCost * 2,
            profitMargin: ((opportunity.estimatedCost * 2 - opportunity.estimatedCost) / opportunity.estimatedCost) * 100,
            roiPercentage: ((opportunity.estimatedProfit / opportunity.estimatedCost) * 100),
            confidenceScore: opportunity.confidence || 50,
            status: 'PENDING'
          }
        });

        return newProduct;
      });

      // ✅ CRÍTICO: Si analyze está en modo automatic, aprobar automáticamente el producto
      // Esto permite que el workflow avance de ANALYZE a PUBLISH
      const analyzeMode = await workflowConfigService.getStageMode(currentUserId, 'analyze');
      if (analyzeMode === 'automatic') {
        try {
          const { productService } = await import('./product.service');
          await productService.updateProductStatusSafely(
            product.id,
            'APPROVED',
            currentUserId,
            'Autopilot: Aprobación automática (analyze en modo automatic)'
          );
          
          logger.info('Autopilot: Producto aprobado automáticamente', {
            productId: product.id,
            userId: currentUserId,
            analyzeMode
          });
        } catch (approveError: any) {
          logger.error('Autopilot: Error aprobando producto automáticamente', {
            productId: product.id,
            userId: currentUserId,
            error: approveError?.message || String(approveError)
          });
          // No fallar el flujo si la aprobación automática falla
        }
      }

      // ✅ Programar despublicación automática basada en tiempo óptimo
      await publicationOptimizerService.scheduleAutoUnpublish(
        currentUserId,
        product.id,
        optimization.durationDays
      );

      // ✅ P4: Validar credenciales antes de intentar publicar
      const marketplace = this.config.targetMarketplace as 'ebay' | 'mercadolibre' | 'amazon';
      
      // Validar que las credenciales existan y sean válidas
      try {
        const credentials = await this.marketplaceService.getCredentials(
          currentUserId,
          marketplace,
          currentEnvironment
        );
        
        if (!credentials || !credentials.isActive) {
          logger.warn('Autopilot: Missing or inactive credentials, skipping publication', {
            service: 'autopilot',
            userId: currentUserId,
            productId: product.id,
            marketplace,
            environment: currentEnvironment
          });
          
          // Enviar notificación al usuario sobre credenciales faltantes
          const { notificationService } = await import('./notification.service');
          notificationService.sendToUser(currentUserId, {
            type: 'SYSTEM_ALERT', // ✅ FIX: Changed from 'WARNING' to valid type
            title: 'Autopilot: Publicación omitida',
            message: `No se pudo publicar producto en ${marketplace} porque faltan credenciales válidas. Por favor, configura tus credenciales en Settings → API Settings.`,
            priority: 'NORMAL',
            category: 'SYSTEM', // ✅ FIX: Changed from 'AUTOPILOT' to valid category
            data: { productId: product.id, marketplace, environment: currentEnvironment }
          });
          
          // Mantener producto en APPROVED sin publicar
          return { success: false };
        }
        
        // Verificar issues con las credenciales
        if (credentials.issues && credentials.issues.length > 0) {
          logger.warn('Autopilot: Credentials have issues, skipping publication', {
            service: 'autopilot',
            userId: currentUserId,
            productId: product.id,
            marketplace,
            environment: currentEnvironment,
            issues: credentials.issues
          });
          
          // Enviar notificación al usuario sobre problemas con credenciales
          const { notificationService } = await import('./notification.service');
          notificationService.sendToUser(currentUserId, {
            type: 'SYSTEM_ALERT', // ✅ FIX: Changed from 'WARNING' to valid type
            title: 'Autopilot: Publicación omitida',
            message: `No se pudo publicar producto en ${marketplace} debido a problemas con las credenciales: ${credentials.issues.join(', ')}. Por favor, revisa tus credenciales en Settings → API Settings.`,
            priority: 'NORMAL',
            category: 'SYSTEM', // ✅ FIX: Changed from 'AUTOPILOT' to valid category
            data: { productId: product.id, marketplace, environment: currentEnvironment, issues: credentials.issues }
          });
          
          return { success: false };
        }
      } catch (credError: any) {
        logger.error('Autopilot: Error validating credentials', {
          service: 'autopilot',
          userId: currentUserId,
          productId: product.id,
          marketplace,
          environment: currentEnvironment,
          error: credError.message
        });
        return { success: false };
      }
      
      // ✅ ALTA PRIORIDAD: Integrar MarketplaceService para publicar automáticamente
      try {
        const publishResult = await this.marketplaceService.publishProduct(currentUserId, {
          productId: product.id,
          marketplace,
          customData: {
            categoryId: opportunity.category,
            price: opportunity.estimatedCost * 2,
            quantity: 1,
            title: opportunity.title,
            description: opportunity.description
          }
        }, currentEnvironment);

        if (publishResult.success) {
          // ✅ CORREGIDO: Usar función helper para sincronizar estado e isPublished
          const { productService } = await import('./product.service');
          await productService.updateProductStatusSafely(
            product.id,
            'PUBLISHED',
            true,
            currentUserId
          );
          
          // Actualizar productData con información de publicación
          await prisma.product.update({
            where: { id: product.id },
            data: {
              productData: JSON.stringify({
                ...JSON.parse(product.productData || '{}'),
                marketplaceListingId: publishResult.listingId,
                marketplaceListingUrl: publishResult.listingUrl,
                publishedAt: new Date().toISOString()
              })
            }
          });

          logger.info('Autopilot: Product published to marketplace successfully', {
            service: 'autopilot',
            userId: currentUserId,
            productId: product.id,
            marketplace,
            listingId: publishResult.listingId,
            environment: currentEnvironment
          });
        } else {
          logger.warn('Autopilot: Failed to publish product to marketplace', {
            service: 'autopilot',
            userId: currentUserId,
            productId: product.id,
            marketplace,
            error: publishResult.error,
            environment: currentEnvironment
          });
          
          // ✅ CORREGIDO: Mantener producto en APPROVED si falla la publicación (no revertir a PENDING)
          // Si falla la publicación pero el producto ya estaba aprobado, mantener APPROVED
          // Solo revertir a PENDING si el producto nunca fue aprobado
          const { productService } = await import('./product.service');
          const currentStatus = product.status;
          const newStatus = currentStatus === 'APPROVED' ? 'APPROVED' : 'PENDING';
          
          await productService.updateProductStatusSafely(
            product.id,
            newStatus,
            false, // No está publicado si falló
            currentUserId
          );
          
          // Actualizar productData con información del error
          await prisma.product.update({
            where: { id: product.id },
            data: {
              productData: JSON.stringify({
                ...JSON.parse(product.productData || '{}'),
                publishError: publishResult.error,
                publishAttemptedAt: new Date().toISOString()
              })
            }
          });
        }
      } catch (publishError: any) {
        logger.error('Autopilot: Error publishing product to marketplace', {
          service: 'autopilot',
          userId: currentUserId,
          productId: product.id,
          marketplace: this.config.targetMarketplace,
          error: publishError?.message || String(publishError),
          environment: currentEnvironment
        });

        // Mantener producto en PENDING si hay error
        await prisma.product.update({
          where: { id: product.id },
          data: { 
            status: 'PENDING',
            productData: JSON.stringify({
              ...JSON.parse(product.productData || '{}'),
              publishError: publishError?.message || String(publishError),
              publishAttemptedAt: new Date().toISOString()
            })
          }
        });
      }

      this.emit('product:published', { 
        productId: product.id, 
        opportunity,
        publicationDuration: optimization.durationDays
      });

      return { success: true };
    } catch (error) {
      logger.error('Autopilot: Error publishing to marketplace', { error });
      return { success: false };
    }
  }

  /**
   * ✅ Send opportunity to manual approval queue (con userId)
   * @param userId - ID del usuario (OBLIGATORIO)
   */
  private async sendToApprovalQueue(opportunity: Opportunity, userId: number): Promise<void> {
    if (!userId || userId <= 0) {
      throw new Error('sendToApprovalQueue: userId is required and must be greater than 0');
    }
    
    try {
      const currentUserId = userId;
      
      // ✅ P7: Validar que suggestedPrice sea mayor que aliexpressPrice antes de crear producto
      const calculatedSuggestedPrice = opportunity.estimatedCost * 2;
      if (calculatedSuggestedPrice <= opportunity.estimatedCost) {
        logger.error('Autopilot: Invalid price calculation in sendToApprovalQueue, suggestedPrice must be greater than aliexpressPrice', {
          service: 'autopilot',
          userId: currentUserId,
          aliexpressPrice: opportunity.estimatedCost,
          suggestedPrice: calculatedSuggestedPrice,
          opportunityTitle: opportunity.title
        });
        throw new AppError(
          `Invalid price: suggested price (${calculatedSuggestedPrice}) must be greater than AliExpress price (${opportunity.estimatedCost}) to generate profit.`,
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }
      
      // ✅ CORRECCIÓN: Status debe ser 'PENDING' para que aparezca en cola de aprobación
      // ✅ RESILIENCIA: Intentar crear producto con currency, si falla (migración no ejecutada), intentar sin currency
      let product;
      try {
        product = await prisma.product.create({
          data: {
            userId: currentUserId, // ✅ Usar userId del usuario
            title: opportunity.title,
            description: opportunity.description || '',
            aliexpressUrl: opportunity.url,
            aliexpressPrice: opportunity.estimatedCost,
            suggestedPrice: calculatedSuggestedPrice,
            currency: (opportunity as any).currency || 'USD', // ✅ Guardar moneda original (si está disponible)
            category: opportunity.category,
            images: JSON.stringify(opportunity.images || []),
            productData: JSON.stringify({
              ...opportunity,
              source: 'autopilot',
              queuedAt: new Date().toISOString(),
              queuedBy: 'autopilot-system'
            }),
            status: 'PENDING', // ✅ Cambiado de 'APPROVED' a 'PENDING'
            isPublished: false
          }
        });
      } catch (error: any) {
        // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
        if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
          logger.warn('[AUTOPILOT] Currency field not found in database, creating product without currency field (migration may not be executed)', {
            error: error?.message?.substring(0, 200),
            userId: currentUserId
          });
          // Intentar sin el campo currency
          product = await prisma.product.create({
            data: {
              userId: currentUserId,
              title: opportunity.title,
              description: opportunity.description || '',
              aliexpressUrl: opportunity.url,
              aliexpressPrice: opportunity.estimatedCost,
              suggestedPrice: calculatedSuggestedPrice,
              // currency: omitido temporalmente hasta que se ejecute la migración
              category: opportunity.category,
              images: JSON.stringify(opportunity.images || []),
              productData: JSON.stringify({
                ...opportunity,
                source: 'autopilot',
                queuedAt: new Date().toISOString(),
                queuedBy: 'autopilot-system'
              }),
              status: 'PENDING',
              isPublished: false
            }
          });
        } else {
          // Re-lanzar el error si no es por currency
          throw error;
        }
      }

      // ✅ CRÍTICO: Si analyze está en modo automatic, aprobar automáticamente el producto
      // Esto permite que el workflow avance de ANALYZE a PUBLISH
      const analyzeMode = await workflowConfigService.getStageMode(currentUserId, 'analyze');
      if (analyzeMode === 'automatic') {
        try {
          const { productService } = await import('./product.service');
          await productService.updateProductStatusSafely(
            product.id,
            'APPROVED',
            currentUserId,
            'Autopilot: Aprobación automática (analyze en modo automatic)'
          );
          
          logger.info('Autopilot: Producto aprobado automáticamente en sendToApprovalQueue', {
            productId: product.id,
            userId: currentUserId,
            analyzeMode
          });
        } catch (approveError: any) {
          logger.error('Autopilot: Error aprobando producto automáticamente en sendToApprovalQueue', {
            productId: product.id,
            userId: currentUserId,
            error: approveError?.message || String(approveError)
          });
          // No fallar el flujo si la aprobación automática falla
        }
      }

      logger.info('Autopilot: Product sent to approval queue', {
        productId: product.id,
        title: opportunity.title,
        userId: currentUserId,
        estimatedCost: opportunity.estimatedCost,
        estimatedProfit: opportunity.estimatedProfit,
        analyzeMode
      });

      // ✅ MEJORA: Enviar notificación al usuario
      try {
        const { notificationService } = await import('./notification.service');
        notificationService.sendToUser(currentUserId, {
          type: 'USER_ACTION',
          title: 'Producto pendiente de aprobación',
          message: `El producto "${opportunity.title}" ha sido enviado a la cola de aprobación. Profit estimado: $${opportunity.estimatedProfit.toFixed(2)}`,
          priority: 'NORMAL', // ✅ FIX: Changed from 'MEDIUM' to valid priority
          data: {
            productId: product.id,
            userId: currentUserId,
            estimatedProfit: opportunity.estimatedProfit,
            estimatedROI: opportunity.roi
          },
          actions: [
            {
              id: 'view_product',
              label: 'Ver producto',
              action: `view_product:${product.id}`,
              variant: 'primary',
              url: `/publisher`
            }
          ]
        });
      } catch (notifError: any) {
        logger.warn('Autopilot: Failed to send notification', {
          error: notifError?.message || String(notifError),
          productId: product.id
        });
      }

      this.emit('product:queued', { 
        productId: product.id,
        opportunity,
        userId: currentUserId
      });

    } catch (error) {
      logger.error('Autopilot: Error sending to approval queue', { 
        error,
        userId,
        opportunityTitle: opportunity.title
      });
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
