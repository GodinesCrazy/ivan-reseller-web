import axios from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { AppError } from '../middleware/error.middleware';
import { stealthScrapingService, EnhancedScrapedProduct } from './stealth-scraping.service';
import { logger } from '../config/logger';

export interface ScrapedProduct {
  title: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  category?: string;
  specs?: Record<string, any>;
  shipping?: {
    cost?: number;
    estimatedDays?: number;
  };
  stock?: number;
  rating?: number;
  reviews?: number;
  seller?: {
    name: string;
    rating: number;
    location: string;
  };
}

export interface ScrapingConfig {
  useProxy: boolean;
  maxRetries: number;
  delayBetweenRequests: number;
  userAgents: string[];
  proxyList: string[];
}

export interface MarketplaceProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  images: string[];
  url: string;
  marketplace: 'aliexpress' | 'amazon' | 'ebay' | 'mercadolibre';
  availability: boolean;
  seller: string;
  rating?: number;
  reviews?: number;
}

export class AdvancedScrapingService {
  private browser: Browser | null = null;
  private readonly config: ScrapingConfig;
  private proxyIndex = 0;
  private userAgentIndex = 0;
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly PROXY_API_KEY = process.env.SCRAPERAPI_KEY;
  private readonly AI_API_KEY = process.env.GROQ_API_KEY;

  constructor(config?: Partial<ScrapingConfig>) {
    this.config = {
      useProxy: true,
      maxRetries: 3,
      delayBetweenRequests: 2000,
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      ],
      proxyList: [
        // Agregar proxies reales aquí
      ],
      ...config,
    };
  }

  /**
   * Scrape AliExpress product information with stealth mode fallback
   */
  async scrapeAliExpressProduct(url: string, userId: number): Promise<ScrapedProduct> {
    try {
      // Validate AliExpress URL
      if (!this.isValidAliExpressUrl(url)) {
        throw new AppError('Invalid AliExpress URL', 400);
      }

      // Try stealth scraping first (more reliable)
      try {
        logger.info('Attempting stealth scraping for:', url);
        const enhancedData = await stealthScrapingService.scrapeAliExpressProduct(url, userId);
        
        // Convert EnhancedScrapedProduct to ScrapedProduct
        return this.convertEnhancedToStandard(enhancedData);
      } catch (stealthError) {
        logger.warn('Stealth scraping failed, falling back to basic scraping:', stealthError);
        
        // Fallback to basic scraping
        const html = await this.fetchPageContent(url);
        const productData = this.parseAliExpressHTML(html);
        
        // Enhance with AI if API key is available
        if (this.AI_API_KEY && productData.title) {
          productData.description = await this.enhanceDescriptionWithAI(
            productData.title, 
            productData.description
          );
        }

        return productData;
      }
    } catch (error: any) {
      console.error('Scraping error:', error);
      throw new AppError(`Failed to scrape product: ${error.message}`, 500);
    }
  }

  /**
   * Convert EnhancedScrapedProduct to standard ScrapedProduct
   */
  private convertEnhancedToStandard(enhanced: EnhancedScrapedProduct): ScrapedProduct {
    return {
      title: enhanced.title,
      description: enhanced.description,
      price: enhanced.price,
      currency: enhanced.currency,
      images: enhanced.images,
      category: enhanced.category,
      specs: enhanced.specs,
      shipping: {
        cost: enhanced.shipping?.cost,
        estimatedDays: enhanced.shipping?.estimatedDays ? parseInt(enhanced.shipping.estimatedDays) : undefined,
      },
      stock: enhanced.stock,
      rating: enhanced.rating,
      reviews: enhanced.reviews,
      seller: enhanced.seller ? {
        name: enhanced.seller.name,
        rating: enhanced.seller.rating || 0,
        location: enhanced.seller.location || '',
      } : undefined,
    };
  }

  /**
   * Validate if URL is from AliExpress
   */
  private isValidAliExpressUrl(url: string): boolean {
    const aliexpressPatterns = [
      /^https?:\/\/(www\.)?aliexpress\.(com|us)/,
      /^https?:\/\/[a-z]+\.aliexpress\.com/,
      /^https?:\/\/m\.aliexpress\.com/,
    ];
    
    return aliexpressPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Fetch page content using proxy service or direct request
   */
  private async fetchPageContent(url: string): Promise<string> {
    try {
      let response;

      if (this.PROXY_API_KEY) {
        // Use ScraperAPI proxy service
        response = await axios.get('http://api.scraperapi.com', {
          params: {
            api_key: this.PROXY_API_KEY,
            url: url,
            render: true, // Enable JavaScript rendering
          },
          timeout: 30000,
        });
      } else {
        // Direct request with user agent
        response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
          },
          timeout: 15000,
        });
      }

      return response.data;
    } catch (error) {
      throw new AppError(`Failed to fetch page content: ${error.message}`, 500);
    }
  }

  /**
   * Parse HTML content to extract product information
   */
  private parseAliExpressHTML(html: string): ScrapedProduct {
    try {
      // Basic regex patterns for AliExpress (can be enhanced)
      const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
      const priceMatch = html.match(/[\$€£¥]?(\d+[\.,]?\d*)/);
      const currencyMatch = html.match(/currency['":\s]*['"]?([A-Z]{3})['"]?/i);
      
      // Extract images from various possible selectors
      const imageMatches = html.match(/["']https?:\/\/[^"']*\.(jpg|jpeg|png|webp)[^"']*["']/gi) || [];
      const images = imageMatches
        .map(match => match.replace(/['"]/g, ''))
        .filter(url => url.includes('alicdn') || url.includes('aliexpress'))
        .slice(0, 5); // Limit to 5 images

      // Create basic product data
      const product: ScrapedProduct = {
        title: titleMatch ? titleMatch[1].trim() : 'Product Title',
        description: this.extractDescription(html),
        price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0,
        currency: currencyMatch ? currencyMatch[1].toUpperCase() : 'USD',
        images: images.length > 0 ? images : ['https://via.placeholder.com/300x300?text=No+Image'],
        category: this.extractCategory(html),
        shipping: {
          cost: this.extractShippingCost(html),
          estimatedDays: this.extractDeliveryTime(html),
        }
      };

      return product;
    } catch (error) {
      throw new AppError(`Failed to parse product data: ${error.message}`, 500);
    }
  }

  /**
   * Extract product description from HTML
   */
  private extractDescription(html: string): string {
    const descPatterns = [
      /<meta[^>]*name\s*=\s*["']?description["']?[^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
      /<div[^>]*class[^>]*description[^>]*>([^<]+)</i,
      /<p[^>]*>([^<]{50,200})</i,
    ];

    for (const pattern of descPatterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 20) {
        return match[1].trim();
      }
    }

    return 'Product description not available';
  }

  /**
   * Extract category from HTML
   */
  private extractCategory(html: string): string | undefined {
    const categoryMatch = html.match(/category['":\s]*['"]([^'"]+)['"]?/i);
    return categoryMatch ? categoryMatch[1] : undefined;
  }

  /**
   * Extract shipping cost
   */
  private extractShippingCost(html: string): number | undefined {
    const shippingMatch = html.match(/shipping[^0-9]*(\d+[\.,]?\d*)/i);
    return shippingMatch ? parseFloat(shippingMatch[1].replace(',', '.')) : undefined;
  }

  /**
   * Extract delivery time
   */
  private extractDeliveryTime(html: string): number | undefined {
    const deliveryMatch = html.match(/(\d+)[-\s]*days?/i);
    return deliveryMatch ? parseInt(deliveryMatch[1]) : undefined;
  }

  /**
   * Enhance product description using AI
   */
  private async enhanceDescriptionWithAI(title: string, description: string): Promise<string> {
    try {
      if (!this.AI_API_KEY) return description;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'mixtral-8x7b-32768',
          messages: [
            {
              role: 'system',
              content: 'You are a professional product description writer for e-commerce. Enhance product descriptions to be compelling and SEO-friendly while maintaining accuracy.'
            },
            {
              role: 'user',
              content: `Product: ${title}\nCurrent description: ${description}\n\nPlease improve this product description to be more engaging and detailed for dropshipping. Keep it under 200 words.`
            }
          ],
          max_tokens: 300,
          temperature: 0.7,
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
      console.error('AI enhancement failed:', error);
      return description; // Fall back to original description
    }
  }

  /**
   * Generate suggested retail price based on cost and margins
   */
  calculateSuggestedPrice(
    aliexpressPrice: number, 
    profitMargin: number = 0.4, // 40% profit margin
    fixedCosts: number = 5 // Fixed costs (shipping, fees, etc.)
  ): number {
    const totalCost = aliexpressPrice + fixedCosts;
    const suggestedPrice = totalCost / (1 - profitMargin);
    return Math.ceil(suggestedPrice * 100) / 100; // Round up to nearest cent
  }

  // ================= NUEVOS MÉTODOS PARA SCRAPING ROBUSTO =================

  /**
   * Inicializar browser con configuración anti-detección
   */
  async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];

    // Agregar proxy si está configurado
    if (this.config.useProxy && this.config.proxyList.length > 0) {
      const proxy = this.getNextProxy();
      args.push(`--proxy-server=${proxy}`);
    }

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Usar Chrome instalado
        defaultViewport: { width: 1366, height: 768 },
      });

      return this.browser;
    } catch (error) {
      // Fallback sin executable path
      this.browser = await puppeteer.launch({
        headless: true,
        args,
        defaultViewport: { width: 1366, height: 768 },
      });

      return this.browser;
    }
  }

  /**
   * Crear página con configuración anti-detección
   */
  async createStealthPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    // User agent rotativo
    const userAgent = this.getNextUserAgent();
    await page.setUserAgent(userAgent);

    // Headers anti-detección
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Simular viewport aleatorio
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(viewport);

    return page;
  }

  /**
   * Obtener próximo proxy de la lista
   */
  private getNextProxy(): string {
    if (this.config.proxyList.length === 0) {
      throw new Error('No proxies available');
    }
    
    const proxy = this.config.proxyList[this.proxyIndex % this.config.proxyList.length];
    this.proxyIndex++;
    return proxy;
  }

  /**
   * Obtener próximo user agent
   */
  private getNextUserAgent(): string {
    const userAgent = this.config.userAgents[this.userAgentIndex % this.config.userAgents.length];
    this.userAgentIndex++;
    return userAgent;
  }

  /**
   * Rate limiting inteligente
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.delayBetweenRequests) {
      const delay = this.config.delayBetweenRequests - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Delay adicional cada 10 requests
    if (this.requestCount % 10 === 0 && this.requestCount > 0) {
      const extraDelay = Math.random() * 5000 + 2000; // 2-7 segundos
      await new Promise(resolve => setTimeout(resolve, extraDelay));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Scraping robusto con reintentos y detección de errores
   */
  async robustScrape<T>(
    url: string, 
    scrapeFunction: (page: Page) => Promise<T>,
    retries: number = 0
  ): Promise<T> {
    await this.respectRateLimit();

    const page = await this.createStealthPage();

    try {
      // Navegar con timeout y wait conditions
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Esperar que la página cargue completamente
      await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000));

      // Detectar si fuimos bloqueados
      const isBlocked = await this.detectBlocking(page);
      if (isBlocked) {
        throw new Error('Blocked by anti-bot system');
      }

      // Ejecutar función de scraping
      const result = await scrapeFunction(page);
      
      return result;

    } catch (error) {
      console.error(`Scraping error (attempt ${retries + 1}):`, error);
      
      // Reintentar con delay exponencial
      if (retries < this.config.maxRetries) {
        const delay = Math.pow(2, retries) * 1000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Rotar proxy si está disponible
        if (this.config.useProxy && this.config.proxyList.length > 1) {
          await this.rotateProxy();
        }
        
        return this.robustScrape(url, scrapeFunction, retries + 1);
      }
      
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Detectar si fuimos bloqueados por sistemas anti-bot
   */
  private async detectBlocking(page: Page): Promise<boolean> {
    try {
      const blockedIndicators = [
        'cloudflare',
        'captcha',
        'blocked',
        'access denied',
        'robot',
        'bot detected',
        '403 forbidden',
        'rate limited',
      ];

      const pageContent = await page.content().catch(() => '');
      const pageTitle = await page.title().catch(() => '');
      const pageText = (pageContent + ' ' + pageTitle).toLowerCase();

      return blockedIndicators.some(indicator => pageText.includes(indicator));
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotar proxy (reiniciar browser con nuevo proxy)
   */
  private async rotateProxy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scraping multi-marketplace con paralelización inteligente
   */
  async scrapeMultipleMarketplaces(searchQuery: string): Promise<MarketplaceProduct[]> {
    const marketplaces = [
      { name: 'aliexpress', url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(searchQuery)}` },
      { name: 'amazon', url: `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}` },
      { name: 'ebay', url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}` },
    ];

    const results: MarketplaceProduct[] = [];

    // Scraping secuencial para evitar detección
    for (const marketplace of marketplaces) {
      try {
        console.log(`Scraping ${marketplace.name}...`);
        
        const products = await this.robustScrape(marketplace.url, async (page) => {
          return await this.scrapeMarketplaceProducts(page, marketplace.name as any);
        });

        results.push(...products);
        
        // Delay entre marketplaces
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`Failed to scrape ${marketplace.name}:`, error);
        // Continuar con el siguiente marketplace
      }
    }

    return results;
  }

  /**
   * Extraer productos de una página de marketplace
   */
  private async scrapeMarketplaceProducts(
    page: Page, 
    marketplace: 'aliexpress' | 'amazon' | 'ebay' | 'mercadolibre'
  ): Promise<MarketplaceProduct[]> {
    const products: MarketplaceProduct[] = [];

    try {
      switch (marketplace) {
        case 'aliexpress':
          return await this.scrapeAliExpressProducts(page);
        case 'amazon':
          return await this.scrapeAmazonProducts(page);
        case 'ebay':
          return await this.scrapeEbayProducts(page);
        default:
          return [];
      }
    } catch (error) {
      console.error(`Error scraping ${marketplace}:`, error);
      return [];
    }
  }

  /**
   * Scraper específico para AliExpress
   */
  private async scrapeAliExpressProducts(page: Page): Promise<MarketplaceProduct[]> {
    try {
      await page.waitForSelector('[data-item-id]', { timeout: 10000 });
      
      return await page.evaluate(() => {
        const products: MarketplaceProduct[] = [];
        const items = document.querySelectorAll('[data-item-id]');

        items.forEach((item, index) => {
          if (index >= 20) return; // Limitar a 20 productos

          try {
            const titleEl = item.querySelector('h1, h2, h3, .title, [title]');
            const priceEl = item.querySelector('.price, .price-current, [class*="price"]');
            const imageEl = item.querySelector('img');
            const linkEl = item.querySelector('a');

            if (titleEl && priceEl && imageEl) {
              const title = titleEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.trim() || '';
              const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
              const imageUrl = imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || '';
              const productUrl = linkEl?.getAttribute('href') || '';

              if (title && price > 0) {
                products.push({
                  id: `ali_${Date.now()}_${index}`,
                  title,
                  price,
                  currency: 'USD',
                  images: imageUrl ? [imageUrl] : [],
                  url: productUrl.startsWith('http') ? productUrl : `https:${productUrl}`,
                  marketplace: 'aliexpress',
                  availability: true,
                  seller: 'AliExpress Seller',
                });
              }
            }
          } catch (error) {
            console.log('Error parsing product:', error);
          }
        });

        return products;
      });
    } catch (error) {
      console.error('AliExpress scraping failed:', error);
      return [];
    }
  }

  /**
   * Scraper específico para Amazon
   */
  private async scrapeAmazonProducts(page: Page): Promise<MarketplaceProduct[]> {
    try {
      await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 10000 });
      
      return await page.evaluate(() => {
        const products: MarketplaceProduct[] = [];
        const items = document.querySelectorAll('[data-component-type="s-search-result"]');

        items.forEach((item, index) => {
          if (index >= 15) return; // Limitar a 15 productos

          try {
            const titleEl = item.querySelector('h2 a span, .s-title-instructions-style span');
            const priceEl = item.querySelector('.a-price-whole, .a-offscreen');
            const imageEl = item.querySelector('.s-image');
            const linkEl = item.querySelector('h2 a');

            if (titleEl && priceEl && imageEl) {
              const title = titleEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.trim() || '';
              const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
              const imageUrl = imageEl.getAttribute('src') || '';
              const productUrl = linkEl?.getAttribute('href') || '';

              if (title && price > 0) {
                products.push({
                  id: `amz_${Date.now()}_${index}`,
                  title,
                  price,
                  currency: 'USD',
                  images: imageUrl ? [imageUrl] : [],
                  url: productUrl.startsWith('http') ? productUrl : `https://amazon.com${productUrl}`,
                  marketplace: 'amazon',
                  availability: true,
                  seller: 'Amazon Seller',
                });
              }
            }
          } catch (error) {
            console.log('Error parsing Amazon product:', error);
          }
        });

        return products;
      });
    } catch (error) {
      console.error('Amazon scraping failed:', error);
      return [];
    }
  }

  /**
   * Scraper específico para eBay
   */
  private async scrapeEbayProducts(page: Page): Promise<MarketplaceProduct[]> {
    try {
      await page.waitForSelector('.s-item', { timeout: 10000 });
      
      return await page.evaluate(() => {
        const products: MarketplaceProduct[] = [];
        const items = document.querySelectorAll('.s-item');

        items.forEach((item, index) => {
          if (index >= 20 || index === 0) return; // Skip first item (often ad) and limit to 20

          try {
            const titleEl = item.querySelector('.s-item__title');
            const priceEl = item.querySelector('.s-item__price');
            const imageEl = item.querySelector('.s-item__image img');
            const linkEl = item.querySelector('.s-item__link');

            if (titleEl && priceEl && imageEl) {
              const title = titleEl.textContent?.trim() || '';
              const priceText = priceEl.textContent?.trim() || '';
              const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
              const imageUrl = imageEl.getAttribute('src') || '';
              const productUrl = linkEl?.getAttribute('href') || '';

              if (title && price > 0 && !title.toLowerCase().includes('shop on ebay')) {
                products.push({
                  id: `ebay_${Date.now()}_${index}`,
                  title,
                  price,
                  currency: 'USD',
                  images: imageUrl ? [imageUrl] : [],
                  url: productUrl,
                  marketplace: 'ebay',
                  availability: true,
                  seller: 'eBay Seller',
                });
              }
            }
          } catch (error) {
            console.log('Error parsing eBay product:', error);
          }
        });

        return products;
      });
    } catch (error) {
      console.error('eBay scraping failed:', error);
      return [];
    }
  }

  /**
   * Análisis de oportunidades basado en datos scrapeados
   */
  async analyzeScrapedOpportunities(products: MarketplaceProduct[]): Promise<Array<{
    product: MarketplaceProduct;
    opportunityScore: number;
    estimatedProfit: number;
    reasoning: string[];
    competitorCount: number;
  }>> {
    const opportunities = [];

    for (const product of products) {
      const competitorCount = products.filter(p => 
        p.marketplace !== product.marketplace &&
        this.calculateTitleSimilarity(p.title, product.title) > 0.6
      ).length;

      let opportunityScore = 0;
      let estimatedProfit = 0;
      const reasoning: string[] = [];

      // Factor precio
      if (product.price < 50) {
        opportunityScore += 20;
        reasoning.push('Precio bajo, fácil de revender');
      }

      // Factor competencia
      if (competitorCount < 3) {
        opportunityScore += 25;
        reasoning.push('Poca competencia detectada');
      } else if (competitorCount > 10) {
        opportunityScore -= 15;
        reasoning.push('Alta competencia en el mercado');
      }

      // Factor marketplace origen
      if (product.marketplace === 'aliexpress') {
        opportunityScore += 15;
        estimatedProfit = product.price * 2.5; // 150% markup típico
        reasoning.push('Origen AliExpress, buen margen');
      }

      // Factor título (indica calidad del producto)
      if (product.title.length > 50 && /\d/.test(product.title)) {
        opportunityScore += 10;
        reasoning.push('Título descriptivo y detallado');
      }

      if (opportunityScore > 30) {
        opportunities.push({
          product,
          opportunityScore,
          estimatedProfit,
          reasoning,
          competitorCount,
        });
      }
    }

    return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Cerrar browser al finalizar
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Calcular similaridad entre títulos de productos
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.toLowerCase().split(' ').filter(w => w.length > 3);
    const words2 = title2.toLowerCase().split(' ').filter(w => w.length > 3);
    
    const commonWords = words1.filter(word => 
      words2.some(w2 => w2.includes(word) || word.includes(w2))
    );
    
    return commonWords.length / Math.max(words1.length, words2.length, 1);
  }
}

export const scrapingService = new AdvancedScrapingService();