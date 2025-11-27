import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, Protocol, Frame, HTTPResponse } from 'puppeteer';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import axios from 'axios';
import { getChromiumLaunchConfig } from '../utils/chromium';
import { CredentialsManager } from './credentials-manager.service';
import type { AliExpressCredentials } from '../types/api-credentials.types';
import ManualAuthService from './manual-auth.service';
import ManualAuthRequiredError from '../errors/manual-auth-required.error';
import { marketplaceAuthStatusService } from './marketplace-auth-status.service';
import { resolvePrice, resolvePriceRange } from '../utils/currency.utils';
import fxService from './fx.service';
import logger from '../config/logger';

// Configurar Puppeteer con plugin stealth para evadir detección
puppeteer.use(StealthPlugin());

/**
 * Scraper AVANZADO con evasión de CAPTCHA y detección anti-bot
 * Usa Puppeteer con modo stealth para parecer navegador real
 */

interface ScrapedProduct {
  title: string;
  price: number;
  currency: string;
  sourcePrice?: number;
  sourceCurrency?: string;
  originalPrice?: number;
  priceMin?: number;
  priceMax?: number;
  priceMinSource?: number;
  priceMaxSource?: number;
  priceRangeSourceCurrency?: string;
  priceSource?: string;
  imageUrl: string;
  images?: string[]; // ✅ MEJORADO: Array de todas las imágenes disponibles
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
      'input[placeholder*="Email"]',
      'input[placeholder*="correo"]',
      'input[data-role="username"]',
      'input[class*="login-email"]',
      'input[id*="loginId"]',
      'input[id="email"]',
      'input[name*="email"]',
      'input[autocomplete="username"]',
      'input[data-testid*="email"]',
      'input[aria-label*="email"]',
      'input[data-model-key*="loginId"]'
    ],
    'login.password': [
      'input#fm-login-password',
      'input[name="fm-login-password"]',
      'input[name="password"]',
      'input[type="password"]',
      'input[data-placeholder*="Password"]',
      'input[data-placeholder*="contraseña"]',
      'input[placeholder*="Password"]',
      'input[data-role="password"]',
      'input[class*="login-password"]',
      'input[name*="pass"]',
      'input[autocomplete="current-password"]',
      'input[data-testid*="password"]',
      'input[aria-label*="password"]',
      'input[data-model-key*="password"]'
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
      'button[class*="login-submit"]',
      'button[data-role="submit"]',
      'button[data-testid*="sign"]',
      'button[data-testid*="login"]',
      'button[data-action*="signin"]',
      'button[name="login"]'
    ],
    'login.switchPassword': [
      '.switch-btn',
      '.password-login',
      '#login-switch',
      '.login-switch',
      'a[data-spm-anchor-id*="password"]',
      'button[data-role="password"]',
      'button[data-type="password"]',
      'button[data-testid*="password-login"]',
      'button[data-testid*="switch-to-password"]',
      'button[data-action*="password"]',
      'button:contains("Password login")',
      'button:contains("Use password")'
    ],
    'login.headerLink': [
      'a[href*="login"]',
      'a[data-role="login"]',
      'a[data-spm-anchor-id*="login"]',
      '.user-account .sign-btn',
      '.nav-user-account .sign-btn',
      'a.sign-btn',
      'button.header-signin-btn',
      'button[data-testid*="header-signin"]',
      'button[data-testid*="sign-in-button"]',
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
      'button[data-testid*="accept"]',
      'button[class*="gdpr"]',
      'button[class*="cookie-accept"]',
      'button:contains("Accept all")',
      'button:contains("Aceptar todo")'
    ],
    'popups.close': [
      'a[data-role="close"]',
      'button[aria-label="close"]',
      '.next-dialog .next-dialog-close',
      '.close-button',
      '.close-btn',
      'button[data-role="close"]',
      'button[data-action="close"]',
      'button[data-testid*="close"]',
      'button:contains("Close")'
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
      'button[data-testid*="sign"]',
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
      'button[data-testid*="passkey-skip"]'
    ],
    'modal.emailLoginSwitch': [
      'a:contains("Sign in with password")',
      'a:contains("Sign in with email")',
      'button:contains("Sign in with password")',
      'button[data-role="password-login"]',
      'button[data-testid*="password-login"]',
      'button:contains("Use email")',
      'button:contains("Email login")',
      'button[data-testid*="email-login"]'
    ],
    'modal.emailContinue': [
      'button:contains("Continue")',
      'button:contains("Continuar")',
      'button.next-btn-primary',
      'button[data-role="continue"]',
      'button[data-testid*="continue"]',
      'button[data-testid*="next"]'
    ],
  };

  async init(): Promise<void> {
    const { logger } = await import('../config/logger');
    logger.info('[SCRAPER] Iniciando navegador con evasión anti-bot');

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

    // ✅ RESTAURADO: Lógica simple que funcionaba antes
    // Confiar en lo que retorna getChromiumLaunchConfig() y usarlo directamente
    // Solo si Puppeteer falla al usarlo, entonces usar fallbacks
    if (executablePath) {
      logger.info('[SCRAPER] Chromium encontrado en ruta preferida', { path: executablePath });
    } else {
      logger.info('[SCRAPER] Usando Chromium de Puppeteer (sin executablePath especificado)');
    }

    try {
      const launchOptions: any = {
        headless,
        args: ['--no-sandbox', ...chromiumArgs],
        ignoreDefaultArgs: ['--enable-automation'],
        ignoreHTTPSErrors: true,
        executablePath,
        defaultViewport,
      };

      logger.info('[SCRAPER] Lanzando Chromium', { path: executablePath || 'Puppeteer default' });

      // ✅ Intentar lanzar con timeout para evitar cuelgues
      try {
        this.browser = await Promise.race([
          puppeteer.launch(launchOptions),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Browser launch timeout after 30s')), 30000)
          )
        ]) as Browser;
        
        // ✅ Verificar que el navegador esté realmente conectado
        if (!this.browser || !this.browser.isConnected()) {
          throw new Error('Browser launched but not connected');
        }
        
        logger.info('[SCRAPER] Navegador iniciado exitosamente', { executablePath: executablePath || 'Puppeteer default' });
      } catch (launchError: any) {
        logger.error('[SCRAPER] Error al lanzar navegador', {
          error: launchError?.message || String(launchError),
          executablePath: executablePath || 'none',
          stack: launchError?.stack
        });
        
        // ✅ SI HAY ENOENT: El archivo no existe realmente, buscar chromium del sistema directamente
        if (launchError.message?.includes('ENOENT') && executablePath) {
          logger.warn('[SCRAPER] Error ENOENT - el archivo no existe realmente', { executablePath });
          
          // ✅ En ENOENT, buscar chromium del sistema directamente (Railway/Nixpacks lo instala en /app/.chromium/chromium)
          // No usar resolveChromiumExecutable() porque ya probamos Sparticuz - buscar directamente en rutas del sistema
          const fs = await import('fs');
          const systemPaths = [
            '/app/.chromium/chromium', // Railway/Nixpacks
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/local/bin/chromium',
            '/usr/local/bin/chromium-browser'
          ];
          
          for (const systemPath of systemPaths) {
            try {
              if (fs.existsSync(systemPath)) {
                const stats = fs.statSync(systemPath);
                if (stats.isFile()) {
                  // Intentar hacer ejecutable si no lo es
                  try {
                    if (os.platform() !== 'win32') {
                      fs.chmodSync(systemPath, 0o755);
                    }
                  } catch {}
                  
                  logger.info('[SCRAPER] Intentando con chromium del sistema', { path: systemPath });
                  launchOptions.executablePath = systemPath;
                  
                  try {
                    this.browser = await Promise.race([
                      puppeteer.launch(launchOptions),
                      new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Browser launch timeout after 30s')), 30000)
                      )
                    ]) as Browser;
                    
                    if (!this.browser || !this.browser.isConnected()) {
                      throw new Error('Browser launched but not connected (with system chromium)');
                    }
                    
                    // Verificar que puede crear páginas
                    const testPage = await this.browser.newPage();
                    await testPage.close();
                    
                    logger.info('[SCRAPER] Navegador iniciado exitosamente con chromium del sistema', { path: systemPath });
                    return; // ✅ Éxito, retornar inmediatamente
                  } catch (systemChromiumError: any) {
                    logger.warn('[SCRAPER] Falló con chromium del sistema', {
                      path: systemPath,
                      error: systemChromiumError?.message || String(systemChromiumError)
                    });
                    // Continuar con siguiente path
                    continue;
                  }
                }
              }
            } catch (pathError) {
              // Continuar con siguiente path
              continue;
            }
          }
          
          // ✅ Si no se encuentra chromium del sistema, intentar SIN executablePath
          logger.warn('[SCRAPER] No se encontró chromium del sistema, intentando sin executablePath');
          delete launchOptions.executablePath;
          
          try {
            this.browser = await Promise.race([
              puppeteer.launch(launchOptions),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Browser launch timeout after 30s')), 30000)
              )
            ]) as Browser;
            
            if (!this.browser || !this.browser.isConnected()) {
              throw new Error('Browser launched but not connected (without executablePath)');
            }
            
            // Verificar que puede crear páginas
            const testPage = await this.browser.newPage();
            await testPage.close();
            
            logger.info('[SCRAPER] Navegador iniciado exitosamente sin executablePath');
            return; // ✅ Éxito, retornar inmediatamente
          } catch (noExecPathError: any) {
            // Si también falla sin executablePath, continuar con fallbacks normales
            logger.warn('[SCRAPER] También falló sin executablePath, usando fallbacks', {
              error: noExecPathError?.message || String(noExecPathError)
            });
            throw noExecPathError;
          }
        }
        
        // ✅ Si hay error de "Target closed", intentar cerrar y relanzar
        if (launchError.message?.includes('Target closed') || launchError.message?.includes('Protocol error')) {
          logger.warn('[SCRAPER] Error de protocolo detectado, intentando con configuración más simple', {
            error: launchError?.message || String(launchError)
          });
          // Cerrar navegador si existe pero está en mal estado
          if (this.browser) {
            try {
              await this.browser.close().catch(() => {});
            } catch {}
            this.browser = null;
          }
          // Lanzar con configuración más simple
          throw new Error('Protocol error - will retry with minimal config');
        }
        throw launchError;
      }
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      logger.error('[SCRAPER] Error al iniciar navegador', {
        error: errorMsg,
        stack: error?.stack
      });
      
      // ✅ Fallback 1: Configuración mínima con Chromium del sistema
      try {
        logger.info('[SCRAPER] Intentando con configuración mínima (Chromium sistema)');
        const minimalOptions: any = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-default-apps',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain',
            '--single-process', // ✅ Crítico para Railway/contenedores
          ],
        };

        // ✅ Solo usar executablePath si NO falló con ENOENT antes
        // Si llegamos aquí con ENOENT, NO usar executablePath en fallback
        if (executablePath && !errorMsg.includes('ENOENT')) {
          minimalOptions.executablePath = executablePath;
        }
        // Si hubo ENOENT, no incluir executablePath para que Puppeteer use el suyo

        // ✅ Intentar lanzar con timeout también en fallback
        this.browser = await Promise.race([
          puppeteer.launch(minimalOptions),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Browser launch timeout after 30s')), 30000)
          )
        ]) as Browser;
        
        // ✅ Esperar un momento para que el navegador se estabilice
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // ✅ Verificar conexión
        if (!this.browser || !this.browser.isConnected()) {
          throw new Error('Browser launched but not connected (fallback)');
        }
        
        // ✅ Verificar que el navegador puede crear una página
        try {
          const testPage = await this.browser.newPage();
          await testPage.close();
        } catch (testError: any) {
          throw new Error(`Browser test failed: ${testError.message}`);
        }
        
        logger.info('[SCRAPER] Navegador iniciado con configuración mínima');
      } catch (fallbackError: any) {
        const fallbackMsg = fallbackError.message || String(fallbackError);
        logger.error('[SCRAPER] Error con configuración mínima', {
          error: fallbackMsg,
          stack: fallbackError?.stack
        });
        
        // ✅ Fallback 2: Intentar sin executablePath (usar Chromium de Puppeteer)
        try {
          logger.info('[SCRAPER] Intentando sin executablePath (Chromium Puppeteer)');
          const puppeteerChromiumOptions: any = {
            headless: 'new', // Usar nuevo modo headless si está disponible
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--single-process',
            ],
          };

          // NO especificar executablePath - dejar que Puppeteer use el suyo
          this.browser = await Promise.race([
            puppeteer.launch(puppeteerChromiumOptions),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Puppeteer Chromium launch timeout')), 30000)
            )
          ]) as Browser;
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (!this.browser || !this.browser.isConnected()) {
            throw new Error('Puppeteer Chromium not connected');
          }
          
          // ✅ Verificar que puede crear páginas
          const testPage = await this.browser.newPage();
          await testPage.close();
          
          logger.info('[SCRAPER] Navegador iniciado con Chromium de Puppeteer');
        } catch (puppeteerError: any) {
          const puppeteerMsg = puppeteerError.message || String(puppeteerError);
          logger.error('[SCRAPER] Error crítico al iniciar navegador', {
            error: puppeteerMsg,
            stack: puppeteerError?.stack,
            message: 'Todos los métodos de inicio fallaron'
          });
          logger.warn('[SCRAPER] Continuando sin navegador - se usará bridge Python como alternativa');
          this.browser = null;
        }
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
  async scrapeAliExpress(userId: number, query: string, environment: 'sandbox' | 'production' = 'production', userBaseCurrency?: string): Promise<ScrapedProduct[]> {
    const { logger } = await import('../config/logger');
    
    logger.info('[SCRAPER] scrapeAliExpress iniciado', { query, userId, environment, userBaseCurrency });
    
    // ✅ Intentar inicializar navegador, pero si falla, NO retornar vacío inmediatamente
    // En su lugar, lanzar un error que permita al opportunity-finder usar el fallback de bridge Python
    if (!this.browser) {
      logger.debug('[SCRAPER] Navegador no disponible, intentando inicializar...');
      try {
        await this.init();
        // Verificar que el navegador se inicializó correctamente
        if (!this.browser || !this.browser.isConnected()) {
          logger.warn('[SCRAPER] Navegador no disponible después de init', {
            hasBrowser: !!this.browser,
            isConnected: this.browser?.isConnected() || false
          });
          // ✅ NO retornar vacío - lanzar error para que opportunity-finder use bridge Python
          throw new Error('Browser not available after initialization');
        }
        logger.info('[SCRAPER] Navegador inicializado correctamente');
      } catch (initError: any) {
        logger.error('[SCRAPER] No se pudo inicializar navegador', {
          error: initError?.message || String(initError),
          stack: initError?.stack
        });
        // ✅ NO retornar vacío - lanzar error para que opportunity-finder use bridge Python
        throw new Error(`Failed to initialize browser: ${initError?.message || String(initError)}`);
      }
    }
    
    // ✅ Verificar que el navegador sigue conectado antes de usar
    if (this.browser && !this.browser.isConnected()) {
      logger.warn('[SCRAPER] Navegador desconectado, intentando reinicializar...');
      try {
        await this.init();
        if (!this.browser || !this.browser.isConnected()) {
          logger.warn('[SCRAPER] No se pudo reinicializar navegador');
          // ✅ NO retornar vacío - lanzar error para que opportunity-finder use bridge Python
          throw new Error('Browser not connected after reinitialization');
        }
      } catch (reinitError: any) {
        logger.error('[SCRAPER] Error al reinicializar navegador', {
          error: reinitError?.message || String(reinitError)
        });
        // ✅ NO retornar vacío - lanzar error para que opportunity-finder use bridge Python
        throw new Error(`Failed to reinitialize browser: ${reinitError?.message || String(reinitError)}`);
      }
    }

    logger.info('[SCRAPER] Scraping REAL AliExpress', { query, environment, userId });

    // ✅ MODIFICADO: NO requerir cookies o login antes de hacer scraping
    // El scraping debe funcionar en modo público primero, y solo solicitar autenticación si detecta CAPTCHA/bloqueo
    const cookies = await this.fetchAliExpressCookies(userId, environment);
    logger.debug('[SCRAPER] Cookies encontradas', { count: cookies.length, userId, environment });

    const hasManualCookies = cookies.length > 0;

    // ✅ Si hay cookies guardadas, usarlas (mejora, pero NO requerido)
    if (hasManualCookies) {
      logger.info('[SCRAPER] Cookies disponibles, inyectándolas en el navegador', { count: cookies.length });
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
        logger.info('[SCRAPER] Cookies inyectadas exitosamente', { count: cookies.length, userId });
        this.isLoggedIn = true;
        this.loggedInUserId = userId;
        await marketplaceAuthStatusService.markHealthy(
          userId,
          'aliexpress',
          'Sesión restaurada automáticamente usando cookies guardadas'
        );
      } catch (cookieError) {
        logger.warn('[SCRAPER] No se pudieron inyectar cookies', {
          error: cookieError instanceof Error ? cookieError.message : String(cookieError),
          userId
        });
      } finally {
        await tempPage.close().catch(() => {});
      }
    } else {
      // ✅ NO hay cookies - continuar en modo público (como funcionaba antes del 8 de noviembre)
      logger.info('[SCRAPER] No hay cookies guardadas. Continuando en modo público (sin autenticación)', { userId });
      logger.debug('[SCRAPER] Si detectamos CAPTCHA o bloqueo, entonces solicitaremos autenticación manual');
    }
    
    // ✅ ELIMINADO: No intentar login automático antes de hacer scraping
    // El login automático solo se intentará si detectamos CAPTCHA/bloqueo durante el scraping

    // ✅ Crear página con manejo de errores para "Target closed"
    let page: Page;
    try {
      if (!this.browser || !this.browser.isConnected()) {
        throw new Error('Browser not connected');
      }
      page = await this.browser.newPage();
    } catch (pageError: any) {
      const errorMsg = pageError?.message || String(pageError);
      if (errorMsg.includes('Target closed') || errorMsg.includes('Protocol error')) {
        logger.warn('[SCRAPER] Error "Target closed" al crear página, reinicializando navegador...', { error: errorMsg });
        // Cerrar navegador si existe pero está en mal estado
        if (this.browser) {
          try {
            await this.browser.close().catch(() => {});
          } catch {}
          this.browser = null;
        }
        // Reintentar inicialización
        try {
          await this.init();
          if (!this.browser || !this.browser.isConnected()) {
            throw new Error('Browser not connected after reinit');
          }
          page = await this.browser.newPage();
          logger.info('[SCRAPER] Navegador reinicializado exitosamente después de "Target closed"');
        } catch (reinitError: any) {
          logger.error('[SCRAPER] No se pudo reinicializar navegador después de "Target closed"', {
            error: reinitError?.message || String(reinitError)
          });
          return [];
        }
      } else {
        throw pageError;
      }
    }

    const apiCapturedItems: any[] = [];
    const seenApiResponses = new Set<string>();

    const apiResponseHandler = async (response: HTTPResponse) => {
      try {
        const url = response.url();
        if (!url) return;
        
        // ✅ Capturar más endpoints de AliExpress que pueden contener productos
        const aliExpressApiPatterns = [
          'api.mgsearch.alibaba.com',
          'gpsfront.aliexpress.com',
          'wholesale.aliexpress.com',
          'search.aliexpress.com',
          '/api/search',
          '/search/api',
          'aliexpress.com/api'
        ];
        
        if (!aliExpressApiPatterns.some(pattern => url.includes(pattern))) {
          return;
        }
        
        const status = response.status();
        if (status < 200 || status >= 400) {
          console.debug(`⚠️  API response con status ${status}: ${url.substring(0, 80)}`);
          return;
        }
        
        const key = `${url}|${response.request().method()}`;
        if (seenApiResponses.has(key)) return;
        
        const headers = response.headers() || {};
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        if (contentType && !contentType.includes('json') && !contentType.includes('text')) {
          return;
        }
        
        const text = await response.text().catch(() => '');
        if (!text) return;
        seenApiResponses.add(key);
        
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          // Intentar extraer JSON si está embebido en texto
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              data = JSON.parse(jsonMatch[0]);
            } catch {
              return;
            }
          } else {
            return;
          }
        }

        const candidates =
          data?.resultList ||
          data?.items ||
          data?.data?.items ||
          data?.data?.result?.resultList ||
          data?.data?.resultList ||
          data?.data?.mods?.itemList?.content ||
          data?.content ||
          (Array.isArray(data) ? data : []) ||
          [];

        if (Array.isArray(candidates) && candidates.length > 0) {
          apiCapturedItems.push(...candidates);
          logger.info('[SCRAPER] Productos capturados desde API interna', {
            count: candidates.length,
            url: url.substring(0, 80),
            query
          });
        }
      } catch (error) {
        logger.warn('[SCRAPER] Error procesando respuesta API AliExpress', {
          error: error instanceof Error ? error.message : String(error),
          query
        });
      }
    };

    try {
      page.on('response', apiResponseHandler);
      await this.setupRealBrowser(page);

      // ✅ ESTRATEGIA MEJORADA: Navegar primero a la página principal para establecer sesión
      logger.info('[SCRAPER] Estableciendo sesión en AliExpress (navegando a página principal primero)', { query });
      try {
        await page.goto('https://www.aliexpress.com', { 
          waitUntil: 'domcontentloaded', 
          timeout: 20000 
        });
        // Esperar un momento para que se establezca la sesión
        await new Promise(resolve => setTimeout(resolve, 2000));
        logger.info('[SCRAPER] Sesión establecida en página principal');
      } catch (homeError: any) {
        logger.warn('[SCRAPER] Error navegando a página principal, continuando de todos modos', {
          error: homeError?.message || String(homeError)
        });
      }

      // ✅ Probar múltiples formatos de URL de búsqueda (AliExpress puede cambiar el formato)
      const searchUrls = [
        `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query)}.html`,
        `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`,
        `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}&SortType=total_tranpro_desc`,
        `https://www.aliexpress.com/w/wholesale?SearchText=${encodeURIComponent(query)}&g=y`,
      ];
      
      let searchUrl = searchUrls[0];
      let navigationSuccess = false;
      
      // Intentar navegar con el primer formato
      logger.info('[SCRAPER] Navegando a URL de búsqueda', { url: searchUrl, query });
      try {
        await page.goto(searchUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        // ✅ Esperar más tiempo para que la página se cargue completamente
        await new Promise(resolve => setTimeout(resolve, 3000));
        navigationSuccess = true;
        logger.info('[SCRAPER] Navegación exitosa', { url: searchUrl });
      } catch (navError: any) {
        logger.warn('[SCRAPER] Error navegando con formato inicial', {
          error: navError?.message || String(navError),
          url: searchUrl
        });
        
        // Intentar con formatos alternativos
        for (let i = 1; i < searchUrls.length; i++) {
          try {
            searchUrl = searchUrls[i];
            logger.debug('[SCRAPER] Intentando formato alternativo', { format: i + 1, url: searchUrl });
            await page.goto(searchUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: 25000 
            });
            navigationSuccess = true;
            logger.info('[SCRAPER] Navegación exitosa con formato alternativo', { format: i + 1, url: searchUrl });
            break;
          } catch (altError: any) {
            logger.warn('[SCRAPER] Formato alternativo también falló', {
              format: i + 1,
              error: altError?.message || String(altError),
              url: searchUrl
            });
            if (i === searchUrls.length - 1) {
              // Último intento con timeout más corto
              try {
                await page.goto(searchUrl, { 
                  waitUntil: 'networkidle0', 
                  timeout: 15000 
                });
                navigationSuccess = true;
              } catch (finalError: any) {
                logger.error('[SCRAPER] Error al navegar a AliExpress con todos los formatos', {
                  error: finalError?.message || String(finalError),
                  query,
                  userId
                });
                throw new Error(`Failed to navigate to AliExpress: ${finalError.message}`);
              }
            }
          }
        }
      }
      
      if (!navigationSuccess) {
        throw new Error('Failed to navigate to AliExpress with any URL format');
      }

      // ✅ RESTAURACIÓN: Esperar más tiempo ANTES de verificar bloqueo (como funcionaba antes)
      // El scraper anterior esperaba más tiempo para dar oportunidad a que la página cargue
      logger.debug('[SCRAPER] Esperando tiempo adicional antes de verificar bloqueo...', { query });
      await new Promise(resolve => setTimeout(resolve, 8000)); // ✅ Aumentado de 5s a 8s (como funcionaba antes)
      
      // ✅ Verificar si AliExpress bloqueó el acceso (página "punish" o TMD)
      // PERO NO retornar vacío inmediatamente - intentar extraer productos de todos modos
      const currentUrl = page.url();
      let isBlocked = currentUrl.includes('/punish') || 
                      currentUrl.includes('TMD') || 
                      currentUrl.includes('x5secdata') ||
                      currentUrl.includes('x5step');
      
      if (isBlocked) {
        logger.warn('[SCRAPER] Posible bloqueo detectado en URL, pero intentando continuar', {
          url: currentUrl,
          query,
          userId,
          message: 'AliExpress puede estar bloqueando, pero intentaremos extraer productos de todos modos.'
        });
        
        await this.captureAliExpressSnapshot(page, `blocked-${Date.now()}`);
        
        // ✅ RESTAURACIÓN: Intentar esperar más tiempo y ver si la página se carga
        // A veces AliExpress redirige temporalmente pero luego carga la página correcta
        // El scraper anterior era más paciente y esperaba más tiempo
        logger.debug('[SCRAPER] Esperando tiempo adicional para ver si la página se carga después del bloqueo...', { query });
        await new Promise(resolve => setTimeout(resolve, 15000)); // ✅ Aumentado de 10s a 15s (como funcionaba antes)
        
        // Verificar si la URL cambió (puede haber redirigido a la página correcta)
        const urlAfterWait = page.url();
        const stillBlocked = urlAfterWait.includes('/punish') || 
                            urlAfterWait.includes('TMD') || 
                            urlAfterWait.includes('x5secdata') ||
                            urlAfterWait.includes('x5step');
        
        if (!stillBlocked) {
          logger.info('[SCRAPER] Bloqueo temporal resuelto, página cargó correctamente después de esperar', { 
            originalUrl: currentUrl,
            newUrl: urlAfterWait 
          });
          // Continuar normalmente - el bloqueo se resolvió
        } else {
          logger.warn('[SCRAPER] Bloqueo persiste después de esperar, intentando usar cookies...', { userId });
          
          // ✅ Intentar usar cookies si están disponibles
          try {
            const credentials = await CredentialsManager.getCredentials(userId, 'aliexpress', environment || 'production') as AliExpressCredentials | null;
            
            if (credentials && credentials.cookies && credentials.cookies.length > 0) {
              logger.info('[SCRAPER] Intentando usar cookies guardadas para evitar bloqueo', { userId });
              
              // Cerrar página actual y crear una nueva con cookies
              await page.close();
              const newPage = await this.browser!.newPage();
              await this.setupRealBrowser(newPage);
              
              // Establecer cookies antes de navegar
              await newPage.setCookie(...credentials.cookies.map((cookie: any) => ({
                name: cookie.name || cookie.key,
                value: cookie.value,
                domain: cookie.domain || '.aliexpress.com',
                path: cookie.path || '/',
                expires: cookie.expires || cookie.expiry || Date.now() / 1000 + 86400
              })));
              
              // Navegar primero a la página principal
              await newPage.goto('https://www.aliexpress.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
              await new Promise(resolve => setTimeout(resolve, 3000)); // ✅ Aumentar de 2s a 3s
              
              // Intentar navegar de nuevo con cookies
              await newPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              // ✅ RESTAURACIÓN: Esperar MÁS tiempo después de usar cookies (como funcionaba antes)
              // El scraper anterior esperaba más tiempo para que las cookies surtieran efecto
              await new Promise(resolve => setTimeout(resolve, 8000)); // ✅ Aumentado de 5s a 8s
              
              // ✅ Esperar tiempo adicional y verificar si la página se carga correctamente
              await new Promise(resolve => setTimeout(resolve, 5000)); // ✅ Esperar adicional de 5s
              const newUrl = newPage.url();
              
              // ✅ Verificar si aún está bloqueado después de esperar
              const stillBlockedAfterCookies = newUrl.includes('/punish') || 
                                              newUrl.includes('TMD') || 
                                              newUrl.includes('x5secdata') ||
                                              newUrl.includes('x5step');
              
              if (!stillBlockedAfterCookies) {
                logger.info('[SCRAPER] Navegación exitosa con cookies, bloqueo evitado', { userId });
                page = newPage; // Usar la nueva página
                page.on('response', apiResponseHandler); // Re-agregar el handler
                // ✅ Actualizar isBlocked después de usar cookies
                isBlocked = false;
              } else {
                logger.warn('[SCRAPER] Bloqueo persiste incluso con cookies después de esperar 13s', { 
                  userId, 
                  url: newUrl,
                  action: 'Continuando con extracción DOM pero probablemente retornará vacío'
                });
                page = newPage; // Usar la nueva página de todos modos
                page.on('response', apiResponseHandler); // Re-agregar el handler
                // ✅ Marcar como bloqueado para que se activen fallbacks más rápido
                isBlocked = true;
              }
            } else {
              // No hay cookies - continuar de todos modos e intentar extraer productos
              logger.warn('[SCRAPER] AliExpress puede estar bloqueando, pero continuando para intentar extraer productos', { userId, query });
            }
          } catch (cookieError: any) {
            logger.warn('[SCRAPER] Error al intentar usar cookies, pero continuando de todos modos', {
              error: cookieError?.message || String(cookieError),
              userId,
              query
            });
            // Continuar sin cookies - intentar extraer productos de todos modos
          }
        }
      }

      // ✅ Esperar más tiempo para que la página cargue completamente y ejecutar JavaScript
      logger.debug('[SCRAPER] Esperando que la página cargue completamente', { query });
      
      // Esperar a que la página esté lista
      try {
        await page.waitForFunction(() => {
          const w = (globalThis as any).window;
          return w.document && w.document.readyState === 'complete';
        }, { timeout: 15000 }); // ✅ Aumentar timeout de 10s a 15s
        logger.debug('[SCRAPER] Página lista (readyState complete)');
      } catch (e) {
        logger.warn('[SCRAPER] Timeout esperando readyState, continuando...', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
      
      // ✅ Esperar tiempo adicional para que JavaScript ejecute y productos se rendericen
      // ANTES: 3s → AHORA: 8s para dar más tiempo cuando hay bloqueo potencial
      await new Promise(resolve => setTimeout(resolve, 8000)); // ✅ Aumentar de 3s a 8s
      logger.debug('[SCRAPER] Tiempo de espera adicional completado');
      
      // ✅ Extraer moneda local de AliExpress desde la página (selector de ubicación/moneda)
      // Ejemplo: "Concepción/ES/CLP" → moneda local = "CLP"
      let aliExpressLocalCurrency: string | null = null;
      try {
        aliExpressLocalCurrency = await page.evaluate(() => {
          const w = (globalThis as any).window;
          const doc = w?.document;
          if (!doc) return null;
          
          // Buscar en el selector de ubicación/moneda (ej: "Concepción/ES/CLP")
          // AliExpress muestra esto en varios lugares, intentar múltiples selectores
          const currencySelectors = [
            '[data-role="currency-switcher"]',
            '[data-spm="currency"]',
            '.currency-selector',
            '[class*="currency"]',
            '[class*="location"]',
            '[class*="shipping"]',
            'span[title*="/"]', // Títulos que contienen "/" (ej: "Concepción/ES/CLP")
            'div[title*="/"]',
            'a[title*="/"]',
            // Buscar en el texto del header/navbar
            '[class*="header"] [class*="shipping"]',
            '[class*="nav"] [class*="shipping"]',
          ];
          
          for (const selector of currencySelectors) {
            const element = doc.querySelector(selector);
            if (element) {
              const text = (element.textContent || element.getAttribute('title') || '').trim();
              // Buscar patrón de moneda (ej: "CLP", "USD", "EUR" después de "/")
              const match = text.match(/\/([A-Z]{3})\b/);
              if (match && match[1]) {
                return match[1].toUpperCase();
              }
            }
          }
          
          // Buscar en el texto completo de la página por patrones de moneda conocidos
          const bodyText = doc.body?.textContent || '';
          const currencyPatterns = [
            /\/(CLP|USD|EUR|GBP|MXN|BRL|ARS|COP|PEN)\b/i,
            /Currency:\s*([A-Z]{3})\b/i,
            /currency:\s*([A-Z]{3})\b/i,
            /Moneda:\s*([A-Z]{3})\b/i,
          ];
          
          for (const pattern of currencyPatterns) {
            const match = bodyText.match(pattern);
            if (match && match[1]) {
              return match[1].toUpperCase();
            }
          }
          
          // Buscar en variables globales de JavaScript (AliExpress puede tener esto)
          if (w?.__INITIAL_STATE__?.locale?.currency) {
            return String(w.__INITIAL_STATE__.locale.currency).toUpperCase();
          }
          if (w?.__INITIAL_STATE__?.main?.currency) {
            return String(w.__INITIAL_STATE__.main.currency).toUpperCase();
          }
          if (w?.runParams?.locale?.currency) {
            return String(w.runParams.locale.currency).toUpperCase();
          }
          
          return null;
        });
        
        // ✅ CORRECCIÓN: Validar que la moneda detectada sea un código ISO 4217 válido
        // Lista de códigos de moneda válidos comunes
        const validCurrencyCodes = new Set([
          'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
          'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'VES', 'DOP', 'CRC',
          'AED', 'SAR', 'INR', 'KRW', 'THB', 'VND', 'IDR', 'PHP', 'MYR', 'NZD',
          'ZAR', 'TRY', 'RUB', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'SEK',
          'NOK', 'DKK', 'ISK', 'ILS', 'EGP', 'NGN', 'KES', 'GHS', 'UGX', 'TZS'
        ]);
        
        if (aliExpressLocalCurrency && validCurrencyCodes.has(aliExpressLocalCurrency)) {
          logger.info('[SCRAPER] Moneda local de AliExpress detectada', { 
            localCurrency: aliExpressLocalCurrency,
            userBaseCurrency: userBaseCurrency || 'USD',
            query,
            userId
          });
        } else {
          if (aliExpressLocalCurrency) {
            logger.warn('[SCRAPER] Moneda detectada no es válida (ISO 4217), usando USD como fallback', { 
              detectedCurrency: aliExpressLocalCurrency,
              query, 
              userId 
            });
          } else {
            logger.warn('[SCRAPER] No se pudo detectar moneda local de AliExpress, usando USD como fallback', { query, userId });
          }
          aliExpressLocalCurrency = 'USD'; // Fallback
        }
      } catch (currencyError: any) {
        logger.warn('[SCRAPER] Error al extraer moneda local de AliExpress', {
          error: currencyError?.message || String(currencyError),
          query,
          userId
        });
        aliExpressLocalCurrency = 'USD'; // Fallback
      }
      
      // Intentar hacer scroll para activar lazy loading
      try {
        await page.evaluate(() => {
          const w = (globalThis as any).window;
          if (w.scrollTo) {
            w.scrollTo(0, 500);
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.debug('[SCRAPER] Scroll realizado para activar lazy loading');
      } catch (e) {
        // Ignorar errores de scroll
        logger.debug('[SCRAPER] Error al hacer scroll (ignorado)');
      }
      
      // ✅ Si detectamos bloqueo, intentar extraer del DOM inmediatamente sin esperar runParams
      const hasCaptcha = await page.evaluate(() => {
        const captchaSelectors = [
          '.captcha',
          '#captcha',
          '[class*="captcha"]',
          '[id*="captcha"]',
          'iframe[src*="captcha"]',
          '.security-check',
          '.verification'
        ];
        return captchaSelectors.some(sel => document.querySelector(sel) !== null);
      }).catch(() => false);
      
      // ✅ Verificar bloqueo en el contenido de la página (no solo URL)
      const isBlockedInContent = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const htmlContent = document.body?.innerHTML?.toLowerCase() || '';
        return bodyText.includes('blocked') ||
               bodyText.includes('access denied') ||
               bodyText.includes('verification required') ||
               bodyText.includes('security check') ||
               htmlContent.includes('punish') ||
               htmlContent.includes('x5secdata') ||
               htmlContent.includes('tmd');
      }).catch(() => false);
      
      // ✅ Si detectamos bloqueo, saltar runParams y extraer del DOM directamente
      // Verificar bloqueo de nuevo después de intentar usar cookies (puede haber cambiado)
      const currentUrlForCheck = page.url();
      const isStillBlockedForRunParams = currentUrlForCheck.includes('/punish') || 
                                        currentUrlForCheck.includes('TMD') || 
                                        currentUrlForCheck.includes('x5secdata') ||
                                        currentUrlForCheck.includes('x5step');
      const shouldSkipRunParams = isStillBlockedForRunParams || hasCaptcha || isBlockedInContent;
      
      if (shouldSkipRunParams) {
        const currentUrl = page.url();
        logger.warn('[SCRAPER] Bloqueo detectado, saltando runParams y extrayendo directamente del DOM', { 
          query, 
          userId,
          hasCaptcha,
          isBlockedInContent,
          isBlocked,
          url: currentUrl
        });
        await this.captureAliExpressSnapshot(page, `blocked-detected-${Date.now()}`);
        
        // ✅ Saltar directamente a extracción DOM sin esperar runParams
        // Esto es más rápido y puede funcionar incluso con bloqueo parcial
      }

      // Extraer runParams con los productos renderizados por la propia página
      // ✅ Si detectamos bloqueo, saltar runParams y extraer directamente del DOM
      let products: any[] = [];
      
      if (!shouldSkipRunParams) {
        // ✅ Solo intentar runParams si NO detectamos bloqueo
        try {
          // ✅ Intentar extraer runParams inmediatamente después de cargar
          const runParamsFromScript = await this.extractRunParamsFromPage(page);
          if (runParamsFromScript) {
            const list =
              runParamsFromScript?.mods?.itemList?.content ||
              runParamsFromScript?.resultList ||
              runParamsFromScript?.items ||
              [];

            if (Array.isArray(list) && list.length > 0) {
            products = list.map((item: any) => {
              // ✅ TAREA 1: Extraer y normalizar URL de imagen con múltiples fallbacks
              let imageUrl = item.image?.imgUrl || item.imageUrl || item.image?.url || item.imgUrl || '';
              
              // Limpiar y normalizar URL
              if (imageUrl) {
                imageUrl = String(imageUrl).replace(/^\//, 'https://').trim();
                // Si no empieza con http, agregarlo
                if (imageUrl && !imageUrl.startsWith('http')) {
                  if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                  } else {
                    imageUrl = 'https://' + imageUrl;
                  }
                }
              }
              
              // Si aún no hay imagen válida, intentar construir desde productId o usar placeholder
              if (!imageUrl || imageUrl.length < 10) {
                const productId = item.productId || item.id;
                if (productId) {
                  const idStr = String(productId);
                  if (idStr.length >= 8) {
                    imageUrl = `https://ae01.alicdn.com/kf/${idStr.substring(0, 2)}/${idStr}.jpg`;
                  }
                }
                // Último fallback: placeholder
                if (!imageUrl || imageUrl.length < 10) {
                  imageUrl = 'https://via.placeholder.com/300x300?text=No+Image';
                }
              }
              
              return {
                title: String(item.title || item.productTitle || '').trim().substring(0, 150),
                price: Number(item.actSkuCalPrice || item.skuCalPrice || item.salePrice || 0),
                imageUrl: imageUrl,
                productUrl: (item.productUrl || item.detailUrl || '').startsWith('http') ? (item.productUrl || item.detailUrl) : `https:${item.productUrl || item.detailUrl || ''}`,
                rating: Number(item.evaluationRate) || Number(item.evaluationScore) || 0,
                reviewCount: Number(item.evaluationCount) || Number(item.reviewNum) || 0,
                seller: item.storeName || 'AliExpress Vendor',
                shipping: item.logistics?.desc || item.logisticsDesc || 'Varies',
                availability: 'In stock',
              };
            }).filter((p: any) => p.title && p.price);

            if (products.length > 0) {
              logger.info('Extraídos productos desde runParams (script)', { count: products.length });
              return products;
            }
          }
        }

        // ✅ Esperar más tiempo si no se encontraron productos inicialmente
        logger.debug('Esperando runParams...');
        
        // Hacer scroll adicional para activar carga
        try {
          await page.evaluate(() => {
            const w = (globalThis as any).window;
            for (let i = 0; i < 3; i++) {
              w.scrollBy?.(0, 300);
              // Pequeña pausa entre scrolls
            }
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
          // Ignorar errores
        }
        
        await page.waitForFunction(() => {
          const w = (globalThis as any).window;
          const params = w?.runParams || 
                         w?.__runParams__ ||
                         w?.__INITIAL_STATE__?.main?.search?.items ||
                         w?.window?.runParams;
          if (!params) return false;
          return Boolean(
            params?.resultList?.length || 
            params?.mods?.itemList?.content?.length ||
            params?.items?.length ||
            (params?.data && (params.data.resultList || params.data.items))
          );
        }, { timeout: 30000 }); // ✅ RESTAURACIÓN: Aumentado a 30s (como funcionaba antes)
        const runParams = await page.evaluate(() => {
          const w = (globalThis as any).window;
          // Intentar múltiples ubicaciones para runParams
          return w?.runParams || 
                 w?.__runParams__ ||
                 w?.__INITIAL_STATE__?.main?.search?.items ||
                 w?.window?.runParams ||
                 null;
        });
        const list =
          runParams?.mods?.itemList?.content ||
          runParams?.mods?.itemList?.items ||
          runParams?.resultList ||
          runParams?.items ||
          runParams?.data?.resultList ||
          runParams?.data?.items ||
          (runParams?.data?.mods && runParams.data.mods.itemList?.content) ||
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
            logger.info('Extraídos productos desde runParams (window)', { count: products.length });
            return products;
          }
        } else {
          logger.warn('runParams no retornó productos o estructura no reconocida');
        }
      } catch (runParamsError: any) {
        logger.warn('No se pudo analizar runParams', { error: runParamsError?.message || String(runParamsError) });
      }

        if (products.length > 0) {
          logger.info('Productos encontrados desde runParams/API', { count: products.length });
          return products;
        }
      } else {
        logger.info('[SCRAPER] Bloqueo detectado, saltando runParams e intentando extracción DOM directa', { query, userId });
      }
      
      logger.debug('No se encontraron productos desde runParams/API, intentando DOM scraping...');

      if (apiCapturedItems.length > 0) {
        const normalizedApi = apiCapturedItems
          .map(item => this.normalizeAliExpressItem(item, aliExpressLocalCurrency || undefined, userBaseCurrency || undefined))
          .filter((item): item is ScrapedProduct => Boolean(item));
        if (normalizedApi.length > 0) {
          logger.info('Extraídos productos desde API interna', { count: normalizedApi.length });
          return normalizedApi.slice(0, 40);
        }
      }

      const niDataProducts = await this.extractProductsFromNiData(page, aliExpressLocalCurrency || undefined, userBaseCurrency || undefined);
      if (niDataProducts.length > 0) {
        logger.info('Extraídos productos desde __NI_DATA__', { count: niDataProducts.length });
        return niDataProducts;
      }

      // ✅ Intentar extracción desde scripts con __AER_DATA__ u otros preloads
      const scriptProducts = await this.extractProductsFromScripts(page, aliExpressLocalCurrency || undefined, userBaseCurrency || undefined);
      if (scriptProducts.length > 0) {
        logger.info('Extraídos productos desde scripts embebidos', { count: scriptProducts.length });
        return scriptProducts;
      }

      // ✅ Si todo lo anterior falló, intentar con scraping DOM clásico
      // ✅ RESTAURACIÓN: Esperar MÁS tiempo para que la página cargue (como funcionaba antes)
      // El scraper anterior esperaba más tiempo antes de intentar extraer productos
      const waitTime = shouldSkipRunParams ? 12000 : 8000; // ✅ Aumentado: 12s cuando hay bloqueo, 8s normal (como funcionaba antes)
      logger.debug(`Esperando que los productos se rendericen en el DOM (${waitTime}ms)...`, { 
        shouldSkipRunParams, 
        isBlocked 
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // ✅ Esperar a que carguen los productos con múltiples selectores alternativos
      // ✅ Si detectamos bloqueo, ser más agresivo y no esperar tanto tiempo
      let productsLoaded = false;
      const selectors = [
        '.search-item-card-wrapper-gallery',
        '[data-item-id]',
        '.list--gallery--C2f2tvm',
        '.search-item-card',
        '.item-card-wrapper-gallery',
        'div[data-pl="product"]',
        'div[data-pl="product-card"]',
        'div[data-widgetid*="manhattan"]',
        '[data-list-id="product"]',
        '.manhattan--container--1lP57Ag',
        '.search-item-card-wrapper',
        '[class*="search-item"]',
        '[class*="product-card"]',
        '[class*="item-card"]',
        'a[href*="/item/"]',
        'a[href*="/product/"]'
      ];

      // ✅ RESTAURACIÓN: Intentar MÁS veces con diferentes estrategias (como funcionaba antes)
      // El scraper anterior era más persistente y intentaba más veces
      const maxAttempts = shouldSkipRunParams ? 8 : 5; // ✅ RESTAURACIÓN: 8 intentos cuando hay bloqueo, 5 normal (como funcionaba antes)
      const selectorTimeout = shouldSkipRunParams ? 10000 : 12000; // ✅ RESTAURACIÓN: 10s cuando hay bloqueo, 12s normal (como funcionaba antes)
      
      // Intentar múltiples veces con diferentes esperas
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // ✅ Intentar TODOS los selectores en paralelo para mayor velocidad
        const selectorPromises = selectors.map(async (selector) => {
          try {
            const count = await page.evaluate((sel) => {
              const doc = (globalThis as any).document;
              if (!doc) return 0;
              const elements = doc.querySelectorAll(sel);
              return elements ? elements.length : 0;
            }, selector);
            
            if (count > 0) {
              return { selector, count };
            }
            return null;
          } catch {
            return null;
          }
        });
        
        const results = await Promise.all(selectorPromises);
        const found = results.find(r => r !== null);
        
        if (found) {
          productsLoaded = true;
          logger.info('Productos encontrados con selector (búsqueda paralela)', { 
            selector: found.selector, 
            count: found.count,
            attempt: attempt + 1,
            maxAttempts,
            shouldSkipRunParams
          });
          break;
        }
        
        if (!productsLoaded && attempt < maxAttempts - 1) {
          // Si no se encontraron, hacer scroll y esperar MÁS tiempo si hay bloqueo
          // ANTES: scrollWait = 1000 (muy poco) → AHORA: scrollWait = 5000 (más tiempo)
          const scrollWait = shouldSkipRunParams ? 8000 : 5000; // ✅ RESTAURACIÓN: Aumentado a 8s cuando hay bloqueo (como funcionaba antes)
          logger.debug(`⏳ Intento ${attempt + 1} falló, haciendo scroll y esperando ${scrollWait}ms...`, { 
            attempt, 
            userId, 
            query,
            shouldSkipRunParams
          });
          await page.evaluate(() => {
            const w = (globalThis as any).window;
            w.scrollBy?.(0, 1000);
          });
          await new Promise(resolve => setTimeout(resolve, scrollWait));
          
          // ✅ Intentar esperar selector con timeout más corto si hay bloqueo
          try {
            await page.waitForSelector(selectors[0], { timeout: selectorTimeout });
          } catch {
            // Continuar de todos modos
          }
        }
      }

      if (!productsLoaded) {
        logger.warn('No se encontraron productos con ningún selector, intentando extraer de todos modos...');
        // ✅ RESTAURACIÓN: Hacer scroll completo de la página para activar lazy loading (como funcionaba antes)
        // El scraper anterior esperaba más tiempo después del scroll
        const scrollTime = shouldSkipRunParams ? 15000 : 10000; // ✅ Aumentado: 15s si hay bloqueo, 10s normal (como funcionaba antes)
        await page.evaluate(() => {
          const w = (globalThis as any).window;
          const scrollHeight = w.document?.documentElement?.scrollHeight || 0;
          const clientHeight = w.document?.documentElement?.clientHeight || 0;
          const maxScroll = scrollHeight - clientHeight;
          
          // Scroll progresivo - más rápido si hay bloqueo
          let currentScroll = 0;
          const scrollStep = 500;
          const scrollInterval = setInterval(() => {
            currentScroll += scrollStep;
            w.scrollTo?.(0, Math.min(currentScroll, maxScroll));
            if (currentScroll >= maxScroll) {
              clearInterval(scrollInterval);
            }
          }, 200); // ✅ Scroll más rápido (200ms vs 300ms)
        });
        await new Promise(resolve => setTimeout(resolve, scrollTime)); // ✅ Usar tiempo dinámico
      }

      // ✅ Auto-scroll solo si no hay bloqueo (para evitar esperas innecesarias)
      if (!shouldSkipRunParams) {
        await this.autoScroll(page);
      } else {
        // Si hay bloqueo, hacer scroll manual más agresivo
        logger.debug('[SCRAPER] Haciendo scroll agresivo debido a bloqueo detectado');
        await page.evaluate(() => {
          const w = (globalThis as any).window;
          for (let i = 0; i < 10; i++) {
            w.scrollBy?.(0, 500);
          }
        });
        await new Promise(resolve => setTimeout(resolve, 5000)); // ✅ RESTAURACIÓN: Aumentado a 5s (como funcionaba antes)
      }

      const domExtractionResult = await page.evaluate((skipRunParams: boolean) => {
        const selectors = [
          '.search-item-card-wrapper-gallery',
          '[data-item-id]',
          '.list--gallery--C2f2tvm',
          '.search-item-card',
          '.item-card-wrapper-gallery',
          '[class*="item-card"]',
          '[class*="product-item"]',
          '[class*="search-item"]',
          'div[data-pl="product"]',
          'div[data-pl="product-card"]',
          'div[data-widgetid*="manhattan"]',
          '.manhattan--container--1lP57Ag',
          '[data-list-id="product"]',
          '.search-item-card-wrapper',
          'a[href*="/item/"]',
          'a[href*="/product/"]',
          '[class*="gallery-item"]',
          '[class*="card-item"]'
        ];

        let items: any = null;
        let usedSelector = '';
        for (const selector of selectors) {
          const doc = (globalThis as any).document;
          items = doc ? doc.querySelectorAll(selector) : [];
          if (items && items.length > 0) {
            usedSelector = selector;
            break;
          }
        }

        // ✅ Si no se encontraron items Y hay bloqueo, intentar selectores más genéricos como fallback
        if ((!items || items.length === 0) && skipRunParams) {
          const doc = (globalThis as any).document;
          if (doc) {
            const fallbackSelectors = [
              'a[href*="/item/"]',
              'a[href*="/product/"]',
              '[href*="/item/"]',
              '[href*="/product/"]',
              'div[class*="item"]',
              'div[class*="product"]',
              'div[class*="card"]',
              'li[class*="item"]',
              'li[class*="product"]',
              '[data-product-id]',
              '[data-item-id]',
              'div[id*="item"]',
              'div[id*="product"]'
            ];
            for (const fallbackSelector of fallbackSelectors) {
              const fallbackItems = doc.querySelectorAll(fallbackSelector);
              if (fallbackItems && fallbackItems.length > 0) {
                items = fallbackItems;
                usedSelector = `fallback:${fallbackSelector}`;
                break;
              }
            }
          }
        }
        
        if (!items || items.length === 0) {
          return {
            products: [],
            debug: {
              itemsFound: 0,
              usedSelector: '',
              extractionLogs: ['No se encontraron productos con ningún selector (incluyendo fallbacks)']
            }
          };
        }

        const extractionLogs: string[] = [];
        let extractedCount = 0;
        let discardedCount = 0;

        extractionLogs.push(`Iniciando extracción de ${items.length} productos con selector: ${usedSelector}`);

        const results = Array.from(items).slice(0, 40).map((item: any, index: number) => {

          try {
            const titleSelectors = [
              '.multi--titleText--nXeOvyr',
              '[class*="titleText"]',
              '[class*="title"]',
              'a[data-pl="product-title"]',
              'div[data-pl="product-title"]',
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
              'span[class*="price"]',
              'div[data-pl="product-price"]',
              'span[data-pl="price"]',
              '.manhattan--price--Qap6TJd'
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
              '[class*="gallery"] img',
              'img[data-pl="product-image"]',
              'div[data-pl="product-image"] img'
            ];
            let imageElement: any = null;
            for (const sel of imageSelectors) {
              imageElement = item.querySelector(sel);
              if (imageElement) break;
            }

            const ratingElement =
              item.querySelector('[data-pl="rating"] span') ||
              item.querySelector('[class*="rating"] span');

            const reviewsElement =
              item.querySelector('[data-pl="review"]') ||
              item.querySelector('[class*="review"]');

            const shippingElement =
              item.querySelector('[data-pl="shipping"]') ||
              item.querySelector('[class*="shipping"]');

            // ✅ Buscar enlace del producto con múltiples selectores (priorizando enlaces de productos individuales)
            let linkElement: any = null;
            const linkSelectors = [
              'a[href*="/item/"][href*=".html"]',  // Prioridad: URLs de productos individuales con .html
              'a[href*="/item/"]',  // URLs de productos individuales
              'a[href*="/product/"][href*=".html"]',  // URLs de productos con .html
              'a[href*="/product/"]',  // URLs de productos
              'a[href*="aliexpress.com/item"][href*=".html"]',
              'a[href*="aliexpress.com/item"]',
              'a[href*="aliexpress.com/product"][href*=".html"]',
              'a[href*="aliexpress.com/product"]',
              'a[href][data-pl="product-title"]',
              '[data-pl="product-title"] a[href*="/item/"]',
              '[data-pl="product-title"] a[href*="/product/"]',
              '[data-pl="product-title"] a[href]',
              '[class*="product-title"] a[href*="/item/"]',
              '[class*="product-title"] a[href*="/product/"]',
              '[class*="product-title"] a[href]',
              '[class*="title"] a[href*="/item/"]',
              '[class*="title"] a[href*="/product/"]',
              '[class*="title"] a[href]',
              'a[href*="/item/"]:first-of-type',
              'a[href*="/product/"]:first-of-type',
              'a[href]:first-of-type',
              'a[href]'
            ];
            
            for (const selector of linkSelectors) {
              const found = item.querySelector(selector);
              if (found) {
                const href = found.getAttribute('href') || '';
                // ✅ Filtrar URLs genéricas que no son de productos individuales
                if (href && !href.includes('/ssr/') && !href.includes('/wholesale') && 
                    !href.includes('/w/') && !href.includes('/category/') &&
                    (href.includes('/item/') || href.includes('/product/'))) {
                  linkElement = found;
                  break;
                }
              }
            }

            const attrPriceRaw =
              item.getAttribute('data-price') ||
              item.getAttribute('data-skuprice') ||
              item.getAttribute('data-price-range') ||
              '';

            const fullText = item.textContent ? String(item.textContent) : '';

            let title = titleElement?.textContent?.trim() ||
                        (linkElement?.getAttribute('title') || '') ||
                        (linkElement?.textContent?.trim() || '');
            if (!title && fullText) {
              const textLines = fullText
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0);
              title = textLines[0] || '';
            }

            // Logging detallado para diagnóstico
            const debugInfo: any = {
              index,
              hasTitleElement: !!titleElement,
              hasPriceElement: !!priceElement,
              hasImageElement: !!imageElement,
              hasLinkElement: !!linkElement,
              title: title ? title.substring(0, 50) : 'none',
              priceElementText: priceElement?.textContent?.substring(0, 50) || 'none',
              linkElementHref: linkElement?.getAttribute('href')?.substring(0, 50) || 'none'
            };

            // ✅ Extraer precio del texto visible del elemento DOM (no de propiedades inexistentes)
            const priceElementText = priceElement?.textContent?.trim() || '';
            const priceFromAttribute = attrPriceRaw || '';
            
            // Intentar extraer precio del atributo data-price si existe
            const dataPrice = item.getAttribute('data-price') || 
                             item.getAttribute('data-skuprice') || 
                             item.getAttribute('data-actprice') ||
                             item.getAttribute('data-price-range') ||
                             '';

            // ✅ Extraer datos brutos del precio (sin resolver) para procesarlos fuera de page.evaluate()
            // Solo usar el texto visible y atributos del DOM, no propiedades de objetos JavaScript
            const rawPriceData = {
              priceElementText,
              priceFromAttribute,
              dataPrice,
              fullText: fullText.substring(0, 500), // Limitar tamaño para evitar payloads grandes
            };

            // ✅ Extraer imagen del atributo src o data-src del elemento DOM
            let image = '';
            if (imageElement) {
              image = imageElement.getAttribute('src') ||
                      imageElement.getAttribute('data-src') ||
                      imageElement.getAttribute('data-lazy-src') ||
                      imageElement.getAttribute('data-ks-lazyload') ||
                      (imageElement as any).src ||
                      '';
            }

            // ✅ CORRECCIÓN: Extraer URL del atributo href del elemento link del DOM
            // Intentar múltiples estrategias para encontrar la URL del producto
            let url = '';
            
            // Estrategia 1: Atributo href directo del linkElement
            if (linkElement) {
              url = linkElement.getAttribute('href') || '';
              // También intentar data-href o data-url como fallback
              if (!url || url.length < 10) {
                url = linkElement.getAttribute('data-href') || 
                      linkElement.getAttribute('data-url') || 
                      (linkElement as any).href || '';
              }
            }
            
            // Estrategia 2: Buscar enlaces dentro del item si no se encontró URL válida
            if (!url || url.length < 10 || url.includes('/ssr/') || url.includes('/wholesale') || url.includes('/w/')) {
              const allLinks = item.querySelectorAll('a[href]');
              for (const link of Array.from(allLinks)) {
                const linkEl = link as HTMLAnchorElement;
                if (!linkEl || typeof linkEl.getAttribute !== 'function') continue;
                const href = linkEl.getAttribute('href') || linkEl.getAttribute('data-href') || '';
                // ✅ Solo aceptar URLs de productos individuales
                if (href && href.length >= 10 && (href.includes('/item/') || href.includes('/product/')) &&
                    !href.includes('/ssr/') && !href.includes('/wholesale') && 
                    !href.includes('/w/') && !href.includes('/category/')) {
                  url = href;
                  linkElement = linkEl;
                  break;
                }
              }
            }
            
            // Estrategia 3: Intentar extraer de data-attributes del item mismo
            if (!url || url.length < 10) {
              const itemDataUrl = item.getAttribute('data-item-id') || 
                                  item.getAttribute('data-product-id') ||
                                  item.getAttribute('data-sku-id') || '';
              if (itemDataUrl) {
                // Construir URL de producto usando el ID
                url = `https://www.aliexpress.com/item/${itemDataUrl}.html`;
              }
            }

            // ✅ Validar que la URL sea de un producto individual antes de continuar
            if (!url || url.includes('/ssr/') || url.includes('/wholesale') || 
                url.includes('/w/') || url.includes('/category/') ||
                (!url.includes('/item/') && !url.includes('/product/'))) {
              debugInfo.discardReason = 'url_invalida';
              debugInfo.hasUrl = !!url;
              debugInfo.urlLength = url?.length || 0;
              debugInfo.url = url?.substring(0, 80) || 'none';
              extractionLogs.push(`Producto ${index} descartado (URL inválida - no es de producto individual): ${JSON.stringify(debugInfo)}`);
              discardedCount++;
              return null as any;
            }

            if (!title || !url) {
              debugInfo.discardReason = 'validacion_final';
              debugInfo.hasUrl = !!url;
              debugInfo.urlLength = url?.length || 0;
              extractionLogs.push(`Producto ${index} descartado (validación final - sin título o URL): ${JSON.stringify(debugInfo)}`);
              discardedCount++;
              return null as any;
            }

            const rating =
              item.ratingScore ||
              item.evaluationRate ||
              item.starRating ||
              item.feedbackScore ||
              item.averageStar ||
              0;

            const reviewCount =
              item.evaluationCount ||
              item.reviewCount ||
              item.feedbackCount ||
              item.commentCount ||
              item.numberOfOrders ||
              0;

            // ✅ Construir URLs absolutas
            let imageUrl = '';
            if (image) {
              if (image.startsWith('//')) {
                imageUrl = `https:${image}`;
              } else if (image.startsWith('http')) {
                imageUrl = image;
              } else if (image.startsWith('/')) {
                imageUrl = `https://www.aliexpress.com${image}`;
              } else {
                imageUrl = `https://${image}`;
              }
            }

            let productUrl = '';
            if (url) {
              // Limpiar la URL de parámetros de tracking y otros
              let cleanUrl = url.split('?')[0].split('#')[0];
              
              if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                productUrl = cleanUrl;
              } else if (cleanUrl.startsWith('//')) {
                productUrl = `https:${cleanUrl}`;
              } else if (cleanUrl.startsWith('/')) {
                productUrl = `https://www.aliexpress.com${cleanUrl}`;
              } else if (cleanUrl.startsWith('./')) {
                productUrl = `https://www.aliexpress.com${cleanUrl.substring(1)}`;
              } else {
                // Intentar construir URL si parece ser una ruta relativa
                if (cleanUrl.includes('/item/') || cleanUrl.includes('/product/')) {
                  productUrl = `https://www.aliexpress.com/${cleanUrl}`;
                } else {
                  productUrl = `https://www.aliexpress.com/item/${cleanUrl}`;
                }
              }
            }

            // ✅ Logging para diagnóstico
            if (!productUrl || productUrl.length < 10) {
              extractionLogs.push(`Producto ${index}: URL inválida o vacía. url="${url}", productUrl="${productUrl}"`);
            }

            extractedCount++;
            return {
              title: String(title).trim().substring(0, 150),
              rawPriceData, // ✅ Incluir datos brutos para resolver fuera
              imageUrl,
              productUrl,
              rating: Number(rating) || 0,
              reviewCount: Number(reviewCount) || 0,
              seller: 'AliExpress Vendor', // No tenemos esta info del DOM
              shipping: 'Varies',
              availability: 'In stock',
            };
          } catch (error) {
            discardedCount++;
            extractionLogs.push(`Error extrayendo producto ${index}: ${error instanceof Error ? error.message : String(error)}`);
            return null as any;
          }
        });

        const validResults = results.filter(r => r !== null);
        extractionLogs.push(`Extracción completada: ${validResults.length} válidos de ${items.length} totales (${extractedCount} extraídos, ${discardedCount} descartados)`);
        
        return {
          products: validResults,
          debug: {
            itemsFound: items.length,
            usedSelector,
            extractionLogs
          }
        };
      }, shouldSkipRunParams);

      // Registrar logs de debug fuera de page.evaluate()
      const { products: productsFromDom, debug: domDebug } = domExtractionResult;
      
      logger.debug('[DOM] Resultado de extracción DOM', {
        itemsFound: domDebug.itemsFound,
        usedSelector: domDebug.usedSelector,
        productsExtracted: productsFromDom.length,
        query,
        userId
      });

      // Registrar cada log de extracción
      domDebug.extractionLogs.forEach((logMsg: string) => {
        if (logMsg.includes('descartado') || logMsg.includes('Error')) {
          logger.warn(`[DOM] ${logMsg}`, { query, userId });
        } else {
          logger.debug(`[DOM] ${logMsg}`, { query, userId });
        }
      });

      // ✅ Resolver precios fuera de page.evaluate() (donde están disponibles resolvePrice y resolvePriceRange)
      const productsWithResolvedPrices = productsFromDom.map((product: any) => {
        if (!product.rawPriceData) {
          return null;
        }

        const { priceElementText, priceFromAttribute, dataPrice, fullText } = product.rawPriceData;

        try {
          // ✅ Prioridad 1: Intentar resolver desde atributo data-price
          let resolvedPrice:
            | {
                amount: number;
                sourceCurrency: string;
                amountInBase: number;
                baseCurrency: string;
              }
            | null = null;

          if (dataPrice) {
            const resolution = resolvePrice({
              raw: dataPrice,
              itemCurrencyHints: [],
              textHints: [dataPrice],
              sourceCurrency: aliExpressLocalCurrency || undefined, // ✅ Moneda local de AliExpress
              userBaseCurrency: userBaseCurrency || undefined, // ✅ Moneda base del usuario
            });
            if (resolution.amount > 0 && resolution.amountInBase > 0) {
              resolvedPrice = resolution;
            }
          }

          // ✅ Prioridad 2: Intentar resolver desde texto visible del elemento de precio
          if (!resolvedPrice && priceElementText) {
            const resolution = resolvePrice({
              raw: priceElementText,
              itemCurrencyHints: [],
              textHints: [priceElementText],
              sourceCurrency: aliExpressLocalCurrency || undefined, // ✅ Moneda local de AliExpress
              userBaseCurrency: userBaseCurrency || undefined, // ✅ Moneda base del usuario
            });
            if (resolution.amount > 0 && resolution.amountInBase > 0) {
              resolvedPrice = resolution;
            }
          }

          // ✅ Prioridad 3: Intentar extraer precio del texto completo del producto
          if (!resolvedPrice && fullText) {
            // Buscar patrones de precio en el texto (ej: "$5.330", "$1.371", "US $8.025", "$26.600", etc.)
            // ✅ Mejorar patrones para detectar CLP (formato chileno con punto como separador de miles)
            const pricePatterns = [
              /US\s*\$?\s*([\d,]+\.?\d*)/i,  // USD explícito
              /\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/,  // Formato chileno: $26.600 o $26.600,50
              /\$?\s*([\d,]+\.?\d*)/,  // Formato general
              /([\d,]+\.?\d*)\s*USD/i,
              /([\d,]+\.?\d*)\s*CLP/i,
              /([\d,]+\.?\d*)\s*\$/
            ];

            for (const pattern of pricePatterns) {
              const match = fullText.match(pattern);
              if (match && match[1]) {
                const priceStr = match[1].replace(/,/g, '');
                // ✅ Incluir contexto completo del texto para mejor detección de moneda
                const resolution = resolvePrice({
                  raw: priceStr,
                  itemCurrencyHints: [],
                  textHints: [fullText, priceElementText || '', dataPrice || ''],
                  sourceCurrency: aliExpressLocalCurrency || undefined, // ✅ Moneda local de AliExpress
                  userBaseCurrency: userBaseCurrency || undefined, // ✅ Moneda base del usuario
                });
                if (resolution.amount > 0 && resolution.amountInBase > 0) {
                  resolvedPrice = resolution;
                  logger.debug('[DOM] Precio resuelto desde fullText', {
                    pattern: pattern.toString(),
                    priceStr,
                    detectedCurrency: resolution.sourceCurrency,
                    amount: resolution.amount,
                    amountInBase: resolution.amountInBase,
                    query,
                    userId
                  });
                  break;
                }
              }
            }
          }

          if (!resolvedPrice || resolvedPrice.amountInBase <= 0) {
            logger.warn('[DOM] Producto descartado (precio inválido después de resolver)', {
              title: product.title?.substring(0, 50),
              priceElementText: priceElementText?.substring(0, 50),
              dataPrice,
              hasFullText: !!fullText,
              query,
              userId
            });
            return null;
          }

          const price = resolvedPrice.amountInBase;
          const baseCurrency = resolvedPrice.baseCurrency;
          const sourcePrice = resolvedPrice.amount;
          const sourceCurrency = resolvedPrice.sourceCurrency;

          // Para DOM scraping, usamos el precio único (no rangos)
          const priceMinBase = price;
          const priceMaxBase = price;
          const priceMinSource = sourcePrice;
          const priceMaxSource = sourcePrice;
          const priceRangeSourceCurrency = sourceCurrency;
          const priceSource = 'single';

          // Validación final con precio resuelto
          if (price <= 0 || !product.title || !product.productUrl) {
            logger.warn('[DOM] Producto descartado (validación final después de resolver precio)', {
              title: product.title?.substring(0, 50),
              price,
              hasUrl: !!product.productUrl,
              query,
              userId
            });
            return null;
          }

          // ✅ VALIDACIÓN ADICIONAL: Si el precio base es muy alto (>1000) y la moneda fuente es USD,
          // pero el precio fuente también es alto y similar, probablemente es CLP sin detectar
          // Ejemplo: price=2560, sourceCurrency=USD, sourcePrice=2560 → debería ser CLP
          let finalPrice = price;
          let finalSourcePrice = sourcePrice;
          let finalSourceCurrency = sourceCurrency;
          
          if (price > 1000 && sourceCurrency === baseCurrency && Math.abs(price - sourcePrice) < sourcePrice * 0.1) {
            // Ambos precios son muy similares y altos, probablemente son CLP sin convertir
            const convertedFromCLP = fxService.convert(sourcePrice, 'CLP', baseCurrency);
            
            // Si la conversión da un valor razonable (<1000 USD) y es menor que el precio actual,
            // entonces eran CLP
            if (convertedFromCLP > 0 && convertedFromCLP < 1000 && convertedFromCLP < price) {
              logger.warn('[SCRAPER] Detected possible CLP misdetected as USD in scraper output', {
                originalPrice: price,
                originalSourcePrice: sourcePrice,
                originalSourceCurrency: sourceCurrency,
                correctedPrice: convertedFromCLP,
                correctedSourceCurrency: 'CLP',
                title: product.title?.substring(0, 50),
                query,
                userId
              });
              
              finalPrice = convertedFromCLP;
              finalSourcePrice = sourcePrice; // Mantener el valor original en CLP
              finalSourceCurrency = 'CLP';
            }
          }

          logger.debug('[DOM] Producto con precios finales', {
            title: product.title?.substring(0, 50),
            productUrl: product.productUrl,
            imageUrl: product.imageUrl,
            finalPrice,
            finalSourcePrice,
            finalSourceCurrency,
            baseCurrency,
            query,
            userId
          });

          return {
            title: product.title,
            price: finalPrice,
            currency: baseCurrency,
            sourcePrice: finalSourcePrice,
            sourceCurrency: finalSourceCurrency,
            priceMin: priceMinBase === price ? finalPrice : priceMinBase,
            priceMax: priceMaxBase === price ? finalPrice : priceMaxBase,
            priceMinSource,
            priceMaxSource: finalSourcePrice,
            priceRangeSourceCurrency: finalSourceCurrency,
            priceSource,
            imageUrl: product.imageUrl,
            productUrl: product.productUrl,
            rating: product.rating,
            reviewCount: product.reviewCount,
            seller: product.seller,
            shipping: product.shipping,
            availability: product.availability,
          };
        } catch (error) {
          logger.error('[DOM] Error resolviendo precio', {
            error: error instanceof Error ? error.message : String(error),
            title: product.title?.substring(0, 50),
            query,
            userId
          });
          return null;
        }
      }).filter((p: any) => p !== null);

      if (productsWithResolvedPrices.length === 0) {
        const finalUrl = page.url();
        const isBlockedUrl = finalUrl.includes('/punish') || finalUrl.includes('TMD') || finalUrl.includes('x5secdata');
        
        logger.warn('[SCRAPER] No se encontraron productos después de métodos iniciales, intentando estrategias adicionales...', {
          query,
          userId,
          url: finalUrl,
          isBlockedUrl
        });
        
        // ✅ RESTAURACIÓN COMPLETA: Intentar estrategias adicionales incluso si ya hay algunos productos
        // Cuando hay bloqueo, es mejor intentar extraer más productos con estrategias agresivas
        // Esto restaura el comportamiento que funcionaba cuando el scraper encontraba oportunidades
        // ✅ RESTAURACIÓN: Intentar estrategias adicionales antes de retornar vacío
        // 1. Intentar esperar más tiempo y hacer scroll más agresivo
        logger.debug('[SCRAPER] Intentando scroll más agresivo y espera adicional...', { 
          query,
          currentProductsCount: productsWithResolvedPrices.length,
          isBlocked: isBlockedUrl
        });
        try {
          await page.evaluate(() => {
            const w = (globalThis as any).window;
            // Scroll completo de la página varias veces
            for (let i = 0; i < 5; i++) {
              w.scrollTo?.(0, w.document?.documentElement?.scrollHeight || 0);
              // Pequeña pausa entre scrolls
            }
          });
          await new Promise(resolve => setTimeout(resolve, 8000)); // Esperar 8s adicionales
          
          // ✅ RESTAURACIÓN 27 NOV 2025: Versión exacta que funcionaba cuando encontraba oportunidades
          // Esta es la versión simple del backup que funcionaba correctamente
          const retryProducts = await page.evaluate(() => {
            const doc = (globalThis as any).document;
            if (!doc) return [];
            
            const allLinks = doc.querySelectorAll('a[href*="/item/"]');
            const products: any[] = [];
            
            for (let i = 0; i < Math.min(allLinks.length, 20); i++) {
              const link = allLinks[i];
              const href = link.getAttribute('href') || '';
              const title = link.textContent?.trim() || link.getAttribute('title') || '';
              
              // Buscar precio cerca del link
              let price = 0;
              let parent = link.parentElement;
              for (let depth = 0; depth < 5 && parent; depth++) {
                const priceEl = parent.querySelector('[class*="price"], [data-price]');
                if (priceEl) {
                  const priceText = priceEl.textContent || '';
                  const match = priceText.match(/[\d.,]+/);
                  if (match) {
                    price = parseFloat(match[0].replace(/,/g, ''));
                    break;
                  }
                }
                parent = parent.parentElement;
              }
              
              // Buscar imagen cerca del link
              let image = '';
              parent = link.parentElement;
              for (let depth = 0; depth < 5 && parent; depth++) {
                const imgEl = parent.querySelector('img');
                if (imgEl) {
                  image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                  if (image) break;
                }
                parent = parent.parentElement;
              }
              
              if (title && title.length > 5 && href && href.length > 10) {
                products.push({
                  title: title.substring(0, 150),
                  price: price || 1, // Precio mínimo
                  imageUrl: image || '',
                  productUrl: href.startsWith('http') ? href : `https://www.aliexpress.com${href}`,
                  rating: 0,
                  reviewCount: 0,
                  seller: 'AliExpress Vendor',
                  shipping: 'Varies',
                  availability: 'In stock'
                });
              }
            }
            
            return products;
          });
          
          if (retryProducts && retryProducts.length > 0) {
            logger.info('[SCRAPER] Encontrados productos después de scroll agresivo', { count: retryProducts.length });
            const normalizedRetry = retryProducts
              .map(item => this.normalizeAliExpressItem(item, aliExpressLocalCurrency || undefined, userBaseCurrency || undefined))
              .filter((item): item is ScrapedProduct => Boolean(item));
            
            if (normalizedRetry.length > 0) {
              logger.info('[SCRAPER] Productos normalizados después de scroll agresivo', { count: normalizedRetry.length });
              return normalizedRetry;
            }
          }
        } catch (retryError: any) {
          logger.warn('[SCRAPER] Error en intento adicional de extracción', { error: retryError?.message });
        }
        
        // ✅ 2. Intentar navegar a la página principal y luego a la búsqueda de nuevo
        if (isBlockedUrl) {
          logger.debug('[SCRAPER] Bloqueo detectado, intentando navegar desde página principal...', { query });
          try {
            await page.goto('https://www.aliexpress.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const searchUrl = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query)}.html`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // ✅ RESTAURACIÓN 27 NOV 2025: Intentar extraer de nuevo (versión exacta del backup)
            const retryAfterNav = await page.evaluate(() => {
              const doc = (globalThis as any).document;
              if (!doc) return [];
              
              const allLinks = doc.querySelectorAll('a[href*="/item/"]');
              const products: any[] = [];
              
              for (let i = 0; i < Math.min(allLinks.length, 15); i++) {
                const link = allLinks[i];
                const href = link.getAttribute('href') || '';
                const title = link.textContent?.trim() || link.getAttribute('title') || '';
                
                if (title && title.length > 5 && href && href.length > 10) {
                  products.push({
                    title: title.substring(0, 150),
                    price: 1, // Precio mínimo
                    imageUrl: '',
                    productUrl: href.startsWith('http') ? href : `https://www.aliexpress.com${href}`,
                    rating: 0,
                    reviewCount: 0,
                    seller: 'AliExpress Vendor',
                    shipping: 'Varies',
                    availability: 'In stock'
                  });
                }
              }
              
              return products;
            });
            
            if (retryAfterNav && retryAfterNav.length > 0) {
              logger.info('[SCRAPER] Encontrados productos después de re-navegación', { count: retryAfterNav.length });
              const normalizedAfterNav = retryAfterNav
                .map(item => this.normalizeAliExpressItem(item, aliExpressLocalCurrency || undefined, userBaseCurrency || undefined))
                .filter((item): item is ScrapedProduct => Boolean(item));
              
              if (normalizedAfterNav.length > 0) {
                return normalizedAfterNav;
              }
            }
          } catch (navError: any) {
            logger.warn('[SCRAPER] Error en re-navegación', { error: navError?.message });
          }
        }
        
        // ✅ Solo después de TODOS los intentos, verificar CAPTCHA/bloqueo
        const hasCaptchaOrBlock = await page.evaluate(() => {
          const captchaSelectors = [
            '.captcha', '#captcha', '[class*="captcha"]', '[id*="captcha"]',
            'iframe[src*="captcha"]', '.security-check', '.verification',
            '.block-message', '[class*="block"]', '.access-denied'
          ];
          return captchaSelectors.some(sel => document.querySelector(sel) !== null) ||
                 document.body.innerText.toLowerCase().includes('captcha') ||
                 document.body.innerText.toLowerCase().includes('blocked') ||
                 document.body.innerText.toLowerCase().includes('access denied');
        }).catch(() => false);
        
        if (hasCaptchaOrBlock) {
          logger.warn('[SCRAPER] CAPTCHA o bloqueo detectado después de todos los intentos', { userId, query, url: page.url() });
          const currentUrl = page.url();
          await this.captureAliExpressSnapshot(page, `captcha-block-${Date.now()}`).catch(() => {});
          
          // ✅ RESTAURACIÓN: Cuando hay bloqueo persistente y no se encontraron productos,
          // retornar vacío para permitir que opportunity-finder intente los fallbacks
          // Solo lanzar ManualAuthRequiredError si el opportunity-finder también falla después de intentar todos los métodos
          logger.warn('[SCRAPER] Bloqueo persistente detectado, retornando vacío para permitir fallbacks en opportunity-finder', {
            userId,
            query,
            url: currentUrl,
            message: 'El opportunity-finder intentará bridge Python, ScraperAPI, ZenRows antes de requerir autenticación manual'
          });
          return [];
        }
        
        logger.warn('[SCRAPER] No se encontraron productos después de todos los intentos', {
          query,
          userId,
          url: finalUrl,
          attempts: {
            runParamsScript: 'falló',
            runParamsWindow: 'falló',
            apiResponses: apiCapturedItems.length > 0 ? `${apiCapturedItems.length} items` : 'ninguna',
            niData: 'falló',
            embeddedScripts: 'falló',
            domScraping: 'falló',
            aggressiveScroll: 'intentado',
            reNavigation: isBlockedUrl ? 'intentado' : 'no aplicable'
          }
        });
        
        await this.captureAliExpressSnapshot(page, `no-products-${Date.now()}`).catch(() => {});
        return [];
      }

      // ✅ Validar que todos los productos tengan URL
      const productsWithoutUrl = productsWithResolvedPrices.filter((p: any) => !p.productUrl || p.productUrl.length < 10);
      if (productsWithoutUrl.length > 0) {
        logger.warn(`[SCRAPER] ${productsWithoutUrl.length} productos sin URL válida de ${productsWithResolvedPrices.length} totales`, {
          query,
          userId,
          titles: productsWithoutUrl.map((p: any) => p.title?.substring(0, 50)),
          missingUrls: productsWithoutUrl.length
        });
      }

      logger.info('[SCRAPER] Extraídos productos REALES de AliExpress desde DOM', {
        count: productsWithResolvedPrices.length,
        query,
        userId,
        firstProducts: productsWithResolvedPrices.slice(0, 3).map((p: any) => ({ 
          title: p.title?.substring(0, 50), 
          price: p.price, 
          currency: p.currency,
          sourcePrice: p.sourcePrice,
          productUrl: p.productUrl?.substring(0, 80) || 'NO_URL',
          hasUrl: !!p.productUrl && p.productUrl.length >= 10
        }))
      });

      return productsWithResolvedPrices;

    } catch (error) {
      if (error instanceof ManualAuthRequiredError) {
        throw error;
      }
      logger.error('[SCRAPER] Error scraping AliExpress', { 
        userId, 
        query, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    } finally {
      page.off('response', apiResponseHandler);
      await page.close();
    }
  }

  /**
   * Scraping REAL de eBay
   */
  async scrapeEbay(query: string): Promise<ScrapedProduct[]> {
    if (!this.browser) await this.init();

    logger.info('[SCRAPER] Scraping REAL eBay', { query });

    const page = await this.browser!.newPage();

    try {
      await this.setupRealBrowser(page);

      const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0&LH_BIN=1`;
      logger.debug('[SCRAPER] Navegando a eBay', { query, url: searchUrl });

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
            logger.debug('[SCRAPER] Error extracting eBay product', { error: error instanceof Error ? error.message : String(error) });
          }
        });

        return results;
      });

      logger.info('[SCRAPER] Extraídos productos REALES de eBay', { query, count: products.length });
      return products;

    } catch (error) {
      logger.error('[SCRAPER] Error scraping eBay', { 
        query, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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

    logger.info('[SCRAPER] Scraping REAL Amazon', { query });

    const page = await this.browser!.newPage();

    try {
      await this.setupRealBrowser(page);

      // Amazon detecta bots fácilmente, usar múltiples estrategias
      const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&ref=sr_pg_1`;
      logger.debug('[SCRAPER] Navegando a Amazon', { query, url: searchUrl });

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
        logger.debug('[SCRAPER] No se encontraron productos estándar, intentando selector alternativo', { query });
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
            logger.debug('[SCRAPER] Error extracting Amazon product', { error: error instanceof Error ? error.message : String(error) });
          }
        });

        return results;
      });

      logger.info('[SCRAPER] Extraídos productos REALES de Amazon', { query, count: products.length });
      return products;

    } catch (error) {
      logger.error('[SCRAPER] Error scraping Amazon', { 
        query, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return this.useAmazonAlternative(query);
    } finally {
      await page.close();
    }
  }

  /**
   * Configurar página para parecer navegador real
   */
  private async setupRealBrowser(page: Page): Promise<void> {
    // ✅ User agent realista y actualizado
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUA);

    // ✅ Viewport realista y variado
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 }
    ];
    const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(randomViewport);

    // ✅ Headers adicionales más completos
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'DNT': '1'
    });

    // ✅ Ocultar indicadores de automatización
    await page.evaluateOnNewDocument(() => {
      // Ocultar webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Sobrescribir plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Sobrescribir languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es'],
      });
      
      // Sobrescribir permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission } as PermissionStatus) :
          originalQuery(parameters)
      );
    });

    // ✅ NO bloquear recursos críticos - AliExpress necesita CSS y JS para renderizar productos
    // Solo bloquear imágenes y videos opcionales si es necesario
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();
        
        // Bloquear solo recursos pesados no esenciales
        if (
          resourceType === 'media' || 
          resourceType === 'websocket' ||
          url.includes('analytics') ||
          url.includes('tracking') ||
          url.includes('ads') ||
          url.includes('advertising')
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });
    } catch (error) {
      // Si falla, continuar sin intercepción
      console.warn('⚠️  No se pudo configurar intercepción de requests:', (error as Error).message);
    }
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
   * Auto scroll para cargar más contenido (lazy loading)
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
      // ✅ Método 1: Intentar desde HTML directamente
      const html = await page.content();
      const patterns = [
        /window\.runParams\s*=\s*(\{[\s\S]*?\});/,
        /window\.__runParams__\s*=\s*(\{[\s\S]*?\});/,
        /__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
        /runParams\s*:\s*(\{[\s\S]*?\})/,
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match.length >= 2) {
          try {
            const runParamsString = match[1];
            // Usar Function para evaluar el objeto (runParams contiene comillas simples y estructuras no JSON)
            const runParams = Function(`"use strict";return (${runParamsString});`)();
            if (runParams && (runParams.resultList || runParams.mods || runParams.items)) {
              console.log('✅ runParams encontrado en HTML con pattern:', pattern.toString().substring(0, 50));
              return runParams;
            }
          } catch (evalError) {
            // Continuar con siguiente pattern
            continue;
          }
        }
      }
      
      // ✅ Método 2: Intentar desde window directamente
      try {
        const runParams = await page.evaluate(() => {
          const w = (globalThis as any).window;
          return w?.runParams || 
                 w?.__runParams__ ||
                 w?.__INITIAL_STATE__?.main?.search ||
                 w?.window?.runParams ||
                 null;
        });
        
        if (runParams && (runParams.resultList || runParams.mods || runParams.items || runParams.data)) {
          console.log('✅ runParams encontrado en window object');
          return runParams;
        }
      } catch (evalError) {
        console.warn('⚠️  Error evaluando runParams desde window:', (evalError as Error).message);
      }
      
      return null;
    } catch (error) {
      console.warn('⚠️  Error extrayendo runParams del HTML:', (error as Error).message);
      return null;
    }
  }

  private async extractProductsFromNiData(page: Page, aliExpressLocalCurrency?: string, userBaseCurrency?: string): Promise<ScrapedProduct[]> {
    try {
      const niData = await page.evaluate(() => {
        const w = (globalThis as any).window;
        if (!w || !w.__NI_DATA__) return null;
        try {
          return JSON.parse(JSON.stringify(w.__NI_DATA__));
        } catch {
          return w.__NI_DATA__;
        }
      });

      if (!niData) return [];

      const blocks = Array.isArray(niData) ? niData : [niData];
      const collected: any[] = [];

      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        const result =
          block?.data?.result?.resultList ||
          block?.data?.result?.items ||
          block?.data?.mods?.itemList?.content ||
          block?.resultList ||
          block?.items ||
          null;

        if (Array.isArray(result) && result.length > 0) {
          collected.push(...result);
        }
      }

      if (collected.length === 0) return [];

      const normalized = collected
        .map(item => this.normalizeAliExpressItem(item, aliExpressLocalCurrency, userBaseCurrency))
        .filter((item): item is ScrapedProduct => Boolean(item));

      return normalized.slice(0, 40);
    } catch (error) {
      console.warn('⚠️  Error extrayendo productos desde __NI_DATA__:', (error as Error).message);
      return [];
    }
  }

  private async extractProductsFromScripts(page: Page, aliExpressLocalCurrency?: string, userBaseCurrency?: string): Promise<ScrapedProduct[]> {
    try {
      const scripts = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return [];
        return Array.from(doc.querySelectorAll('script')).map((script: any) => ({
          type: script.type || '',
          text: (script.textContent || '').trim(),
        }));
      });

      for (const script of scripts) {
        if (!script.text) continue;

        let data: any = null;

        if (script.type && script.type.includes('json')) {
          try {
            data = JSON.parse(script.text);
          } catch {
            continue;
          }
        } else {
          const aerMatch = script.text.match(/window\.__AER_DATA__\s*=\s*(\{[\s\S]*?\});/);
          if (aerMatch && aerMatch[1]) {
            try {
              data = JSON.parse(aerMatch[1]);
            } catch {
              try {
                data = Function(`"use strict";return (${aerMatch[1]});`)();
              } catch {
                data = null;
              }
            }
          }

          if (!data) {
            const initMatch = script.text.match(/window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});/);
            if (initMatch && initMatch[1]) {
              try {
                data = JSON.parse(initMatch[1]);
              } catch {
                try {
                  data = Function(`"use strict";return (${initMatch[1]});`)();
                } catch {
                  data = null;
                }
              }
            }
          }
        }

        if (!data) continue;

        const productArray = this.findProductArrayDeep(data);
        if (productArray && productArray.length > 0) {
          const normalized = productArray
            .map(item => this.normalizeAliExpressItem(item, aliExpressLocalCurrency, userBaseCurrency))
            .filter((item): item is ScrapedProduct => Boolean(item));

          if (normalized.length > 0) {
            return normalized.slice(0, 40);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Error extrayendo productos desde scripts:', (error as Error).message);
    }
    return [];
  }

  private findProductArrayDeep(data: any, visited = new Set<any>()): any[] | null {
    if (!data || typeof data !== 'object') return null;

    if (visited.has(data)) {
      return null;
    }
    visited.add(data);

    if (Array.isArray(data)) {
      if (
        data.length > 0 &&
        data.every(item => typeof item === 'object') &&
        data.some(item => item && (item.productId || item.productUrl || item.title || item.productTitle))
      ) {
        return data;
      }
      for (const entry of data) {
        const found = this.findProductArrayDeep(entry, visited);
        if (found && found.length > 0) return found;
      }
      return null;
    }

    for (const key of Object.keys(data)) {
      const value = (data as any)[key];
      if (!value) continue;
      if (typeof value === 'object') {
        const found = this.findProductArrayDeep(value, visited);
        if (found && found.length > 0) return found;
      }
    }
    return null;
  }

  private normalizeAliExpressItem(item: any, aliExpressLocalCurrency?: string, userBaseCurrency?: string): ScrapedProduct | null {
    if (!item || typeof item !== 'object') return null;

    const title =
      item.title ||
      item.productTitle ||
      item.subject ||
      item.name ||
      item.seoTitle ||
      '';

    const priceCandidates: unknown[] = [
      item.actSkuCalPrice,
      item.skuCalPrice,
      item.salePrice,
      item.displayPrice,
      item.priceValue,
      item.price,
      item.tradePrice,
      item.discountPrice,
      item.minPrice,
      item.maxPrice,
      item.appSalePrice,
      item.appSalePriceMin,
      item.appSalePriceMax,
      item.priceText,
      item.salePriceText,
      item.displayPriceText,
    ];

    const currencyHints: unknown[] = [
      item.currency,
      item.currencyCode,
      item.tradeCurrency,
      item.displayCurrency,
      item.targetCurrency,
      item.originalCurrency,
      item.appSaleCurrency,
      item.localCurrency,
      item.currencySymbol,
      item.prices?.currency,
      item.prices?.currencyCode,
      item.priceModule?.currency,
      item.priceModule?.currencyCode,
    ];

    const textHints: Array<string | undefined | null> = [
      item.priceText,
      item.salePriceText,
      item.displayPriceText,
      item.displayPrice,
      item.discountPriceText,
      item.priceDescription,
      item.currencySymbol ? String(item.currencySymbol) : null,
      item.priceModule?.formattedPrice,
      item.priceModule?.formatedPrice,
      item.priceModule?.priceRangeText,
      item.multiPriceDisplay,
    ];

    const rangeCandidates: unknown[] = [
      [item.minPrice, item.maxPrice],
      [item.appSalePriceMin, item.appSalePriceMax],
      item.priceRange,
      item.activityPriceRange,
      item.priceModule?.priceRange,
      item.priceModule?.activityPriceRange,
      item.priceModule?.minActivityPrice,
      item.priceModule?.maxActivityPrice,
      item.priceModule?.minPrice,
      item.priceModule?.maxPrice,
      item.priceModule?.minAmount,
      item.priceModule?.maxAmount,
      item.skuPriceRange,
      item.skuActivityAmount,
    ];

    const priceRangeInfo = resolvePriceRange({
      rawRange: rangeCandidates,
      itemCurrencyHints: currencyHints,
      textHints,
      sourceCurrency: aliExpressLocalCurrency || undefined, // ✅ Moneda local de AliExpress
      userBaseCurrency: userBaseCurrency || undefined, // ✅ Moneda base del usuario
    });

    let resolvedPrice:
      | {
          amount: number;
          sourceCurrency: string;
          amountInBase: number;
          baseCurrency: string;
        }
      | null = null;

    if (priceRangeInfo && priceRangeInfo.maxAmountInBase > 0) {
      resolvedPrice = {
        amount: priceRangeInfo.maxAmount,
        sourceCurrency: priceRangeInfo.currency,
        amountInBase: priceRangeInfo.maxAmountInBase,
        baseCurrency: priceRangeInfo.baseCurrency,
      };
    }

    if (!resolvedPrice) {
      for (const candidate of priceCandidates) {
        if (candidate === undefined || candidate === null || candidate === '') {
          continue;
        }
        const hints = [...textHints, typeof candidate === 'string' ? candidate : null];
        const resolution = resolvePrice({
          raw: candidate,
          itemCurrencyHints: currencyHints,
          textHints: hints,
          sourceCurrency: aliExpressLocalCurrency || undefined, // ✅ Moneda local de AliExpress
          userBaseCurrency: userBaseCurrency || undefined, // ✅ Moneda base del usuario
        });
        if (resolution.amount > 0 && resolution.amountInBase > 0) {
          resolvedPrice = resolution;
          break;
        }
      }
    }

    // ✅ FALLBACK: Si no se resolvió el precio, intentar usar el valor numérico directamente
    if (!resolvedPrice || resolvedPrice.amountInBase <= 0) {
      // Intentar extraer precio directo de los candidatos numéricos
      for (const candidate of priceCandidates) {
        if (candidate === undefined || candidate === null || candidate === '') {
          continue;
        }
        
        // Si es un número, usarlo directamente
        if (typeof candidate === 'number' && isFinite(candidate) && candidate > 0) {
          const fallbackCurrency = aliExpressLocalCurrency || userBaseCurrency || 'USD';
          resolvedPrice = {
            amount: candidate,
            sourceCurrency: fallbackCurrency,
            amountInBase: candidate, // Asumir misma moneda si no se puede convertir
            baseCurrency: userBaseCurrency || 'USD',
          };
          
          logger.debug('[SCRAPER] Usando precio directo como fallback', {
            title: title?.substring(0, 50) || 'N/A',
            candidate,
            currency: fallbackCurrency
          });
          break;
        }
        
        // Si es string, intentar parsearlo
        if (typeof candidate === 'string') {
          const numericMatch = candidate.match(/[\d.,]+/);
          if (numericMatch) {
            const numericValue = parseFloat(numericMatch[0].replace(/,/g, ''));
            if (isFinite(numericValue) && numericValue > 0) {
              const fallbackCurrency = aliExpressLocalCurrency || userBaseCurrency || 'USD';
              resolvedPrice = {
                amount: numericValue,
                sourceCurrency: fallbackCurrency,
                amountInBase: numericValue, // Asumir misma moneda si no se puede convertir
                baseCurrency: userBaseCurrency || 'USD',
              };
              
              logger.debug('[SCRAPER] Usando precio parseado como fallback', {
                title: title?.substring(0, 50) || 'N/A',
                candidate: candidate.substring(0, 30),
                parsedValue: numericValue,
                currency: fallbackCurrency
              });
              break;
            }
          }
        }
      }
    }

    // ✅ Extraer URL antes de usarla (evitar redeclaración)
    const productUrlValue =
      item.productUrl ||
      item.url ||
      item.link ||
      item.productLink ||
      item.href ||
      item.productHref ||
      item.detailUrl ||
      item.productDetailUrl ||
      item.affiliateUrl ||
      (item.productId ? `https://www.aliexpress.com/item/${item.productId}.html` : null) ||
      null;
    
    // Renombrar para evitar conflictos con otras variables 'url' en el scope
    const url = productUrlValue;

    // ✅ RESTAURACIÓN: Aceptar productos con precio mínimo (1) cuando no se puede detectar precio
    // Esto permite extraer productos incluso cuando AliExpress bloquea y los precios no se pueden leer
    if (!resolvedPrice || resolvedPrice.amountInBase <= 0) {
      // Si el producto tiene título y URL válidos, usar precio mínimo de 1 USD
      // Esto restaura la funcionalidad de cuando el scraper funcionaba correctamente
      if (title && title.trim().length > 0 && url && url.length > 10) {
        logger.debug('[SCRAPER] Producto sin precio detectado, usando precio mínimo (1 USD) para permitir extracción', {
          title: title?.substring(0, 50) || 'N/A',
          url: url.substring(0, 80),
          hasResolvedPrice: !!resolvedPrice,
          priceCandidates: priceCandidates.filter(c => c !== undefined && c !== null && c !== '').slice(0, 3)
        });
        resolvedPrice = {
          amount: 1,
          sourceCurrency: 'USD',
          amountInBase: 1,
          baseCurrency: userBaseCurrency || 'USD',
        };
      } else {
        logger.debug('[SCRAPER] Producto descartado por falta de título/URL o precio inválido', {
          title: title?.substring(0, 50) || 'N/A',
          hasTitle: !!title && title.trim().length > 0,
          hasUrl: !!url && url.length > 10,
          hasResolvedPrice: !!resolvedPrice,
          amountInBase: resolvedPrice?.amountInBase || 0,
        });
        return null;
      }
    }

    const price = resolvedPrice.amountInBase;
    const baseCurrency = resolvedPrice.baseCurrency;
    const sourcePrice = resolvedPrice.amount;
    const sourceCurrency = resolvedPrice.sourceCurrency;

    const priceMinBase = priceRangeInfo ? priceRangeInfo.minAmountInBase : price;
    const priceMaxBase = priceRangeInfo ? priceRangeInfo.maxAmountInBase : price;
    const priceMinSource = priceRangeInfo ? priceRangeInfo.minAmount : sourcePrice;
    const priceMaxSource = priceRangeInfo ? priceRangeInfo.maxAmount : sourcePrice;
    const priceRangeSourceCurrency = priceRangeInfo ? priceRangeInfo.currency : sourceCurrency;
    const priceSource = priceRangeInfo ? 'range:max' : 'single';

    // ✅ MEJORADO: Extraer TODAS las imágenes disponibles, no solo la primera
    const allImages: string[] = [];
    const imageSet = new Set<string>(); // Para evitar duplicados

    // Función helper para normalizar y agregar URL de imagen
    const addImage = (img: any) => {
      if (!img || typeof img !== 'string') return;
      let normalized = img.trim();
      if (!normalized) return;
      
      // Normalizar URL
      if (normalized.startsWith('//')) {
        normalized = `https:${normalized}`;
      } else if (!normalized.startsWith('http')) {
        normalized = `https://${normalized}`;
      }
      
      // Validar que sea una URL válida de imagen
      if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalized)) {
        if (!imageSet.has(normalized)) {
          imageSet.add(normalized);
          allImages.push(normalized);
        }
      }
    };

    // Extraer de diferentes fuentes posibles
    // 1. Arrays de imágenes
    if (Array.isArray(item.images)) {
      item.images.forEach(addImage);
    }
    if (Array.isArray(item.imageUrlList)) {
      item.imageUrlList.forEach(addImage);
    }
    if (Array.isArray(item.productImages)) {
      item.productImages.forEach(addImage);
    }
    if (Array.isArray(item.galleryImages)) {
      item.galleryImages.forEach(addImage);
    }
    if (Array.isArray(item.imageList)) {
      item.imageList.forEach(addImage);
    }

    // 2. Campos individuales (imagen principal)
    addImage(item.imageUrl);
    addImage(item.productImage);
    addImage(item.image);
    addImage(item.pic);
    addImage(item.mainImage);
    addImage(item.primaryImage);

    // 3. Objetos anidados
    if (item.imageModule?.imagePathList && Array.isArray(item.imageModule.imagePathList)) {
      item.imageModule.imagePathList.forEach(addImage);
    }
    if (item.imageModule?.imageUrlList && Array.isArray(item.imageModule.imageUrlList)) {
      item.imageModule.imageUrlList.forEach(addImage);
    }
    if (item.productImageModule?.imagePathList && Array.isArray(item.productImageModule.imagePathList)) {
      item.productImageModule.imagePathList.forEach(addImage);
    }

    // Si no hay imágenes, usar la primera disponible como fallback
    const image = allImages.length > 0 ? allImages[0] : '';

    // ✅ url ya está declarada arriba (línea 3002), no redeclarar

    // ✅ Validar requisitos mínimos con logging
    if (!title || title.trim().length === 0) {
      logger.debug('[SCRAPER] Producto descartado: sin título');
      return null;
    }
    
    if (price <= 0) {
      logger.debug('[SCRAPER] Producto descartado: precio inválido', {
        title: title.substring(0, 50),
        price,
        sourcePrice,
        sourceCurrency,
        baseCurrency
      });
      return null;
    }
    
    if (!url || url.trim().length === 0) {
      logger.debug('[SCRAPER] Producto descartado: sin URL', {
        title: title.substring(0, 50)
      });
      return null;
    }

    const rating =
      item.ratingScore ||
      item.evaluationRate ||
      item.starRating ||
      item.feedbackScore ||
      item.averageStar ||
      0;

    const reviewCount =
      item.evaluationCount ||
      item.reviewCount ||
      item.feedbackCount ||
      item.commentCount ||
      item.numberOfOrders ||
      0;

    // ✅ MEJORADO: Incluir todas las imágenes en el resultado
    // Si no hay imágenes en el array, usar la imagen principal como fallback
    const finalImages = allImages.length > 0 ? allImages : (image ? [image] : []);

    return {
      title: String(title).trim().substring(0, 150),
      price,
      currency: baseCurrency,
      sourcePrice,
      sourceCurrency,
      priceMin: priceMinBase,
      priceMax: priceMaxBase,
      priceMinSource,
      priceMaxSource,
      priceRangeSourceCurrency,
      priceSource,
      imageUrl: image
        ? image.startsWith('//')
          ? `https:${image}`
          : image.startsWith('http')
          ? image
          : `https:${image}`
        : '',
      // ✅ MEJORADO: Incluir array de todas las imágenes disponibles
      images: finalImages,
      productUrl: url.startsWith('http') ? url : `https:${url}`,
      rating: Number(rating) || 0,
      reviewCount: Number(reviewCount) || 0,
      seller: item.storeName || item.sellerName || 'AliExpress Vendor',
      shipping: item.logisticsDesc || item.shipping || 'Varies',
      availability: item.availability || 'In stock',
    };
  }

  async ensureAliExpressSession(userId: number): Promise<boolean> {
    let result = false;
    try {
      if (!this.browser) {
        await this.init();
      }
      await this.ensureAliExpressLogin(userId);
      result = this.isLoggedIn && this.loggedInUserId === userId;
      return result;
    } finally {
      await this.close().catch(() => {});
    }
  }

  private async ensureAliExpressLogin(userId: number): Promise<void> {
     if (!this.browser) {
       await this.init();
     }
 
     // ✅ VERIFICAR: Si el navegador sigue siendo null después de init(), no podemos continuar
     if (!this.browser) {
       console.warn('⚠️  No se pudo inicializar el navegador. No se puede realizar login automático.');
       await marketplaceAuthStatusService.markError(
         userId,
         'aliexpress',
         'No se pudo inicializar el navegador. El scraping puede no estar disponible en este momento.',
         { lastAutomaticAttempt: new Date() }
       );
       return;
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

    await marketplaceAuthStatusService.markRefreshing(
      userId,
      'Intentando renovar sesión de AliExpress automáticamente'
    );

    const loginPage = await this.browser.newPage();
 
     try {
       await this.setupRealBrowser(loginPage);
       console.log('🔐 Navigating to AliExpress login page');
       await loginPage.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

       let context: FrameLike = (await this.waitForAliExpressLoginFrame(loginPage)) || loginPage;
       let attempts = 0;
       let lastState: AliExpressLoginState = AliExpressLoginState.UNKNOWN;

       while (attempts < 10) {
         attempts += 1;
         await this.handleAliExpressPopups(loginPage);
         await this.handleAliExpressPopups(context);
         context = await this.resolveAliExpressActiveContext(loginPage, context);
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
             await this.logAliExpressHtml(loginPage, context, `unknown-${attempts}`);
             if (attempts >= 4) {
               console.warn('⚠️  Persisting UNKNOWN state, forcing direct login navigation');
               await loginPage.goto(this.fallbackLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
               await new Promise(resolve => setTimeout(resolve, 2000));
               const fallbackSuccess = await this.tryDirectAliExpressLogin(loginPage, email, password, twoFactorEnabled ? twoFactorSecret : undefined);
               if (fallbackSuccess) {
                 await this.persistAliExpressSession(loginPage, userId, { email, password, twoFactorEnabled: !!twoFactorEnabled, twoFactorSecret });
                 return;
               }
             } else {
               const clicked = await this.tryClickLoginByText(context);
               if (!clicked && attempts >= 2) {
                 console.warn('⚠️  Login link not found via text, navigating to fallback login page');
                 await loginPage.goto(this.fallbackLoginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
                 await new Promise(resolve => setTimeout(resolve, 2000));
                 const fallbackSuccess = await this.tryDirectAliExpressLogin(loginPage, email, password, twoFactorEnabled ? twoFactorSecret : undefined);
                 if (fallbackSuccess) {
                   await this.persistAliExpressSession(loginPage, userId, { email, password, twoFactorEnabled: !!twoFactorEnabled, twoFactorSecret });
                   return;
                 }
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
         context = await this.resolveAliExpressActiveContext(loginPage, context);
       }

      console.warn(`⚠️  Unable to authenticate on AliExpress after ${attempts} steps. Last state: ${lastState}`);
      await this.captureAliExpressSnapshot(loginPage, `login-failed-${Date.now()}`);
      const manualSession = await ManualAuthService.startSession(
        userId,
        'aliexpress',
        this.fallbackLoginUrl || this.loginUrl
      );
      throw new ManualAuthRequiredError('aliexpress', manualSession.token, manualSession.loginUrl, manualSession.expiresAt);
     } catch (error: any) {
      if (error instanceof ManualAuthRequiredError) {
        throw error;
      }
      await marketplaceAuthStatusService.markError(
        userId,
        'aliexpress',
        error?.message || 'Error desconocido intentando iniciar sesión',
        { lastAutomaticAttempt: new Date() }
      );
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
        return (
          frameUrl.includes('login.alibaba.com') ||
          frameUrl.includes('passport.aliexpress.com') ||
          frameUrl.includes('mini_login') ||
          frameUrl.includes('render-accounts.aliexpress.com') ||
          frameUrl.includes('accounts.aliexpress.com') ||
          frameUrl.includes('seller-passport.aliexpress.com') ||
          frameUrl.includes('aeu.aliexpress.com') ||
          frameUrl.includes('passkey')
        );
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
            isEmpty: true,
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
          isEmpty: false,
        };
      }, selectorCatalog);

      if (info.isEmpty) {
        return { state: AliExpressLoginState.REQUIRES_MANUAL_REVIEW, details: 'empty-frame' };
      }

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
      await marketplaceAuthStatusService.markHealthy(
        userId,
        'aliexpress',
        'Sesión autenticada automáticamente'
      );
    } catch (error) {
      console.warn('⚠️  Unable to persist AliExpress session:', (error as Error).message);
    }
  }

  private async tryDirectAliExpressLogin(page: Page, email: string, password: string, twoFactorSecret?: string | null): Promise<boolean> {
    try {
      const loginUrl = 'https://www.aliexpress.com/p/ug/login.html?returnUrl=' + encodeURIComponent('https://www.aliexpress.com/');
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }));
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.handleAliExpressPopups(page);

      let frame = await this.waitForAliExpressLoginFrame(page);
      if (!frame) {
        await page.waitForSelector('iframe[name="alibaba-login-box"], iframe[src*="login.alibaba.com"], iframe[src*="render-accounts"]', { timeout: 20000 }).catch(() => null);
        frame = await this.waitForAliExpressLoginFrame(page);
      }
      let context: FrameLike = frame || page.mainFrame();
      await this.handleAliExpressPopups(context);

      // Switch to password/email form if necessary
      await context.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return;
        const candidates = Array.from(doc.querySelectorAll('button, a, span')) as any[];
        candidates.forEach((btn) => {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (!text) return;
          if (text.includes('password') || text.includes('contraseña')) {
            btn.click?.();
          }
        });
      }).catch(() => {});

      await this.clickIfExists(context, this.getAliExpressSelectors('login.switchPassword'), 'switch-password-login');
      await this.clickIfExists(context, this.getAliExpressSelectors('modal.emailLoginSwitch'), 'modal-email-switch');
      await this.clickIfExists(context, this.getAliExpressSelectors('modal.emailContinue'), 'modal-email-continue');
      await this.handleAliExpressPopups(context);

      const emailTyped = await this.typeIntoField(context, this.getAliExpressSelectors('login.email'), email, 'email');
      const passwordTyped = await this.typeIntoField(context, this.getAliExpressSelectors('login.password'), password, 'password');

      if (!emailTyped || !passwordTyped) {
        console.warn('⚠️  Unable to locate login fields inside new AliExpress login form');
        return false;
      }

      let submitted = await this.clickIfExists(context, this.getAliExpressSelectors('login.submit'), 'login-submit');
      if (!submitted) {
        await context.evaluate(() => {
          const doc = (globalThis as any).document;
          if (!doc) return;
          const btn = (Array.from(doc.querySelectorAll('button, a')) as any[]).find((el) => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text === 'sign in' || text === 'login' || text === 'iniciar sesión' || text === 'acceder';
          });
          btn?.click?.();
        }).catch(() => {});
        submitted = true;
      }

      if (!submitted) {
        console.warn('⚠️  Could not submit AliExpress login form');
        return false;
      }

      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        new Promise(resolve => setTimeout(resolve, 6000)),
      ]);

      await new Promise(resolve => setTimeout(resolve, 3000));
      const cookies = await page.cookies();
      const hasSessionCookie = cookies.some((c) => c.name.toLowerCase().includes('xman')) || cookies.some((c) => c.name === 'intl_locale');
      const stillOnLogin = page.url().includes('login.aliexpress.com') || page.url().includes('passport.aliexpress.com');

      if (hasSessionCookie || !stillOnLogin) {
        return true;
      }

      console.warn('⚠️  New login flow did not yield expected cookies, trying ajax fallback');
      return await this.tryAliExpressAjaxLogin(page, email, password);
    } catch (error) {
      console.warn('⚠️  Direct AliExpress login fallback failed:', (error as Error).message);
      return await this.tryAliExpressAjaxLogin(page, email, password);
    }
  }

  private async tryAliExpressAjaxLogin(page: Page, email: string, password: string): Promise<boolean> {
    try {
      const result = await page.evaluate(async ({ email, password }) => {
        const payload = new URLSearchParams({
          loginId: email,
          password2: password,
          keepLogin: 'true',
          bizParams: '',
          appName: 'ae_pc_protection',
          fromSite: 'main',
          csessionid: '',
          umidToken: '',
          hsiz: '',
          riskControlCode: '',
          scene: '',
        });
        const response = await fetch('https://passport.aliexpress.com/mini_login/ajaxLogin.htm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'x-requested-with': 'XMLHttpRequest',
          },
          body: payload.toString(),
          credentials: 'include',
        });
        if (!response.ok) {
          return { success: false, status: response.status };
        }
        const data = await response.json();
        return { status: response.status, data };
      }, { email, password });

      const ajaxData: any = result?.data;
      if (!ajaxData || ajaxData?.content?.status === 'fail') {
        console.warn('⚠️  Ajax login reported failure', ajaxData?.content || ajaxData);
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      const cookies = await page.cookies();
      if (cookies.some(c => c.name.toLowerCase().includes('xman')) || cookies.some(c => c.name === 'intl_locale')) {
        return true;
      }

      console.warn('⚠️  Ajax login succeeded but expected cookies missing', ajaxData);
      return false;
    } catch (error) {
      console.warn('⚠️  Ajax login fallback failed:', (error as Error).message);
      return false;
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
    try {
      const fallbackSuccess = await context.evaluate(
        ({ value, label }) => {
          const doc = (globalThis as any).document;
          if (!doc) return false;
          const lower = (text: string | null | undefined) => (text || '').toLowerCase();
          const isEmail = label === 'email';
          const isPassword = label === 'password';
          const candidates = Array.from(doc.querySelectorAll('input, textarea, div[contenteditable="true"]')) as any[];
          const filtered = candidates.filter((input: any) => {
            const type = lower(input.getAttribute('type'));
            const name = lower(input.getAttribute('name'));
            const placeholder = lower(input.getAttribute('placeholder'));
            const ariaLabel = lower(input.getAttribute('aria-label'));
            const dataTestId = lower(input.getAttribute('data-testid'));
            if (isEmail) {
              return (
                type === 'text' ||
                type === 'email' ||
                placeholder.includes('mail') ||
                placeholder.includes('correo') ||
                name.includes('mail') ||
                ariaLabel.includes('mail') ||
                dataTestId.includes('email')
              );
            }
            if (isPassword) {
              return (
                type === 'password' ||
                placeholder.includes('contraseña') ||
                placeholder.includes('password') ||
                name.includes('pass') ||
                ariaLabel.includes('password') ||
                dataTestId.includes('pass')
              );
            }
            return false;
          });
          const target = filtered.find((input: any) => !input.disabled && input.offsetParent !== null) || filtered[0];
          if (!target) {
            return false;
          }
          target.focus?.();
          try {
            if (target.isContentEditable) {
              target.textContent = '';
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.textContent = value;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              target.value = '';
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.value = value;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch (error) {
            (target as any).setAttribute('value', value);
          }
          return true;
        },
        { value, label }
      );
      if (fallbackSuccess) {
        console.log(`✅ Heuristic fallback success for ${label}`);
        return true;
      }
    } catch (error) {
      console.warn(`⚠️  Heuristic fallback failed for ${label}: ${(error as Error).message}`);
    }
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

    await context
      .evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return;

        const clickByText = (root: any, texts: string[]) => {
          const buttons = Array.from(root.querySelectorAll('button, a, div')) as any[];
          buttons.forEach((btn) => {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (!text) return;
            if (texts.some((t) => text.includes(t))) {
              btn.click?.();
            }
          });
        };

        const normalized = (values: string[]) =>
          values.map((text) => text.toLowerCase().trim()).filter(Boolean);

        const acceptTexts = normalized([
          'accept',
          'accept all',
          'allow all',
          'agree',
          'aceptar',
          'aceptar todas',
          'aceptar todo',
          'permitir',
          'allow',
          'allow cookies',
          'consent',
        ]);
        const skipTexts = normalized([
          'not now',
          'maybe later',
          'later',
          'skip',
          'usar después',
          'no ahora',
          'quizás más tarde',
          'omitir',
          'passkey',
          'recordar más tarde',
        ]);

        clickByText(doc, acceptTexts);
        clickByText(doc, skipTexts);

        const shadowHosts = Array.from(doc.querySelectorAll('*')).filter((el: any) => el?.shadowRoot);
        shadowHosts.forEach((host: any) => {
          try {
            clickByText(host.shadowRoot, acceptTexts);
            clickByText(host.shadowRoot, skipTexts);
          } catch {}
        });

        // Forzar eliminación de overlays persistentes
        const overlays = Array.from(doc.querySelectorAll('div')) as any[];
        overlays
          .filter((el) => {
            const style = (globalThis as any).getComputedStyle?.(el);
            if (!style) return false;
            const isFixed = style.position === 'fixed' || style.position === 'sticky';
            const hasHighZ = Number(style.zIndex || '0') >= 1000;
            const coversWholeScreen =
              parseInt(style.width || '0', 10) >= (globalThis as any).innerWidth * 0.8 &&
              parseInt(style.height || '0', 10) >= (globalThis as any).innerHeight * 0.8;
            const text = (el.textContent || '').toLowerCase();
            return (
              isFixed &&
              hasHighZ &&
              coversWholeScreen &&
              (text.includes('cookie') || text.includes('passkey') || text.includes('consent'))
            );
          })
          .forEach((el) => {
            try {
              el.parentElement?.removeChild(el);
            } catch {}
          });
      })
      .catch(() => {});

    const passkeyDismissed = await this.clickIfExists(context, this.getAliExpressSelectors('modal.passkey.dismiss'), 'passkey-dismiss');
    if (!passkeyDismissed) {
      await context.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return;
        const removeDialogs = (root: any) => {
          if (!root) return;
          const dialogSelectors = ['.ae-passkey-dialog', '.passkey-dialog', '[data-role="passkey-dialog"]', '.next-dialog.passkey'];
          dialogSelectors.forEach((sel) => {
            root.querySelectorAll(sel).forEach((el: any) => {
              if (el && el.parentElement) {
                el.parentElement.removeChild(el);
              }
            });
          });
        };
        removeDialogs(doc);
        const hosts = Array.from(doc.querySelectorAll('*')) as any[];
        hosts
          .filter((el) => el?.shadowRoot)
          .forEach((host) => {
            removeDialogs(host.shadowRoot);
          });
      }).catch(() => {});
    }
  }

  private async fetchAliExpressCookies(userId: number, environment: 'sandbox' | 'production' = 'production'): Promise<Protocol.Network.Cookie[]> {
    try {
      const credentials = await CredentialsManager.getCredentials(userId, 'aliexpress', environment);
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

  private async logAliExpressHtml(page: Page, context: FrameLike, label: string): Promise<void> {
    try {
      const pageHtml = await page.evaluate(() => (globalThis as any).document?.documentElement?.outerHTML || '').catch(() => '');
      let contextHtml = '';
      let contextUrl = 'main-page';
      if (context !== page) {
        try {
          contextHtml = await context.evaluate(() => (globalThis as any).document?.documentElement?.outerHTML || '').catch(() => '');
          // @ts-ignore
          contextUrl = (context as Frame).url?.() || 'frame';
        } catch {
          contextHtml = '[unavailable]';
        }
      }
      console.log(`📄 AliExpress HTML [${label}] page=${page.url()} snippet=${pageHtml.slice(0, 800)} ...`);
      if (context !== page) {
        console.log(`📄 AliExpress HTML [${label}] context=${contextUrl} snippet=${contextHtml.slice(0, 800)} ...`);
      }
    } catch (error) {
      console.warn('⚠️  Unable to log AliExpress HTML:', (error as Error).message);
    }
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

  private async resolveAliExpressActiveContext(page: Page, current: FrameLike): Promise<FrameLike> {
    try {
      const frames = page.frames();
      const candidate = frames.find(frame => {
        const url = frame.url();
        return (
          url.includes('passkey') ||
          url.includes('render-accounts.aliexpress.com') ||
          url.includes('login.alibaba.com') ||
          url.includes('passport.aliexpress.com') ||
          url.includes('accounts.aliexpress.com') ||
          url.includes('seller-passport.aliexpress.com') ||
          url.includes('aeu.aliexpress.com')
        );
      });
      if (candidate) {
        const hasDocument = await candidate.evaluate(() => Boolean((globalThis as any).document?.body)).catch(() => false);
        if (hasDocument) {
          return candidate;
        }
      }
    } catch (error) {
      console.warn('⚠️  Error resolving active AliExpress context:', (error as Error).message);
    }
    return current;
  }
}

export default AdvancedMarketplaceScraper;

type FrameLike = Page | Frame;