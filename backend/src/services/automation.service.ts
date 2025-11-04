import { Queue, Worker, Job } from 'bullmq';
import { ScrapingService } from './scraping.service';
import { EBayService } from './ebay.service';
import { AmazonService } from './amazon.service';
import { MercadoLibreService } from './mercadolibre.service';
import { AIOpportunityEngine } from './ai-opportunity.service';
import { NotificationService } from './notifications.service';
import { SecureCredentialManager } from './security.service';

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
    const isRedisAvailable = process.env.REDIS_URL !== undefined;
    
    if (isRedisAvailable) {
      const redisConfig = { host: 'localhost', port: 6379 };
      this.opportunityQueue = new Queue('opportunity-processing', { connection: redisConfig });
      this.orderQueue = new Queue('order-processing', { connection: redisConfig });
      this.monitoringQueue = new Queue('monitoring', { connection: redisConfig });
      this.initializeWorkers();
    } else {
      console.log('ℹ️  Automation queues disabled (Redis not configured)');
    }
  }

  /**
   * Inicializar workers para procesamiento en background
   */
  private initializeWorkers(): void {
    const redisConfig = { host: 'localhost', port: 6379 };
    
    // Worker para procesar oportunidades
    new Worker('opportunity-processing', async (job: Job) => {
      return await this.processOpportunityJob(job);
    }, { connection: redisConfig });

    // Worker para procesar órdenes automatizadas
    new Worker('order-processing', async (job: Job) => {
      return await this.processOrderJob(job);
    }, { connection: redisConfig });

    // Worker para monitoreo continuo
    new Worker('monitoring', async (job: Job) => {
      return await this.performMonitoringTask(job);
    }, { connection: redisConfig });
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
      console.log(`🎯 Procesando oportunidad: ${opportunityData.product}`);

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

      // 2. Si está en automático, proceder con compra automática
      automatedOrder.status = 'processing';
      automatedOrder.timestamps.processed = new Date();

      // 3. Obtener datos de la oportunidad original
      const opportunity = await this.getOpportunityById(automatedOrder.opportunityId);
      if (!opportunity) {
        throw new Error('Oportunidad no encontrada');
      }

      // 4. Realizar compra automática al proveedor
      const purchaseResult = await this.executePurchaseFromSupplier({
        supplierUrl: opportunity.supplierUrl,
        quantity: automatedOrder.orderDetails.quantity,
        maxPrice: opportunity.buyPrice,
        shippingAddress: automatedOrder.customerInfo.address
      });

      if (!purchaseResult.success) {
        throw new Error(`Error en compra automática: ${purchaseResult.error}`);
      }

      automatedOrder.status = 'purchasing';
      automatedOrder.timestamps.purchased = new Date();

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
   * Configurar modo de operación
   */
  async setOperationMode(mode: 'manual' | 'automatic', environment: 'sandbox' | 'production'): Promise<void> {
    console.log(`⚙️ Cambiando modo: ${mode} - Entorno: ${environment}`);
    
    this.config.mode = mode;
    this.config.environment = environment;

    // Actualizar configuración de servicios
    await this.ebayService.setEnvironment(environment);
    await this.amazonService.setEnvironment(environment);
    await this.mercadolibreService.setEnvironment(environment);

    // Notificar cambio de modo
    await this.notificationService.sendModeChange({
      mode,
      environment,
      timestamp: new Date()
    });

    console.log(`✅ Modo actualizado: ${mode} (${environment})`);
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
    // En implementación real, obtener de base de datos
    // Por ahora retornar mock data
    return {
      id,
      product: 'Mock Product',
      sourceMarketplace: 'ebay',
      targetMarketplace: 'amazon',
      buyPrice: 25.99,
      sellPrice: 39.99,
      profitMargin: 35.0,
      supplierUrl: 'https://example.com/product',
      confidence: 85,
      metadata: {
        title: 'Mock Product Title',
        description: 'Mock description',
        images: [],
        category: 'Electronics',
        condition: 'new',
        shipping: {}
      }
    };
  }

  private async executePurchaseFromSupplier(params: {
    supplierUrl: string;
    quantity: number;
    maxPrice: number;
    shippingAddress: any;
  }): Promise<{
    success: boolean;
    supplierOrderId?: string;
    estimatedDelivery?: Date;
    trackingNumber?: string;
    error?: string;
  }> {
    try {
      // En implementación real, integrar con APIs de proveedores
      // o usar automatización web para compras
      
      console.log(`🛒 Comprando desde: ${params.supplierUrl}`);
      
      // Simular compra exitosa
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        success: true,
        supplierOrderId: `SUP_${Date.now()}`,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
        trackingNumber: `TRK${Date.now()}`
      };
      
    } catch (error) {
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