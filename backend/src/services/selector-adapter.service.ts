// @ts-nocheck
import { Page, ElementHandle } from 'puppeteer';
import { logger } from '../config/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Selector pattern with fallbacks and success tracking
 */
export interface SelectorPattern {
  primary: string;
  fallbacks: string[];
  successRate: number;
  lastSuccess?: Date;
  description?: string;
}

/**
 * Element type mapping for adaptive selection
 */
export interface ElementTypePatterns {
  [key: string]: SelectorPattern;
}

/**
 * Selector validation result
 */
export interface SelectorValidationResult {
  selector: string;
  found: boolean;
  element?: ElementHandle;
  time: number;
  method: 'css' | 'xpath' | 'text' | 'position';
}

/**
 * Adaptive Selector System
 * 
 * Sistema inteligente que aprende y se adapta cuando los sitios web cambian su HTML.
 * Características:
 * - Múltiples selectores fallback para cada elemento
 * - Tracking de tasa de éxito por selector
 * - Búsqueda por texto cuando fallan los selectores CSS
 * - Análisis de posición y contexto
 * - Aprende de selectores exitosos
 * - Persistencia de patrones exitosos
 */
export class SelectorAdapterService {
  private patterns: ElementTypePatterns = {};
  private patternsFile: string;
  private learningEnabled: boolean = true;

  constructor() {
    this.patternsFile = path.join(__dirname, '../../data/selector-patterns.json');
    this.loadPatterns();
  }

  /**
   * Load selector patterns from file
   */
  private loadPatterns(): void {
    try {
      if (fs.existsSync(this.patternsFile)) {
        const data = fs.readFileSync(this.patternsFile, 'utf-8');
        this.patterns = JSON.parse(data);
        logger.info(`Loaded ${Object.keys(this.patterns).length} selector patterns`);
      } else {
        this.initializeDefaultPatterns();
      }
    } catch (error) {
      logger.error('Error loading selector patterns:', error);
      this.initializeDefaultPatterns();
    }
  }

  /**
   * Initialize default selector patterns for common AliExpress elements
   */
  private initializeDefaultPatterns(): void {
    this.patterns = {
      productTitle: {
        primary: 'h1[data-pl="product-title"]',
        fallbacks: [
          'h1.product-title-text',
          '.product-title h1',
          '[class*="productTitle"]',
          'h1[class*="title"]',
          'div[data-pl="product-title"] h1',
        ],
        successRate: 1.0,
        description: 'Product title on detail page',
      },
      productPrice: {
        primary: '.product-price-value',
        fallbacks: [
          '[class*="price"] [class*="value"]',
          '[data-price-value]',
          '.uniform-banner-box-price',
          'span[class*="price"]',
          'div[data-pl="product-price"]',
          '[itemprop="price"]',
        ],
        successRate: 1.0,
        description: 'Product price',
      },
      originalPrice: {
        primary: '.product-price-original',
        fallbacks: [
          '[class*="original"] [class*="price"]',
          '[class*="oldPrice"]',
          'del[class*="price"]',
          's[class*="price"]',
        ],
        successRate: 0.8,
        description: 'Original price before discount',
      },
      productImages: {
        primary: '.image-view-magnifier img',
        fallbacks: [
          '[class*="imageView"] img',
          '[class*="gallery"] img',
          '[data-role="thumb"] img',
          'ul[class*="image"] img',
          '.slider-image img',
        ],
        successRate: 0.95,
        description: 'Product images in gallery',
      },
      description: {
        primary: '.product-description',
        fallbacks: [
          '[class*="description"]',
          '[data-pl="product-description"]',
          'div[class*="detail"]',
          '.html-content',
        ],
        successRate: 0.9,
        description: 'Product description',
      },
      shipping: {
        primary: '[class*="shipping"] [class*="price"]',
        fallbacks: [
          '[data-pl="shipping"]',
          'span[class*="shipping"]',
          'div[class*="delivery"]',
        ],
        successRate: 0.7,
        description: 'Shipping cost and info',
      },
      shippingTime: {
        primary: '[class*="delivery"] [class*="time"]',
        fallbacks: [
          '[class*="shipping"] [class*="days"]',
          'span[class*="deliveryTime"]',
          '[data-spm*="shipping"]',
        ],
        successRate: 0.7,
        description: 'Estimated delivery time',
      },
      seller: {
        primary: '.seller-info-name',
        fallbacks: [
          '[class*="store"] [class*="name"]',
          'a[class*="seller"]',
          '[class*="shop"] [class*="title"]',
          '[data-spm*="store"]',
        ],
        successRate: 0.85,
        description: 'Seller/store name',
      },
      rating: {
        primary: '.overview-rating-average',
        fallbacks: [
          '[class*="rating"] [class*="average"]',
          'span[class*="score"]',
          '[itemprop="ratingValue"]',
          '[class*="star"] [class*="num"]',
        ],
        successRate: 0.9,
        description: 'Product rating',
      },
      reviews: {
        primary: '.product-reviewer-reviews',
        fallbacks: [
          '[class*="review"] [class*="count"]',
          'span[class*="reviewCount"]',
          '[itemprop="reviewCount"]',
        ],
        successRate: 0.85,
        description: 'Number of reviews',
      },
      orders: {
        primary: '[class*="order"] [class*="num"]',
        fallbacks: [
          'span[class*="sold"]',
          '[class*="sales"]',
          'span:contains("orders")',
        ],
        successRate: 0.75,
        description: 'Number of orders',
      },
      stock: {
        primary: '[class*="quantity"] [class*="available"]',
        fallbacks: [
          'span[class*="stock"]',
          '[class*="inventory"]',
          'span:contains("available")',
        ],
        successRate: 0.6,
        description: 'Available stock',
      },
      addToCart: {
        primary: 'button[class*="add-to-cart"]',
        fallbacks: [
          'button:contains("Add to Cart")',
          'button[data-role="addToCart"]',
          'button:contains("Buy Now")',
          '.product-action button',
        ],
        successRate: 0.9,
        description: 'Add to cart button',
      },
    };

    this.savePatterns();
  }

  /**
   * Save patterns to file
   */
  private savePatterns(): void {
    try {
      const dir = path.dirname(this.patternsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.patternsFile,
        JSON.stringify(this.patterns, null, 2),
        'utf-8'
      );
      logger.debug('Selector patterns saved successfully');
    } catch (error) {
      logger.error('Error saving selector patterns:', error);
    }
  }

  /**
   * Find element adaptively using multiple strategies
   * 
   * @param page - Puppeteer page
   * @param elementType - Type of element to find
   * @param fallbackStrategies - Enable fallback strategies (text, position)
   * @returns Element handle or null
   */
  async findElement(
    page: Page,
    elementType: string,
    fallbackStrategies: boolean = true
  ): Promise<ElementHandle | null> {
    const pattern = this.patterns[elementType];

    if (!pattern) {
      logger.warn(`No pattern defined for element type: ${elementType}`);
      return null;
    }

    // Strategy 1: Try known successful selectors
    let element = await this.tryKnownSelectors(page, pattern);
    if (element) {
      this.recordSuccess(elementType, await this.getUsedSelector(element, pattern));
      return element;
    }

    if (!fallbackStrategies) {
      return null;
    }

    // Strategy 2: Text-based search
    element = await this.findByTextAnalysis(page, elementType);
    if (element) {
      await this.learnNewSelector(page, element, elementType);
      return element;
    }

    // Strategy 3: Position-based search
    element = await this.findByPositionAnalysis(page, elementType);
    if (element) {
      await this.learnNewSelector(page, element, elementType);
      return element;
    }

    logger.warn(`Could not find element: ${elementType}`);
    this.recordFailure(elementType);
    return null;
  }

  /**
   * Try known selectors for element type
   */
  private async tryKnownSelectors(
    page: Page,
    pattern: SelectorPattern
  ): Promise<ElementHandle | null> {
    const selectors = [pattern.primary, ...pattern.fallbacks];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // Verify element is visible
          const isVisible = await page.evaluate((el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, element);

          if (isVisible) {
            logger.debug(`Found element with selector: ${selector}`);
            return element;
          }
        }
      } catch (error) {
        logger.debug(`Selector failed: ${selector}`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Find element by text analysis
   */
  private async findByTextAnalysis(
    page: Page,
    elementType: string
  ): Promise<ElementHandle | null> {
    const textPatterns: Record<string, string[]> = {
      addToCart: ['add to cart', 'buy now', 'purchase', 'comprar', 'añadir'],
      shipping: ['shipping', 'delivery', 'envío', 'entrega'],
      seller: ['store', 'shop', 'seller', 'tienda', 'vendedor'],
      orders: ['orders', 'sold', 'pedidos', 'vendidos'],
      reviews: ['reviews', 'feedback', 'reseñas', 'opiniones'],
    };

    const patterns = textPatterns[elementType];
    if (!patterns) {
      return null;
    }

    for (const pattern of patterns) {
      try {
        // Search by text content
        const elements = await page.$x(
          `//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${pattern}')]`
        );

        for (const element of elements) {
          const isVisible = await page.evaluate((el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, element);

          if (isVisible) {
            logger.info(`Found element by text analysis: "${pattern}"`);
            return element as ElementHandle;
          }
        }
      } catch (error) {
        logger.debug(`Text search failed for: ${pattern}`, error);
      }
    }

    return null;
  }

  /**
   * Find element by position analysis
   */
  private async findByPositionAnalysis(
    page: Page,
    elementType: string
  ): Promise<ElementHandle | null> {
    const strategies: Record<string, (page: Page) => Promise<ElementHandle | null>> = {
      addToCart: this.findAddToCartByPosition.bind(this),
      productPrice: this.findPriceByPosition.bind(this),
    };

    const strategy = strategies[elementType];
    if (strategy) {
      return await strategy(page);
    }

    return null;
  }

  /**
   * Find "Add to Cart" button by position (usually near price)
   */
  private async findAddToCartByPosition(page: Page): Promise<ElementHandle | null> {
    try {
      const element = await page.evaluateHandle(() => {
        // Find price elements
        const priceElements = Array.from(
          document.querySelectorAll('[class*="price"], [data-price]')
        );

        for (const priceEl of priceElements) {
          const priceRect = priceEl.getBoundingClientRect();

          // Find buttons near price
          const buttons = Array.from(document.querySelectorAll('button'));

          const candidates = buttons
            .map((btn) => {
              const btnRect = btn.getBoundingClientRect();
              const distance = Math.sqrt(
                Math.pow(btnRect.left - priceRect.left, 2) +
                  Math.pow(btnRect.top - priceRect.top, 2)
              );

              return { btn, distance, width: btnRect.width, height: btnRect.height };
            })
            .filter((c) => c.distance < 300 && c.width > 80 && c.height > 30)
            .sort((a, b) => a.distance - b.distance);

          if (candidates.length > 0) {
            return candidates[0].btn;
          }
        }

        return null;
      });

      if (element && (await element.asElement())) {
        logger.info('Found Add to Cart by position analysis');
        return element.asElement();
      }
    } catch (error) {
      logger.debug('Position analysis failed for Add to Cart', error);
    }

    return null;
  }

  /**
   * Find price by position (usually prominent in upper area)
   */
  private async findPriceByPosition(page: Page): Promise<ElementHandle | null> {
    try {
      const element = await page.evaluateHandle(() => {
        // Look for large, prominent text with currency symbols
        const allText = Array.from(document.querySelectorAll('*'));

        const candidates = allText
          .filter((el) => {
            const text = el.textContent?.trim() || '';
            const hasPrice = /[\$€£¥₹]\s*\d+|\d+\s*[\$€£¥₹]/.test(text);
            const rect = el.getBoundingClientRect();

            return (
              hasPrice &&
              rect.width > 30 &&
              rect.height > 15 &&
              rect.top < window.innerHeight * 0.5
            );
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const fontSize = parseFloat(
              window.getComputedStyle(el).fontSize || '0'
            );

            return { el, fontSize, area: rect.width * rect.height };
          })
          .sort((a, b) => b.fontSize - a.fontSize);

        if (candidates.length > 0) {
          return candidates[0].el;
        }

        return null;
      });

      if (element && (await element.asElement())) {
        logger.info('Found price by position analysis');
        return element.asElement();
      }
    } catch (error) {
      logger.debug('Position analysis failed for price', error);
    }

    return null;
  }

  /**
   * Learn new selector from successful element
   */
  private async learnNewSelector(
    page: Page,
    element: ElementHandle,
    elementType: string
  ): Promise<void> {
    if (!this.learningEnabled) {
      return;
    }

    try {
      const selector = await page.evaluate((el) => {
        // Try to generate a unique selector
        if (el.id) {
          return `#${el.id}`;
        }

        // Try class-based selector
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter((c) => c.length > 0);
          if (classes.length > 0) {
            return `.${classes.join('.')}`;
          }
        }

        // Try attribute-based selector
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          if (attr.name.startsWith('data-')) {
            return `[${attr.name}="${attr.value}"]`;
          }
        }

        return null;
      }, element);

      if (selector && !this.patterns[elementType].fallbacks.includes(selector)) {
        logger.info(`Learned new selector for ${elementType}: ${selector}`);
        this.patterns[elementType].fallbacks.unshift(selector);
        this.savePatterns();
      }
    } catch (error) {
      logger.debug('Error learning new selector', error);
    }
  }

  /**
   * Get selector that was used to find element
   */
  private async getUsedSelector(
    element: ElementHandle,
    pattern: SelectorPattern
  ): Promise<string> {
    // This is a simplified version - in production, you'd track which selector was used
    return pattern.primary;
  }

  /**
   * Record successful selector usage
   */
  private recordSuccess(elementType: string, selector: string): void {
    if (this.patterns[elementType]) {
      this.patterns[elementType].lastSuccess = new Date();
      // Increase success rate (weighted average)
      const current = this.patterns[elementType].successRate;
      this.patterns[elementType].successRate = current * 0.9 + 0.1;

      // Move successful selector to front
      const fallbacks = this.patterns[elementType].fallbacks;
      const index = fallbacks.indexOf(selector);
      if (index > 0) {
        fallbacks.splice(index, 1);
        fallbacks.unshift(selector);
      }

      // Save periodically (every 10 successes)
      if (Math.random() < 0.1) {
        this.savePatterns();
      }
    }
  }

  /**
   * Record selector failure
   */
  private recordFailure(elementType: string): void {
    if (this.patterns[elementType]) {
      // Decrease success rate
      const current = this.patterns[elementType].successRate;
      this.patterns[elementType].successRate = Math.max(0, current * 0.9 - 0.1);
    }
  }

  /**
   * Extract text content from element
   */
  async extractText(element: ElementHandle | null): Promise<string | null> {
    if (!element) return null;

    try {
      return await element.evaluate((el) => el.textContent?.trim() || null);
    } catch (error) {
      logger.debug('Error extracting text', error);
      return null;
    }
  }

  /**
   * Extract attribute from element
   */
  async extractAttribute(
    element: ElementHandle | null,
    attribute: string
  ): Promise<string | null> {
    if (!element) return null;

    try {
      return await element.evaluate(
        (el, attr) => el.getAttribute(attr),
        attribute
      );
    } catch (error) {
      logger.debug(`Error extracting attribute ${attribute}`, error);
      return null;
    }
  }

  /**
   * Extract all matching elements
   */
  async findElements(
    page: Page,
    elementType: string
  ): Promise<ElementHandle[]> {
    const pattern = this.patterns[elementType];

    if (!pattern) {
      logger.warn(`No pattern defined for element type: ${elementType}`);
      return [];
    }

    const selectors = [pattern.primary, ...pattern.fallbacks];

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          logger.debug(`Found ${elements.length} elements with selector: ${selector}`);
          return elements;
        }
      } catch (error) {
        logger.debug(`Selector failed: ${selector}`, error);
        continue;
      }
    }

    return [];
  }

  /**
   * Smart click with multiple strategies
   */
  async smartClick(
    page: Page,
    element: ElementHandle
  ): Promise<boolean> {
    try {
      // Strategy 1: Normal click
      await element.click();
      return true;
    } catch (error) {
      logger.debug('Normal click failed, trying JavaScript click');
    }

    try {
      // Strategy 2: JavaScript click
      await page.evaluate((el) => {
        if (el instanceof HTMLElement) {
          el.click();
        }
      }, element);
      return true;
    } catch (error) {
      logger.debug('JavaScript click failed, trying forced click');
    }

    try {
      // Strategy 3: Force click at element position
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return true;
      }
    } catch (error) {
      logger.error('All click strategies failed', error);
    }

    return false;
  }

  /**
   * Validate selector still works
   */
  async validateSelector(
    page: Page,
    selector: string
  ): Promise<SelectorValidationResult> {
    const startTime = Date.now();

    try {
      const element = await page.$(selector);
      const time = Date.now() - startTime;

      if (element) {
        const isVisible = await page.evaluate((el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, element);

        return {
          selector,
          found: isVisible,
          element: isVisible ? element : undefined,
          time,
          method: 'css',
        };
      }

      return { selector, found: false, time, method: 'css' };
    } catch (error) {
      return {
        selector,
        found: false,
        time: Date.now() - startTime,
        method: 'css',
      };
    }
  }

  /**
   * Get pattern statistics
   */
  getPatternStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [type, pattern] of Object.entries(this.patterns)) {
      stats[type] = {
        successRate: pattern.successRate,
        lastSuccess: pattern.lastSuccess,
        fallbackCount: pattern.fallbacks.length,
      };
    }

    return stats;
  }

  /**
   * Reset pattern for element type
   */
  resetPattern(elementType: string): void {
    if (this.patterns[elementType]) {
      this.patterns[elementType].successRate = 0.5;
      this.patterns[elementType].lastSuccess = undefined;
      this.savePatterns();
      logger.info(`Reset pattern for ${elementType}`);
    }
  }

  /**
   * Enable/disable learning mode
   */
  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
    logger.info(`Learning mode ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Singleton instance
export const selectorAdapter = new SelectorAdapterService();
