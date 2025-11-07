import puppeteer, { Browser, Page, HTTPResponse } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import axios from 'axios';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../config/logger';
import { selectorAdapter } from './selector-adapter.service';
import { proxyManager } from './proxy-manager.service';
import { apiAvailability } from './api-availability.service';
import { retryScrapingOperation } from '../utils/retry.util';
import { getChromiumLaunchConfig } from '../utils/chromium';

// Apply stealth plugin to make Puppeteer undetectable
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

/**
 * Configuration for stealth scraping
 */
export interface StealthConfig {
  useResidentialProxies: boolean;
  proxyRotationInterval: number; // minutes
  humanDelayRange: [number, number]; // seconds
  mouseMovementSimulation: boolean;
  scrollBehavior: boolean;
  captchaSolving: boolean;
  fingerprintRotation: boolean;
  sessionDuration: number; // minutes
  maxRetries: number;
  timeout: number; // milliseconds
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

/**
 * Enhanced scraped product data
 */
export interface EnhancedScrapedProduct {
  title: string;
  description: string;
  price: number;
  currency: string;
  originalPrice?: number;
  discount?: number;
  images: string[];
  mainImage: string;
  category?: string;
  specs?: Record<string, any>;
  shipping?: {
    cost?: number;
    estimatedDays?: string;
    freeShipping?: boolean;
  };
  stock?: number;
  rating?: number;
  reviews?: number;
  orders?: number;
  seller?: {
    name: string;
    rating?: number;
    location?: string;
    positiveScore?: number;
  };
  variations?: Array<{
    name: string;
    options: string[];
    prices?: Record<string, number>;
  }>;
  metadata?: {
    scrapedAt: Date;
    sourceUrl: string;
    scrapeMethod: 'stealth' | 'api' | 'fallback';
  };
}

/**
 * Browser fingerprint for anti-detection
 */
interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  language: string;
  timezone: string;
  webgl: string;
  canvas: string;
}

/**
 * Advanced Stealth Scraping Service for AliExpress
 * 
 * Features:
 * - Undetectable browser automation with puppeteer-extra
 * - Human-like behavior simulation (mouse movements, scrolling)
 * - Automatic captcha solving integration
 * - Proxy rotation and fingerprint management
 * - Adaptive selector system
 * - Automatic retry with exponential backoff
 */
export class StealthScrapingService {
  private browser: Browser | null = null;
  private config: StealthConfig;
  private currentProxy: ProxyConfig | null = null;
  private proxyList: ProxyConfig[] = [];
  private currentFingerprint: BrowserFingerprint | null = null;
  private lastProxyRotation: Date = new Date();
  private requestCount = 0;
  private failedProxies: Set<string> = new Set();
  
  // Captcha solving APIs
  private readonly ANTI_CAPTCHA_KEY = process.env.ANTI_CAPTCHA_API_KEY;
  private readonly TWO_CAPTCHA_KEY = process.env.TWO_CAPTCHA_API_KEY;
  
  // AI for description enhancement
  private readonly AI_API_KEY = process.env.GROQ_API_KEY;

  constructor(config?: Partial<StealthConfig>) {
    this.config = {
      useResidentialProxies: true,
      proxyRotationInterval: 5,
      humanDelayRange: [1.0, 3.0],
      mouseMovementSimulation: true,
      scrollBehavior: true,
      captchaSolving: true,
      fingerprintRotation: true,
      sessionDuration: 30,
      maxRetries: 3,
      timeout: 30000,
      ...config,
    };

    this.loadProxies();
    logger.info('StealthScrapingService initialized with config:', this.config);
  }

  /**
   * Load proxies from environment or configuration
   */
  private loadProxies(): void {
    const proxyEnv = process.env.PROXY_LIST;
    
    if (proxyEnv) {
      try {
        const proxies = JSON.parse(proxyEnv);
        this.proxyList = proxies.map((proxy: any) => ({
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
          protocol: proxy.protocol || 'http',
        }));
        logger.info(`Loaded ${this.proxyList.length} proxies`);
      } catch (error) {
        logger.error('Failed to parse proxy list:', error);
      }
    }

    // Add ScraperAPI as fallback proxy
    if (process.env.SCRAPERAPI_KEY) {
      this.proxyList.push({
        url: `http://scraperapi:${process.env.SCRAPERAPI_KEY}@proxy-server.scraperapi.com:8001`,
      });
    }
  }

  /**
   * Initialize browser with stealth configuration
   */
  private async initializeBrowser(proxy?: ProxyConfig): Promise<Browser> {
    let executablePath: string | undefined = process.env.PUPPETEER_EXECUTABLE_PATH;

    if (!executablePath) {
      try {
        const config = await getChromiumLaunchConfig();
        executablePath = config.executablePath;
      } catch (error) {
        logger.warn('Chromium helper failed to resolve executable:', (error as Error).message);
      }
    }

    // Primero intentar encontrar Chromium usando 'which'
    if (!executablePath) {
      try {
        const chromiumPath = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (chromiumPath && fs.existsSync(chromiumPath)) {
          executablePath = chromiumPath;
          logger.info(`Found system Chromium at: ${executablePath}`);
        }
      } catch (e) {
        // 'which' no encontró Chromium, continuar con otras opciones
      }
    }
    
    // Si no se encontró, buscar en el store de Nix
    if (!executablePath) {
      try {
        const nixStorePath = execSync('find /nix/store -name chromium -type f 2>/dev/null | head -1', { encoding: 'utf-8' }).trim();
        if (nixStorePath && fs.existsSync(nixStorePath)) {
          executablePath = nixStorePath;
          logger.info(`Found Nix Chromium at: ${executablePath}`);
        }
      } catch (e) {
        // Continuar sin Chromium del sistema
      }
    }
    
    try {
      const chromiumConfig = await getChromiumLaunchConfig([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]);

      const launchOptions: any = {
        headless: chromiumConfig.headless,
        args: chromiumConfig.args,
        executablePath: chromiumConfig.executablePath,
      };

      executablePath = launchOptions.executablePath;

      logger.info(`Using system Chromium: ${launchOptions.executablePath}`);

      // Add proxy if provided
      if (proxy) {
        if (proxy.url) {
          launchOptions.args.push(`--proxy-server=${proxy.url}`);
        } else if (proxy.host && proxy.port) {
          launchOptions.args.push(`--proxy-server=${proxy.protocol}://${proxy.host}:${proxy.port}`);
        }
      }

      // Use random viewport size to avoid fingerprinting
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1536, height: 864 },
      ];
      const viewport = viewports[Math.floor(Math.random() * viewports.length)];

      this.browser = await puppeteer.launch(launchOptions);

      // Create fingerprint
      this.currentFingerprint = await this.generateFingerprint(viewport);

      logger.info('Browser initialized with stealth configuration');
      return this.browser;
    } catch (error: any) {
      logger.error('Failed to initialize browser:', error);
      // Intentar con configuración mínima como fallback
      try {
        logger.info('Attempting browser launch with minimal configuration');
        const minimalOptions: any = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        };
        
        if (executablePath) {
          minimalOptions.executablePath = executablePath;
        }
        
        this.browser = await puppeteer.launch(minimalOptions);
        logger.info('Browser initialized with minimal configuration');
        return this.browser;
      } catch (fallbackError: any) {
        logger.error('Failed to initialize browser with fallback:', fallbackError);
        throw new AppError(`Failed to initialize stealth browser: ${fallbackError.message}`, 500);
      }
    }
  }

  /**
   * Generate random browser fingerprint
   */
  private async generateFingerprint(viewport: { width: number; height: number }): Promise<BrowserFingerprint> {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
    const languages = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE'];
    const timezones = ['America/New_York', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles'];

    return {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
      viewport,
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      language: languages[Math.floor(Math.random() * languages.length)],
      timezone: timezones[Math.floor(Math.random() * timezones.length)],
      webgl: this.generateRandomWebGLVendor(),
      canvas: this.generateRandomCanvasFingerprint(),
    };
  }

  private generateRandomWebGLVendor(): string {
    const vendors = [
      'Intel Inc.',
      'NVIDIA Corporation',
      'AMD',
      'Apple Inc.',
    ];
    return vendors[Math.floor(Math.random() * vendors.length)];
  }

  private generateRandomCanvasFingerprint(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Apply fingerprint to page
   */
  private async applyFingerprint(page: Page): Promise<void> {
    if (!this.currentFingerprint) return;

    const { userAgent, viewport, platform, language, timezone, webgl, canvas } = this.currentFingerprint;

    await page.setUserAgent(userAgent);
    await page.setViewport(viewport);

    // Override navigator properties
    await page.evaluateOnNewDocument((platform, language, webgl, canvas) => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
      Object.defineProperty(navigator, 'language', { get: () => language });
      Object.defineProperty(navigator, 'languages', { get: () => [language] });
      
      // Override WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return webgl;
        if (parameter === 37446) return webgl;
        return getParameter.call(this, parameter);
      };

      // Override canvas fingerprinting
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        const context = this.getContext('2d');
        if (context) {
          context.fillText(canvas, 0, 0);
        }
        return originalToDataURL.apply(this, arguments as any);
      };
    }, platform, language, webgl, canvas);

    // Set timezone
    await page.emulateTimezone(timezone);

    logger.info('Fingerprint applied to page');
  }

  /**
   * Simulate human-like behavior
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    if (!this.config.scrollBehavior && !this.config.mouseMovementSimulation) return;

    try {
      // Random mouse movements
      if (this.config.mouseMovementSimulation) {
        const width = page.viewport()?.width || 1920;
        const height = page.viewport()?.height || 1080;
        
        for (let i = 0; i < 3; i++) {
          await page.mouse.move(
            Math.random() * width,
            Math.random() * height,
            { steps: 10 }
          );
          await this.randomDelay(100, 300);
        }
      }

      // Random scrolling
      if (this.config.scrollBehavior) {
        await page.evaluate(() => {
          window.scrollBy({
            top: Math.random() * 500 + 200,
            behavior: 'smooth',
          });
        });
        await this.randomDelay(500, 1000);

        await page.evaluate(() => {
          window.scrollBy({
            top: -(Math.random() * 300 + 100),
            behavior: 'smooth',
          });
        });
      }

      await this.randomDelay(...this.config.humanDelayRange);
    } catch (error) {
      logger.warn('Failed to simulate human behavior:', error);
    }
  }

  /**
   * Random delay to simulate human behavior
   */
  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check for captcha and solve if present
   */
  private async detectAndSolveCaptcha(page: Page): Promise<boolean> {
    if (!this.config.captchaSolving) return false;

    try {
      // Check for common captcha elements
      const captchaSelectors = [
        'iframe[src*="captcha"]',
        'iframe[src*="recaptcha"]',
        '#captcha',
        '.captcha',
        '[data-callback*="captcha"]',
      ];

      for (const selector of captchaSelectors) {
        const captchaElement = await page.$(selector);
        if (captchaElement) {
          logger.info('Captcha detected, attempting to solve...');
          
          // Try to solve captcha
          const solved = await this.solveCaptcha(page, selector);
          if (solved) {
            logger.info('Captcha solved successfully');
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error('Error detecting/solving captcha:', error);
      return false;
    }
  }

  /**
   * Solve captcha using external service
   */
  private async solveCaptcha(page: Page, selector: string): Promise<boolean> {
    // This would integrate with 2Captcha or Anti-Captcha service
    // For now, we'll implement a placeholder
    
    if (!this.TWO_CAPTCHA_KEY && !this.ANTI_CAPTCHA_KEY) {
      logger.warn('No captcha solving service configured');
      return false;
    }

    try {
      // Get page URL and sitekey
      const url = page.url();
      
      // TODO: Implement actual captcha solving integration
      // This would require:
      // 1. Extract sitekey from iframe
      // 2. Send to 2Captcha/Anti-Captcha API
      // 3. Wait for solution
      // 4. Inject solution into page
      
      logger.info('Captcha solving not yet implemented, waiting for manual solve...');
      await this.randomDelay(5000, 10000);
      
      return false;
    } catch (error) {
      logger.error('Failed to solve captcha:', error);
      return false;
    }
  }

  /**
   * Rotate proxy if needed
   */
  private shouldRotateProxy(): boolean {
    const now = new Date();
    const minutesSinceRotation = (now.getTime() - this.lastProxyRotation.getTime()) / 60000;
    return minutesSinceRotation >= this.config.proxyRotationInterval;
  }

  /**
   * Get next proxy from list
   */
  private getNextProxy(): ProxyConfig | null {
    if (this.proxyList.length === 0) return null;

    // Filter out failed proxies
    const availableProxies = this.proxyList.filter(proxy => {
      const proxyKey = proxy.url || `${proxy.host}:${proxy.port}`;
      return !this.failedProxies.has(proxyKey);
    });

    if (availableProxies.length === 0) {
      // Reset failed proxies if all have failed
      this.failedProxies.clear();
      return this.proxyList[0];
    }

    const randomIndex = Math.floor(Math.random() * availableProxies.length);
    return availableProxies[randomIndex];
  }

  /**
   * Mark proxy as failed
   */
  private markProxyAsFailed(proxy: ProxyConfig): void {
    const proxyKey = proxy.url || `${proxy.host}:${proxy.port}`;
    this.failedProxies.add(proxyKey);
    logger.warn(`Proxy marked as failed: ${proxyKey}`);
  }

  /**
   * Scrape AliExpress product with stealth mode
   */
  async scrapeAliExpressProduct(url: string, userId: number): Promise<EnhancedScrapedProduct> {
    // ✅ Usar retry para scraping (puede fallar por bloqueos temporales)
    const result = await retryScrapingOperation(
      async () => {
        return await this._scrapeAliExpressProductInternal(url, userId);
      },
      {
        maxRetries: 5,
        onRetry: (attempt, error, delay) => {
          logger.warn(`Retrying scrapeAliExpressProduct (attempt ${attempt})`, {
            url,
            userId,
            error: error.message,
            delay,
          });
        },
      }
    );

    if (!result.success || !result.data) {
      throw new AppError(`Failed to scrape product after retries: ${result.error?.message || 'Unknown error'}`, 500);
    }

    return result.data;
  }

  /**
   * Internal scraping method (wrapped by retry)
   */
  private async _scrapeAliExpressProductInternal(url: string, userId: number): Promise<EnhancedScrapedProduct> {
    // ✅ CHECK: Verify scraping API is available
    const capabilities = await apiAvailability.getCapabilities(userId);
    if (!capabilities.canScrapeAliExpress) {
      logger.error('Scraping failed: No scraping API configured (ScraperAPI or ZenRows)');
      throw new AppError(
        'Scraping service not available. Please configure ScraperAPI or ZenRows in /settings/apis',
        503
      );
    }

    // Rotate proxy if needed
    if (!this.currentProxy || this.shouldRotateProxy()) {
      this.currentProxy = this.getNextProxy();
      this.lastProxyRotation = new Date();
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }

    // Initialize browser if needed
    if (!this.browser) {
      await this.initializeBrowser(this.currentProxy || undefined);
    }

    const page = await this.browser!.newPage();

    try {
      // Apply fingerprint
      await this.applyFingerprint(page);

      // Set timeout
      page.setDefaultTimeout(this.config.timeout);

      // Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      logger.info(`Navigating to AliExpress product: ${url}`);

      // Navigate to page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior(page);

      // Check for captcha
      const hasCaptcha = await this.detectAndSolveCaptcha(page);
      if (hasCaptcha) {
        await this.randomDelay(2000, 4000);
      }

      // Extract product data
      const productData = await this.extractProductData(page, url);

      // Close page
      await page.close();

      // Enhance description with AI if available
      if (this.AI_API_KEY && productData.title) {
        try {
          productData.description = await this.enhanceDescriptionWithAI(
            productData.title,
            productData.description
          );
        } catch (error) {
          logger.warn('Failed to enhance description with AI:', error);
        }
      }

      logger.info(`Successfully scraped product: ${productData.title}`);
      return productData;
    } catch (error) {
      await page.close();
      
      // Mark proxy as failed if error is proxy-related
      if (this.currentProxy && this.isProxyError(error)) {
        this.markProxyAsFailed(this.currentProxy);
        this.currentProxy = null;
      }

      throw error;
    }
  }

  /**
   * Check if error is proxy-related
   */
  private isProxyError(error: any): boolean {
    const proxyErrorMessages = [
      'ERR_PROXY_CONNECTION_FAILED',
      'ERR_TUNNEL_CONNECTION_FAILED',
      'ERR_CONNECTION_REFUSED',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];

    const errorString = error?.message || error?.toString() || '';
    return proxyErrorMessages.some(msg => errorString.includes(msg));
  }

  /**
   * Extract product data from page using adaptive selectors
   */
  private async extractProductData(page: Page, url: string): Promise<EnhancedScrapedProduct> {
    logger.info('Extracting product data with adaptive selectors...');

    // Use adaptive selector system for robust element finding
    const titleElement = await selectorAdapter.findElement(page, 'productTitle');
    const title = await selectorAdapter.extractText(titleElement) || 'Unknown Product';

    const descriptionElement = await selectorAdapter.findElement(page, 'description');
    const description = await selectorAdapter.extractText(descriptionElement) || '';

    const priceElement = await selectorAdapter.findElement(page, 'productPrice');
    const priceText = await selectorAdapter.extractText(priceElement) || '0';
    const priceMatch = priceText.match(/[\d,.]+/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

    const originalPriceElement = await selectorAdapter.findElement(page, 'originalPrice');
    const originalPriceText = await selectorAdapter.extractText(originalPriceElement) || '0';
    const originalPriceMatch = originalPriceText.match(/[\d,.]+/);
    const originalPrice = originalPriceMatch ? parseFloat(originalPriceMatch[0].replace(/,/g, '')) : undefined;

    // Extract images using adaptive selector
    const imageElements = await selectorAdapter.findElements(page, 'productImages');
    const images: string[] = [];
    
    for (const imgElement of imageElements) {
      const src = await selectorAdapter.extractAttribute(imgElement, 'src');
      const dataSrc = await selectorAdapter.extractAttribute(imgElement, 'data-src');
      const imageUrl = src || dataSrc;
      
      if (imageUrl && !images.includes(imageUrl)) {
        images.push(imageUrl);
      }
    }

    // Extract rating
    const ratingElement = await selectorAdapter.findElement(page, 'rating');
    const ratingText = await selectorAdapter.extractText(ratingElement) || '0';
    const ratingMatch = ratingText.match(/[\d.]+/);
    const rating = ratingMatch ? parseFloat(ratingMatch[0]) : undefined;

    // Extract reviews count
    const reviewsElement = await selectorAdapter.findElement(page, 'reviews');
    const reviewsText = await selectorAdapter.extractText(reviewsElement) || '0';
    const reviewsMatch = reviewsText.match(/[\d,]+/);
    const reviews = reviewsMatch ? parseInt(reviewsMatch[0].replace(/,/g, '')) : undefined;

    // Extract orders count
    const ordersElement = await selectorAdapter.findElement(page, 'orders');
    const ordersText = await selectorAdapter.extractText(ordersElement) || '0';
    const ordersMatch = ordersText.match(/[\d,]+/);
    const orders = ordersMatch ? parseInt(ordersMatch[0].replace(/,/g, '')) : undefined;

    // Extract seller info
    const sellerElement = await selectorAdapter.findElement(page, 'seller');
    const sellerName = await selectorAdapter.extractText(sellerElement) || 'Unknown Seller';

    // Extract shipping info
    const shippingElement = await selectorAdapter.findElement(page, 'shipping');
    const shippingText = await selectorAdapter.extractText(shippingElement) || '';
    const shippingMatch = shippingText.match(/[\d.]+/);
    const shippingCost = shippingMatch ? parseFloat(shippingMatch[0]) : undefined;

    const shippingTimeElement = await selectorAdapter.findElement(page, 'shippingTime');
    const shippingTimeText = await selectorAdapter.extractText(shippingTimeElement) || '';

    // Calculate discount percentage
    const discount = originalPrice && originalPrice > price 
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : undefined;

    // Get currency from price text (fallback logic)
    const currency = priceText.includes('$') ? 'USD' 
      : priceText.includes('€') ? 'EUR'
      : priceText.includes('£') ? 'GBP'
      : 'USD';

    // Enhance description with AI (optional)
    const enhancedDescription = await this.enhanceDescriptionWithAI(title, description);

    return {
      title,
      description: enhancedDescription,
      price,
      currency,
      originalPrice,
      discount,
      images,
      mainImage: images[0] || '',
      rating,
      reviews,
      orders,
      seller: {
        name: sellerName,
      },
      shipping: {
        cost: shippingCost,
        estimatedDays: shippingTimeText,
        freeShipping: shippingCost === 0,
      },
      metadata: {
        scrapedAt: new Date(),
        sourceUrl: url,
        scrapeMethod: 'stealth',
      },
    };
  }

  /**
   * Enhance description with AI
   */
  private async enhanceDescriptionWithAI(title: string, description: string): Promise<string> {
    if (!this.AI_API_KEY) return description;

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are a professional product description writer for e-commerce. Create engaging, SEO-friendly product descriptions.',
            },
            {
              role: 'user',
              content: `Create a compelling product description for:\nTitle: ${title}\nOriginal description: ${description}\n\nMake it engaging, highlight key features, and optimize for SEO. Keep it under 500 words.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0]?.message?.content || description;
    } catch (error) {
      logger.error('Failed to enhance description with AI:', error);
      return description;
    }
  }

  /**
   * Close browser and cleanup
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed and cleaned up');
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      currentProxy: this.currentProxy,
      failedProxies: Array.from(this.failedProxies),
      lastProxyRotation: this.lastProxyRotation,
    };
  }
}

// Export singleton instance
export const stealthScrapingService = new StealthScrapingService();
export default stealthScrapingService;
