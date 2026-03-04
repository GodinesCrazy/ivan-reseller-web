// @ts-nocheck
import { trace } from '../utils/boot-trace';
trace('loading automated-business.service');

import { prisma } from '../config/database';
import { EbayService } from './ebay.service';
import { AIOpportunityEngine } from './ai-opportunity.service';
import { notificationService } from './notification.service';
import { AdvancedScrapingService } from './scraping.service';
import { jobService } from './job.service';
import logger from '../config/logger';

interface AutomationConfig {
  mode: 'manual' | 'automatic';
  environment: 'sandbox' | 'production';
  stages?: {
    scrape: 'manual' | 'automatic';
    analyze: 'manual' | 'automatic';
    publish: 'manual' | 'automatic';
  };
  rules: AutomationRule[];
  thresholds: {
    minProfitMargin: number;
    maxInvestment: number;
    minConfidence: number;
    maxRiskLevel: number;
  };
}

interface AutomationRule {
  id: string;
  name: string;
  type: 'pricing' | 'inventory' | 'listing' | 'purchasing' | 'fulfillment';
  condition: string;
  action: string;
  active: boolean;
  parameters: Record<string, any>;
  lastExecuted?: Date;
  executionCount: number;
  successRate: number;
}

interface Transaction {
  id: string;
  type: 'sale' | 'purchase';
  productId: string;
  productTitle: string;
  marketplace: string;
  buyerInfo?: {
    name: string;
    address: string;
    email: string;
    phone?: string;
  };
  supplierInfo?: {
    name: string;
    url: string;
    trackingNumber?: string;
  };
  amounts: {
    salePrice: number;
    purchasePrice: number;
    profit: number;
    fees: number;
  };
  status: 'pending' | 'processing' | 'fulfilled' | 'completed' | 'cancelled' | 'error';
  timestamps: {
    created: Date;
    saleCompleted?: Date;
    purchaseCompleted?: Date;
    shipped?: Date;
    delivered?: Date;
  };
  automation: {
    wasAutomated: boolean;
    triggerRule?: string;
    actions: string[];
  };
  trackingInfo?: {
    trackingNumber: string;
    carrier: string;
    status: string;
    estimatedDelivery: Date;
  };
}

interface DropshippingOrder {
  transactionId: string;
  supplierOrderId: string;
  supplierUrl: string;
  buyerAddress: string;
  trackingNumber?: string;
  status: 'ordered' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
}

export class AutomatedBusinessService {
  private ebayService: EbayService;
  private aiEngine: AIOpportunityEngine;
  private notificationService: typeof notificationService;
  private scrapingService: AdvancedScrapingService;
  // Using imported jobService instance instead of creating new one
  
  private config: AutomationConfig;
  private pausedStage: 'scrape' | 'analyze' | 'publish' | null = null;
  private activeTransactions: Map<string, Transaction> = new Map();
  private automationRules: Map<string, AutomationRule> = new Map();

  constructor() {
    this.ebayService = new EbayService();
    this.aiEngine = new AIOpportunityEngine();
    this.notificationService = notificationService;
    this.scrapingService = new AdvancedScrapingService();
    // jobService is already instantiated
    
    this.initializeDefaultConfig();
    this.setupAutomationRules();
    
    // ✅ TEST FIX: No start engine in test environment
    const automationEngineEnabled = (process.env.AUTOMATION_ENGINE_ENABLED ?? 'true') === 'true';
    if (automationEngineEnabled) {
      this.startAutomationEngine();
    }
  }

  /**
   * Configuración inicial del sistema
   */
  private initializeDefaultConfig(): void {
    this.config = {
      mode: 'manual',
      environment: 'sandbox',
      stages: { scrape: 'automatic', analyze: 'automatic', publish: 'manual' },
      rules: [],
      thresholds: {
        minProfitMargin: 15,
        maxInvestment: 500,
        minConfidence: 75,
        maxRiskLevel: 3
      }
    };
  }

  /**
   * Configurar reglas de automatización
   */
  private setupAutomationRules(): void {
    const defaultRules: AutomationRule[] = [
      {
        id: 'auto-pricing',
        name: 'Ajuste automático de precios competitivos',
        type: 'pricing',
        condition: 'competitor_price_change > 5%',
        action: 'match_price_with_margin',
        active: true,
        parameters: { minMargin: 15, maxAdjustment: 20 },
        executionCount: 0,
        successRate: 0
      },
      {
        id: 'auto-purchase',
        name: 'Compra automática al recibir orden',
        type: 'purchasing',
        condition: 'sale_completed AND mode=automatic',
        action: 'purchase_from_supplier',
        active: true,
        parameters: { maxDelay: 30 }, // 30 minutos máximo
        executionCount: 0,
        successRate: 0
      },
      {
        id: 'auto-listing',
        name: 'Publicación automática de oportunidades',
        type: 'listing',
        condition: 'opportunity_confidence > 85 AND profit_margin > 25',
        action: 'create_listing',
        active: false, // Desactivada por defecto
        parameters: { maxListings: 10, categories: ['electronics', 'home'] },
        executionCount: 0,
        successRate: 0
      },
      {
        id: 'inventory-alert',
        name: 'Alerta de stock bajo',
        type: 'inventory',
        condition: 'stock_level < 3',
        action: 'send_notification',
        active: true,
        parameters: { alertThreshold: 3 },
        executionCount: 0,
        successRate: 0
      }
    ];

    defaultRules.forEach(rule => {
      this.automationRules.set(rule.id, rule);
    });
  }

  /**
   * Iniciar el motor de automatización
   */
  private startAutomationEngine(): void {
    logger.info('🤖 Iniciando motor de automatización...');
    
    // Monitoreo continuo cada 5 minutos
    setInterval(() => {
      if (this.config.mode === 'automatic') {
        this.processAutomationCycle();
      }
    }, 5 * 60 * 1000);

    // Monitoreo de transacciones cada minuto
    setInterval(() => {
      this.monitorActiveTransactions();
    }, 60 * 1000);
  }

  /**
   * ✅ Procesar ciclo de automatización con configuración por usuario
   */
  private async processAutomationCycle(userId?: number): Promise<void> {
    try {
      // Si no hay userId, usar admin por defecto (para backward compatibility)
      const currentUserId = userId || 1;
      
      // ✅ Obtener configuración de workflow del usuario
      const workflowConfig = await workflowConfigService.getUserConfig(currentUserId);
      const environment = await workflowConfigService.getUserEnvironment(currentUserId);
      
      logger.info('🔄 Ejecutando ciclo de automatización', { userId: currentUserId, environment });
      
      // ✅ Verificar etapa SCRAPE
      const scrapeMode = await workflowConfigService.getStageMode(currentUserId, 'scrape');
      if (scrapeMode === 'manual') {
        logger.info('Etapa SCRAPE en modo manual - pausando', { userId: currentUserId });
        await this.notificationService.sendAlert({
          type: 'action_required',
          title: 'Etapa SCRAPE pausada',
          message: 'Modo manual: presiona "Continuar" para seguir con SCRAPE.',
          priority: 'HIGH',
          data: { stage: 'scrape', userId: currentUserId },
          actions: [{ id: 'continue_scrape', label: 'Continuar SCRAPE', action: 'continue_stage:scrape', variant: 'primary' }]
        });
        return;
      }
      
      // 1. Buscar nuevas oportunidades
      if (scrapeMode === 'automatic') {
        await this.discoverOpportunities(currentUserId, environment);
      } else if (scrapeMode === 'guided') {
        // ✅ GUIDED MODE: Notificar antes de buscar oportunidades
        const { notificationService } = await import('./notification.service');
        const { guidedActionTracker } = await import('./guided-action-tracker.service');
        const actionId = await guidedActionTracker.registerAction(
          currentUserId,
          'scrape',
          'confirm',
          { userId: currentUserId },
          5, // 5 minutos timeout
          async () => {
            await this.discoverOpportunities(currentUserId, environment);
          }
        );
        
        await notificationService.sendToUser(currentUserId, {
          type: 'ACTION_REQUIRED',
          title: 'Búsqueda guiada - ¿Buscar oportunidades ahora?',
          message: 'El sistema está listo para buscar nuevas oportunidades. ¿Deseas iniciar la búsqueda ahora? (Se iniciará automáticamente en 5 minutos si no respondes)',
          priority: 'NORMAL',
          category: 'JOB',
          data: {
            stage: 'scrape',
            mode: 'guided',
            actionId,
            userId: currentUserId,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
          },
          actions: [
            { 
              id: `${actionId}_confirm`, 
              label: '✅ Iniciar Búsqueda', 
              action: 'confirm_scrape_guided', 
              variant: 'primary' 
            },
            { 
              id: `${actionId}_skip`, 
              label: '⏭️ Omitir Ahora', 
              action: 'skip_scrape_guided', 
              variant: 'secondary' 
            }
          ]
        });
      }
      
      // ✅ Verificar etapa ANALYZE
      const analyzeMode = await workflowConfigService.getStageMode(currentUserId, 'analyze');
      if (analyzeMode === 'manual') {
        logger.info('Etapa ANALYZE en modo manual - pausando', { userId: currentUserId });
        await this.notificationService.sendAlert({
          type: 'action_required',
          title: 'Etapa ANALYZE pausada',
          message: 'Modo manual: presiona "Continuar" para seguir con ANALYZE.',
          priority: 'HIGH',
          data: { stage: 'analyze', userId: currentUserId },
          actions: [{ id: 'continue_analyze', label: 'Continuar ANALYZE', action: 'continue_stage:analyze', variant: 'primary' }]
        });
        return;
      }
      
      // 2. Monitorear precios existentes
      if (analyzeMode === 'automatic') {
        await this.monitorPricing(currentUserId);
      } else if (analyzeMode === 'guided') {
        // ✅ GUIDED MODE: Notificar antes de analizar
        const { notificationService } = await import('./notification.service');
        const actionId = `guided_analyze_${currentUserId}_${Date.now()}`;
        
        await notificationService.sendToUser(currentUserId, {
          type: 'ACTION_REQUIRED',
          title: 'Análisis guiado - ¿Analizar productos ahora?',
          message: 'El sistema está listo para analizar precios y oportunidades existentes. ¿Deseas iniciar el análisis ahora? (Se iniciará automáticamente en 5 minutos si no respondes)',
          priority: 'NORMAL',
          category: 'JOB',
          data: {
            stage: 'analyze',
            mode: 'guided',
            actionId,
            userId: currentUserId,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
          },
          actions: [
            { 
              id: `${actionId}_confirm`, 
              label: '✅ Iniciar Análisis', 
              action: 'confirm_analyze_guided', 
              variant: 'primary' 
            },
            { 
              id: `${actionId}_skip`, 
              label: '⏭️ Omitir Ahora', 
              action: 'skip_analyze_guided', 
              variant: 'secondary' 
            }
          ]
        });

        // Programar análisis automático después de timeout
        setTimeout(async () => {
          const currentMode = await workflowConfigService.getStageMode(currentUserId, 'analyze');
          if (currentMode === 'guided') {
            logger.info('AutomatedBusiness: Guided analyze - No response, executing automatically after timeout', {
              userId: currentUserId
            });
            await this.monitorPricing(currentUserId);
          }
        }, 5 * 60 * 1000);
      }
      
      // ✅ Verificar etapa PUBLISH
      const publishMode = await workflowConfigService.getStageMode(currentUserId, 'publish');
      if (publishMode === 'manual') {
        logger.info('Etapa PUBLISH en modo manual - pausando', { userId: currentUserId });
        await this.notificationService.sendAlert({
          type: 'action_required',
          title: 'Etapa PUBLISH pausada',
          message: 'Modo manual: presiona "Continuar" para seguir con PUBLISH.',
          priority: 'HIGH',
          data: { stage: 'publish', userId: currentUserId },
          actions: [{ id: 'continue_publish', label: 'Continuar PUBLISH', action: 'continue_stage:publish', variant: 'primary' }]
        });
        return;
      }
      
      // 3. Procesar órdenes pendientes
      if (publishMode === 'automatic') {
        await this.processOrders(currentUserId);
      } else if (publishMode === 'guided') {
        // ✅ GUIDED MODE: Notificar antes de procesar publicaciones pendientes
        const { notificationService } = await import('./notification.service');
        const actionId = `guided_publish_process_${currentUserId}_${Date.now()}`;
        
        await notificationService.sendToUser(currentUserId, {
          type: 'ACTION_REQUIRED',
          title: 'Procesamiento guiado - ¿Procesar publicaciones pendientes ahora?',
          message: 'Hay productos listos para publicar. ¿Deseas procesarlos ahora? (Se procesarán automáticamente en 5 minutos si no respondes)',
          priority: 'NORMAL',
          category: 'PRODUCT',
          data: {
            stage: 'publish',
            mode: 'guided',
            actionId,
            userId: currentUserId,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
          },
          actions: [
            { 
              id: `${actionId}_confirm`, 
              label: '✅ Procesar Ahora', 
              action: 'confirm_publish_process_guided', 
              variant: 'primary' 
            },
            { 
              id: `${actionId}_skip`, 
              label: '⏭️ Omitir Ahora', 
              action: 'skip_publish_process_guided', 
              variant: 'secondary' 
            }
          ]
        });

        // Programar procesamiento automático después de timeout
        setTimeout(async () => {
          const currentMode = await workflowConfigService.getStageMode(currentUserId, 'publish');
          if (currentMode === 'guided') {
            logger.info('AutomatedBusiness: Guided publish process - No response, executing automatically after timeout', {
              userId: currentUserId
            });
            await this.processOrders(currentUserId);
          }
        }, 5 * 60 * 1000);
      }
      
      // ✅ Verificar etapa FULFILLMENT
      const fulfillmentMode = await workflowConfigService.getStageMode(currentUserId, 'fulfillment');
      if (fulfillmentMode === 'manual') {
        logger.info('Etapa FULFILLMENT en modo manual - pausando', { userId: currentUserId });
        return;
      }
      
      // 4. Actualizar tracking (si está en automatic o guided)
      if (fulfillmentMode === 'automatic' || fulfillmentMode === 'guided') {
        await this.updateTracking(currentUserId);
      }
      
    } catch (error: any) {
      logger.error('❌ Error en ciclo de automatización', { error, userId });
      await this.notificationService.sendAlert({
        type: 'error',
        title: 'Error en automatización',
        message: error.message
      });
    }
  }

  /**
   * ✅ Descubrir nuevas oportunidades automáticamente (con userId y environment)
   */
  private async discoverOpportunities(userId?: number, environment?: 'sandbox' | 'production'): Promise<void> {
    const rule = this.automationRules.get('auto-listing');
    if (!rule?.active) return;

    try {
      // ✅ Obtener configuración del usuario si está disponible
      const currentUserId = userId || 1;
      let userEnvironment = environment;
      let userConfig = null;

      if (userId) {
        userEnvironment = await workflowConfigService.getUserEnvironment(currentUserId);
        userConfig = await workflowConfigService.getUserConfig(currentUserId);
      }

      const opportunities = await this.aiEngine.findTrendingOpportunities({
        minConfidence: userConfig?.autoApproveThreshold || this.config.thresholds.minConfidence,
        minProfitMargin: this.config.thresholds.minProfitMargin,
        maxInvestment: userConfig?.maxAutoInvestment || this.config.thresholds.maxInvestment
      });

      for (const opportunity of opportunities.slice(0, rule.parameters.maxListings)) {
        await this.autoCreateListing(opportunity, currentUserId, userEnvironment);
      }

    } catch (error) {
      logger.error('❌ Error descubriendo oportunidades', { error, userId });
    }
  }

  /**
   * ✅ Monitorear precios automáticamente (con userId)
   */
  private async monitorPricing(userId?: number): Promise<void> {
    const rule = this.automationRules.get('auto-pricing');
    if (!rule?.active) return;

    try {
      const currentUserId = userId || 1;
      
      // Obtener listings activos del usuario (esto vendría de la BD)
      const activeListings = await this.getActiveListings(currentUserId);
      
      for (const listing of activeListings) {
        await this.checkAndAdjustPrice(listing, currentUserId);
      }

    } catch (error) {
      logger.error('❌ Error monitoreando precios', { error, userId });
    }
  }

  /**
   * Procesar órdenes de venta automáticamente
   */
  async processSaleOrder(saleData: {
    orderId: string;
    productId: string;
    productTitle: string;
    buyerInfo: any;
    salePrice: number;
    marketplace: string;
  }): Promise<Transaction> {
    logger.info('💰 Nueva venta recibida', { productTitle: saleData.productTitle, orderId: saleData.orderId });
    
    const transaction: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'sale',
      productId: saleData.productId,
      productTitle: saleData.productTitle,
      marketplace: saleData.marketplace,
      buyerInfo: saleData.buyerInfo,
      amounts: {
        salePrice: saleData.salePrice,
        purchasePrice: 0,
        profit: 0,
        fees: saleData.salePrice * 0.1 // 10% fees estimado
      },
      status: 'pending',
      timestamps: {
        created: new Date(),
        saleCompleted: new Date()
      },
      automation: {
        wasAutomated: this.config.mode === 'automatic',
        actions: []
      }
    };

    this.activeTransactions.set(transaction.id, transaction);

    // Enviar notificación
    await this.notificationService.sendAlert({
      type: 'sale',
      title: 'Nueva venta completada',
      message: `Se vendió: ${saleData.productTitle} por $${saleData.salePrice}`
    });

    // Si está en modo automático, proceder con la compra
    if (this.config.mode === 'automatic') {
      await this.autoProcessPurchase(transaction);
    } else {
      await this.notificationService.sendAlert({
        type: 'action_required',
        title: 'Acción requerida',
        message: 'Nueva venta requiere procesamiento manual'
      });
    }

    return transaction;
  }

  /**
   * Procesar compra automática
   */
  private async autoProcessPurchase(transaction: Transaction): Promise<void> {
    try {
      logger.info('🛒 Procesando compra automática', { productTitle: transaction.productTitle, transactionId: transaction.id });
      
      transaction.status = 'processing';
      transaction.automation.actions.push('auto_purchase_initiated');

      // 1. Encontrar el mejor proveedor
      const supplier = await this.findBestSupplier(transaction.productTitle);
      if (!supplier) {
        throw new Error('No se encontró proveedor disponible');
      }

      // 2. Realizar compra automática
      const purchaseResult = await this.executePurchase(supplier, transaction);
      
      // 3. Actualizar transacción
      transaction.amounts.purchasePrice = purchaseResult.price;
      transaction.amounts.profit = transaction.amounts.salePrice - 
                                 transaction.amounts.purchasePrice - 
                                 transaction.amounts.fees;
      transaction.supplierInfo = {
        name: supplier.name,
        url: supplier.url,
        trackingNumber: purchaseResult.trackingNumber
      };
      transaction.timestamps.purchaseCompleted = new Date();
      transaction.automation.actions.push('purchase_completed');

      // 4. Configurar envío directo
      if (purchaseResult.trackingNumber) {
        await this.setupDirectShipping(transaction, purchaseResult);
      }

      transaction.status = 'fulfilled';
      
      await this.notificationService.sendAlert({
        type: 'success',
        title: 'Compra automática exitosa',
        message: `Producto comprado automáticamente. Ganancia: $${transaction.amounts.profit.toFixed(2)}`
      });

    } catch (error) {
      logger.error('❌ Error en compra automática', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id
      });
      transaction.status = 'error';
      transaction.automation.actions.push(`error: ${error.message}`);
      
      await this.notificationService.sendAlert({
        type: 'error',
        title: 'Error en compra automática',
        message: `Error procesando ${transaction.productTitle}: ${error.message}`
      });
    }
  }

  /**
   * Encontrar el mejor proveedor
   */
  private async findBestSupplier(productTitle: string): Promise<any> {
    try {
      // Buscar en múltiples fuentes
      const suppliers = await Promise.all([
        this.scrapingService.findSuppliers(productTitle, 'aliexpress'),
        this.scrapingService.findSuppliers(productTitle, 'alibaba'),
        this.ebayService.searchProducts({ keywords: productTitle, limit: 10 })
      ]);

      const allSuppliers = suppliers.flat().filter(s => s && s.price > 0);
      
      if (allSuppliers.length === 0) return null;

      // Seleccionar el mejor (precio más bajo + mejor rating)
      return allSuppliers.sort((a, b) => {
        const scoreA = this.calculateSupplierScore(a);
        const scoreB = this.calculateSupplierScore(b);
        return scoreB - scoreA;
      })[0];

    } catch (error) {
      logger.error('❌ Error buscando proveedores', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id
      });
      return null;
    }
  }

  /**
   * Calcular score del proveedor
   */
  private calculateSupplierScore(supplier: any): number {
    let score = 0;
    
    // Precio más bajo es mejor (invertido)
    score += (1000 - supplier.price) * 0.4;
    
    // Rating más alto es mejor
    score += (supplier.rating || 0) * 20;
    
    // Más ventas es mejor
    score += Math.log(supplier.soldCount + 1) * 10;
    
    // Envío gratis es mejor
    if (supplier.freeShipping) score += 50;
    
    return score;
  }

  /**
   * Ejecutar compra del proveedor
   */
  private async executePurchase(supplier: any, transaction: Transaction): Promise<any> {
    if (this.config.environment === 'sandbox') {
      // En sandbox, simular la compra
      logger.info('🧪 SANDBOX: Simulando compra automática', { transactionId: transaction.id });
      return {
        orderId: `sandbox_${Date.now()}`,
        price: supplier.price,
        trackingNumber: `TRACK${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };
    }

    // En producción, realizar compra real
    logger.info('PRODUCCIÓN: Ejecutando compra real', { supplier: supplier.marketplace });
    
    // Aquí iría la integración real con el proveedor
    // Por ejemplo, usando APIs de AliExpress, eBay, etc.
    
    if (supplier.marketplace === 'ebay') {
      return await this.ebayService.purchaseItem({
        itemId: supplier.itemId,
        quantity: 1,
        shippingAddress: transaction.buyerInfo.address
      });
    }
    
    // Para otros marketplaces, usar scraping automatizado
    return await this.scrapingService.executePurchase(supplier, {
      shippingAddress: transaction.buyerInfo.address,
      quantity: 1
    });
  }

  /**
   * Configurar envío directo al comprador
   */
  private async setupDirectShipping(transaction: Transaction, purchaseResult: any): Promise<void> {
    const dropshippingOrder: DropshippingOrder = {
      transactionId: transaction.id,
      supplierOrderId: purchaseResult.orderId,
      supplierUrl: transaction.supplierInfo?.url || '',
      buyerAddress: transaction.buyerInfo?.address || '',
      trackingNumber: purchaseResult.trackingNumber,
      status: 'ordered'
    };

    // Guardar orden de dropshipping (en BD real)
    logger.info('📦 Configurando envío directo', { 
      transactionId: dropshippingOrder.transactionId,
      supplierOrderId: dropshippingOrder.supplierOrderId
    });

    // Programar seguimiento automático (usando instancia importada)
    // await jobService.scheduleTrackingUpdate(transaction.id, purchaseResult.trackingNumber);
    
    transaction.trackingInfo = {
      trackingNumber: purchaseResult.trackingNumber,
      carrier: purchaseResult.carrier || 'Unknown',
      status: 'shipped',
      estimatedDelivery: purchaseResult.estimatedDelivery
    };
  }

  /**
   * Crear listing automático de oportunidad
   */
  private async autoCreateListing(opportunity: any): Promise<void> {
    try {
      if (this.config.environment === 'sandbox') {
        logger.info('🧪 SANDBOX: Simulando creación de listing', { opportunityTitle: opportunity.title });
        return;
      }

      logger.info('📝 Creando listing automático', { opportunityTitle: opportunity.title });
      
      const listingData = {
        title: opportunity.title,
        description: this.generateDescription(opportunity),
        price: opportunity.suggestedPrice,
        category: opportunity.category,
        images: await this.getProductImages(opportunity.title),
        shippingPolicy: 'fast_n_free',
        returnPolicy: '30_days'
      };

      const listing = await this.ebayService.createListing(listingData);
      
      await this.notificationService.sendAlert({
        type: 'success',
        title: 'Nuevo listing creado',
        message: `Se publicó automáticamente: ${opportunity.title}`
      });

    } catch (error) {
      logger.error('❌ Error creando listing automático', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        opportunityTitle: opportunity.title
      });
    }
  }

  /**
   * Generar descripción automática del producto
   */
  private generateDescription(opportunity: any): string {
    return `
${opportunity.title}

✨ Características destacadas:
${opportunity.aiAnalysis.strengths.map(s => `• ${s}`).join('\n')}

📦 Especificaciones:
• Envío rápido y seguro
• Garantía de satisfacción
• Soporte técnico incluido

💡 Recomendado por nuestro sistema IA con ${opportunity.confidence}% de confianza.

🛒 ¡Compra ahora y aprovecha esta oportunidad!
    `.trim();
  }

  /**
   * Obtener imágenes del producto
   */
  private async getProductImages(productTitle: string): Promise<string[]> {
    try {
      // Buscar imágenes mediante scraping
      const images = await this.scrapingService.getProductImages(productTitle);
      return images.slice(0, 5); // Máximo 5 imágenes
    } catch (error) {
      logger.warn('⚠️ Error obteniendo imágenes', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  /**
   * Monitorear transacciones activas
   */
  private async monitorActiveTransactions(): Promise<void> {
    for (const [id, transaction] of this.activeTransactions) {
      try {
        if (transaction.status === 'fulfilled' && transaction.trackingInfo) {
          await this.updateTransactionTracking(transaction);
        }
        
        // Limpiar transacciones completadas después de 7 días
        if (transaction.status === 'completed' && 
            Date.now() - transaction.timestamps.created.getTime() > 7 * 24 * 60 * 60 * 1000) {
          this.activeTransactions.delete(id);
        }
      } catch (error) {
        logger.error('❌ Error monitoreando transacción', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          transactionId: id
        });
      }
    }
  }

  /**
   * Actualizar tracking de transacción
   */
  private async updateTransactionTracking(transaction: Transaction): Promise<void> {
    if (!transaction.trackingInfo?.trackingNumber) return;

    try {
      const trackingUpdate = await this.scrapingService.getTrackingInfo(
        transaction.trackingInfo.trackingNumber
      );

      if (trackingUpdate.status === 'delivered') {
        transaction.status = 'completed';
        transaction.timestamps.delivered = new Date();
        
        await this.notificationService.sendAlert({
          type: 'success',
          title: 'Entrega completada',
          message: `Producto entregado exitosamente: ${transaction.productTitle}`
        });
      }

    } catch (error) {
      logger.warn('⚠️ Error actualizando tracking', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Obtener configuración actual
   */
  getConfig(): AutomationConfig {
    return { ...this.config };
  }

  /**
   * Actualizar configuración
   */
  updateConfig(newConfig: Partial<AutomationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('⚙️ Configuración actualizada', { config: this.config });
    
    // Notificar cambio de modo
    if (newConfig.mode) {
      this.notificationService.sendAlert({
        type: 'info',
        title: 'Modo cambiado',
        message: `Sistema ahora en modo: ${newConfig.mode}`
      });
    }
  }

  /**
   * Obtener transacciones activas
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Obtener reglas de automatización
   */
  getAutomationRules(): AutomationRule[] {
    return Array.from(this.automationRules.values());
  }

  /**
   * Actualizar regla de automatización
   */
  updateAutomationRule(ruleId: string, updates: Partial<AutomationRule>): void {
    const rule = this.automationRules.get(ruleId);
    if (rule) {
      this.automationRules.set(ruleId, { ...rule, ...updates });
    }
  }

  /**
   * Obtener métricas del sistema
   */
  getMetrics(): any {
    const transactions = Array.from(this.activeTransactions.values());
    
    return {
      totalTransactions: transactions.length,
      completedTransactions: transactions.filter(t => t.status === 'completed').length,
      totalRevenue: transactions.reduce((sum, t) => sum + t.amounts.salePrice, 0),
      totalProfit: transactions.reduce((sum, t) => sum + t.amounts.profit, 0),
      automationRate: transactions.filter(t => t.automation.wasAutomated).length / Math.max(transactions.length, 1),
      averageProcessingTime: this.calculateAverageProcessingTime(transactions),
      activeRules: Array.from(this.automationRules.values()).filter(r => r.active).length
    };
  }

  /**
   * Calcular tiempo promedio de procesamiento
   */
  private calculateAverageProcessingTime(transactions: Transaction[]): number {
    const completed = transactions.filter(t => 
      t.timestamps.saleCompleted && t.timestamps.purchaseCompleted
    );
    
    if (completed.length === 0) return 0;
    
    const totalTime = completed.reduce((sum, t) => {
      const saleTime = t.timestamps.saleCompleted!.getTime();
      const purchaseTime = t.timestamps.purchaseCompleted!.getTime();
      return sum + (purchaseTime - saleTime);
    }, 0);
    
    return totalTime / completed.length / (1000 * 60); // En minutos
  }

  /**
   * Procesar órdenes pendientes (con userId)
   */
  private async processOrders(userId?: number): Promise<void> {
    try {
      const currentUserId = userId || 1;
      
      // ✅ Verificar etapa PURCHASE
      const purchaseMode = await workflowConfigService.getStageMode(currentUserId, 'purchase');
      if (purchaseMode === 'manual') {
        logger.info('Etapa PURCHASE en modo manual - pausando', { userId: currentUserId });
        return;
      }
      
      // Obtener órdenes pendientes del usuario
      const pendingOrders = await this.getPendingOrders(currentUserId);
      
      for (const order of pendingOrders) {
        if (purchaseMode === 'automatic') {
          // Compra automática
          await this.executePurchase(order);
        } else if (purchaseMode === 'guided') {
          // Modo guiado - notificar y esperar confirmación
          await this.notificationService.sendAlert({
            type: 'action_required',
            title: 'Orden lista para compra',
            message: `Orden ${order.id} lista para compra. ¿Proceder?`,
            priority: 'HIGH',
            data: { orderId: order.id, stage: 'purchase', userId: currentUserId },
            actions: [{ id: 'confirm_purchase', label: 'Confirmar Compra', action: 'confirm_purchase', variant: 'primary' }]
          });
        }
      }
    } catch (error) {
      logger.error('❌ Error procesando órdenes', { error, userId });
    }
  }

  /**
   * ✅ Actualizar tracking (con userId)
   */
  private async updateTracking(userId?: number): Promise<void> {
    try {
      const currentUserId = userId || 1;
      
      // ✅ Verificar etapa FULFILLMENT
      const fulfillmentMode = await workflowConfigService.getStageMode(currentUserId, 'fulfillment');
      if (fulfillmentMode === 'manual') {
        return;
      }
      
      // Obtener órdenes en tránsito del usuario
      const ordersInTransit = await this.getOrdersInTransit(currentUserId);
      
      for (const order of ordersInTransit) {
        await this.updateOrderTracking(order);
      }
    } catch (error) {
      logger.error('❌ Error actualizando tracking', { error, userId });
    }
  }

  // Métodos auxiliares
  private async getActiveListings(userId: number): Promise<any[]> {
    return prisma.marketplaceListing.findMany({
      where: { userId },
      include: { product: true },
    });
  }

  private async getPendingOrders(userId: number): Promise<any[]> {
    return prisma.order.findMany({
      where: { userId, status: 'PAID' },
      include: { user: true },
    });
  }

  private async getOrdersInTransit(userId: number): Promise<any[]> {
    return prisma.order.findMany({
      where: { userId, status: { in: ['PURCHASING', 'PURCHASED'] } },
      include: { user: true },
    });
  }

  private async checkAndAdjustPrice(listing: any, userId: number): Promise<void> {
    try {
      const { dynamicPricingService } = await import('./dynamic-pricing.service');
      const productId = listing?.productId ?? listing?.product?.id;
      const supplierPrice = Number(listing?.product?.aliexpressPrice ?? listing?.product?.totalCost ?? listing?.product?.aliexpressPrice ?? 0);
      const marketplace = (listing?.marketplace ?? 'ebay') as 'ebay' | 'amazon' | 'mercadolibre';
      if (productId && supplierPrice > 0) {
        await dynamicPricingService.repriceByProduct(productId, supplierPrice, marketplace, userId);
      }
    } catch (err) {
      logger.warn('checkAndAdjustPrice failed', { listingId: listing?.id, userId, error: (err as Error)?.message });
    }
  }

  private async executePurchase(order: any): Promise<void> {
    try {
      const { orderFulfillmentService } = await import('./order-fulfillment.service');
      const orderId = order?.id ?? order?.orderId;
      if (orderId) {
        await orderFulfillmentService.fulfillOrder(String(orderId));
      }
    } catch (err) {
      logger.error('executePurchase failed', { orderId: order?.id, error: (err as Error)?.message });
    }
  }

  private async updateOrderTracking(order: any): Promise<void> {
    try {
      const orderId = order?.id ?? order?.orderId;
      if (!orderId) return;
      const purchaseLog = await prisma.purchaseLog.findFirst({
        where: { orderId: String(orderId), userId: order?.userId },
        orderBy: { id: 'desc' },
      });
      const tracking = purchaseLog?.trackingNumber ?? order?.trackingNumber;
      if (!tracking) return;
      if (purchaseLog?.saleId) {
        await prisma.sale.update({
          where: { id: purchaseLog.saleId },
          data: { trackingNumber: tracking },
        });
      } else if (order?.productId && order?.userId) {
        const sale = await prisma.sale.findFirst({
          where: { productId: order.productId, userId: order.userId, status: { in: ['PENDING', 'PROCESSING'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (sale?.id) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: { trackingNumber: tracking },
          });
        }
      }
    } catch (err) {
      logger.warn('updateOrderTracking failed', { orderId: order?.id, error: (err as Error)?.message });
    }
  }

  private async autoCreateListing(opportunity: any, userId?: number, environment?: 'sandbox' | 'production'): Promise<void> {
    // TODO: Implementar creación automática de listing con userId y environment
  }
}

export const automatedBusinessSystem = new AutomatedBusinessService();
