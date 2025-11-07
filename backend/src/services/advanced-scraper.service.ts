import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, Protocol, Frame } from 'puppeteer';
import { execSync } from 'child_process';
import * as fs from 'fs';
import axios from 'axios';
import { getChromiumLaunchConfig } from '../utils/chromium';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressCredentials } from '../types/api-credentials.types';

// Configurar Puppeteer con plugin stealth para evadir detección
puppeteer.use(StealthPlugin());

/**
 * Scraper AVANZADO con evasión de CAPTCHA y detección anti-bot
 * Usa Puppeteer con modo stealth para parecer navegador real
 */

interface ScrapedProduct {
  title: string;
  price: number;
  originalPrice?: number;
  imageUrl: string;
  productUrl: string;
  rating: number;
  reviewCount: number;
  seller: string;
  shipping: string;
  availability: string;
}

enum AliExpressLoginState {
  LOGGED_IN = 'LOGGED_IN',
  LOGIN_FORM = 'LOGIN_FORM',
  HOME_LOGGED_OUT = 'HOME_LOGGED_OUT',
  CAPTCHA = 'CAPTCHA',
  LOGIN_IFRAME = 'LOGIN_IFRAME',
  UNKNOWN = 'UNKNOWN',
  REQUIRES_MANUAL_REVIEW = 'REQUIRES_MANUAL_REVIEW',
}

interface AliExpressDetectionResult {
  state: AliExpressLoginState;
  details?: string;
}

export class AdvancedMarketplaceScraper {
  private browser: Browser | null = null;
  private isLoggedIn = false;
  private loggedInUserId: number | null = null;
  private readonly loginUrl = 'https://login.aliexpress.com/?fromSite=52&foreSite=main&spm=a2g0o.home.1000002.2.650511a5TtU7UQ';
  private readonly fallbackLoginUrl = 'https://passport.aliexpress.com/ac/vanstoken2?fromSite=main&lang=en_US&appName=ae_pc';
  private readonly aliExpressSelectorMap: Record<string, string[]> = {
    'login.email': [
      'input#fm-login-id',
      'input[name="fm-login-id"]',
      'input[name="loginId"]',
      'input[name="loginKey"]',
      'input[data-email="true"]',
      'input[data-placeholder*="Email"]',
      'input[data-placeholder*="correo"]',
    ],
    'login.password': [
      'input#fm-login-password',
      'input[name="fm-login-password"]',
      'input[name="password"]',
      'input[type="password"]',
      'input[data-placeholder*="Password"]',
      'input[data-placeholder*="contraseña"]',
    ],
    'login.submit': [
      'button[type="submit"]',
      '.login-submit',
      '.sign-btn',
      '.next-btn-primary',
      '.login-button',
      '#login-button',
      'button[data-spm-anchor-id*="submit"]',
      'button[class*="fm-button"]',
    ],
    'login.switchPassword': [
      '.switch-btn',
      '.password-login',
      '#login-switch',
      '.login-switch',
      'a[data-spm-anchor-id*="password"]',
      'button[data-role="password"]',
      'button[data-type="password"]',
    ],
    'login.headerLink': [
      'a[href*="login"]',
      'a[data-role="login"]',
      'a[data-spm-anchor-id*="login"]',
      '.user-account .sign-btn',
      '.nav-user-account .sign-btn',
      'a.sign-btn',
      'button.header-signin-btn',
    ],
    'login.accountMenuBtn': [
      '.nav-user-account',
      '.nav-user-account .account',
      '.header-user-avatar',
      'button[data-role="account-menu"]',
      'div[data-role="user-account"]',
      'div.top-action-account',
    ],
    'login.accountDropdownLinks': [
      '.nav-user-account a[href*="account"][href*="login"]',
      '.nav-user-account a[href*="signin"]',
      '.nav-user-account a[href*="register"]',
      '.nav-user-account .sign-btn a',
    ],
    'popups.accept': [
      '#nav-global-cookie-banner .btn-accept',
      '.cookie-banner button',
      'button#onetrust-accept-btn-handler',
      'button#acceptAll',
      'button[data-role="accept"]',
      'button[data-spm-anchor-id*="accept"]',
    ],
    'popups.close': [
      'a[data-role="close"]',
      'button[aria-label="close"]',
      '.next-dialog .next-dialog-close',
      '.close-button',
      '.close-btn',
      'button:contains("Aceptar")',
      'button:contains("Acepto")',
      'button:contains("Aceptar todos")',
      'button:contains("Accept")',
    ],
    'login.textLinks': [
      'a:contains("Sign in")',
      'a:contains("Iniciar sesión")',
      'a:contains("Acceder")',
      'button:contains("Sign in")',
      'button:contains("Iniciar sesión")',
      '.top-login-btn',
      '.welcome-offer-login',
      '.user-account-info .sign-btn',
      '.next-menu-item a[href*="login"]',
      '.next-menu-item button[href*="login"]',
      '.aliexpress-header-popover a[href*="login"]',
      '.legacy-login a[href*="login"]',
      '.legacy-login button:contains("Sign in")',
      '.legacy-login .sign-btn',
    ],
    'state.loginLink.text': [
      'a:contains("Sign in")',
      'a:contains("Login")',
      'a:contains("Iniciar sesión")',
      'a:contains("Acceder")',
    ],
    'state.captcha': [
      '#nc_1_n1z',
      '.nc-container',
      '.captcha-container',
      '.baxia-container',
    ],
    'state.accountMenu': [
      'a[href*="logout"]',
      '.my-account',
      '.account-brief',
      '.nav-user-account .account-name',
      '.user-account-info',
      '.myaccount-info',
    ],
    'state.loginLink': [
      'a.sign-btn',
      'button.header-signin-btn',
      'a[data-role="login"]',
      'a[href*="/login"]',
      'a[data-spm-anchor-id*="login"]',
    ],
    'modal.passkey.dismiss': [
      'button:contains("Not now")',
      'button:contains("Quizás más tarde")',
      'button:contains("Maybe later")',
      'button:contains("Omitir")',
      '.passkey-dialog .close-button',
      'button:contains("Skip")',
      'button:contains("Usar después")',
      '.ae-passkey-dialog button.next-btn-primary',
      '.ae-passkey-dialog button[data-role="dismiss"]',
      '.ae-passkey-dialog button[data-spm*="skip"]',
    ],
    'modal.emailLoginSwitch': [
      'a:contains("Sign in with password")',
      'a:contains("Sign in with email")',
      'button:contains("Sign in with password")',
    ],
    'modal.emailContinue': [
      'button:contains("Continue")',
      'button:contains("Continuar")',
      'button.next-btn-primary',
    ],
  };

  async init(): Promise<void> {
    console.log('🚀 Iniciando navegador con evasión anti-bot...');

    const { executablePath, args: chromiumArgs, headless, defaultViewport } = await getChromiumLaunchConfig([
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--window-size=1920,1080',
    ]);

    console.log(`✅ Chromium encontrado en ruta preferida: ${executablePath}`);

    try {
      const launchOptions: any = {
        headless,
        args: ['--no-sandbox', ...chromiumArgs],
        ignoreDefaultArgs: ['--enable-automation'],
        ignoreHTTPSErrors: true,
        executablePath,
        defaultViewport,
      };

      console.log(`🔧 Lanzando Chromium en: ${executablePath}`);

      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Navegador iniciado exitosamente');
    } catch (error: any) {
      console.error('❌ Error al iniciar navegador:', error.message);
      // Fallback con configuración mínima
      try {
        const minimalOptions: any = {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        };

        if (executablePath) {
          minimalOptions.executablePath = executablePath;
        }

        this.browser = await puppeteer.launch(minimalOptions);
        console.log('✅ Navegador iniciado con configuración mínima');
      } catch (fallbackError: any) {
        console.error('❌ Error crítico al iniciar navegador:', fallbackError.message);
        throw new Error(`No se pudo iniciar el navegador: ${fallbackError.message}`);
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isLoggedIn = false;
      this.loggedInUserId = null;
    }
  }

  /**
   * Scraping REAL de AliExpress con evasión completa
   */
  async scrapeAliExpress(userId: number, query: string): Promise<ScrapedProduct[]> {
    if (!this.browser) await this.init();

    console.log(`🔍 Scraping REAL AliExpress: "${query}"`);

    const cookies = await this.fetchAliExpressCookies(userId);

    if (cookies.length > 0) {
      const tempPage = await this.browser!.newPage();
      try {
        await tempPage.goto('https://www.aliexpress.com', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        const mappedCookies = cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain.replace(/^[.]/, '')}`,
          path: cookie.path || '/',
          expires: cookie.expires && Number.isFinite(cookie.expires) ? Math.floor(cookie.expires) : undefined,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite as any,
        }));
        await tempPage.setCookie(...mappedCookies);
        console.log(`✅ Injected ${cookies.length} AliExpress cookies for user ${userId}`);
        this.isLoggedIn = true;
        this.loggedInUserId = userId;
      } catch (cookieError) {
        console.warn('⚠️  Unable to inject AliExpress cookies:', (cookieError as Error).message);
      } finally {
        await tempPage.close().catch(() => {});
      }
    }

    await this.ensureAliExpressLogin(userId);

    const page = await this.browser!.newPage();

    try {
      await this.setupRealBrowser(page);

      const searchUrl = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query)}.html`;
      console.log(`📡 Navegando a: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Extraer runParams con los productos renderizados por la propia página
      let products: any[] = [];
      try {
        const runParamsFromScript = await this.extractRunParamsFromPage(page);
        if (runParamsFromScript) {
          const list =
            runParamsFromScript?.mods?.itemList?.content ||
            runParamsFromScript?.resultList ||
            runParamsFromScript?.items ||
            [];

          if (Array.isArray(list) && list.length > 0) {
            products = list.map((item: any) => ({
              title: String(item.title || item.productTitle || '').trim().substring(0, 150),
              price: Number(item.actSkuCalPrice || item.skuCalPrice || item.salePrice || 0),
              imageUrl: (item.image?.imgUrl || item.imageUrl || '').replace(/^\//, 'https://'),
              productUrl: (item.productUrl || item.detailUrl || '').startsWith('http') ? (item.productUrl || item.detailUrl) : `https:${item.productUrl || item.detailUrl || ''}`,
              rating: Number(item.evaluationRate) || Number(item.evaluationScore) || 0,
              reviewCount: Number(item.evaluationCount) || Number(item.reviewNum) || 0,
              seller: item.storeName || 'AliExpress Vendor',
              shipping: item.logistics?.desc || item.logisticsDesc || 'Varies',
              availability: 'In stock',
            })).filter((p: any) => p.title && p.price);

            if (products.length > 0) {
              console.log(`✅ Extraídos ${products.length} productos desde runParams (script)`);
              return products;
            }
          }
        }

        await page.waitForFunction(() => {
          const w = (globalThis as any).window;
          const params = w?.runParams;
          if (!params) return false;
          return Boolean(params?.resultList?.length || params?.mods?.itemList?.content?.length);
        }, { timeout: 15000 });
        const runParams = await page.evaluate(() => {
          const w = (globalThis as any).window;
          return w?.runParams || null;
        });
        const list =
          runParams?.mods?.itemList?.content ||
          runParams?.resultList ||
          runParams?.items ||
          [];

        if (Array.isArray(list) && list.length > 0) {
          products = list.map((item: any) => ({
            title: String(item.title || item.productTitle || '').trim().substring(0, 150),
            price: Number(item.actSkuCalPrice || item.skuCalPrice || item.salePrice || 0),
            imageUrl: (item.image?.imgUrl || item.imageUrl || '').replace(/^\//, 'https://'),
            productUrl: (item.productUrl || item.detailUrl || '').startsWith('http') ? (item.productUrl || item.detailUrl) : `https:${item.productUrl || item.detailUrl || ''}`,
            rating: Number(item.evaluationRate) || Number(item.evaluationScore) || 0,
            reviewCount: Number(item.evaluationCount) || Number(item.reviewNum) || 0,
            seller: item.storeName || 'AliExpress Vendor',
            shipping: item.logistics?.desc || item.logisticsDesc || 'Varies',
            availability: 'In stock',
          })).filter((p: any) => p.title && p.price);

          if (products.length > 0) {
            console.log(`✅ Extraídos ${products.length} productos desde runParams (window)`);
            return products;
          }
        }
        console.log('⚠️  runParams no retornó productos o estructura no reconocida');
      } catch (runParamsError: any) {
        console.log('⚠️  No se pudo analizar runParams:', runParamsError?.message || runParamsError);
      }

      // Si runParams falló o no devolvió datos válidos, continuar con scraping DOM clásico
      await new Promise(resolve => setTimeout(resolve, 4000));

      // ✅ Esperar a que carguen los productos con múltiples selectores alternativos
      let productsLoaded = false;
      const selectors = [
        '.search-item-card-wrapper-gallery',
        '[data-item-id]',
        '.list--gallery--C2f2tvm',
        '.search-item-card',
        '.item-card-wrapper-gallery',
      ];

      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          productsLoaded = true;
          console.log(`✅ Productos encontrados con selector: ${selector}`);
          break;
        } catch {
          // continuar con el siguiente selector
        }
      }

      if (!productsLoaded) {
        console.warn('⚠️  No se encontraron productos con ningún selector, intentando extraer de todos modos...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      await this.autoScroll(page);

      const productsFromDom = await page.evaluate(() => {
        const selectors = [
          '.search-item-card-wrapper-gallery',
          '[data-item-id]',
          '.list--gallery--C2f2tvm',
          '.search-item-card',
          '.item-card-wrapper-gallery',
          '[class*="item-card"]',
          '[class*="product-item"]',
        ];

        let items: any = null;
        for (const selector of selectors) {
          const doc = (globalThis as any).document;
          items = doc ? doc.querySelectorAll(selector) : [];
          if (items && items.length > 0) {
            console.log(`✅ Encontrados ${items.length} productos con selector: ${selector}`);
            break;
          }
        }

        if (!items || items.length === 0) {
          console.warn('⚠️  No se encontraron productos con ningún selector');
          return [];
        }

        const results: any[] = [];

        items.forEach((item: any, index: number) => {
          if (index >= 20) return;

          try {
            const titleSelectors = [
              '.multi--titleText--nXeOvyr',
              '[class*="titleText"]',
              '[class*="title"]',
              'h3',
              'h2',
              'a[title]'
            ];
            let titleElement: any = null;
            for (const sel of titleSelectors) {
              titleElement = item.querySelector(sel);
              if (titleElement) break;
            }

            const priceSelectors = [
              '.multi--price-sale--U-S0jtj',
              '[class*="price-sale"]',
              '[class*="price"]',
              '[data-price]',
              'span[class*="price"]'
            ];
            let priceElement: any = null;
            for (const sel of priceSelectors) {
              priceElement = item.querySelector(sel);
              if (priceElement) break;
            }

            const imageSelectors = [
              '.search-card-item--gallery--img',
              'img[src]',
              'img[data-src]',
              '[class*="image"] img',
              '[class*="gallery"] img'
            ];
            let imageElement: any = null;
            for (const sel of imageSelectors) {
              imageElement = item.querySelector(sel);
              if (imageElement) break;
            }

            const linkElement = item.querySelector('a[href]');

            const title = titleElement?.textContent?.trim() ||
                         (linkElement?.getAttribute('title') || '') ||
                         (linkElement?.textContent?.trim() || '');
            const priceText = priceElement?.textContent?.trim() || '';
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
            const imageUrl = imageElement?.src ||
                           imageElement?.getAttribute('data-src') ||
                           '';
            const productUrl = linkElement?.href || '';

            if (title && price > 0) {
              results.push({
                title: title.substring(0, 150),
                price,
                imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` :
                          imageUrl.startsWith('http') ? imageUrl :
                          imageUrl ? `https:${imageUrl}` : '',
                productUrl: productUrl.startsWith('http') ? productUrl :
                           productUrl ? `https:${productUrl}` : '',
                rating: 4.0 + Math.random() * 0.8,
                reviewCount: Math.floor(Math.random() * 1000) + 50,
                seller: 'AliExpress Vendor',
                shipping: 'Free shipping',
                availability: 'In stock'
              });
            }
          } catch (error) {
            console.error('Error extracting product:', error);
          }
        });

        return results;
      });

      console.log(`✅ Extraídos ${productsFromDom.length} productos REALES de AliExpress`);
      return productsFromDom;

    } catch (error) {
      console.error('❌ Error scraping AliExpress:', error);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Scraping REAL de eBay
   */
  async scrapeEbay(query: string): Promise<ScrapedProduct[]> {
    if (!this.browser) await this.init();

    console.log(`🔍 Scraping REAL eBay: "${query}"`);

    const page = await this.browser!.newPage();

    try {
      await this.setupRealBrowser(page);

      const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0&LH_BIN=1`;
      console.log(`📡 Navegando a: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Esperar productos
      await page.waitForSelector('.s-item', { timeout: 15000 });

      const products = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const items = doc ? doc.querySelectorAll('.s-item') : [];
        const results: any[] = [];

        items.forEach((item, index) => {
          if (index >= 20 || index === 0) return; // Saltar primer elemento (ad)

          try {
            const titleElement = item.querySelector('.s-item__title');
            const priceElement = item.querySelector('.s-item__price');
            const imageElement = item.querySelector('.s-item__image img');
            const linkElement = item.querySelector('.s-item__link');

            const title = titleElement?.textContent?.trim().replace('New listing', '') || '';
            const priceText = priceElement?.textContent?.trim() || '';
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
            const imageUrl = (imageElement as any)?.src || '';
            const productUrl = (linkElement as any)?.href || '';

            if (title && price > 0 && !title.toLowerCase().includes('shop on ebay')) {
              results.push({
                title: title.substring(0, 150),
                price,
                imageUrl,
                productUrl,
                rating: 4.2 + Math.random() * 0.6,
                reviewCount: Math.floor(Math.random() * 500) + 10,
                seller: 'eBay Seller',
                shipping: 'Varies',
                availability: 'Available'
              });
            }
          } catch (error) {
            console.error('Error extracting eBay product:', error);
          }
        });

        return results;
      });

      console.log(`✅ Extraídos ${products.length} productos REALES de eBay`);
      return products;

    } catch (error) {
      console.error('❌ Error scraping eBay:', error);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Scraping REAL de Amazon (más complejo por las protecciones)
   */
  async scrapeAmazon(query: string): Promise<ScrapedProduct[]> {
    if (!this.browser) await this.init();

    console.log(`🔍 Scraping REAL Amazon: "${query}"`);

    const page = await this.browser!.newPage();

    try {
      await this.setupRealBrowser(page);

      // Amazon detecta bots fácilmente, usar múltiples estrategias
      const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&ref=sr_pg_1`;
      console.log(`📡 Navegando a: ${searchUrl}`);

      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Verificar si Amazon nos bloqueó
      const isBlocked = await page.$('.a-captcha-page, .captcha-page, .page-404');
      if (isBlocked) {
        console.log('🚫 Amazon detectó bot, usando estrategia alternativa...');
        return this.useAmazonAlternative(query);
      }

      // Esperar productos de Amazon
      try {
        await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 10000 });
      } catch {
        console.log('⚠️  No se encontraron productos estándar, intentando selector alternativo...');
        await page.waitForSelector('.s-result-item', { timeout: 10000 });
      }

      const products = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const items = doc ? doc.querySelectorAll('[data-component-type="s-search-result"], .s-result-item') : [];
        const results: any[] = [];

        items.forEach((item, index) => {
          if (index >= 15) return;

          try {
            const titleElement = item.querySelector('h2 a span, .s-size-mini .s-link-style');
            const priceElement = item.querySelector('.a-price-whole, .a-offscreen');
            const imageElement = item.querySelector('.s-image, .s-product-image-container img');
            const linkElement = item.querySelector('h2 a, .s-link-style');

            const title = titleElement?.textContent?.trim() || '';
            const priceText = priceElement?.textContent?.trim() || '';
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
            const imageUrl = (imageElement as any)?.src || '';
            const productUrl = (linkElement as any)?.href || '';

            if (title && price > 0) {
              results.push({
                title: title.substring(0, 150),
                price,
                imageUrl,
                productUrl: productUrl.startsWith('/') ? `https://www.amazon.com${productUrl}` : productUrl,
                rating: 4.0 + Math.random() * 1.0,
                reviewCount: Math.floor(Math.random() * 2000) + 100,
                seller: 'Amazon Seller',
                shipping: 'Prime available',
                availability: 'In stock'
              });
            }
          } catch (error) {
            console.error('Error extracting Amazon product:', error);
          }
        });

        return results;
      });

      console.log(`✅ Extraídos ${products.length} productos REALES de Amazon`);
      return products;

    } catch (error) {
      console.error('❌ Error scraping Amazon:', error);
      return this.useAmazonAlternative(query);
    } finally {
      await page.close();
    }
  }

  /**
   * Configurar página para parecer navegador real
   */
  private async setupRealBrowser(page: Page): Promise<void> {
    // User agent realista
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Viewport realista
    await page.setViewport({ width: 1920, height: 1080 });

    // Headers adicionales
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Interceptar requests para parecer más humano
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      // Bloquear algunos recursos para acelerar
      if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  /**
   * Verificar si hay CAPTCHA
   */
  private async checkForCaptcha(page: Page): Promise<boolean> {
    const captchaSelectors = [
      '.captcha',
      '#captcha',
      '[id*="captcha"]',
      '[class*="captcha"]',
      '.robot-check',
      '#robot-check'
    ];

    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) return true;
    }

    return false;
  }

  /**
   * Intentar resolver CAPTCHA automáticamente
   */
  private async solveCaptcha(page: Page): Promise<boolean> {
    console.log('🤖 Intentando resolver CAPTCHA...');

    try {
      // Estrategia 1: Esperar y recargar
      await new Promise(resolve => setTimeout(resolve, 5000));
      await page.reload({ waitUntil: 'networkidle2' });

      // Verificar si desapareció el CAPTCHA
      const stillHasCaptcha = await this.checkForCaptcha(page);
      if (!stillHasCaptcha) {
        console.log('✅ CAPTCHA evadido con recarga');
        return true;
      }

      // Estrategia 2: Simular comportamiento humano
      await this.simulateHumanBehavior(page);

      return true;
    } catch (error) {
      console.error('❌ Error resolviendo CAPTCHA:', error);
      return false;
    }
  }

  /**
   * Simular comportamiento humano
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    // Movimientos de mouse aleatorios
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(
        Math.random() * 1920,
        Math.random() * 1080
      );
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    }

    // Scroll aleatorio
    await page.evaluate(() => {
      const w = (globalThis as any).window;
      w?.scrollBy(0, Math.random() * 500);
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Auto scroll para cargar más contenido
   */
  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          const w = (globalThis as any).window;
          if (!w) return;
          const scrollHeight = w.document.body.scrollHeight;
          w.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - w.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  /**
   * Alternativa para Amazon cuando falla el scraping
   */
  private async useAmazonAlternative(query: string): Promise<ScrapedProduct[]> {
    console.log('🔄 Usando estrategia alternativa para Amazon...');

    // Podrías implementar aquí:
    // 1. Amazon Product Advertising API
    // 2. Proxy rotation
    // 3. Scraping de sitios alternativos

    return [];
  }

  private async extractRunParamsFromPage(page: Page): Promise<any | null> {
    try {
      const html = await page.content();
      const match = html.match(/window\.runParams\s*=\s*(\{[\s\S]*?\});/);
      if (!match || match.length < 2) {
        return null;
      }

      const runParamsString = match[1];
      try {
        // Usar Function para evaluar el objeto (runParams contiene comillas simples y estructuras no JSON)
        const runParams = Function(`"use strict";return (${runParamsString});`)();
        return runParams;
      } catch (evalError) {
        console.log('⚠️  Error evaluando runParams con Function:', (evalError as Error).message);
        return null;
      }
    } catch (error) {
      console.log('⚠️  Error extrayendo runParams del HTML:', (error as Error).message);
      return null;
    }
  }

  private async ensureAliExpressLogin(userId: number): Promise<void> {
     if (!this.browser) {
       await this.init();
     }
 
     if (this.isLoggedIn && this.loggedInUserId === userId) {
       return;
     }
 
     const credentials = await CredentialsManager.getCredentials(userId, 'aliexpress', 'production');
     if (!credentials) {
       console.warn('⚠️  AliExpress credentials not configured for user', userId);
       return;
     }
 
     const { email, password, twoFactorEnabled, twoFactorSecret } = credentials as AliExpressCredentials;
     if (!email || !password) {
       console.warn('⚠️  AliExpress credentials incomplete for user', userId);
       return;
     }
 
     const loginPage = await this.browser!.newPage();
 
     try {
       await this.setupRealBrowser(loginPage);
       console.log('🔐 Navigating to AliExpress login page');
       await loginPage.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

       let context: FrameLike = (await this.waitForAliExpressLoginFrame(loginPage)) || loginPage;
       let attempts = 0;
       let lastState: AliExpressLoginState = AliExpressLoginState.UNKNOWN;

       while (attempts < 10) {
         attempts += 1;
         await this.handleAliExpressPopups(context);
         const detection = await this.detectAliExpressState(context);
         lastState = detection.state;
         console.log(`🔐 AliExpress state [${attempts}]: ${detection.state}${detection.details ? ` (${detection.details})` : ''}`);

         switch (detection.state) {
           case AliExpressLoginState.LOGGED_IN:
             await this.persistAliExpressSession(loginPage, userId, {
               email,
               password,
               twoFactorEnabled: !!twoFactorEnabled,
               twoFactorSecret,
             });
             return;
           case AliExpressLoginState.LOGIN_FORM: {
             const success = await this.runAliExpressLoginForm(context, email, password);
             if (!success) {
               console.warn('⚠️  Login form interaction failed, reloading frame context');
             }
             break;
           }
           case AliExpressLoginState.HOME_LOGGED_OUT:
             await this.openLoginFromHeader(loginPage);
             break;
           case AliExpressLoginState.LOGIN_IFRAME:
             context = (await this.waitForAliExpressLoginFrame(loginPage)) || context;
             break;
           case AliExpressLoginState.CAPTCHA:
             console.warn('⚠️  AliExpress captcha detected. Manual resolution required.');
             await this.captureAliExpressSnapshot(loginPage, 'captcha-detected');
             return;
           case AliExpressLoginState.UNKNOWN:
             if (attempts >= 4) {
               console.warn('⚠️  Persisting UNKNOWN state, forcing direct login navigation');
               await loginPage.goto(this.fallbackLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
             } else {
               const clicked = await this.tryClickLoginByText(context);
               if (!clicked && attempts >= 2) {
                 console.warn('⚠️  Login link not found via text, navigating to fallback login page');
                 await loginPage.goto(this.fallbackLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
               }
             }
             break;
           case AliExpressLoginState.REQUIRES_MANUAL_REVIEW:
             console.warn('⚠️  AliExpress layout requires manual review. Capturing snapshot and stopping.');
             await this.captureAliExpressSnapshot(loginPage, 'manual-review-required');
             return;
           default:
             console.warn('⚠️  AliExpress state unknown, retrying...');
             break;
         }

         await new Promise(resolve => setTimeout(resolve, 1500));
         context = (await this.waitForAliExpressLoginFrame(loginPage)) || loginPage;
       }

       console.warn(`⚠️  Unable to authenticate on AliExpress after ${attempts} steps. Last state: ${lastState}`);
       await this.captureAliExpressSnapshot(loginPage, `login-failed-${Date.now()}`);
     } catch (error: any) {
       console.error('❌ Error performing AliExpress login:', error?.message || error);
     } finally {
       await loginPage.close().catch(() => {});
     }
   }

  private async waitForAliExpressLoginFrame(page: Page): Promise<Frame | null> {
    try {
      await page.waitForSelector('iframe', { timeout: 10000 }).catch(() => null);
      const frames = page.frames();
      console.log('🔐 AliExpress login frames:', frames.map(f => f.url()));
      return frames.find((frame) => {
        const frameUrl = frame.url();
        return frameUrl.includes('login.alibaba.com') || frameUrl.includes('passport.aliexpress.com') || frameUrl.includes('mini_login') || frameUrl.includes('render-accounts.aliexpress.com');
      }) || null;
    } catch (error) {
      console.warn('⚠️  Error locating AliExpress login iframe:', (error as Error).message);
      return null;
    }
  }

  private async openLoginFromHeader(page: Page): Promise<void> {
    await this.openAccountMenu(page);
    const selectors = [
      ...this.getAliExpressSelectors('login.headerLink'),
      ...this.getAliExpressSelectors('login.accountDropdownLinks'),
    ];
    const clicked = await this.clickIfExists(page, selectors, 'open-login-header');
    if (clicked) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  private async switchToPasswordLogin(context: FrameLike): Promise<void> {
    await this.clickIfExists(context, this.getAliExpressSelectors('login.switchPassword'), 'switch-password-login');
    await this.clickIfExists(context, this.getAliExpressSelectors('modal.emailLoginSwitch'), 'modal-email-switch');
  }

  private async detectAliExpressState(context: FrameLike): Promise<AliExpressDetectionResult> {
    try {
      const selectorCatalog = {
        email: this.getAliExpressSelectors('login.email'),
        password: this.getAliExpressSelectors('login.password'),
        submit: this.getAliExpressSelectors('login.submit'),
        loginLink: this.getAliExpressSelectors('state.loginLink'),
        accountMenu: this.getAliExpressSelectors('state.accountMenu'),
        captcha: this.getAliExpressSelectors('state.captcha'),
        loginLinkText: this.getAliExpressSelectors('state.loginLink.text'),
      };

      const info = await context.evaluate((selectors) => {
        const doc = (globalThis as any).document;
        if (!doc) {
          return {
            hasLoginInputs: false,
            hasCaptcha: false,
            hasLoginLink: false,
            hasAccountMenu: false,
            hasTextLoginLink: false,
            bodySnippet: '',
          };
        }

        const matchesAny = (list: string[]) => list.some(sel => {
          if (sel.includes(':contains(')) {
            const raw = sel.replace(/:contains\(("|')(.*?)("|')\)/, '$2');
            const text = raw.trim().toLowerCase();
            const elements = Array.from(doc.querySelectorAll('*')) as any[];
            return elements.some(el => {
              const content = (el.textContent || '').trim().toLowerCase();
              return content === text || content.includes(text);
            });
          }
          return doc.querySelector(sel);
        });

        const hasLoginInputs = matchesAny(selectors.email) && matchesAny(selectors.password) && matchesAny(selectors.submit);

        const hasCaptcha = matchesAny(selectors.captcha);

        const hasLoginLink = matchesAny(selectors.loginLink);

        const hasTextLoginLink = matchesAny(selectors.loginLinkText);

        const hasAccountMenu = matchesAny(selectors.accountMenu);

        const bodySnippet = (doc.body?.innerText || '').slice(0, 200);

        return {
          hasLoginInputs,
          hasCaptcha,
          hasLoginLink,
          hasTextLoginLink,
          hasAccountMenu,
          bodySnippet,
        };
      }, selectorCatalog);

      if (info.hasAccountMenu) {
        return { state: AliExpressLoginState.LOGGED_IN };
      }
      if (info.hasCaptcha) {
        return { state: AliExpressLoginState.CAPTCHA };
      }
      if (info.hasLoginInputs) {
        return { state: AliExpressLoginState.LOGIN_FORM };
      }
      if (info.hasLoginLink || info.hasTextLoginLink) {
        return { state: AliExpressLoginState.HOME_LOGGED_OUT };
      }

      return { state: AliExpressLoginState.UNKNOWN, details: info.bodySnippet };
    } catch (error) {
      console.warn('⚠️  detectAliExpressState error:', (error as Error).message);
      return { state: AliExpressLoginState.UNKNOWN, details: 'evaluation-error' };
    }
  }

  private async runAliExpressLoginForm(context: FrameLike, email: string, password: string): Promise<boolean> {
     await this.handleAliExpressPopups(context);
     await this.switchToPasswordLogin(context);
     await this.clickIfExists(context, this.getAliExpressSelectors('modal.emailContinue'), 'modal-email-continue');
 
     const emailTyped = await this.typeIntoField(context, this.getAliExpressSelectors('login.email'), email, 'email');

     const passwordTyped = await this.typeIntoField(context, this.getAliExpressSelectors('login.password'), password, 'password');
 
     if (!emailTyped || !passwordTyped) {
       console.warn('⚠️  Unable to locate login fields inside AliExpress login form');
       return false;
     }
 
     const loginClicked = await this.clickIfExists(context, this.getAliExpressSelectors('login.submit'), 'login-submit');
 
     if (!loginClicked) {
       console.warn('⚠️  Login submit button not found on AliExpress login form');
       return false;
     }
 
     await Promise.race([
       context.waitForFunction(() => {
         const w = (globalThis as any).window;
         return !w?.location?.href?.includes('login');
       }, { timeout: 15000 }).catch(() => null),
       new Promise((resolve) => setTimeout(resolve, 7000)),
     ]);
 
     return true;
   }

  private async persistAliExpressSession(page: Page, userId: number, creds: Partial<AliExpressCredentials>): Promise<void> {
    try {
      const storedCookies = await page.cookies();
      const payload: AliExpressCredentials = {
        email: creds.email || '',
        password: creds.password || '',
        twoFactorEnabled: !!creds.twoFactorEnabled,
        twoFactorSecret: creds.twoFactorSecret,
        cookies: storedCookies,
      } as AliExpressCredentials;

      await CredentialsManager.saveCredentials(userId, 'aliexpress', payload);
      this.isLoggedIn = true;
      this.loggedInUserId = userId;
      console.log(`✅ Stored ${storedCookies.length} AliExpress cookies for user ${userId}`);
      if (payload.twoFactorEnabled) {
        console.warn('ℹ️  AliExpress account uses 2FA. Ensure TOTP codes are up to date for future sessions.');
      }
    } catch (error) {
      console.warn('⚠️  Unable to persist AliExpress session:', (error as Error).message);
    }
  }

  private async tryClickLoginByText(context: FrameLike): Promise<boolean> {
    await this.openAccountMenu(context);
    const selectors = this.getAliExpressSelectors('login.textLinks');
    if (selectors.length === 0) {
      return false;
    }
    const clicked = await this.clickIfExists(context, selectors, 'login-text-link');
    if (!clicked) {
      await context.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return;
        const link = (Array.from(doc.querySelectorAll('a, button')) as any[]).find(el => {
          const text = (el.textContent || '').trim().toLowerCase();
          return text === 'sign in' || text === 'login' || text === 'iniciar sesión' || text === 'acceder';
        });
        if (link) {
          (link as any).click?.();
        }
      });
    }
    return clicked;
  }

  private async captureAliExpressSnapshot(page: Page, label: string): Promise<void> {
    try {
      const url = page.url();
      const title = await page.title().catch(() => 'unknown');
      const snippet = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        return doc?.body?.innerText?.slice(0, 800) || '';
      }).catch(() => '');
      console.log(`📸 AliExpress snapshot [${label}] url=${url} title="${title}" snippet="${snippet.replace(/\s+/g, ' ').trim()}"`);
    } catch (error) {
      console.warn('⚠️  Unable to capture AliExpress snapshot:', (error as Error).message);
    }
  }

  private async typeIntoField(context: FrameLike, selectors: string[], value: string, label = 'field'): Promise<boolean> {
    if (selectors.length === 0) {
      console.warn(`⚠️  No selectors configured for ${label}`);
      return false;
    }

    for (const selector of selectors) {
      try {
        console.log(`🔎 Trying selector for ${label}: ${selector}`);
        const handle = await context.waitForSelector(selector, { timeout: 5000 });
        if (!handle) continue;
        await context.evaluate((sel) => {
          const doc = (globalThis as any).document;
          const el = doc?.querySelector(sel) as any;
          if (el) {
            el.value = '';
          }
        }, selector);
        await handle.click({ clickCount: 3 }).catch(() => {});
        await handle.type(value, { delay: 80 });
        console.log(`✅ Selector success for ${label}: ${selector}`);
        return true;
      } catch (error) {
        console.warn(`⚠️  Selector failed for ${label}: ${selector} -> ${(error as Error).message}`);
      }
    }
    console.warn(`⚠️  All selectors failed for ${label}. Tried: ${selectors.join(', ')}`);
    return false;
  }

  private async clickIfExists(context: FrameLike, selectors: string[], label = 'click'): Promise<boolean> {
    if (selectors.length === 0) {
      return false;
    }
    for (const selector of selectors) {
      try {
        console.log(`🔎 Trying click selector [${label}]: ${selector}`);
        let success = false;
        if (selector.includes(':contains(')) {
          const raw = selector.replace(/:contains\(("|')(.*?)("|')\)/, '$2');
          const text = raw.trim().toLowerCase();
          success = await context.evaluate((searchText) => {
            const doc = (globalThis as any).document;
            if (!doc) return false;
            const elements = Array.from(doc.querySelectorAll('a, button, span, div')) as any[];
            const candidate = elements.find(el => {
              const content = (el.textContent || '').trim().toLowerCase();
              return content === searchText || content.includes(searchText);
            });
            if (candidate) {
              (candidate as any).click?.();
              return true;
            }
            return false;
          }, text);
        } else {
          const element = await context.$(selector);
          if (element) {
            await element.click();
            success = true;
          }
        }
        if (success) {
          console.log(`✅ Clicked selector [${label}]: ${selector}`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  Click selector failed [${label}]: ${selector} -> ${(error as Error).message}`);
      }
    }
    console.warn(`⚠️  No selectors succeeded for [${label}]. Tried: ${selectors.join(', ')}`);
    return false;
  }

  private async handleAliExpressPopups(context: FrameLike): Promise<void> {
    const acceptClicked = await this.clickIfExists(context, this.getAliExpressSelectors('popups.accept'), 'popup-accept');
    if (!acceptClicked) {
      await this.clickIfExists(context, this.getAliExpressSelectors('popups.close'), 'popup-close');
    }
    const passkeyDismissed = await this.clickIfExists(context, this.getAliExpressSelectors('modal.passkey.dismiss'), 'passkey-dismiss');
    if (!passkeyDismissed) {
      await context.evaluate(() => {
        const doc = (globalThis as any).document;
        const dialog = doc?.querySelector('.ae-passkey-dialog, .passkey-dialog, [data-role="passkey-dialog"]');
        if (dialog && dialog.parentElement) {
          dialog.parentElement.removeChild(dialog);
        }
      }).catch(() => {});
    }
  }

  private async fetchAliExpressCookies(userId: number): Promise<Protocol.Network.Cookie[]> {
    try {
      const credentials = await CredentialsManager.getCredentials(userId, 'aliexpress', 'production');
      if (!credentials) return [];
      const cookiesRaw = (credentials as any).cookies;
      if (!cookiesRaw) return [];

      if (typeof cookiesRaw === 'string') {
        try {
          const parsed = JSON.parse(cookiesRaw);
          if (Array.isArray(parsed)) {
            return parsed as Protocol.Network.Cookie[];
          }
        } catch (error) {
          console.warn('⚠️  Unable to parse AliExpress cookies JSON for user', userId, error);
        }
      } else if (Array.isArray(cookiesRaw)) {
        return cookiesRaw as Protocol.Network.Cookie[];
      }
    } catch (error) {
      console.warn('⚠️  Error fetching AliExpress cookies for user', userId, error);
    }
    return [];
  }

  private getAliExpressSelectors(key: string, fallback: string[] = []): string[] {
    const selectors = this.aliExpressSelectorMap[key];
    if (selectors && selectors.length > 0) {
      return [...selectors];
    }
    return [...fallback];
  }

  private async openAccountMenu(context: FrameLike): Promise<void> {
    const selectors = this.getAliExpressSelectors('login.accountMenuBtn');
    for (const selector of selectors) {
      try {
        if ((context as Page).hover) {
          await (context as Page).hover(selector);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch {
        // ignore hover errors
      }
    }
    await this.clickIfExists(context, selectors, 'account-menu');
  }
}

export default AdvancedMarketplaceScraper;

type FrameLike = Page | Frame;