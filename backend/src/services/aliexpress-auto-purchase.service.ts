// @ts-nocheck
// ✅ FASE 3: Dynamic imports para evitar SIGSEGV - NO importar puppeteer al nivel superior
import { trace } from '../utils/boot-trace';
trace('loading aliexpress-auto-purchase.service');

import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import { getChromiumLaunchConfig } from '../utils/chromium';

// ✅ FASE 3: Types para puppeteer dinámico
type Browser = any;
type Page = any;

/**
 * AliExpress Auto-Purchase Service
 * Automates the purchase process on AliExpress using Puppeteer
 * 
 * IMPORTANT: This is a semi-automated solution since AliExpress doesn't have a public API
 * Requires AliExpress account credentials and stored payment method
 */

export interface AliExpressCredentials {
  email: string;
  password: string;
  twoFactorEnabled?: boolean;
}

export interface PurchaseRequest {
  productUrl: string;
  quantity: number;
  maxPrice: number;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    phoneNumber: string;
  };
  notes?: string;
}

export interface PurchaseResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  totalAmount?: number;
  trackingNumber?: string;
  estimatedDelivery?: string;
  error?: string;
  screenshots?: string[]; // For debugging
}

export class AliExpressAutoPurchaseService {
  private browser: Browser | null = null;
  private isLoggedIn: boolean = false;
  private credentials: AliExpressCredentials | null = null;
  // ✅ FASE 3: Cache de módulo puppeteer cargado dinámicamente
  private puppeteerModule: any = null;

  constructor() {}

  // ✅ FASE 3: Lazy load puppeteer solo cuando se necesite
  private async loadPuppeteer(): Promise<any> {
    if (this.puppeteerModule) {
      return this.puppeteerModule;
    }
    
    const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
    if (disableBrowser) {
      throw new Error('Browser automation is disabled (DISABLE_BROWSER_AUTOMATION=true)');
    }

    try {
      const puppeteerCore = await import('puppeteer-core');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      
      const puppeteer = puppeteerCore.default;
      puppeteer.use(StealthPlugin());
      
      this.puppeteerModule = puppeteer;
      logger.info('[AutoPurchase] Puppeteer loaded successfully (dynamic import)');
      return puppeteer;
    } catch (error) {
      logger.error('[AutoPurchase] Failed to load puppeteer:', error);
      throw error;
    }
  }

  /**
   * Initialize browser with stealth mode
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    // ✅ FASE 3: Cargar puppeteer dinámicamente
    const puppeteer = await this.loadPuppeteer();

    const { executablePath, args, defaultViewport, headless } = await getChromiumLaunchConfig();

    this.browser = await puppeteer.launch({
      headless: headless ?? false,
      executablePath,
      args,
      defaultViewport,
    });

    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * Set AliExpress credentials
   */
  setCredentials(credentials: AliExpressCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Login to AliExpress
   */
  async login(): Promise<boolean> {
    if (!this.credentials) {
      throw new AppError('AliExpress credentials not set', 400);
    }

    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      logger.info('Navigating to AliExpress login page');
      await page.goto('https://login.aliexpress.com/', { waitUntil: 'networkidle2' });

      // Wait for login form
      await page.waitForSelector('input[type="text"], input[name="loginId"]', { timeout: 10000 });

      // Enter email
      await page.type('input[type="text"], input[name="loginId"]', this.credentials.email, { delay: 100 });

      // Enter password
      await page.type('input[type="password"], input[name="password"]', this.credentials.password, { delay: 100 });

      // Click login button
      await page.click('button[type="submit"], .login-submit');

      // Wait for navigation or 2FA
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if 2FA is required
      const is2FARequired = await page.$('.two-factor-code');
      if (is2FARequired && this.credentials.twoFactorEnabled) {
        logger.warn('2FA required - Manual intervention needed');
        // Here you could implement SMS/Email code input
        // For now, we'll wait for manual input
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds for manual 2FA
      }

      // Check if login was successful
      const url = page.url();
      if (url.includes('login')) {
        logger.error('Login failed - Still on login page');
        await page.screenshot({ path: 'login-failed.png' });
        return false;
      }

      logger.info('AliExpress login successful');
      this.isLoggedIn = true;
      await page.close();
      return true;

    } catch (error: any) {
      logger.error('AliExpress login error', { error: error.message });
      return false;
    }
  }

  /**
   * Execute automatic purchase on AliExpress
   * 
   * ✅ MEJORADO: Intenta usar Dropshipping API primero (más confiable)
   * Si falla o no hay credenciales, usa Puppeteer como fallback
   */
  async executePurchase(request: PurchaseRequest, userId?: number): Promise<PurchaseResult> {
    // ✅ NUEVO: Intentar usar Dropshipping API primero
    if (userId) {
      try {
        const { CredentialsManager } = await import('./credentials-manager.service');
        const { aliexpressDropshippingAPIService, refreshAliExpressDropshippingToken } = await import('./aliexpress-dropshipping-api.service');
        const { prisma } = await import('../config/database');
        const { resolveEnvironment } = await import('../utils/environment-resolver');
        const { logger: envLogger } = await import('../config/logger');
        
        // ✅ MEJORADO: Resolver ambiente usando utilidad centralizada
        // Intentar obtener credenciales del ambiente preferido, luego del alternativo si no se especificó explícitamente
        const preferredEnvironment = await resolveEnvironment({
          userId,
          default: 'production'
        });
        
        // Intentar ambos ambientes (preferido primero, luego alternativo)
        const environmentsToTry: Array<'sandbox' | 'production'> = [
          preferredEnvironment,
          preferredEnvironment === 'production' ? 'sandbox' : 'production'
        ];
        
        let dropshippingCreds: any = null;
        let resolvedEnv: 'sandbox' | 'production' | null = null;
        
        for (const env of environmentsToTry) {
          const creds = await CredentialsManager.getCredentials(
            userId,
            'aliexpress-dropshipping',
            env
          );
          
          if (creds && creds.accessToken) {
            dropshippingCreds = creds;
            resolvedEnv = env;
            if (env !== preferredEnvironment) {
              envLogger.debug('[ALIEXPRESS-AUTO-PURCHASE] Credenciales de Dropshipping API encontradas en ambiente alternativo', {
                preferred: preferredEnvironment,
                found: env,
                userId
              });
            }
            break;
          }
        }
        
        if (dropshippingCreds && dropshippingCreds.accessToken) {
          const activeEnvironment = (resolvedEnv || preferredEnvironment) as 'sandbox' | 'production';
          const refreshedResult = await refreshAliExpressDropshippingToken(userId, activeEnvironment, { minTtlMs: 60_000 });
          if (refreshedResult.credentials) {
            dropshippingCreds = refreshedResult.credentials;
          }
          logger.info('[ALIEXPRESS-AUTO-PURCHASE] Credenciales de Dropshipping API encontradas, intentando usar API oficial', {
            userId,
            productUrl: request.productUrl,
            environment: activeEnvironment,
            resolvedFrom: resolvedEnv,
            tokenRefreshed: refreshedResult.refreshed,
          });
          
          try {
            aliexpressDropshippingAPIService.setCredentials(dropshippingCreds);
            
            // Extraer productId de la URL
            const productIdMatch = request.productUrl.match(/[\/_](\d+)\.html/);
            const productId = productIdMatch ? productIdMatch[1] : null;
            
            if (!productId) {
              logger.warn('[ALIEXPRESS-AUTO-PURCHASE] No se pudo extraer productId de la URL (strict isolation: no browser fallback)', {
                url: request.productUrl
              });
              return {
                success: false,
                error: 'Could not extract productId from AliExpress URL. Dropshipping API requires productId.',
              };
            } else {
              // Obtener información del producto desde la API
              const productInfo = await aliexpressDropshippingAPIService.getProductInfo(productId, {
                localCountry: request.shippingAddress.country,
                localLanguage: 'es',
              });
              
              // Validar precio
              if (productInfo.salePrice > request.maxPrice) {
                logger.warn('[ALIEXPRESS-AUTO-PURCHASE] Precio excede máximo usando API', {
                  price: productInfo.salePrice,
                  maxPrice: request.maxPrice
                });
                return {
                  success: false,
                  error: `Price $${productInfo.salePrice} exceeds maximum $${request.maxPrice}`,
                };
              }
              
              // Determinar SKU si hay variantes (simplificado - usar el primero disponible)
              let selectedSkuId: string | undefined;
              if (productInfo.skus && productInfo.skus.length > 0) {
                const availableSku = productInfo.skus.find(sku => sku.stock > 0);
                if (availableSku) {
                  selectedSkuId = availableSku.skuId;
                }
              }
              
              // Seleccionar método de envío
              let shippingMethodId: string | undefined;
              if (productInfo.shippingInfo?.availableShippingMethods && productInfo.shippingInfo.availableShippingMethods.length > 0) {
                // Usar el método de envío más económico disponible
                const cheapestMethod = productInfo.shippingInfo.availableShippingMethods
                  .sort((a, b) => a.cost - b.cost)[0];
                shippingMethodId = cheapestMethod.methodId;
              }
              
              // Crear orden usando la API
              const placeOrderResult = await aliexpressDropshippingAPIService.placeOrder({
                productId,
                skuId: selectedSkuId,
                quantity: request.quantity,
                shippingAddress: request.shippingAddress,
                shippingMethodId,
                buyerMessage: request.notes,
              });
              
              logger.info('[ALIEXPRESS-AUTO-PURCHASE] Orden creada exitosamente usando Dropshipping API', {
                orderId: placeOrderResult.orderId,
                orderNumber: placeOrderResult.orderNumber,
                totalAmount: placeOrderResult.totalAmount,
                userId
              });
              
              // Guardar orden en base de datos
              try {
                await prisma.purchaseLog.create({
                  data: {
                    userId: userId,
                    productUrl: request.productUrl,
                    orderId: placeOrderResult.orderId,
                    orderNumber: placeOrderResult.orderNumber,
                    totalAmount: placeOrderResult.totalAmount,
                    currency: placeOrderResult.currency,
                    status: placeOrderResult.status,
                    supplierUrl: request.productUrl,
                    shippingAddress: JSON.stringify(request.shippingAddress),
                  },
                });
              } catch (dbError: any) {
                logger.warn('[ALIEXPRESS-AUTO-PURCHASE] Error guardando orden en DB', {
                  error: dbError?.message,
                  orderId: placeOrderResult.orderId
                });
                // No fallar si no se puede guardar en DB
              }
              
              return {
                success: true,
                orderId: placeOrderResult.orderId,
                orderNumber: placeOrderResult.orderNumber,
                totalAmount: placeOrderResult.totalAmount,
                estimatedDelivery: placeOrderResult.estimatedDelivery,
              };
            }
          } catch (apiError: any) {
            logger.warn('[ALIEXPRESS-AUTO-PURCHASE] Error usando Dropshipping API (strict isolation: no browser fallback)', {
              error: apiError?.message || String(apiError),
              userId,
              productUrl: request.productUrl,
              willFallback: false
            });
            
            // Si el error es de token expirado, no continuar con Puppeteer
            if (apiError.message === 'ACCESS_TOKEN_EXPIRED') {
              return {
                success: false,
                error: 'AliExpress Dropshipping API access token expired. Please refresh credentials.',
              };
            }
            
            return {
              success: false,
              error: `AliExpress Dropshipping API failed: ${apiError?.message || String(apiError)}`,
            };
          }
        } else {
          logger.debug('[ALIEXPRESS-AUTO-PURCHASE] No hay credenciales de Dropshipping API configuradas (strict isolation: no browser fallback)', {
            userId
          });
          return {
            success: false,
            error: 'AliExpress Dropshipping credentials not configured for this user/environment.',
          };
        }
      } catch (apiCheckError: any) {
        logger.warn('[ALIEXPRESS-AUTO-PURCHASE] Error verificando Dropshipping API (strict isolation: no browser fallback)', {
          error: apiCheckError?.message || String(apiCheckError),
          userId
        });
        return {
          success: false,
          error: `AliExpress Dropshipping verification failed: ${apiCheckError?.message || String(apiCheckError)}`,
        };
      }
    }
    
    // ✅ FALLBACK: Usar Puppeteer (método existente)
    logger.info('[ALIEXPRESS-AUTO-PURCHASE] Usando Puppeteer para compra automática (fallback o sin credenciales API)', {
      productUrl: request.productUrl
    });
    
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return {
          success: false,
          error: 'Failed to login to AliExpress',
        };
      }
    }

    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      logger.info('Navigating to product page', { url: request.productUrl });
      await page.goto(request.productUrl, { waitUntil: 'networkidle2' });

      // Take screenshot for debugging
      await page.screenshot({ path: 'product-page.png' });

      // Wait for product to load
      await page.waitForSelector('.product-price, .product-title', { timeout: 10000 });

      // Check price
      const priceText = await page.$eval('.product-price-value, .product-price', 
        (el) => el.textContent || ''
      );
      const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

      if (price > request.maxPrice) {
        logger.warn('Price exceeds maximum', { price, maxPrice: request.maxPrice });
        return {
          success: false,
          error: `Price $${price} exceeds maximum $${request.maxPrice}`,
        };
      }

      // Set quantity if possible
      if (request.quantity > 1) {
        const quantityInput = await page.$('input[type="number"], .quantity-input');
        if (quantityInput) {
          await quantityInput.click({ clickCount: 3 }); // Select all
          await quantityInput.type(request.quantity.toString());
        }
      }

      // Click "Buy Now" button
      const buyNowButton = await page.$('button.buy-now, .product-action .buynow');
      if (!buyNowButton) {
        logger.error('Buy Now button not found');
        return {
          success: false,
          error: 'Buy Now button not found on product page',
        };
      }

      await buyNowButton.click();
      logger.info('Clicked Buy Now button');

      // Wait for checkout page
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.screenshot({ path: 'checkout-page.png' });

      // Fill shipping address (if not already saved)
      const addressForm = await page.$('.shipping-address-form');
      if (addressForm) {
        logger.info('Filling shipping address');
        
        await page.type('input[name="fullName"]', request.shippingAddress.fullName, { delay: 50 });
        await page.type('input[name="address"]', request.shippingAddress.addressLine1, { delay: 50 });
        if (request.shippingAddress.addressLine2) {
          await page.type('input[name="address2"]', request.shippingAddress.addressLine2, { delay: 50 });
        }
        await page.type('input[name="city"]', request.shippingAddress.city, { delay: 50 });
        await page.type('input[name="zipCode"]', request.shippingAddress.zipCode, { delay: 50 });
        await page.type('input[name="phoneNumber"]', request.shippingAddress.phoneNumber, { delay: 50 });
      }

      // Add notes if provided
      if (request.notes) {
        const notesInput = await page.$('textarea[name="buyerMessage"], .order-notes');
        if (notesInput) {
          await notesInput.type(request.notes, { delay: 50 });
        }
      }

      // Take screenshot before confirming
      await page.screenshot({ path: 'pre-purchase.png' });

      // ✅ HABILITADO: Compra automática con validaciones de seguridad
      // Las validaciones de capital y saldo PayPal se realizan ANTES de llegar aquí
      
      // ✅ Verificación doble para compras superiores a $100
      const estimatedTotal = price * request.quantity;
      if (estimatedTotal > 100) {
        logger.warn('Compra de alto valor detectada', { 
          estimatedTotal, 
          maxPrice: request.maxPrice,
          url: request.productUrl 
        });
        
        // Agregar delay adicional para compras de alto valor
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const confirmButton = await page.$('button.place-order, .confirm-btn, button[type="submit"]');
      if (!confirmButton) {
        logger.error('Confirm button not found');
        await page.close();
        return {
          success: false,
          error: 'Confirm button not found on checkout page',
          screenshots: ['product-page.png', 'checkout-page.png', 'pre-purchase.png'],
        };
      }

      // ✅ Realizar compra
      logger.info('Placing order on AliExpress', { 
        productUrl: request.productUrl,
        estimatedTotal,
        maxPrice: request.maxPrice
      });
      
      await confirmButton.click();
      logger.info('Order placed!');

      // Wait for order confirmation
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'order-confirmation.png' });

      // Extract order information
      const orderNumber = await page.$eval('.order-number, .order-id, [data-order-id]', 
        (el) => el.textContent || ''
      ).catch(() => {
        // Intentar extraer de la URL
        const url = page.url();
        const match = url.match(/orderId[=:](\d+)/i);
        return match ? match[1] : 'UNKNOWN';
      });

      const totalAmount = await page.$eval('.total-amount, .order-total, [data-total]', 
        (el) => el.textContent || ''
      ).then(text => parseFloat(text.replace(/[^0-9.]/g, ''))).catch(() => estimatedTotal);

      logger.info('Order placed successfully', { orderNumber, totalAmount });

      // Store order in database
      await this.storeOrder({
        orderNumber,
        productUrl: request.productUrl,
        totalAmount,
        shippingAddress: request.shippingAddress,
      });

      await page.close();

      return {
        success: true,
        orderNumber,
        orderId: orderNumber,
        totalAmount,
        estimatedDelivery: '15-30 days', // AliExpress typical
      };

    } catch (error: any) {
      logger.error('Auto-purchase error', { error: error.message });
      
      // ✅ SISTEMA DE ALERTAS: Notificar si Puppeteer falla
      try {
        const { notificationService } = await import('./notification.service');
        const { prisma } = await import('../config/database');
        
        // Intentar obtener userId del contexto (puede estar en request o metadata)
        let userId: number | null = null;
        try {
          // Buscar en PurchaseLog más reciente para obtener userId
          const recentLog = await prisma.purchaseLog.findFirst({
            where: {
              supplierUrl: { contains: request.productUrl.substring(0, 50) }
            },
            orderBy: { createdAt: 'desc' }
          });
          userId = recentLog?.userId || null;
        } catch (logError) {
          logger.warn('No se pudo obtener userId para alerta de Puppeteer', { error: logError });
        }

        // Determinar tipo de error
        const isPuppeteerError = error.message?.includes('puppeteer') || 
                                 error.message?.includes('browser') ||
                                 error.message?.includes('page') ||
                                 error.message?.includes('timeout') ||
                                 error.message?.includes('navigation');

        if (isPuppeteerError && userId) {
          await notificationService.sendToUser(userId, {
            type: 'SYSTEM_ERROR',
            title: '⚠️ Error en compra automática (Puppeteer)',
            message: `Falló la automatización de compra. Error: ${error.message.substring(0, 200)}`,
            category: 'AUTOMATION',
            priority: 'HIGH',
            data: {
              errorType: 'PUPPETEER_ERROR',
              errorMessage: error.message,
              productUrl: request.productUrl,
              requiresManualAction: true,
              suggestedAction: 'Revisar credenciales de AliExpress o ejecutar compra manualmente'
            }
          });

          logger.warn('Alerta de error Puppeteer enviada', {
            userId,
            error: error.message,
            productUrl: request.productUrl
          });
        }
      } catch (alertError: any) {
        logger.error('Error enviando alerta de Puppeteer', { 
          error: alertError.message,
          originalError: error.message 
        });
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Store order information in database
   */
  private async storeOrder(orderData: any): Promise<void> {
    try {
      await prisma.systemConfig.create({
        data: {
          key: `aliexpress_order_${orderData.orderNumber}`,
          value: JSON.stringify({
            orderNumber: orderData.orderNumber,
            productUrl: orderData.productUrl,
            totalAmount: orderData.totalAmount,
            shippingAddress: orderData.shippingAddress,
            purchasedAt: new Date(),
            status: 'PENDING',
          }),
        },
      });
    } catch (error) {
      logger.error('Failed to store order in database', { error });
    }
  }

  /**
   * Get order tracking information
   */
  async getOrderTracking(orderNumber: string): Promise<any> {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      await page.goto(`https://www.aliexpress.com/p/order/detail.html?orderId=${orderNumber}`, 
        { waitUntil: 'networkidle2' }
      );

      // Extract tracking information
      const trackingNumber = await page.$eval('.tracking-number', 
        (el) => el.textContent || ''
      ).catch(() => null);

      const orderStatus = await page.$eval('.order-status', 
        (el) => el.textContent || ''
      ).catch(() => 'UNKNOWN');

      await page.close();

      return {
        orderNumber,
        trackingNumber,
        status: orderStatus,
      };

    } catch (error: any) {
      logger.error('Failed to get tracking info', { error: error.message });
      return null;
    }
  }
}

export default new AliExpressAutoPurchaseService();
