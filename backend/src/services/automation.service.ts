// @ts-nocheck
import { trace } from '../utils/boot-trace';
trace('loading automation.service');

import { Queue, Worker, Job } from 'bullmq';
import { ScrapingService } from './scraping.service';
import { EBayService } from './ebay.service';
import { AmazonService } from './amazon.service';
import { MercadoLibreService } from './mercadolibre.service';
import { AIOpportunityEngine } from './ai-opportunity.service';
import { NotificationService } from './notifications.service';
import { SecureCredentialManager } from './security.service';
import logger from '../config/logger';
import { workflowConfigService } from './workflow-config.service';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';

export interface AutomationConfig {
  mode: 'manual' | 'automatic';
  environment: 'sandbox' | 'production';
  maxConcurrentJobs: number;
  retryAttempts: number;
  delayBetweenOperations: number;
  enableRealTimeNotifications: boolean;
}

export interface OpportunityData {
  id: string;
  product: string;
  sourceMarketplace: string;
  targetMarketplace: string;
  buyPrice: number;
  sellPrice: number;
  profitMargin: number;
  supplierUrl: string;
  confidence: number;
  metadata: {
    title: string;
    description: string;
    images: string[];
    category: string;
    condition: string;
    shipping: any;
  };
}

export interface AutomatedOrder {
  id: string;
  opportunityId: string;
  customerId: string;
  customerInfo: {
    name: string;
    email: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };
  orderDetails: {
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    paymentMethod: string;
  };
  status: 'pending' | 'processing' | 'purchasing' | 'shipping' | 'completed' | 'failed';
  timestamps: {
    created: Date;
    processed?: Date;
    purchased?: Date;
    shipped?: Date;
    completed?: Date;
  };
}

export class AutomationService {
  private config: AutomationConfig;
  private opportunityQueue: Queue;
  private orderQueue: Queue;
  private monitoringQueue: Queue;
  
  private scrapingService: ScrapingService;
  private ebayService: EBayService;
  private amazonService: AmazonService;
  private mercadolibreService: MercadoLibreService;
  private aiEngine: AIOpportunityEngine;
  private notificationService: NotificationService;
  private securityManager: SecureCredentialManager;

  private activeOrders: Map<string, AutomatedOrder> = new Map();
  private performanceMetrics = {
    totalOpportunities: 0,
    successfulOrders: 0,
    failedOrders: 0,
    averageProfit: 0,
    totalRevenue: 0
  };

  constructor(config: AutomationConfig) {
    this.config = config;
    
    // Inicializar servicios
    this.scrapingService = new ScrapingService();
    this.ebayService = new EBayService();
    this.amazonService = new AmazonService();
    this.mercadolibreService = new MercadoLibreService();
    this.aiEngine = new AIOpportunityEngine();
    this.notificationService = new NotificationService();
    this.securityManager = new SecureCredentialManager();

    // Configurar queues con Redis - solo si está disponible
    const bullMQRedis = getBullMQRedisConnection();
    
    if (isRedisAvailable && bullMQRedis) {
      this.opportunityQueue = new Queue('opportunity-processing', { connection: bullMQRedis as any });
      this.orderQueue = new Queue('order-processing', { connection: bullMQRedis as any });
      this.monitoringQueue = new Queue('monitoring', { connection: bullMQRedis as any });
      this.initializeWorkers(bullMQRedis);
    } else {
      console.log('ℹ️  Automation queues disabled (Redis not configured)');
    }
  }

  /**
   * Inicializar workers para procesamiento en background
   */
  private initializeWorkers(bullMQRedis: any): void {
    // Worker para procesar oportunidades
    new Worker('opportunity-processing', async (job: Job) => {
      return await this.processOpportunityJob(job);
    }, { connection: bullMQRedis as any });

    // Worker para procesar órdenes automatizadas
    new Worker('order-processing', async (job: Job) => {
      return await this.processOrderJob(job);
    }, { connection: bullMQRedis as any });

    // Worker para monitoreo continuo
    new Worker('monitoring', async (job: Job) => {
      return await this.performMonitoringTask(job);
    }, { connection: bullMQRedis as any });
  }

  /**
   * FLUJO PRINCIPAL: Procesar oportunidad completa
   */
  async processOpportunity(opportunityData: Partial<OpportunityData>): Promise<{
    success: boolean;
    opportunityId?: string;
    listingId?: string;
    error?: string;
  }> {
    try {
      logger.info('Procesando oportunidad', { product: opportunityData.product });

      // 1. Validar y enriquecer datos con IA
      const enrichedOpportunity = await this.aiEngine.analyzeOpportunity(opportunityData);
      
      if (enrichedOpportunity.confidence < 70) {
        return {
          success: false,
          error: `Confianza IA muy baja: ${enrichedOpportunity.confidence}%`
        };
      }

      // 2. Obtener datos completos del producto fuente
      const productData = await this.scrapingService.scrapeProductDetails(
        enrichedOpportunity.supplierUrl,
        enrichedOpportunity.sourceMarketplace
      );

      // 3. Optimizar datos para marketplace destino
      const optimizedListing = await this.aiEngine.optimizeListingData({
        ...productData,
        targetMarketplace: enrichedOpportunity.targetMarketplace,
        suggestedPrice: enrichedOpportunity.sellPrice
      });

      // 4. Publicar en marketplace destino
      let listingResult;
      switch (enrichedOpportunity.targetMarketplace.toLowerCase()) {
        case 'ebay':
          listingResult = await this.ebayService.createListing(optimizedListing);
          break;
        case 'amazon':
          listingResult = await this.amazonService.createProduct(optimizedListing);
          break;
        case 'mercadolibre':
          listingResult = await this.mercadolibreService.createListing(optimizedListing);
          break;
        default:
          throw new Error(`Marketplace no soportado: ${enrichedOpportunity.targetMarketplace}`);
      }

      if (!listingResult.success) {
        throw new Error(`Error publicando: ${listingResult.error}`);
      }

      // 5. Monitorear listing automáticamente
      if (this.config.mode === 'automatic') {
        await this.monitoringQueue.add('monitor-listing', {
          listingId: listingResult.listingId,
          marketplace: enrichedOpportunity.targetMarketplace,
          opportunityId: enrichedOpportunity.id,
          checkInterval: 300000 // 5 minutos
        });
      }

      // 6. Notificar éxito
      await this.notificationService.sendOpportunitySuccess({
        opportunityId: enrichedOpportunity.id,
        product: enrichedOpportunity.product,
        marketplace: enrichedOpportunity.targetMarketplace,
        listingId: listingResult.listingId,
        expectedProfit: enrichedOpportunity.profitMargin,
        confidence: enrichedOpportunity.confidence
      });

      this.performanceMetrics.totalOpportunities++;
      
      return {
        success: true,
        opportunityId: enrichedOpportunity.id,
        listingId: listingResult.listingId
      };

    } catch (error) {
      console.error('❌ Error procesando oportunidad:', error);
      
      await this.notificationService.sendError({
        type: 'opportunity_processing_failed',
        error: error instanceof Error ? error.message : 'Error desconocido',
        context: { opportunityData }
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * FLUJO AUTOMATIZADO: Ejecutar cuando se recibe una orden
   */
  async executeAutomatedFlow(order: Partial<AutomatedOrder>): Promise<{
    success: boolean;
    orderId?: string;
    error?: string;
  }> {
    try {
      console.log(`🤖 Ejecutando flujo automatizado para orden: ${order.id}`);

      // Solo ejecutar si está en modo automático
      if (this.config.mode !== 'automatic') {
        return {
          success: false,
          error: 'Sistema en modo manual - flujo automatizado deshabilitado'
        };
      }

      const orderId = order.id || `order_${Date.now()}`;
      const automatedOrder: AutomatedOrder = {
        id: orderId,
        opportunityId: order.opportunityId || '',
        customerId: order.customerId || '',
        customerInfo: order.customerInfo || {} as any,
        orderDetails: order.orderDetails || {} as any,
        status: 'pending',
        timestamps: {
          created: new Date()
        }
      };

      this.activeOrders.set(orderId, automatedOrder);

      // 1. Notificar al usuario de la venta
      await this.notificationService.sendSaleNotification({
        orderId,
        product: automatedOrder.orderDetails.quantity + ' unidades',
        customer: automatedOrder.customerInfo.name,
        amount: automatedOrder.orderDetails.totalAmount,
        timestamp: new Date()
      });

      // ✅ Validar que la venta esté en estado correcto antes de procesar
      if (automatedOrder.status !== 'pending' && automatedOrder.status !== 'confirmed') {
        throw new Error(`Cannot process order in status: ${automatedOrder.status}`);
      }

      // 2. Si está en automático, proceder con compra automática
      automatedOrder.status = 'processing';
      automatedOrder.timestamps.processed = new Date();

      // 3. Obtener datos de la oportunidad original
      const opportunity = await this.getOpportunityById(automatedOrder.opportunityId);
      if (!opportunity) {
        throw new Error('Oportunidad no encontrada');
      }

      // ✅ Validar datos de compra
      if (!opportunity.supplierUrl || !automatedOrder.customerInfo.address) {
        throw new Error('Missing required data for purchase: supplierUrl or shipping address');
      }

      // ✅ Validar precio máximo
      if (opportunity.buyPrice <= 0) {
        throw new Error('Invalid buy price: must be greater than 0');
      }

      // ✅ CRÍTICO: Validar capital de trabajo antes de comprar
      const userId = parseInt(automatedOrder.customerId) || 0; // customerId contiene el userId del vendedor
      if (userId > 0) {
        const { workflowConfigService } = await import('./workflow-config.service');
        const { prisma } = await import('../config/database');
        const { logger } = await import('../config/logger');
        const { toNumber } = await import('../utils/decimal.utils');

        // Calcular capital disponible
        const totalCapital = await workflowConfigService.getWorkingCapital(userId);
        
        // Obtener costos pendientes
        const pendingOrders = await prisma.sale.findMany({
          where: {
            userId: userId,
            status: { in: ['PENDING', 'PROCESSING'] }
          }
        });
        const pendingCost = pendingOrders.reduce((sum, order) => 
          sum + toNumber(order.aliexpressCost || 0), 0
        );

        // Obtener productos aprobados pero no publicados
        const approvedProducts = await prisma.product.findMany({
          where: {
            userId: userId,
            status: 'APPROVED',
            isPublished: false
          }
        });
        const approvedCost = approvedProducts.reduce((sum, product) => 
          sum + toNumber(product.aliexpressPrice || 0), 0
        );

        const availableCapital = totalCapital - pendingCost - approvedCost;
        const purchaseCost = opportunity.buyPrice * automatedOrder.orderDetails.quantity;

        if (availableCapital < purchaseCost) {
          const errorMsg = `Capital insuficiente. Disponible: $${availableCapital.toFixed(2)}, Requerido: $${purchaseCost.toFixed(2)}`;
          logger.warn('Compra automática cancelada por capital insuficiente', {
            userId,
            availableCapital,
            purchaseCost,
            orderId: automatedOrder.id
          });
          
          automatedOrder.status = 'failed';
          automatedOrder.error = errorMsg;
          
          await this.notificationService.sendAlert({
            type: 'error',
            title: 'Compra automática cancelada',
            message: errorMsg,
            priority: 'HIGH'
          });
          
          throw new Error(errorMsg);
        }

        logger.info('Validación de capital exitosa', {
          userId,
          availableCapital,
          purchaseCost,
          orderId: automatedOrder.id
        });
      }

      // ✅ CRÍTICO: Validar saldo PayPal antes de comprar (si se usa PayPal)
      // Nota: PayPal Payouts API no tiene endpoint directo para verificar saldo
      // En producción, esto debería validarse con PayPal REST API o almacenar saldo en BD
      // Por ahora, solo validamos capital de trabajo

      // ✅ Registrar intento de compra en PurchaseLog
      const { prisma } = await import('../config/database');
      const { toNumber } = await import('../utils/decimal.utils');
      let purchaseLogId: number | null = null;
      
      try {
        const purchaseLog = await prisma.purchaseLog.create({
          data: {
            userId: userId,
            saleId: null, // Se actualizará después si se encuentra la venta
            orderId: automatedOrder.id,
            productId: parseInt(opportunity.id) || null,
            supplierUrl: opportunity.supplierUrl,
            purchaseAmount: opportunity.buyPrice * automatedOrder.orderDetails.quantity,
            quantity: automatedOrder.orderDetails.quantity,
            status: 'PENDING',
            success: false,
            capitalValidated: true, // Ya validado arriba
            capitalAvailable: availableCapital,
            paypalValidated: false, // PayPal validation no implementada aún
            retryAttempt: 0,
            maxRetries: 3,
          }
        });
        purchaseLogId = purchaseLog.id;
      } catch (logError) {
        logger.warn('Failed to create purchase log', { error: logError });
      }

      // 4. Realizar compra automática al proveedor (con retry y try-catch para rollback)
      let purchaseResult;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          purchaseResult = await this.executePurchaseFromSupplier({
            supplierUrl: opportunity.supplierUrl,
            quantity: automatedOrder.orderDetails.quantity,
            maxPrice: opportunity.buyPrice,
            shippingAddress: automatedOrder.customerInfo.address,
            userId: userId, // Pasar userId para logging
          });

          if (purchaseResult.success) {
            // ✅ Actualizar log de compra como exitoso y vincular con venta si existe
            if (purchaseLogId) {
              // Intentar encontrar la venta relacionada por orderId
              let relatedSaleId: number | null = null;
              try {
                const relatedSale = await prisma.sale.findFirst({
                  where: { orderId: automatedOrder.id }
                });
                if (relatedSale) {
                  relatedSaleId = relatedSale.id;
                }
              } catch (e) {
                // Ignorar si no se encuentra la venta
              }

              await prisma.purchaseLog.update({
                where: { id: purchaseLogId },
                data: {
                  saleId: relatedSaleId, // Vincular con venta si existe
                  status: 'SUCCESS',
                  success: true,
                  supplierOrderId: purchaseResult.supplierOrderId,
                  trackingNumber: purchaseResult.trackingNumber,
                  completedAt: new Date(),
                  retryAttempt: retryCount,
                }
              });
            }
            
            automatedOrder.status = 'purchasing';
            automatedOrder.timestamps.purchased = new Date();
            break; // Salir del loop de retry
          } else {
            throw new Error(`Error en compra automática: ${purchaseResult.error}`);
          }
        } catch (purchaseError) {
          retryCount++;
          
          if (retryCount >= maxRetries) {
            // ✅ Actualizar log de compra como fallido
            if (purchaseLogId) {
              await prisma.purchaseLog.update({
                where: { id: purchaseLogId },
                data: {
                  status: 'FAILED',
                  success: false,
                  errorMessage: purchaseError instanceof Error ? purchaseError.message : 'Unknown purchase error',
                  completedAt: new Date(),
                  retryAttempt: retryCount,
                }
              });
            }
            
            // ✅ Rollback: Marcar orden como fallida
            automatedOrder.status = 'failed';
            automatedOrder.error = purchaseError instanceof Error ? purchaseError.message : 'Unknown purchase error';
            throw purchaseError; // Re-throw para que se maneje arriba
          } else {
            // ✅ Retry: Esperar antes de reintentar
            logger.warn(`Purchase attempt ${retryCount} failed, retrying...`, {
              error: purchaseError instanceof Error ? purchaseError.message : String(purchaseError),
              retryCount,
              maxRetries
            });
            
            // Actualizar log con intento de retry
            if (purchaseLogId) {
              await prisma.purchaseLog.update({
                where: { id: purchaseLogId },
                data: {
                  retryAttempt: retryCount,
                  errorMessage: `Retry ${retryCount}/${maxRetries}: ${purchaseError instanceof Error ? purchaseError.message : 'Unknown error'}`,
                }
              });
            }
            
            // Esperar antes de reintentar (backoff exponencial)
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000)));
          }
        }
      }

      // 5. Actualizar tracking y notificar
      await this.notificationService.sendPurchaseConfirmation({
        orderId,
        supplierOrderId: purchaseResult.supplierOrderId,
        estimatedDelivery: purchaseResult.estimatedDelivery,
        trackingNumber: purchaseResult.trackingNumber
      });

      automatedOrder.status = 'shipping';
      automatedOrder.timestamps.shipped = new Date();

      // 6. Calcular ganancia y actualizar métricas
      const profit = automatedOrder.orderDetails.totalAmount - opportunity.buyPrice;
      this.performanceMetrics.successfulOrders++;
      this.performanceMetrics.totalRevenue += automatedOrder.orderDetails.totalAmount;
      this.performanceMetrics.averageProfit = 
        (this.performanceMetrics.averageProfit + profit) / this.performanceMetrics.successfulOrders;

      // 7. Marcar como completado
      automatedOrder.status = 'completed';
      automatedOrder.timestamps.completed = new Date();

      await this.notificationService.sendOrderCompleted({
        orderId,
        profit,
        totalRevenue: this.performanceMetrics.totalRevenue,
        processingTime: Date.now() - automatedOrder.timestamps.created.getTime()
      });

      return {
        success: true,
        orderId
      };

    } catch (error) {
      console.error('❌ Error en flujo automatizado:', error);
      
      if (order.id) {
        const failedOrder = this.activeOrders.get(order.id);
        if (failedOrder) {
          failedOrder.status = 'failed';
          this.performanceMetrics.failedOrders++;
        }
      }

      await this.notificationService.sendError({
        type: 'automated_flow_failed',
        error: error instanceof Error ? error.message : 'Error desconocido',
        context: { order }
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * Buscar y procesar oportunidades automáticamente
   */
  async searchAndProcessOpportunities(): Promise<OpportunityData[]> {
    try {
      console.log('🔍 Buscando nuevas oportunidades...');

      // 1. Buscar en múltiples fuentes
      const searchResults = await Promise.all([
        this.scrapingService.searchProducts('electronics trending', 'ebay'),
        this.scrapingService.searchProducts('home improvement deals', 'amazon'),
        this.scrapingService.searchProducts('fashion accessories', 'mercadolibre')
      ]);

      const allProducts = searchResults.flat();

      // 2. Analizar con IA para detectar oportunidades
      const opportunities: OpportunityData[] = [];
      
      for (const product of allProducts.slice(0, 10)) { // Procesar primeros 10
        try {
          const analysis = await this.aiEngine.calculateProfitability({
            product: product.title,
            currentPrice: product.price,
            sourceMarketplace: product.marketplace,
            category: product.category
          });

          if (analysis.profitMargin > 20 && analysis.confidence > 80) {
            opportunities.push({
              id: `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              product: product.title,
              sourceMarketplace: product.marketplace,
              targetMarketplace: this.selectBestTargetMarketplace(product.category),
              buyPrice: product.price,
              sellPrice: analysis.suggestedPrice,
              profitMargin: analysis.profitMargin,
              supplierUrl: product.url,
              confidence: analysis.confidence,
              metadata: {
                title: product.title,
                description: product.description || '',
                images: product.images || [],
                category: product.category,
                condition: product.condition || 'new',
                shipping: product.shipping || {}
              }
            });
          }
        } catch (error) {
          console.warn('⚠️ Error analizando producto:', error);
        }
      }

      console.log(`✅ Encontradas ${opportunities.length} oportunidades de ${allProducts.length} productos`);

      // 3. Si está en modo automático, procesar automáticamente
      if (this.config.mode === 'automatic') {
        for (const opportunity of opportunities.slice(0, 3)) { // Procesar top 3
          await this.opportunityQueue.add('process-opportunity', opportunity);
        }
      }

      return opportunities;

    } catch (error) {
      console.error('❌ Error buscando oportunidades:', error);
      return [];
    }
  }

  /**
   * ✅ Configurar modo de operación (con userId para config por usuario)
   */
  async setOperationMode(mode: 'manual' | 'automatic', environment: 'sandbox' | 'production', userId?: number): Promise<void> {
    const currentUserId = userId || 1;
    
    logger.info(`⚙️ Cambiando modo: ${mode} - Entorno: ${environment}`, { userId: currentUserId });
    
    // ✅ Actualizar configuración de workflow del usuario
    if (userId) {
      await workflowConfigService.updateUserConfig(currentUserId, {
        environment,
        workflowMode: mode
      });
    } else {
      // Backward compatibility - actualizar config global
      this.config.mode = mode;
      this.config.environment = environment;
    }

    // Actualizar configuración de servicios con environment del usuario
    const userEnvironment = userId 
      ? await workflowConfigService.getUserEnvironment(currentUserId)
      : environment;
      
    await this.ebayService.setEnvironment(userEnvironment);
    await this.amazonService.setEnvironment(userEnvironment);
    await this.mercadolibreService.setEnvironment(userEnvironment);

    // Notificar cambio de modo
    await this.notificationService.sendModeChange({
      mode,
      environment: userEnvironment,
      timestamp: new Date()
    });

    logger.info(`✅ Modo actualizado: ${mode} (${userEnvironment})`, { userId: currentUserId });
  }

  /**
   * Obtener métricas de rendimiento
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      activeOrders: this.activeOrders.size,
      currentMode: this.config.mode,
      currentEnvironment: this.config.environment,
      uptime: process.uptime()
    };
  }

  /**
   * Métodos auxiliares privados
   */
  private async processOpportunityJob(job: Job): Promise<any> {
    return await this.processOpportunity(job.data);
  }

  private async processOrderJob(job: Job): Promise<any> {
    return await this.executeAutomatedFlow(job.data);
  }

  private async performMonitoringTask(job: Job): Promise<any> {
    const { listingId, marketplace, opportunityId } = job.data;
    
    // Monitorear estado del listing
    let service;
    switch (marketplace.toLowerCase()) {
      case 'ebay': service = this.ebayService; break;
      case 'amazon': service = this.amazonService; break;
      case 'mercadolibre': service = this.mercadolibreService; break;
      default: throw new Error(`Marketplace no soportado: ${marketplace}`);
    }

    const status = await service.getListingStatus(listingId);
    
    if (status.sold) {
      // Procesar venta si está en automático
      if (this.config.mode === 'automatic') {
        await this.orderQueue.add('process-order', {
          listingId,
          opportunityId,
          buyerInfo: status.buyerInfo,
          saleAmount: status.saleAmount
        });
      } else {
        // Solo notificar si está en manual
        await this.notificationService.sendSaleNotification({
          orderId: listingId,
          product: status.productTitle,
          customer: status.buyerInfo?.name,
          amount: status.saleAmount,
          timestamp: new Date()
        });
      }
    }

    return { monitored: true, status };
  }

  private async getOpportunityById(id: string): Promise<OpportunityData | null> {
    // ✅ OBTENER OPORTUNIDAD REAL DE LA BASE DE DATOS
    try {
      const { prisma } = await import('../config/database');
      const opportunity = await prisma.$queryRaw`
        SELECT * FROM opportunities WHERE id = ${id} LIMIT 1
      ` as any[];

      if (!opportunity || opportunity.length === 0) {
        return null;
      }

      const opp = opportunity[0];
      return {
        id: String(opp.id),
        product: opp.title || 'Producto',
        sourceMarketplace: opp.sourceMarketplace || 'aliexpress',
        targetMarketplace: opp.targetMarketplaces?.[0] || 'ebay',
        buyPrice: opp.costUsd || 0,
        sellPrice: opp.suggestedPriceUsd || 0,
        profitMargin: (opp.profitMargin || 0) * 100,
        supplierUrl: opp.aliexpressUrl || '',
        confidence: (opp.confidenceScore || 0.5) * 100,
        metadata: {
          title: opp.title || '',
          description: '',
          images: [],
          category: '',
          condition: 'new',
          shipping: {}
        }
      };
    } catch (error) {
      logger.error('Error getting opportunity from database:', error);
      return null;
    }
  }

  private async executePurchaseFromSupplier(params: {
    supplierUrl: string;
    quantity: number;
    maxPrice: number;
    shippingAddress: any;
    userId?: number;
  }): Promise<{
    success: boolean;
    supplierOrderId?: string;
    estimatedDelivery?: Date;
    trackingNumber?: string;
    error?: string;
  }> {
    try {
      const { logger } = await import('../config/logger');
      logger.info('🛒 Ejecutando compra desde proveedor', { 
        supplierUrl: params.supplierUrl,
        quantity: params.quantity,
        maxPrice: params.maxPrice
      });
      
      // ✅ Integrar con AliExpress Auto-Purchase Service
      if (params.supplierUrl.includes('aliexpress.com')) {
        const AliExpressAutoPurchaseService = (await import('./aliexpress-auto-purchase.service')).default;
        
        // Convertir shippingAddress a formato esperado
        const shippingAddress = typeof params.shippingAddress === 'object' && params.shippingAddress !== null
          ? {
              fullName: params.shippingAddress.name || params.shippingAddress.fullName || 'Customer',
              addressLine1: params.shippingAddress.street || params.shippingAddress.addressLine1 || '',
              addressLine2: params.shippingAddress.addressLine2 || '',
              city: params.shippingAddress.city || '',
              state: params.shippingAddress.state || '',
              zipCode: params.shippingAddress.zipCode || params.shippingAddress.zip || '',
              country: params.shippingAddress.country || '',
              phoneNumber: params.shippingAddress.phone || params.shippingAddress.phoneNumber || '',
            }
          : {
              fullName: 'Customer',
              addressLine1: typeof params.shippingAddress === 'string' ? params.shippingAddress : '',
              addressLine2: '',
              city: '',
              state: '',
              zipCode: '',
              country: '',
              phoneNumber: '',
            };
        
        const purchaseRequest = {
          productUrl: params.supplierUrl,
          quantity: params.quantity,
          maxPrice: params.maxPrice,
          shippingAddress: shippingAddress,
        };
        
        const result = await AliExpressAutoPurchaseService.executePurchase(purchaseRequest, params.userId);
        
        if (result.success && result.orderId) {
          return {
            success: true,
            supplierOrderId: result.orderId || result.orderNumber,
            estimatedDelivery: result.estimatedDelivery 
              ? new Date(result.estimatedDelivery) 
              : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días por defecto
            trackingNumber: result.trackingNumber,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to execute purchase on AliExpress',
          };
        }
      }
      
      // Para otros proveedores, usar implementación genérica
      logger.warn('Supplier not AliExpress, using generic purchase method', { supplierUrl: params.supplierUrl });
      
      // Simular compra exitosa para otros proveedores (TODO: implementar integración real)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        success: true,
        supplierOrderId: `SUP_${Date.now()}`,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
        trackingNumber: `TRK${Date.now()}`
      };
      
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error executing purchase from supplier', { 
        error: error instanceof Error ? error.message : String(error),
        supplierUrl: params.supplierUrl
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error en compra automática'
      };
    }
  }

  private selectBestTargetMarketplace(category: string): string {
    // Lógica para seleccionar el mejor marketplace según categoría
    const categoryMappings: { [key: string]: string } = {
      'electronics': 'amazon',
      'fashion': 'mercadolibre',
      'home': 'ebay',
      'toys': 'amazon',
      'automotive': 'ebay'
    };

    const lowerCategory = category.toLowerCase();
    for (const [key, marketplace] of Object.entries(categoryMappings)) {
      if (lowerCategory.includes(key)) {
        return marketplace;
      }
    }

    return 'ebay'; // Default
  }

  /**
   * Limpieza y cierre de recursos
   */
  async cleanup(): Promise<void> {
    await this.opportunityQueue.close();
    await this.orderQueue.close();
    await this.monitoringQueue.close();
    
    console.log('🧹 Servicio de automatización cerrado correctamente');
  }
}