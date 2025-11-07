import puppeteer, { Browser } from 'puppeteer-core';
import type { Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';
import { prisma } from '../config/database';
import { getChromiumLaunchConfig } from '../utils/chromium';

puppeteer.use(StealthPlugin());

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

  constructor() {}

  /**
   * Initialize browser with stealth mode
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

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
   */
  async executePurchase(request: PurchaseRequest): Promise<PurchaseResult> {
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

      // WARNING: This is the POINT OF NO RETURN
      // Clicking this button will actually place the order and charge the payment method

      logger.warn('⚠️  ABOUT TO PLACE REAL ORDER - Remove this in testing!');
      
      // In production, uncomment this:
      /*
      const confirmButton = await page.$('button.place-order, .confirm-btn');
      if (confirmButton) {
        await confirmButton.click();
        logger.info('Order placed!');

        // Wait for order confirmation
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'order-confirmation.png' });

        // Extract order information
        const orderNumber = await page.$eval('.order-number, .order-id', 
          (el) => el.textContent || ''
        ).catch(() => 'UNKNOWN');

        const totalAmount = await page.$eval('.total-amount, .order-total', 
          (el) => el.textContent || ''
        ).then(text => parseFloat(text.replace(/[^0-9.]/g, ''))).catch(() => 0);

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
      }
      */

      // For testing, return mock success
      await page.close();
      
      return {
        success: false,
        error: 'Auto-purchase disabled for safety - Enable in production',
        screenshots: ['product-page.png', 'checkout-page.png', 'pre-purchase.png'],
      };

    } catch (error: any) {
      logger.error('Auto-purchase error', { error: error.message });
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
