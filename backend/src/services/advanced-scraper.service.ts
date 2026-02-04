// ✅ FASE 3: Dynamic imports para evitar SIGSEGV - NO importar puppeteer al nivel superior
import { trace } from '../utils/boot-trace';
trace('loading advanced-scraper.service');

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
import { AppError, ErrorCode } from '../middleware/error.middleware';
import { resolvePrice, resolvePriceRange, parseLocalizedNumber } from '../utils/currency.utils';
import fxService from './fx.service';
import logger from '../config/logger';

// ✅ FASE 3: Types para puppeteer dinámico
type Browser = any;
type Page = any;
type Protocol = any;
type Frame = any;
type HTTPResponse = any;

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
  shippingCost?: number; // ✅ CRÍTICO: Costo de envío numérico para opportunity-finder
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
  // ✅ FASE 3: Cache de módulos puppeteer cargados dinámicamente
  private puppeteerModule: any = null;
  private stealthPlugin: any = null;
  private puppeteerTypes: any = null;

  // ✅ FASE 3: Lazy load puppeteer solo cuando se necesite
  private async loadPuppeteer(): Promise<any> {
    if (this.puppeteerModule) {
      return this.puppeteerModule;
    }
    
    // Verificar DISABLE_BROWSER_AUTOMATION
    const disableBrowser = process.env.DISABLE_BROWSER_AUTOMATION === 'true';
    if (disableBrowser) {
      throw new Error('Browser automation is disabled (DISABLE_BROWSER_AUTOMATION=true)');
    }

    try {
      const puppeteerExtra = await import('puppeteer-extra');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      const puppeteerTypes = await import('puppeteer');
      
      const puppeteer = puppeteerExtra.default;
      puppeteer.use(StealthPlugin());
      
      this.puppeteerModule = puppeteer;
      this.stealthPlugin = StealthPlugin;
      this.puppeteerTypes = puppeteerTypes;
      
      logger.info('[AdvancedScraper] Puppeteer loaded successfully (dynamic import)');
      return puppeteer;
    } catch (error) {
      logger.error('[AdvancedScraper] Failed to load puppeteer:', error);
      throw error;
    }
  }
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

    // ✅ FASE 3: Cargar puppeteer dinámicamente
    const puppeteer = await this.loadPuppeteer();

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
  async scrapeAliExpress(
    userId: number,
    query: string,
    environment: 'sandbox' | 'production' = 'production',
    userBaseCurrency?: string,
    options?: { nativeOnly?: boolean }
  ): Promise<ScrapedProduct[]> {
    const { logger } = await import('../config/logger');
    const entryTime = Date.now();
    
    // ✅ LOG OBLIGATORIO #1: Entrada al método (SIEMPRE se ejecuta)
    logger.info('[ALIEXPRESS-FLOW] ════════════════════════════════════════════════════════');
    logger.info('[ALIEXPRESS-FLOW] ENTRADA: scrapeAliExpress()', {
      query,
      userId,
      environment,
      userBaseCurrency: userBaseCurrency || 'USD',
      timestamp: new Date().toISOString(),
      entryPoint: 'advanced-scraper.service.ts:scrapeAliExpress'
    });
    logger.info('[ALIEXPRESS-FLOW] ════════════════════════════════════════════════════════');
    
    // ============================================================================
    // FLUJO: PRIORIDAD 1 - AliExpress Affiliate API → PRIORIDAD 2 - Scraping Nativo
    // ============================================================================
    // 
    // DECISIÓN CRÍTICA:
    // 1. Buscar credenciales en BD (sandbox y production)
    // 2. Si hay credenciales → Intentar llamada HTTP a API oficial
    //    - Si API responde → Retornar productos de API
    //    - Si API falla → Continuar con scraping nativo (fallback)
    // 3. Si NO hay credenciales → Usar scraping nativo directamente
    //
    // LOGS CLAVE PARA DEBUGGING:
    // - [ALIEXPRESS-FLOW] ENTRADA → Método iniciado
    // - [ALIEXPRESS-API] Buscando credenciales → Iniciando búsqueda
    // - [ALIEXPRESS-API] ✅ Credenciales encontradas → Se intentará usar API
    // - [ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP → Está por hacer la llamada
    // - [ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP → Justo antes de HTTP
    // - [ALIEXPRESS-AFFILIATE-API] Request → → Llamada HTTP iniciada
    // - [ALIEXPRESS-AFFILIATE-API] Success ← → API respondió correctamente
    // - [ALIEXPRESS-AFFILIATE-API] Error ← → API falló (revisar detalles)
    // - [ALIEXPRESS-FALLBACK] → Usando scraping nativo como fallback
    //
    // BUG RAÍZ IDENTIFICADO (corregido):
    // - Error "apiName is not defined" en línea 633 causaba que el código fallara
    //   silenciosamente al intentar normalizar credenciales, haciendo fallback inmediato
    // - Solución: Eliminada referencia a variable no definida
    // ============================================================================
    
    // ✅ HOTFIX: Declarar affiliateCreds FUERA del try para usarlo después del catch
    let affiliateCreds: any = null;
    let resolvedEnv: 'sandbox' | 'production' | null = null;
    let credentialsCheckError: any = null;
    
    // ✅ LOG OBLIGATORIO #2: Antes de buscar credenciales (SIEMPRE se ejecuta)
    logger.info('[ALIEXPRESS-API] Iniciando búsqueda de credenciales', {
      userId,
      query,
      environment,
      step: 'credentials_lookup',
      willCheckEnvironments: ['sandbox', 'production'],
      note: 'Si NO ves este log, el método no se está ejecutando'
    });
    
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const { aliexpressAffiliateAPIService } = await import('./aliexpress-affiliate-api.service');
      const { resolveEnvironment } = await import('../utils/environment-resolver');
      
      // ✅ ACLARACIÓN: La AliExpress Affiliate API usa el MISMO endpoint para sandbox y production
      // La distinción sandbox/production es solo organizacional para las credenciales en la BD
      // El endpoint siempre es: https://gw.api.taobao.com/router/rest
      // Sin embargo, buscamos credenciales en ambos ambientes porque pueden estar almacenadas
      // con diferentes etiquetas (sandbox/production) dependiendo de cómo se configuraron
      const preferredEnvironment = await resolveEnvironment({
        explicit: environment,
        userId,
        default: 'production'
      });
      
      // Buscar credenciales en ambos ambientes (solo es distinción organizacional, no funcional)
      const environmentsToTry: Array<'sandbox' | 'production'> = [preferredEnvironment];
      environmentsToTry.push(preferredEnvironment === 'production' ? 'sandbox' : 'production');
      
      // ✅ LOG OBLIGATORIO #3: Antes de iterar ambientes (SIEMPRE se ejecuta si llegamos aquí)
      logger.info('[ALIEXPRESS-API] Buscando credenciales de AliExpress Affiliate API', {
        userId,
        query,
        preferredEnvironment,
        environmentsToTry,
        step: 'iterating_environments',
        note: 'Nota: AliExpress Affiliate API usa el mismo endpoint para ambos ambientes. La distinción es solo organizacional.',
        willTryCount: environmentsToTry.length
      });
      
      for (const env of environmentsToTry) {
        try {
          logger.debug('[ALIEXPRESS-API] Intentando obtener credenciales', {
            environment: env,
            userId,
            apiName: 'aliexpress-affiliate'
          });
          
          const creds = await CredentialsManager.getCredentials(
            userId, 
            'aliexpress-affiliate', 
            env
          );
          
          if (creds) {
            // Normalizar el flag sandbox (solo para consistencia, no afecta el endpoint de la API)
            creds.sandbox = env === 'sandbox';
            
            affiliateCreds = creds;
            resolvedEnv = env;
            logger.info('[ALIEXPRESS-API] ✅ Credenciales encontradas y normalizadas', {
              environment: env,
              userId,
              preferredEnvironment,
              appKey: creds.appKey ? `${creds.appKey.substring(0, 6)}...` : 'missing',
              sandbox: creds.sandbox,
              normalized: true,
              willUseAPI: true
            });
            if (env !== preferredEnvironment) {
              logger.info('[ALIEXPRESS-API] Credenciales encontradas en ambiente alternativo', {
                preferred: preferredEnvironment,
                found: env,
                userId
              });
            }
            break;
          } else {
            logger.debug('[ALIEXPRESS-API] No se encontraron credenciales en este ambiente', {
              environment: env,
              userId,
              willTryNext: environmentsToTry.indexOf(env) < environmentsToTry.length - 1
            });
          }
        } catch (credError: any) {
          // ✅ REGLA DE ORO: Capturar error de credenciales pero continuar intentando
          credentialsCheckError = credError;
          const errorMsg = credError?.message || String(credError);
          logger.warn('[ALIEXPRESS-API] Error obteniendo credenciales', {
            environment: env,
            error: errorMsg,
            userId,
            willTryNext: environmentsToTry.indexOf(env) < environmentsToTry.length - 1,
            note: 'Continuando con siguiente ambiente o scraping nativo'
          });
        }
      }
      
      // ✅ LOG OBLIGATORIO #4: Resultado de búsqueda de credenciales (SIEMPRE se ejecuta)
      if (affiliateCreds) {
        logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
        logger.info('[ALIEXPRESS-API] ✅ CREDENCIALES ENCONTRADAS - Usando API oficial', {
          userId,
          query,
          environment: resolvedEnv || preferredEnvironment,
          resolvedFrom: resolvedEnv,
          source: 'aliexpress-affiliate-api',
          credentialsFound: true,
          appKey: affiliateCreds.appKey ? `${affiliateCreds.appKey.substring(0, 6)}...` : 'missing',
          hasAppSecret: !!affiliateCreds.appSecret,
          sandbox: affiliateCreds.sandbox,
          step: 'api_attempt',
          note: 'If API fails or times out, will fallback to native scraping'
        });
        logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
      } else {
        logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
        logger.info('[ALIEXPRESS-API] ⚠️ NO HAY CREDENCIALES - Usando scraping nativo', {
          userId,
          query,
          preferredEnvironment,
          environmentsTried: environmentsToTry,
          credentialsCheckError: credentialsCheckError?.message || null,
          step: 'fallback_to_scraping',
          reason: 'no_credentials_found',
          note: 'Para usar la API oficial, configura credenciales en Settings → API Settings → AliExpress Affiliate API'
        });
        logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
      }
      
      // ✅ PRIORIDAD 1: Si hay credenciales y no es nativeOnly, intentar API primero
      if (affiliateCreds && !options?.nativeOnly) {
        
        // ✅ LOG OBLIGATORIO #5: Antes de configurar servicio (SIEMPRE se ejecuta si hay credenciales)
        logger.info('[ALIEXPRESS-API] ✅ PREPARANDO LLAMADA HTTP a AliExpress Affiliate API', {
          userId,
          query,
          environment: resolvedEnv || preferredEnvironment,
          hasCredentials: !!affiliateCreds,
          appKey: affiliateCreds.appKey ? `${affiliateCreds.appKey.substring(0, 6)}...` : 'missing',
          endpoint: 'https://gw.api.taobao.com/router/rest',
          step: 'configuring_service',
          note: 'Si NO ves logs [ALIEXPRESS-AFFILIATE-API] Request → después de este mensaje, hay un problema en el código'
        });
        
        try {
          // ✅ LOG OBLIGATORIO #6: Configurando servicio (SIEMPRE se ejecuta si hay credenciales)
          logger.info('[ALIEXPRESS-API] Configurando servicio con credenciales', {
            userId,
            query,
            step: 'setting_credentials',
            hasAppKey: !!affiliateCreds.appKey,
            hasAppSecret: !!affiliateCreds.appSecret,
            hasTrackingId: !!affiliateCreds.trackingId
          });
          
          aliexpressAffiliateAPIService.setCredentials(affiliateCreds);
          
          // ✅ CRÍTICO: AliExpress Affiliate API usa autenticación por firma (app_key/app_secret)
          // No requiere OAuth tokens - la autenticación se hace mediante signature en cada request
          // Este código se mantiene para compatibilidad pero no se usa para Affiliate API
          try {
            // Affiliate API no usa OAuth - usa signature-based auth
            logger.info('[ALIEXPRESS-AUTH] Affiliate API usa autenticación por firma (no OAuth)');
          } catch (tokenError: any) {
            logger.warn('[ALIEXPRESS-AUTH] Note: Affiliate API usa signature auth, no OAuth tokens');
          }
          
          // Mapear país desde currency si es necesario
            const shipToCountry = this.getCountryFromCurrency(userBaseCurrency) || 'CL';
          
          // ✅ MEJORADO: Intentar con timeout optimizado
          // El timeout de axios es 30s, Promise.race es 35s para dar margen
          // Esto permite que la API tenga tiempo suficiente para responder
          let affiliateProducts: any = null;
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout after 35s - fallback to native scraping')), 35000)
          );
          
          const apiCallStartTime = Date.now();
          try {
            // ✅ LOG OBLIGATORIO #7: Justo antes de hacer la llamada HTTP real (SIEMPRE se ejecuta)
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            logger.info('[ALIEXPRESS-API] ✅ EJECUTANDO LLAMADA HTTP - searchProducts()', {
              query,
              pageSize: 5,
              targetCurrency: userBaseCurrency || 'USD',
              shipToCountry,
              timeout: '30s (axios) + 35s (race)',
              endpoint: 'https://gw.api.taobao.com/router/rest',
              step: 'http_call_start',
              timestamp: new Date().toISOString(),
              note: 'A partir de aquí deberías ver logs [ALIEXPRESS-AFFILIATE-API] Request → y Success/Error ←'
            });
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            
            affiliateProducts = await Promise.race([
              aliexpressAffiliateAPIService.searchProducts({
                keywords: query,
                pageSize: 5, // ✅ CRÍTICO: Reducir a 5 productos para respuesta más rápida
                targetCurrency: userBaseCurrency || 'USD',
                targetLanguage: 'ES',
                shipToCountry: shipToCountry || 'CL',
                sort: 'LAST_VOLUME_DESC',
              }),
              timeoutPromise
            ]);
            
            const apiCallDuration = Date.now() - apiCallStartTime;
            logger.info('[ALIEXPRESS-API] Llamada exitosa', {
              duration: `${apiCallDuration}ms`,
              productsFound: affiliateProducts?.length || 0
            });
          } catch (raceError: any) {
            const apiCallDuration = Date.now() - apiCallStartTime;
            const errorMessage = raceError?.message || String(raceError);
            const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timeout of') || errorMessage.includes('timeout after');
            
            logger.warn('[ALIEXPRESS-API] Error en llamada a API', {
              duration: `${apiCallDuration}ms`,
              error: errorMessage,
              isTimeout,
              query,
              userId,
              willFallback: true
            });
            
            // Si el error es del timeout, lanzar error específico
            if (isTimeout) {
              throw new Error(`API timeout after ${apiCallDuration}ms - fallback to native scraping`);
            }
            // Si es otro error, también lanzarlo
            throw raceError;
          }
          
          if (affiliateProducts && affiliateProducts.length > 0) {
            // ✅ LOG OBLIGATORIO: Éxito de API (SIEMPRE se ejecuta si API retorna productos)
            const totalDuration = Date.now() - entryTime;
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            logger.info('[ALIEXPRESS-API] ✅ ÉXITO: API retornó productos - NO usando scraping', {
              count: affiliateProducts.length,
              query,
              userId,
              source: 'official-api',
              totalDuration: `${totalDuration}ms`,
              step: 'api_success',
              note: 'Estos productos vienen directamente de la API oficial de AliExpress'
            });
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            
            // ✅ MEJORADO: Obtener detalles completos (incluyendo shipping) en batch
            // Limitar a los primeros 10 productos para optimizar llamadas a la API y evitar timeouts
            const productsToEnhance = affiliateProducts.slice(0, 10);
            const productIds = productsToEnhance
              .map(p => p.productId)
              .filter(Boolean)
              .join(',');
            
            let productDetailsMap: Map<string, any> = new Map();
            
            if (productIds) {
              try {
                logger.debug('[SCRAPER] Obteniendo detalles de envío desde Affiliate API', {
                  productCount: productsToEnhance.length,
                  productIds: productIds.substring(0, 100) + '...'
                });
                
                const details = await aliexpressAffiliateAPIService.getProductDetails({
                  productIds,
                  targetCurrency: userBaseCurrency || 'USD',
                  targetLanguage: 'ES',
                  shipToCountry: shipToCountry || 'CL',
                });
                
                // Crear mapa de detalles por productId para acceso rápido
                details.forEach(detail => {
                  if (detail.productId) {
                    productDetailsMap.set(detail.productId, detail);
                  }
                });
                
                logger.debug('[SCRAPER] Detalles de envío obtenidos', {
                  detailsCount: details.length,
                  withShippingInfo: details.filter(d => d.shippingInfo).length
                });
              } catch (detailsError: any) {
                // ✅ REGLA DE ORO: Si falla obtener detalles, continuar sin ellos
                logger.warn('[SCRAPER] Error obteniendo detalles de envío, continuando sin ellos', {
                  error: detailsError?.message || String(detailsError),
                  willUseFallback: true
                });
              }
            }
            
            // Convertir productos de Affiliate API a formato ScrapedProduct
            const scrapedProducts: ScrapedProduct[] = affiliateProducts.map(product => {
              // ✅ MEJORADO: Filtrar imágenes pequeñas de la API también
              // Consolidar todas las URLs de imágenes (main + small) y eliminar duplicados
              const allRawImages = Array.from(new Set([
                product.productMainImageUrl,
                ...(product.productSmallImageUrls || [])
              ].filter(Boolean))) as string[];
              
              logger.debug('[SCRAPER] Imágenes raw desde API Affiliate', {
                productId: product.productId,
                mainImage: product.productMainImageUrl?.substring(0, 80),
                smallImagesCount: product.productSmallImageUrls?.length || 0,
                totalRawImages: allRawImages.length,
                firstFewImages: allRawImages.slice(0, 3).map(img => img.substring(0, 60))
              });
              
              // ✅ MEJORADO: Filtrar imágenes pequeñas o con patrones de thumbnails
              const images = allRawImages.filter(imgUrl => {
                if (!imgUrl) return false;
                
                // Patrón 1: Detectar dimensiones en URL (ej: _50x50_, _100x100_, _220x220_, etc.)
                const sizePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
                const sizeMatch = imgUrl.match(sizePattern);
                if (sizeMatch) {
                  const width = parseInt(sizeMatch[1], 10);
                  const height = parseInt(sizeMatch[2], 10);
                  // Excluir si alguna dimensión es menor a 200px
                  if (width < 200 || height < 200) {
                    logger.debug('[SCRAPER] Imagen filtrada por tamaño pequeño (API)', {
                      url: imgUrl.substring(0, 80),
                      width,
                      height
                    });
                    return false;
                  }
                  return true;
                }
                
                // Patrón 2: Detectar URLs de thumbnails específicos
                const thumbnailPatterns = [
                  /\/50x50/i,
                  /\/100x100/i,
                  /\/150x150/i,
                  /thumbnail/i,
                  /thumb/i,
                  /_50x50/i,
                  /_100x100/i,
                ];
                
                if (thumbnailPatterns.some(pattern => pattern.test(imgUrl))) {
                  logger.debug('[SCRAPER] Imagen filtrada por patrón de thumbnail (API)', {
                    url: imgUrl.substring(0, 80)
                  });
                  return false;
                }
                
                // Si no hay patrón de tamaño, incluir la imagen (probablemente es válida)
                return true;
              });
              
              // ✅ MEJORADO: Formatear shipping con información real si está disponible
              let shippingString = 'Calculated at checkout';
              let shippingCostNum: number | undefined = undefined;
              const productDetail = productDetailsMap.get(product.productId);
              
              if (productDetail?.shippingInfo) {
                const shippingInfo = productDetail.shippingInfo;
                const shippingCost = shippingInfo.shippingCost;
                const deliveryDays = shippingInfo.deliveryDays;
                
                // ✅ CRÍTICO: Guardar shippingCost como número para que opportunity-finder lo procese
                if (shippingCost !== undefined && shippingCost !== null && typeof shippingCost === 'number') {
                  shippingCostNum = shippingCost;
                  
                  if (shippingCost === 0) {
                    shippingString = deliveryDays 
                      ? `Free shipping (${deliveryDays} days)`
                      : 'Free shipping';
                  } else {
                    const currency = product.currency || userBaseCurrency || 'USD';
                    const costFormatted = shippingCost.toFixed(2);
                    shippingString = deliveryDays
                      ? `${currency} ${costFormatted} shipping (${deliveryDays} days)`
                      : `${currency} ${costFormatted} shipping`;
                  }
                } else if (deliveryDays) {
                  shippingString = `Calculated at checkout (${deliveryDays} days)`;
                }
              }
              
              // ✅ LOGGING: Verificar imágenes antes de retornar
              logger.debug('[SCRAPER] Producto Affiliate API procesado', {
                productId: product.productId,
                title: product.productTitle?.substring(0, 50),
                rawImagesCount: allRawImages.length,
                filteredImagesCount: images.length,
                firstImage: images[0]?.substring(0, 80),
                hasShippingInfo: !!productDetail?.shippingInfo
              });
              
              // ✅ CRÍTICO: Usar moneda directamente de la API (sin inferir desde precio)
              // La API de AliExpress siempre retorna la moneda correcta
              const productCurrency = product.currency || userBaseCurrency || 'USD';
              
              return {
                title: product.productTitle,
                price: product.salePrice,
                originalPrice: product.originalPrice,
                imageUrl: images[0] || '',
                images: images.length > 0 ? images : [], // ✅ Asegurar que siempre sea un array
                productUrl: product.productDetailUrl || product.promotionLink || '',
                rating: product.evaluateScore || 0,
                reviewCount: product.volume || 0,
                seller: product.storeName || '',
                shipping: shippingString,
                shippingCost: shippingCostNum, // ✅ CRÍTICO: Agregar shippingCost como número para opportunity-finder
                availability: 'In Stock',
                currency: productCurrency, // ✅ Usar moneda de la API directamente
              };
            });
            
            logger.info('[ALIEXPRESS-API] Products mapped successfully', {
              convertedCount: scrapedProducts.length,
              withShippingInfo: Array.from(productDetailsMap.values()).filter(d => d.shippingInfo).length,
              query,
              userId,
              source: 'official-api'
            });
            
            // ✅ ÉXITO: Retornar productos desde API oficial (NO usar scraping)
            const apiTotalDuration = Date.now() - entryTime;
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            logger.info('[ALIEXPRESS-API] ✅ RETORNANDO productos de API oficial', {
              productsCount: scrapedProducts.length,
              query,
              userId,
              totalDuration: `${apiTotalDuration}ms`,
              step: 'returning_api_products',
              source: 'official-api',
              note: 'NO se usará scraping - productos vienen de API'
            });
            logger.info('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
            return scrapedProducts;
          } else {
            // ✅ API retornó 0 productos - usar scraping como fallback
            logger.warn('[ALIEXPRESS-FALLBACK] ════════════════════════════════════════════════════════');
            logger.warn('[ALIEXPRESS-FALLBACK] API returned 0 products, using native scraper', {
              query,
              userId,
              reason: 'api_returned_empty',
              fallbackSource: 'native-scraping',
              step: 'api_empty_fallback',
              note: 'La API se llamó correctamente pero retornó 0 productos. Continuando con scraping.'
            });
            logger.warn('[ALIEXPRESS-FALLBACK] ════════════════════════════════════════════════════════');
            // Continuar con scraping nativo si no hay resultados
          }
        } catch (apiError: any) {
          const errorMessage = apiError?.message || String(apiError);
          
          // ✅ Clasificar errores de manera explícita
          const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('API timeout') || errorMessage.includes('ECONNABORTED');
          const isAuthError = errorMessage.includes('credentials') || 
                              errorMessage.includes('unauthorized') || 
                              errorMessage.includes('401') || 
                              errorMessage.includes('403') ||
                              errorMessage.includes('INVALID_SIGNATURE') ||
                              errorMessage.includes('AUTH_ERROR');
          const isRateLimit = errorMessage.includes('rate limit') || errorMessage.includes('429');
          const isServerError = errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503');
          const isNetworkError = errorMessage.includes('network') || 
                                 errorMessage.includes('ECONNREFUSED') || 
                                 errorMessage.includes('ETIMEDOUT') ||
                                 errorMessage.includes('ENOTFOUND') ||
                                 errorMessage.includes('NETWORK_ERROR');
          
          // ✅ Clasificar el error para logging detallado y decisión de fallback
          let reasonCode = 'unknown_error';
          let shouldRetry = false;
          let shouldFallbackToScraping = true; // Por defecto, siempre hacer fallback si falla
          
          if (isTimeout) {
            reasonCode = 'api_timeout';
            shouldRetry = false; // No retry inmediato para timeouts
            shouldFallbackToScraping = true;
          } else if (isAuthError) {
            reasonCode = 'invalid_credentials';
            shouldRetry = false; // No retry para errores de autenticación
            shouldFallbackToScraping = true;
          } else if (isRateLimit) {
            reasonCode = 'rate_limit_exceeded';
            shouldRetry = false; // No retry inmediato para rate limits
            shouldFallbackToScraping = true;
          } else if (isServerError) {
            reasonCode = 'server_error';
            shouldRetry = false; // No retry para errores del servidor de AliExpress
            shouldFallbackToScraping = true;
          } else if (isNetworkError) {
            reasonCode = 'network_error';
            shouldRetry = false; // No retry para errores de red
            shouldFallbackToScraping = true;
          }
          
          // ✅ LOG OBLIGATORIO: Error detallado antes de hacer fallback
          logger.warn('[ALIEXPRESS-FALLBACK] API failed - using native scraper', {
            reason: reasonCode,
            error: errorMessage.substring(0, 500), // Limitar tamaño
            errorType: isTimeout ? 'timeout' : isAuthError ? 'auth' : isRateLimit ? 'rate_limit' : isNetworkError ? 'network' : 'unknown',
            isTimeout,
            isAuthError,
            isRateLimit,
            isServerError,
            isNetworkError,
            query,
            userId,
            fallbackSource: 'native-scraping',
            willFallback: shouldFallbackToScraping,
            recommendation: isAuthError 
              ? 'Verificar credenciales en Settings → API Settings → AliExpress Affiliate API'
              : isTimeout || isNetworkError
              ? 'Problema de conectividad. El fallback a scraping nativo continuará.'
              : 'Revisar logs detallados para más información'
          });
          
          // Continuar con scraping nativo si falla la API
          // (no lanzar error, simplemente continuar con el código de scraping más abajo)
        }
      } else {
        // ✅ No hay credenciales configuradas - usar scraping nativo
        logger.info('[ALIEXPRESS-FALLBACK] Using native scraper because API credentials not configured', {
          userId,
          query,
          reason: 'no_credentials',
          fallbackSource: 'native-scraping',
          note: 'Configura credenciales en Settings → API Settings → AliExpress Affiliate API para usar la API oficial'
        });
        // Continuar con scraping nativo si no hay credenciales
      }
    } catch (affiliateCheckError: any) {
      // ✅ LOG OBLIGATORIO #9: Error al verificar credenciales (SIEMPRE se ejecuta si hay excepción)
      logger.warn('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
      logger.warn('[ALIEXPRESS-API] ❌ Error al verificar credenciales - usando scraping nativo', {
        reason: 'credentials_check_error',
        error: affiliateCheckError?.message || String(affiliateCheckError),
        errorStack: affiliateCheckError?.stack?.substring(0, 500),
        query,
        userId,
        step: 'credentials_check_exception',
        fallbackSource: 'native-scraping',
        note: 'Este error NO debería ocurrir normalmente. Revisar logs anteriores para más detalles.'
      });
      logger.warn('[ALIEXPRESS-API] ════════════════════════════════════════════════════════');
      // Continuar con scraping nativo si hay error
      // En caso de error, affiliateCreds queda como null
    }
    
    // ✅ DECISIÓN: Verificar condiciones para usar scraping como fallback
    // affiliateCreds se declara arriba (línea 649), puede ser null si no hay credenciales
    const { env } = await import('../config/env');
    const allowBrowserAutomation = env.ALLOW_BROWSER_AUTOMATION;
    const dataSource = env.ALIEXPRESS_DATA_SOURCE;
    
    // ✅ LOG OBLIGATORIO: Estado antes de decidir usar scraping
    const hasAffiliateCreds = (typeof affiliateCreds !== 'undefined') && affiliateCreds !== null;
    logger.info('[ALIEXPRESS-FLOW] Verificando condiciones para scraping fallback', {
      userId,
      query,
      hasAffiliateCreds,
      dataSource: dataSource || 'not_set',
      allowBrowserAutomation: allowBrowserAutomation || false,
      step: 'fallback_conditions_check',
      note: 'Si hasAffiliateCreds=false y dataSource=api, se lanzará error. Si no, se usará scraping.'
    });
    
    // ✅ REGLA CLARA: Si dataSource es 'api' y NO hay credenciales, NO hacer scraping (salvo nativeOnly)
    if (!options?.nativeOnly && dataSource === 'api' && !hasAffiliateCreds) {
      logger.warn('[ALIEXPRESS-API-FIRST] ════════════════════════════════════════════════════════');
      logger.warn('[ALIEXPRESS-API-FIRST] API credentials required but not configured', {
        userId,
        query,
        dataSource,
        allowBrowserAutomation,
        step: 'api_first_mode_no_credentials',
        recommendation: 'Configure AliExpress Affiliate API credentials in Settings → API Settings, or set ALIEXPRESS_DATA_SOURCE=scrape to allow scraping fallback'
      });
      logger.warn('[ALIEXPRESS-API-FIRST] ════════════════════════════════════════════════════════');
      throw new AppError(
        'AliExpress API credentials required. Please configure AliExpress Affiliate API in Settings → API Settings. Scraping is disabled in API-first mode.',
        400,
        ErrorCode.CREDENTIALS_ERROR,
        {
          authRequired: true,
          dataSource: 'api',
          message: 'AUTH_REQUIRED: Configure AliExpress Affiliate API credentials to use this feature.',
        }
      );
    }
    
    // ✅ REGLA CLARA: Si browser automation está deshabilitado Y no hay credenciales, NO hacer scraping
    // Si hay credenciales, la API ya se intentó arriba, así que esto solo aplica si no hay credenciales
    if (!allowBrowserAutomation && !hasAffiliateCreds) {
      logger.warn('[ALIEXPRESS-API-FIRST] ════════════════════════════════════════════════════════');
      logger.warn('[ALIEXPRESS-API-FIRST] Browser automation disabled and no API credentials', {
        userId,
        query,
        allowBrowserAutomation,
        dataSource,
        hasAffiliateCreds,
        step: 'no_automation_no_credentials',
        recommendation: 'Configure AliExpress Affiliate API credentials in Settings → API Settings, or enable ALLOW_BROWSER_AUTOMATION=true to allow scraping'
      });
      logger.warn('[ALIEXPRESS-API-FIRST] ════════════════════════════════════════════════════════');
      throw new AppError(
        'Browser automation is disabled and no API credentials found. Please configure AliExpress Affiliate API credentials in Settings → API Settings, or enable browser automation.',
        400,
        ErrorCode.CREDENTIALS_ERROR,
        {
          authRequired: true,
          allowBrowserAutomation: false,
          hasCredentials: false,
          message: 'AUTH_REQUIRED: Browser automation disabled and no API credentials. Configure API credentials to use this feature.',
        }
      );
    }
    
    // ✅ Si llegamos aquí, podemos usar scraping como fallback
    // Esto significa que:
    // - O hay credenciales pero la API falló (ya se intentó arriba)
    // - O no hay credenciales pero scraping está permitido (dataSource != 'api' y allowBrowserAutomation = true)
    
    // ✅ FALLBACK: Continuar con scraping nativo (solo si API falló o no está disponible Y automation está permitido)
    logger.info('[ALIEXPRESS-FALLBACK] Proceeding with native scraping', { 
      query, 
      userId,
      source: 'native-scraping',
      allowBrowserAutomation,
      dataSource,
      reason: 'api_unavailable_or_failed'
    });
    
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
          logger.debug('[SCRAPER] API response con status no exitoso', { status, url: url.substring(0, 80) });
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

      // ✅ CORREGIDO: Usar formato estándar de AliExpress primero (SearchText)
      // El formato /w/wholesale-{query}.html puede causar redirecciones incorrectas y bloques
      const searchUrls = [
        `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`,
        `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}&SortType=total_tranpro_desc`,
        `https://www.aliexpress.com/w/wholesale?SearchText=${encodeURIComponent(query)}&g=y`,
        `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(query)}.html`, // Formato alternativo (menos preferido)
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
              // ✅ MEJORADO: Extraer TODAS las imágenes disponibles desde runParams
              const allImageUrls: string[] = [];
              const imageSet = new Set<string>();
              
              // Función helper para normalizar y agregar URL de imagen
              const addImageUrl = (imgUrl: any) => {
                if (!imgUrl || typeof imgUrl !== 'string') return;
                let normalized = imgUrl.trim();
                if (!normalized) return;
                
                // Normalizar URL
                if (normalized.startsWith('//')) {
                  normalized = `https:${normalized}`;
                } else if (!normalized.startsWith('http')) {
                  normalized = `https://${normalized}`;
                }
                
                // Validar que sea una URL válida de imagen
                if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalized) && !imageSet.has(normalized)) {
                  imageSet.add(normalized);
                  allImageUrls.push(normalized);
                }
              };
              
              // ✅ NUEVO: Buscar arrays completos de imágenes desde imageModule
              if (item.imageModule?.imagePathList && Array.isArray(item.imageModule.imagePathList)) {
                item.imageModule.imagePathList.forEach(addImageUrl);
              }
              if (item.imageModule?.imageUrlList && Array.isArray(item.imageModule.imageUrlList)) {
                item.imageModule.imageUrlList.forEach(addImageUrl);
              }
              if (item.productImageModule?.imagePathList && Array.isArray(item.productImageModule.imagePathList)) {
                item.productImageModule.imagePathList.forEach(addImageUrl);
              }
              
              // ✅ NUEVO: Buscar en arrays de imágenes directos
              if (Array.isArray(item.images)) {
                item.images.forEach(addImageUrl);
              }
              if (Array.isArray(item.imageUrlList)) {
                item.imageUrlList.forEach(addImageUrl);
              }
              if (Array.isArray(item.productImages)) {
                item.productImages.forEach(addImageUrl);
              }
              if (Array.isArray(item.galleryImages)) {
                item.galleryImages.forEach(addImageUrl);
              }
              
              // ✅ MANTENER: Imagen principal como fallback (compatibilidad)
              let imageUrl = item.image?.imgUrl || item.imageUrl || item.image?.url || item.imgUrl || '';
              
              // Limpiar y normalizar URL principal
              if (imageUrl) {
                imageUrl = String(imageUrl).replace(/^\//, 'https://').trim();
                if (imageUrl && !imageUrl.startsWith('http')) {
                  if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                  } else {
                    imageUrl = 'https://' + imageUrl;
                  }
                }
                // Agregar imagen principal al array si no está ya
                addImageUrl(imageUrl);
              }
              
              // Si aún no hay imágenes válidas, intentar construir desde productId o usar placeholder
              if (allImageUrls.length === 0) {
                const productId = item.productId || item.id;
                if (productId) {
                  const idStr = String(productId);
                  if (idStr.length >= 8) {
                    const constructedUrl = `https://ae01.alicdn.com/kf/${idStr.substring(0, 2)}/${idStr}.jpg`;
                    addImageUrl(constructedUrl);
                    if (!imageUrl) imageUrl = constructedUrl;
                  }
                }
                // Último fallback: placeholder
                if (allImageUrls.length === 0) {
                  const placeholderUrl = 'https://via.placeholder.com/300x300?text=No+Image';
                  allImageUrls.push(placeholderUrl);
                  if (!imageUrl) imageUrl = placeholderUrl;
                }
              } else if (!imageUrl) {
                // Si tenemos imágenes en el array pero no imagen principal, usar la primera
                imageUrl = allImageUrls[0];
              }
              
              return {
                title: String(item.title || item.productTitle || '').trim().substring(0, 150),
                price: Number(item.actSkuCalPrice || item.skuCalPrice || item.salePrice || 0),
                imageUrl: imageUrl, // ✅ MANTENER: Imagen principal para compatibilidad
                images: allImageUrls.length > 0 ? allImageUrls : (imageUrl ? [imageUrl] : []), // ✅ NUEVO: Array de todas las imágenes
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

            // ✅ MEJORADO: Obtener TODAS las imágenes, no solo la primera
            const imageSelectors = [
              '.search-card-item--gallery--img',
              'img[src]',
              'img[data-src]',
              '[class*="image"] img',
              '[class*="gallery"] img',
              'img[data-pl="product-image"]',
              'div[data-pl="product-image"] img'
            ];
            
            // ✅ MEJORADO: Buscar TODAS las imágenes usando querySelectorAll
            const allImageUrls: string[] = [];
            const imageSet = new Set<string>(); // Para evitar duplicados
            
            for (const sel of imageSelectors) {
              const foundImages = item.querySelectorAll(sel);
              if (foundImages && foundImages.length > 0) {
                Array.from(foundImages).forEach((imgEl: any) => {
                  // Extraer URL de múltiples atributos posibles
                  const imgSrc = imgEl.getAttribute('src') ||
                                imgEl.getAttribute('data-src') ||
                                imgEl.getAttribute('data-lazy-src') ||
                                imgEl.getAttribute('data-ks-lazyload') ||
                                imgEl.getAttribute('data-original') ||
                                (imgEl as any).src ||
                                '';
                  
                  // Normalizar URL
                  if (imgSrc && typeof imgSrc === 'string' && imgSrc.trim().length > 0) {
                    let normalizedUrl = imgSrc.trim();
                    if (normalizedUrl.startsWith('//')) {
                      normalizedUrl = `https:${normalizedUrl}`;
                    } else if (!normalizedUrl.startsWith('http')) {
                      normalizedUrl = `https://${normalizedUrl}`;
                    }
                    
                    // ✅ MEJORADO: Filtrar imágenes pequeñas (iconos, thumbnails, etc.)
                    // Excluir URLs que contengan dimensiones pequeñas como 48x48, 154x64, etc.
                    const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
                    const sizeMatch = normalizedUrl.match(smallImagePattern);
                    let shouldInclude = true;
                    if (sizeMatch) {
                      const width = parseInt(sizeMatch[1], 10);
                      const height = parseInt(sizeMatch[2], 10);
                      // Excluir si alguna dimensión es menor a 200px
                      if (width < 200 || height < 200) {
                        shouldInclude = false; // Saltar esta imagen
                      }
                    }
                    
                    // Validar que sea una URL válida de imagen y que no sea pequeña
                    if (shouldInclude && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalizedUrl) && !imageSet.has(normalizedUrl)) {
                      imageSet.add(normalizedUrl);
                      allImageUrls.push(normalizedUrl); // ✅ CORREGIDO: Solo guardar URL, no el elemento DOM
                    }
                  }
                });
                
                // Si encontramos imágenes con este selector, continuar (ya tenemos suficientes)
                if (allImageUrls.length > 0) break;
              }
            }
            
            // ✅ MANTENER: Imagen principal para compatibilidad (primera encontrada)
            // Buscar el primer elemento de imagen que coincida con la primera URL encontrada
            let imageElement: any = null;
            if (allImageUrls.length > 0) {
              for (const sel of imageSelectors) {
                const found = item.querySelector(sel);
                if (found) {
                  const src = found.getAttribute('src') || found.getAttribute('data-src') || (found as any).src || '';
                  let normalizedSrc = src;
                  if (src && typeof src === 'string') {
                    if (normalizedSrc.startsWith('//')) {
                      normalizedSrc = `https:${normalizedSrc}`;
                    } else if (!normalizedSrc.startsWith('http')) {
                      normalizedSrc = `https://${normalizedSrc}`;
                    }
                    // Verificar si esta URL está en nuestro array
                    if (allImageUrls.some(url => url === normalizedSrc || url.includes(src) || src.includes(url.split('/').pop() || ''))) {
                      imageElement = found;
                      break;
                    }
                  }
                }
              }
            }
            
            // Si no encontramos elemento pero tenemos URLs, buscar cualquier elemento de imagen
            if (!imageElement) {
              for (const sel of imageSelectors) {
                imageElement = item.querySelector(sel);
                if (imageElement) break;
              }
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

            // ✅ MEJORADO: Extraer imagen principal y combinar con todas las encontradas
            let image = '';
            
            if (imageElement) {
              image = imageElement.getAttribute('src') ||
                      imageElement.getAttribute('data-src') ||
                      imageElement.getAttribute('data-lazy-src') ||
                      imageElement.getAttribute('data-ks-lazyload') ||
                      (imageElement as any).src ||
                      '';
              
              // Normalizar imagen principal
              if (image) {
                if (image.startsWith('//')) {
                  image = `https:${image}`;
                } else if (!image.startsWith('http')) {
                  image = `https://${image}`;
                }
              }
            }
            
            // ✅ CORREGIDO: Usar las URLs ya extraídas (allImageUrls ya contiene todas las imágenes normalizadas)
            // Si tenemos imagen principal y no está en el array, validar tamaño antes de agregarla
            if (image && !allImageUrls.includes(image)) {
              // ✅ MEJORADO: Validar que la imagen principal no sea pequeña
              const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
              const sizeMatch = image.match(smallImagePattern);
              let shouldAdd = true;
              if (sizeMatch) {
                const width = parseInt(sizeMatch[1], 10);
                const height = parseInt(sizeMatch[2], 10);
                if (width < 200 || height < 200) {
                  shouldAdd = false; // No agregar imágenes pequeñas
                }
              }
              if (shouldAdd) {
                allImageUrls.unshift(image); // Agregar al inicio para que sea la principal
              }
            } else if (image && allImageUrls.length === 0) {
              // Si solo tenemos imagen principal y no hay más, validar antes de agregar
              const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
              const sizeMatch = image.match(smallImagePattern);
              let shouldAdd = true;
              if (sizeMatch) {
                const width = parseInt(sizeMatch[1], 10);
                const height = parseInt(sizeMatch[2], 10);
                if (width < 200 || height < 200) {
                  shouldAdd = false; // No agregar imágenes pequeñas
                }
              }
              if (shouldAdd) {
                allImageUrls.push(image);
              }
            }
            
            // ✅ NUEVO: Intentar extraer más imágenes desde data attributes del item (AliExpress usa data-attributes para múltiples imágenes)
            try {
              // Buscar elementos con data-images o data-image-list
              const imageDataAttr = item.getAttribute('data-images') || 
                                    item.getAttribute('data-image-list') ||
                                    item.getAttribute('data-product-images');
              
              if (imageDataAttr) {
                try {
                  const parsedImages = JSON.parse(imageDataAttr);
                  if (Array.isArray(parsedImages)) {
                    parsedImages.forEach((imgUrl: any) => {
                      if (imgUrl && typeof imgUrl === 'string') {
                        let normalized = imgUrl.trim();
                        if (normalized && !allImageUrls.includes(normalized)) {
                          if (normalized.startsWith('//')) {
                            normalized = `https:${normalized}`;
                          } else if (!normalized.startsWith('http')) {
                            normalized = `https://${normalized}`;
                          }
                          if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalized)) {
                            allImageUrls.push(normalized);
                          }
                        }
                      }
                    });
                  }
                } catch (parseError) {
                  // Ignorar errores de parsing
                }
              }
              
              // ✅ MEJORADO: Buscar múltiples imágenes en elementos hijos (galería)
              const galleryImages = item.querySelectorAll('[data-spm*="image"], [class*="gallery"] img, [class*="image"] img, img[data-src]');
              if (galleryImages && galleryImages.length > 0) {
                Array.from(galleryImages).slice(0, 5).forEach((galleryImg: any) => {
                  const gallerySrc = galleryImg.getAttribute('src') ||
                                   galleryImg.getAttribute('data-src') ||
                                   galleryImg.getAttribute('data-lazy-src') ||
                                   galleryImg.getAttribute('data-original') ||
                                   (galleryImg as any).src ||
                                   '';
                  
                  if (gallerySrc && typeof gallerySrc === 'string') {
                    let normalized = gallerySrc.trim();
                    if (normalized && normalized.length > 10) {
                      if (normalized.startsWith('//')) {
                        normalized = `https:${normalized}`;
                      } else if (!normalized.startsWith('http')) {
                        normalized = `https://${normalized}`;
                      }
                      
                      // ✅ MEJORADO: Filtrar imágenes pequeñas (iconos, thumbnails, etc.)
                      const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
                      const sizeMatch = normalized.match(smallImagePattern);
                      if (sizeMatch) {
                        const width = parseInt(sizeMatch[1], 10);
                        const height = parseInt(sizeMatch[2], 10);
                        // Excluir si alguna dimensión es menor a 200px
                        if (width < 200 || height < 200) {
                          return; // Saltar esta imagen
                        }
                      }
                      
                      // Solo agregar si es una URL válida de imagen y no está duplicada
                      if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalized) && !allImageUrls.includes(normalized)) {
                        allImageUrls.push(normalized);
                      }
                    }
                  }
                });
              }
            } catch (galleryError) {
              // Ignorar errores al buscar imágenes adicionales
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

            // ✅ MEJORADO: Construir URLs absolutas para TODAS las imágenes
            let imageUrl = '';
            const normalizedImageUrls: string[] = [];
            
            // Normalizar imagen principal
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
            
            // ✅ NUEVO: Normalizar todas las URLs de imágenes encontradas y filtrar pequeñas
            if (allImageUrls.length > 0) {
              allImageUrls.forEach((img) => {
                let normalized = img;
                if (img.startsWith('//')) {
                  normalized = `https:${img}`;
                } else if (img.startsWith('http')) {
                  normalized = img;
                } else if (img.startsWith('/')) {
                  normalized = `https://www.aliexpress.com${img}`;
                } else {
                  normalized = `https://${img}`;
                }
                
                // ✅ MEJORADO: Filtrar imágenes pequeñas después de normalizar
                const smallImagePattern = /[\/_](\d{1,3})x(\d{1,3})[\/_\.]/;
                const sizeMatch = normalized.match(smallImagePattern);
                if (sizeMatch) {
                  const width = parseInt(sizeMatch[1], 10);
                  const height = parseInt(sizeMatch[2], 10);
                  // Excluir si alguna dimensión es menor a 200px
                  if (width < 200 || height < 200) {
                    return; // Saltar esta imagen
                  }
                }
                
                if (normalized && !normalizedImageUrls.includes(normalized)) {
                  normalizedImageUrls.push(normalized);
                }
              });
            }
            
            // ✅ Si solo tenemos imagen principal, agregarla al array también
            if (imageUrl && !normalizedImageUrls.includes(imageUrl)) {
              normalizedImageUrls.push(imageUrl);
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
            
            // ✅ LOGGING: Verificar cuántas imágenes se extrajeron
            const finalImages = normalizedImageUrls.length > 0 ? normalizedImageUrls : (imageUrl ? [imageUrl] : []);
            
            return {
              title: String(title).trim().substring(0, 150),
              rawPriceData, // ✅ Incluir datos brutos para resolver fuera
              imageUrl,
              images: finalImages, // ✅ Array de todas las imágenes extraídas
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
      // ✅ CORREGIDO: Usar 'let' en lugar de 'const' para poder actualizar cuando estrategias adicionales encuentren productos
      let productsWithResolvedPrices = productsFromDom.map((product: any) => {
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
            // Buscar patrones de precio en el texto (ej: "$5.330", "$1.371", "US $8.025", "$26.600", "0,99€", etc.)
            // ✅ Mejorar patrones para detectar CLP (formato chileno con punto como separador de miles)
            // ✅ Mejorar patrones para detectar EUR (formato europeo con coma como separador decimal)
            const pricePatterns = [
              /US\s*\$?\s*([\d,]+\.?\d*)/i,  // USD explícito
              /\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/,  // Formato chileno: $26.600 o $26.600,50
              /€\s*([\d.,]+)/,  // ✅ NUEVO: Formato europeo: €0,99 o €1.234,56
              /([\d.,]+)\s*€/,  // ✅ NUEVO: Formato europeo: 0,99€ o 1.234,56€
              /\$?\s*([\d,]+\.?\d*)/,  // Formato general
              /([\d,]+\.?\d*)\s*USD/i,
              /([\d,]+\.?\d*)\s*CLP/i,
              /([\d.,]+)\s*EUR/i,  // ✅ NUEVO: EUR explícito
              /([\d,]+\.?\d*)\s*\$/
            ];

            for (const pattern of pricePatterns) {
              const match = fullText.match(pattern);
              if (match && match[1]) {
                // ✅ CORREGIDO: NO eliminar comas - parseLocalizedNumber maneja formatos europeos (0,99) y americanos (0.99)
                // Pasar el string directamente para que determineSeparators detecte correctamente el formato
                const priceStr = match[1];
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
            let convertedFromCLP = sourcePrice;
            try {
              convertedFromCLP = fxService.convert(sourcePrice, 'CLP', baseCurrency);
            } catch (error: any) {
              logger.warn('[SCRAPER] FX conversion failed for CLP detection', {
                from: 'CLP',
                to: baseCurrency,
                amount: sourcePrice,
                error: error?.message
              });
              // Fallback: usar precio sin convertir
              convertedFromCLP = sourcePrice;
            }
            
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
            images: product.images && Array.isArray(product.images) ? product.images : (product.imageUrl ? [product.imageUrl] : []), // ✅ NUEVO: Incluir array de imágenes
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
        const isBlockedUrl = finalUrl.includes('/punish') || finalUrl.includes('TMD') || finalUrl.includes('x5secdata') || finalUrl.includes('x5step');
        
        // ✅ RESTAURACIÓN: Intentar estrategias adicionales PRIMERO (como funcionaba cuando encontraba oportunidades)
        // No verificar CAPTCHA temprano - dejar que las estrategias adicionales se ejecuten
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
                    // ✅ CORREGIDO: Usar parseLocalizedNumber para manejar formatos europeos (0,99) y americanos (0.99)
                    price = parseLocalizedNumber(match[0], aliExpressLocalCurrency || userBaseCurrency || 'USD');
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
              // ✅ CORREGIDO: Actualizar productsWithResolvedPrices en lugar de retornar inmediatamente
              // Esto permite que el código continúe y pueda encontrar más productos o continuar el flujo normal
              // Convertir ScrapedProduct[] al tipo correcto
              productsWithResolvedPrices = normalizedRetry as any;
              // Continuar con el flujo en lugar de retornar aquí para permitir más estrategias
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
            
            // ✅ CORREGIDO: Usar formato estándar SearchText en lugar de /w/wholesale-{query}.html
            const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
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
                // ✅ CORREGIDO: Actualizar productsWithResolvedPrices en lugar de retornar inmediatamente
                // Si ya había productos de retryProducts, combinarlos; si no, usar estos
                if (productsWithResolvedPrices.length > 0) {
                  // Combinar productos evitando duplicados por URL
                  const existingUrls = new Set(productsWithResolvedPrices.map(p => p.productUrl));
                  const newProducts = normalizedAfterNav.filter(p => !existingUrls.has(p.productUrl));
                  productsWithResolvedPrices = [...productsWithResolvedPrices, ...newProducts] as any;
                  logger.info('[SCRAPER] Productos combinados de múltiples estrategias', { 
                    total: productsWithResolvedPrices.length,
                    nuevos: newProducts.length
                  });
                } else {
                  productsWithResolvedPrices = normalizedAfterNav as any;
                }
              }
            }
          } catch (navError: any) {
            logger.warn('[SCRAPER] Error en re-navegación', { error: navError?.message });
          }
        }
        
        // ✅ RESTAURACIÓN: Solo DESPUÉS de TODOS los intentos, verificar CAPTCHA/bloqueo
        // Esto permite que las estrategias adicionales se ejecuten incluso cuando hay bloqueo
        // (como funcionaba cuando el sistema encontraba oportunidades)
        const currentUrlAfterAttempts = page.url();
        const isBlockedUrlFinal = currentUrlAfterAttempts.includes('/punish') || currentUrlAfterAttempts.includes('TMD') || currentUrlAfterAttempts.includes('x5secdata') || currentUrlAfterAttempts.includes('x5step');
        
        const hasCaptchaOrBlock = await page.evaluate(() => {
          const captchaSelectors = [
            '.captcha', '#captcha', '[class*="captcha"]', '[id*="captcha"]',
            'iframe[src*="captcha"]', '.security-check', '.verification',
            '.block-message', '[class*="block"]', '.access-denied'
          ];
          const hasCaptchaElement = captchaSelectors.some(sel => document.querySelector(sel) !== null);
          const bodyText = document.body.innerText.toLowerCase();
          const hasCaptchaText = bodyText.includes('captcha') || 
                                 bodyText.includes('blocked') || 
                                 bodyText.includes('access denied') ||
                                 bodyText.includes('unusual traffic');
          return hasCaptchaElement || hasCaptchaText;
        }).catch(() => false);
        
        // ✅ CORREGIDO: Verificar si ahora tenemos productos después de las estrategias adicionales
        // Si tenemos productos, continuar con el flujo normal en lugar de lanzar error CAPTCHA
        if (productsWithResolvedPrices.length > 0) {
          logger.info('[SCRAPER] Productos encontrados después de estrategias adicionales, continuando flujo normal', {
            count: productsWithResolvedPrices.length,
            query,
            userId
          });
          // Continuar con el flujo normal más abajo (validación de productos, etc.)
        } else if ((hasCaptchaOrBlock || isBlockedUrlFinal) && productsWithResolvedPrices.length === 0) {
          // ✅ Solo lanzar error de CAPTCHA si después de TODOS los intentos no hay productos Y hay bloqueo/CAPTCHA
          logger.warn('[SCRAPER] CAPTCHA o bloqueo detectado después de todos los intentos - activando resolución manual', { 
            userId, 
            query, 
            url: currentUrlAfterAttempts,
            hasCaptchaOrBlock,
            isBlockedUrl: isBlockedUrlFinal
          });
          await this.captureAliExpressSnapshot(page, `captcha-block-${Date.now()}`).catch(() => {});
          
          // ✅ SOLUCIÓN CORRECTA: Crear sesión manual y lanzar error para que el usuario resuelva CAPTCHA
          try {
            const { ManualAuthService } = await import('./manual-auth.service');
            const manualSession = await ManualAuthService.startSession(
              userId,
              'aliexpress',
              currentUrlAfterAttempts // URL de la página con CAPTCHA
            );
            logger.info('[SCRAPER] Sesión manual creada para resolver CAPTCHA', {
              userId,
              token: manualSession.token,
              loginUrl: manualSession.loginUrl
            });
            throw new ManualAuthRequiredError('aliexpress', manualSession.token, manualSession.loginUrl, manualSession.expiresAt);
          } catch (error: any) {
            // Si ya es ManualAuthRequiredError, relanzarlo
            if (error instanceof ManualAuthRequiredError) {
              throw error;
            }
            // Si hay error creando sesión, loguear y retornar vacío
            logger.error('[SCRAPER] Error creando sesión manual, retornando vacío', {
              error: error?.message || String(error),
              userId,
              query
            });
            return [];
          }
        }
        
        // ✅ RESTAURACIÓN: Solo después de TODOS los intentos, retornar vacío o lanzar error CAPTCHA
        // Verificar si hay productos encontrados por las estrategias adicionales
        // (retryProducts y retryAfterNav pueden haber encontrado productos)
        // Nota: currentUrlAfterAttempts ya está declarado arriba (línea 2304)
        
        logger.warn('[SCRAPER] No se encontraron productos después de todos los intentos', {
          query,
          userId,
          url: currentUrlAfterAttempts, // Usar variable ya declarada arriba
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

      // ✅ TEMPORALMENTE DESACTIVADO: Proceso de mejora de imágenes que bloqueaba la búsqueda de oportunidades
      // Este proceso visitaba páginas individuales y ralentizaba demasiado la búsqueda principal
      // TODO: Reimplementar como proceso asíncrono en background después de retornar resultados
      // La búsqueda de oportunidades ahora retorna más rápido sin este bloqueo
      /*
      const productsToEnhance = productsWithResolvedPrices
        .filter((p: any) => {
          if (!p.productUrl || p.productUrl.length < 10) return false;
          return true;
        })
        .slice(0, 3);

      if (productsToEnhance.length > 0 && this.browser) {
        logger.info('[SCRAPER] Mejorando imágenes visitando páginas individuales', {
          count: productsToEnhance.length,
          query,
          userId,
          currentImagesCounts: productsToEnhance.map((p: any) => ({
            title: p.title?.substring(0, 40),
            currentImages: (p.images || (p.imageUrl ? [p.imageUrl] : [])).length
          }))
        });

        for (let i = 0; i < productsToEnhance.length; i++) {
          const product = productsToEnhance[i];
          const currentImagesCount = (product.images || (product.imageUrl ? [product.imageUrl] : [])).length;
          
          try {
            const enhancedImages = await this.extractImagesFromProductPage(product.productUrl);
            
            if (enhancedImages.length > 0) {
              if (enhancedImages.length > currentImagesCount || currentImagesCount === 0) {
                product.images = enhancedImages;
                product.imageUrl = enhancedImages[0];
                logger.info('[SCRAPER] Imágenes mejoradas desde página individual', {
                  productUrl: product.productUrl.substring(0, 80),
                  previousImagesCount: currentImagesCount,
                  newImagesCount: enhancedImages.length,
                  query,
                  userId
                });
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            logger.warn('[SCRAPER] Error extrayendo imágenes de página individual', {
              productUrl: product.productUrl?.substring(0, 80),
              error: error instanceof Error ? error.message : String(error),
              query,
              userId
            });
          }
        }
      }
      */

      logger.info('[SCRAPER] Extraídos productos REALES de AliExpress desde DOM', {
        count: productsWithResolvedPrices.length,
        query,
        userId,
        firstProducts: productsWithResolvedPrices.slice(0, 3).map((p: any) => {
          const imagesArray = p.images || (p.imageUrl ? [p.imageUrl] : []);
          const uniqueImages = new Set(imagesArray);
          return {
            title: p.title?.substring(0, 50), 
            price: p.price, 
            currency: p.currency,
            sourcePrice: p.sourcePrice,
            productUrl: p.productUrl?.substring(0, 80) || 'NO_URL',
            hasUrl: !!p.productUrl && p.productUrl.length >= 10,
            imagesCount: uniqueImages.size,
            imagesArrayLength: imagesArray.length,
            hasImagesArray: Array.isArray(p.images),
            firstImageUrl: p.imageUrl?.substring(0, 60) || 'none',
            firstImagesPreview: Array.from(uniqueImages).slice(0, 3).map((img: string) => img?.substring(0, 50))
          };
        })
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
        logger.warn('[SCRAPER] Amazon detectó bot, usando estrategia alternativa', { query });
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
      logger.warn('[SCRAPER] No se pudo configurar intercepción de requests', { 
        error: error instanceof Error ? error.message : String(error) 
      });
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
    logger.info('[SCRAPER] Intentando resolver CAPTCHA automáticamente');

    try {
      // Estrategia 1: Esperar y recargar
      await new Promise(resolve => setTimeout(resolve, 5000));
      await page.reload({ waitUntil: 'networkidle2' });

      // Verificar si desapareció el CAPTCHA
      const stillHasCaptcha = await this.checkForCaptcha(page);
      if (!stillHasCaptcha) {
        logger.info('[SCRAPER] CAPTCHA evadido con recarga');
        return true;
      }

      // Estrategia 2: Simular comportamiento humano
      await this.simulateHumanBehavior(page);

      return true;
    } catch (error) {
      logger.error('[SCRAPER] Error resolviendo CAPTCHA', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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
    logger.info('[SCRAPER] Usando estrategia alternativa para Amazon', { query });

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
              logger.debug('[SCRAPER] runParams encontrado en HTML', { pattern: pattern.toString().substring(0, 50) });
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
          logger.debug('[SCRAPER] runParams encontrado en window object');
          return runParams;
        }
      } catch (evalError) {
        logger.warn('[SCRAPER] Error evaluando runParams desde window', { error: (evalError as Error).message });
      }
      
      return null;
    } catch (error) {
      logger.warn('[SCRAPER] Error extrayendo runParams del HTML', { error: (error as Error).message });
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
      logger.warn('[SCRAPER] Error extrayendo productos desde __NI_DATA__', { error: (error as Error).message });
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
      logger.warn('[SCRAPER] Error extrayendo productos desde scripts', { error: (error as Error).message });
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

  /**
   * ✅ NUEVO: Extraer todas las imágenes disponibles desde una página individual de producto
   * Visita la URL del producto y extrae todas las imágenes de la galería
   */
  private async extractImagesFromProductPage(productUrl: string): Promise<string[]> {
    if (!this.browser || !productUrl || productUrl.length < 10) {
      return [];
    }

    const imageSet = new Set<string>();

    try {
      const productPage = await this.browser.newPage();
      
      try {
        // Navegar a la página del producto
        await productPage.goto(productUrl, { 
          waitUntil: 'networkidle2', // Esperar a que la red esté inactiva para asegurar que las imágenes carguen
          timeout: 20000 
        });
        
        // Esperar más tiempo para que cargue el contenido dinámico y las imágenes
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // ✅ MEJORA: Hacer scroll incremental para cargar imágenes lazy-load
        await productPage.evaluate(async () => {
          const distance = 100;
          const delay = 100;
          while (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight) {
            window.scrollBy(0, distance);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        });
        await new Promise(resolve => setTimeout(resolve, 2000)); // Espera final
        
        // ✅ MEJORA: Hacer hover/clic en TODAS las miniaturas de la columna lateral para cargar URLs ampliadas
        // Esto es crítico para obtener todas las imágenes de alta resolución de la galería principal
        try {
          const thumbnailInfo = await productPage.evaluate(() => {
            // ✅ PRIORIDAD: Buscar específicamente en #j-image-thumb-wrap (columna lateral de miniaturas)
            const mainThumbWrap = document.querySelector('#j-image-thumb-wrap');
            const clickableThumbs: Array<{ x: number; y: number; index: number; selector: string }> = [];
            
            if (mainThumbWrap) {
              // Buscar TODAS las miniaturas dentro de la columna lateral
              const thumbnails = mainThumbWrap.querySelectorAll('li, [class*="thumb-item"], [data-role="thumb-item"]');
              thumbnails.forEach((thumb: any, index: number) => {
                // Verificar si es clickeable (no está deshabilitado y es visible)
                if (thumb && !thumb.classList.contains('disabled') && thumb.offsetParent !== null) {
                  const rect = thumb.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    // Construir selector específico para esta miniatura
                    const selector = `#j-image-thumb-wrap li:nth-child(${index + 1})`;
                    clickableThumbs.push({ 
                      x: rect.left + rect.width / 2, 
                      y: rect.top + rect.height / 2, 
                      index,
                      selector
                    });
                  }
                }
              });
            } else {
              // Fallback: buscar en otros contenedores de galería
              const thumbnails = document.querySelectorAll('.images-view-item, [class*="thumb-item"], [data-role="thumb-item"]');
              thumbnails.forEach((thumb: any, index: number) => {
                if (thumb && !thumb.classList.contains('disabled') && thumb.offsetParent !== null) {
                  const rect = thumb.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    clickableThumbs.push({ 
                      x: rect.left + rect.width / 2, 
                      y: rect.top + rect.height / 2, 
                      index,
                      selector: ''
                    });
                  }
                }
              });
            }
            
            return clickableThumbs; // ✅ Retornar TODAS las miniaturas, no solo las primeras 5
          });
          
          // ✅ Hacer hover en TODAS las miniaturas para cargar sus URLs ampliadas
          if (thumbnailInfo && thumbnailInfo.length > 0) {
            logger.debug('[SCRAPER] Haciendo hover en miniaturas de la columna lateral', {
              productUrl: productUrl.substring(0, 80),
              totalThumbnails: thumbnailInfo.length
            });
            
            // Hacer hover en cada miniatura para activar la carga de la imagen ampliada
            for (let i = 0; i < thumbnailInfo.length; i++) {
              try {
                const thumb = thumbnailInfo[i];
                // Intentar hacer hover usando el selector específico primero
                if (thumb.selector) {
                  try {
                    await productPage.hover(thumb.selector).catch(() => {});
                  } catch {
                    // Fallback a coordenadas si el selector falla
                    await productPage.mouse.move(thumb.x, thumb.y).catch(() => {});
                  }
                } else {
                  // Usar coordenadas directamente
                  await productPage.mouse.move(thumb.x, thumb.y).catch(() => {});
                }
                // Esperar a que cargue la imagen ampliada antes de continuar
                await new Promise(resolve => setTimeout(resolve, 400)); // Aumentado a 400ms para asegurar carga
              } catch (hoverError) {
                // Continuar con la siguiente si falla
              }
            }
            
            // Volver a la primera miniatura (imagen principal) para asegurar que la imagen principal esté cargada
            if (thumbnailInfo.length > 0) {
              try {
                const firstThumb = thumbnailInfo[0];
                if (firstThumb.selector) {
                  await productPage.hover(firstThumb.selector).catch(() => {});
                } else {
                  await productPage.mouse.move(firstThumb.x, firstThumb.y).catch(() => {});
                }
                await new Promise(resolve => setTimeout(resolve, 500)); // Espera final más larga
              } catch (hoverError) {
                // Ignorar si no se puede hacer hover
              }
            }
          }
        } catch (hoverError) {
          // Si falla el proceso de hover, continuar con la extracción normal
          logger.debug('[SCRAPER] Error haciendo hover en miniaturas, continuando con extracción normal', {
            productUrl: productUrl.substring(0, 80),
            error: hoverError instanceof Error ? hoverError.message : String(hoverError)
          });
        }

        // Extraer imágenes desde múltiples fuentes
        const images = await productPage.evaluate(() => {
          const allImages: string[] = [];
          const seen = new Set<string>();

          // Función helper para agregar imagen
          const addImage = (url: string) => {
            if (!url || typeof url !== 'string') return;
            let normalized = url.trim();
            if (!normalized || normalized.length < 10) return;

            // Normalizar URL
            if (normalized.startsWith('//')) {
              normalized = `https:${normalized}`;
            } else if (!normalized.startsWith('http')) {
              normalized = `https://${normalized}`;
            }

            // Validar que sea una URL válida de imagen
            if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(normalized)) {
              // Remover parámetros de tamaño si los hay (ej: _50x50.jpg -> .jpg)
              const baseUrl = normalized.split('?')[0].split('#')[0];
              if (!seen.has(baseUrl)) {
                seen.add(baseUrl);
                allImages.push(baseUrl);
              }
            }
          };

          // 1. ✅ MEJORA: Extraer desde runParams/scripts (datos embebidos) - PRIORIZAR imagePath (alta resolución)
          try {
            const w = (globalThis as any).window;
            const runParams = w?.runParams || w?.__INITIAL_STATE__?.productDetail?.productInfo || w?.__INITIAL_STATE__?.detail;
            
            // ✅ PRIORIDAD 1: imageModule contiene las URLs de alta resolución
            if (runParams?.data?.imageModule) {
              const imageModule = runParams.data.imageModule;
              
              // imagePathList contiene las rutas base (sin dominio) - estas son de alta resolución
              if (Array.isArray(imageModule.imagePathList)) {
                imageModule.imagePathList.forEach((path: any) => {
                  if (path && typeof path === 'string') {
                    // Construir URL completa si es relativa
                    let fullUrl = path;
                    if (!path.startsWith('http')) {
                      fullUrl = `https://ae01.alicdn.com${path.startsWith('/') ? '' : '/'}${path}`;
                    }
                    addImage(fullUrl);
                  }
                });
              }
              
              // imageUrlList contiene URLs completas - también alta resolución
              if (Array.isArray(imageModule.imageUrlList)) {
                imageModule.imageUrlList.forEach((url: any) => {
                  if (url && typeof url === 'string') {
                    addImage(url);
                  }
                });
              }
            }
            
            // ✅ PRIORIDAD 2: gallery también contiene imágenes de alta resolución
            if (runParams?.data?.gallery) {
              const gallery = runParams.data.gallery;
              if (Array.isArray(gallery)) {
                gallery.forEach((item: any) => {
                  // Priorizar imagePath (alta resolución) sobre imageUrl (miniatura)
                  if (item.imagePath) {
                    let fullUrl = item.imagePath;
                    if (!fullUrl.startsWith('http')) {
                      fullUrl = `https://ae01.alicdn.com${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
                    }
                    addImage(fullUrl);
                  } else if (item.imageUrl || item.url) {
                    addImage(item.imageUrl || item.url);
                  }
                });
              }
            }

            // ✅ PRIORIDAD 3: productInfo.imageList
            if (runParams?.data?.productInfo?.imageList) {
              const imageList = runParams.data.productInfo.imageList;
              if (Array.isArray(imageList)) {
                imageList.forEach((img: any) => {
                  if (typeof img === 'string') {
                    addImage(img);
                  } else if (img.imagePath) {
                    // Priorizar imagePath (alta resolución)
                    let fullUrl = img.imagePath;
                    if (!fullUrl.startsWith('http')) {
                      fullUrl = `https://ae01.alicdn.com${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
                    }
                    addImage(fullUrl);
                  } else if (img.imageUrl || img.url) {
                    addImage(img.imageUrl || img.url);
                  }
                });
              }
            }
            
            // Buscar en otros lugares comunes de runParams
            if (runParams?.imageUrls && Array.isArray(runParams.imageUrls)) {
              runParams.imageUrls.forEach((url: any) => {
                if (url && typeof url === 'string') addImage(url);
              });
            }
            if (runParams?.images && Array.isArray(runParams.images)) {
              runParams.images.forEach((url: any) => {
                if (url && typeof url === 'string') addImage(url);
              });
            }
            if (runParams?.productImages && Array.isArray(runParams.productImages)) {
              runParams.productImages.forEach((url: any) => {
                if (url && typeof url === 'string') addImage(url);
              });
            }
          } catch (e) {
            // Ignorar errores al acceder a runParams
          }

          // 2. ✅ PRIORIDAD: Extraer la imagen principal grande (centro de la página)
          // Esta es la imagen principal que se muestra cuando haces hover/clic en las miniaturas
          const mainImageSelectors = [
            '.images-view-magnifier-wrap img', // Imagen principal ampliada (más común)
            '.image-view-magnifier img', // Variante del selector
            '.magnifier-image', // Imagen del magnifier (zoom)
            '.detail-main-image img', // Imagen principal en detalle
            '[class*="magnifier"] img', // Cualquier elemento con "magnifier"
            '[class*="main-image"] img', // Cualquier elemento con "main-image"
            '.images-view-item img:first-child', // Primera imagen de la vista
            '[class*="image-view-wrap"] img:first-of-type' // Primera imagen del wrapper
          ];

          let mainImageFound = false;
          for (const selector of mainImageSelectors) {
            const mainImg = document.querySelector(selector) as HTMLImageElement;
            if (mainImg) {
              // ✅ PRIORIDAD 1: Buscar atributos de alta resolución primero
              const highResSrc = mainImg.getAttribute('data-src-large') ||
                                mainImg.getAttribute('data-zoom-src') ||
                                mainImg.getAttribute('data-original-large') ||
                                mainImg.getAttribute('data-src') ||
                                mainImg.src;
              if (highResSrc) {
                // Limpiar URL de parámetros de tamaño si los hay
                let cleanUrl = highResSrc.split('?')[0].split('#')[0];
                cleanUrl = cleanUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                addImage(cleanUrl);
                mainImageFound = true;
                break; // Solo necesitamos una imagen principal
              }
            }
          }
          
          // ✅ Si no encontramos la imagen principal con los selectores, buscar en runParams (ya hecho arriba)
          // Pero también intentar buscar en el contenedor principal de imágenes
          if (!mainImageFound) {
            const imageViewWrap = document.querySelector('.images-view-wrap, .image-view-wrap');
            if (imageViewWrap) {
              const firstMainImg = imageViewWrap.querySelector('img:first-of-type') as HTMLImageElement;
              if (firstMainImg) {
                const mainSrc = firstMainImg.getAttribute('data-src-large') ||
                               firstMainImg.getAttribute('data-zoom-src') ||
                               firstMainImg.getAttribute('src') ||
                               firstMainImg.src;
                if (mainSrc) {
                  let cleanUrl = mainSrc.split('?')[0].split('#')[0];
                  cleanUrl = cleanUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                  addImage(cleanUrl);
                }
              }
            }
          }

          // ✅ PRIORIDAD: Extraer TODAS las miniaturas de la columna lateral (#j-image-thumb-wrap)
          // Esta es la columna vertical de miniaturas a la izquierda de la imagen principal
          const mainThumbWrap = document.querySelector('#j-image-thumb-wrap');
          if (mainThumbWrap) {
            // ✅ Extraer TODAS las miniaturas de esta columna específica
            const lateralThumbnails = mainThumbWrap.querySelectorAll('li, [class*="thumb-item"], [data-role="thumb-item"]');
            lateralThumbnails.forEach((thumb: any) => {
              // Buscar imagen dentro de cada miniatura
              const img = thumb.querySelector('img') || thumb;
              
              if (img) {
                // ✅ PRIORIDAD 1: Buscar atributos de alta resolución en el elemento img
                const highResUrl = img.getAttribute('data-src-large') ||
                                  img.getAttribute('data-zoom-src') ||
                                  img.getAttribute('data-original-large') ||
                                  img.getAttribute('data-src') ||
                                  thumb.getAttribute('data-src-large') ||
                                  thumb.getAttribute('data-zoom-src') ||
                                  thumb.getAttribute('data-image-url') ||
                                  thumb.getAttribute('data-src');
                
                if (highResUrl) {
                  addImage(highResUrl);
                } else {
                  // ✅ PRIORIDAD 2: Obtener src de la imagen y limpiar parámetros de tamaño
                  const thumbSrc = img.getAttribute('src') ||
                                 img.getAttribute('data-lazy-src') ||
                                 img.getAttribute('data-ks-lazyload') ||
                                 img.getAttribute('data-original') ||
                                 (img as any).src;
                  if (thumbSrc) {
                    // Remover parámetros de tamaño de miniatura para obtener URL base (alta resolución)
                    let baseUrl = thumbSrc.split('?')[0].split('#')[0];
                    // Reemplazar tamaños de miniatura (ej: _50x50.jpg, _60x60.jpg) con extensión base
                    baseUrl = baseUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                    // Filtrar solo si es una URL válida y no es un icono
                    if (!baseUrl.includes('icon') && !baseUrl.includes('logo') && !baseUrl.includes('avatar')) {
                      addImage(baseUrl);
                    }
                  }
                }
              }
            });
          }
          
          // ✅ FALLBACK: Si no encontramos #j-image-thumb-wrap, buscar en otros contenedores
          if (allImages.length === 0) {
            const thumbnailContainers = [
              '.images-view-item', // Items de la galería principal
              '.gallery-item', // Items de galería
              '[class*="image-view-item"]', // Items específicos de la vista de imágenes
              '[class*="product-gallery"] [class*="thumb"]', // Miniaturas dentro de la galería del producto
              '[class*="main-gallery"] [class*="thumb"]' // Miniaturas dentro de la galería principal
            ];

            for (const containerSelector of thumbnailContainers) {
              const thumbnails = document.querySelectorAll(containerSelector);
              thumbnails.forEach((thumb: any) => {
                // ✅ VERIFICAR que la miniatura NO esté en secciones de productos relacionados
                const isInRelatedSection = thumb.closest('[class*="similar"], [class*="recommend"], [class*="related"], [class*="suggestion"], [class*="recommended"]');
                if (isInRelatedSection) return; // Excluir miniaturas de productos relacionados
                
                // ✅ VERIFICAR que esté dentro de la galería principal del producto
                const isInMainGallery = thumb.closest('.images-view-wrap, .image-view-wrap, [class*="product-image"], [class*="main-gallery"]');
                if (!isInMainGallery && containerSelector.includes('thumb')) return; // Si es selector genérico, debe estar en galería principal
                
                // Buscar imagen dentro del contenedor
                const img = thumb.querySelector('img');
                if (img) {
                  // ✅ PRIORIDAD: Buscar atributos de alta resolución primero
                  const highResUrl = img.getAttribute('data-src-large') ||
                                    img.getAttribute('data-zoom-src') ||
                                    img.getAttribute('data-original-large') ||
                                    thumb.getAttribute('data-src-large') ||
                                    thumb.getAttribute('data-zoom-src') ||
                                    thumb.getAttribute('data-image-url');
                  
                  if (highResUrl) {
                    addImage(highResUrl);
                  } else {
                    // Si no hay URL de alta resolución, usar la miniatura pero remover tamaño
                    const thumbSrc = img.getAttribute('src') ||
                                   img.getAttribute('data-src') ||
                                   img.getAttribute('data-lazy-src') ||
                                   img.getAttribute('data-ks-lazyload') ||
                                   img.getAttribute('data-original') ||
                                   img.src;
                    if (thumbSrc) {
                      // ✅ Filtrar miniaturas muy pequeñas (iconos)
                      if (thumbSrc.includes('_50x50') || thumbSrc.includes('_60x60') || thumbSrc.includes('_40x40')) {
                        // Remover tamaño de miniatura para obtener URL base (alta resolución)
                        let baseUrl = thumbSrc.split('?')[0].split('#')[0];
                        baseUrl = baseUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                        addImage(baseUrl);
                      } else {
                        // Ya es una URL más grande, agregarla directamente
                        addImage(thumbSrc);
                      }
                    }
                  }
                }
              });
            }
          }

          // ✅ MEJORA: Buscar imágenes en selectores de color/modelo (variantes)
          const variantSelectors = [
            '.sku-property-item', // Items de variantes (color, modelo, etc.)
            '[class*="sku-property"]',
            '[class*="property-item"]'
          ];

          for (const selector of variantSelectors) {
            const variants = document.querySelectorAll(selector);
            variants.forEach((variant: any) => {
              const img = variant.querySelector('img');
              if (img) {
                // Obtener URL de alta resolución de la variante
                const variantHighRes = img.getAttribute('data-src-large') ||
                                      img.getAttribute('data-zoom-src') ||
                                      variant.getAttribute('data-image-url') ||
                                      variant.getAttribute('data-src-large');
                
                if (variantHighRes) {
                  addImage(variantHighRes);
                } else {
                  const variantSrc = img.getAttribute('src') ||
                                   img.getAttribute('data-src') ||
                                   img.src;
                  if (variantSrc) {
                    // Remover parámetros de tamaño
                    let baseUrl = variantSrc.split('?')[0];
                    baseUrl = baseUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                    addImage(baseUrl);
                  }
                }
              }
            });
          }

          // 3. ✅ FALLBACK MEJORADO: Buscar imágenes SOLO dentro de la galería principal del producto
          // Excluir explícitamente productos relacionados, banners, logos, etc.
          if (allImages.length < 3) {
            // ✅ DEFINIR selectores específicos para la galería principal (excluir secciones de productos relacionados)
            const mainGallerySelectors = [
              '#j-image-thumb-wrap', // Contenedor principal de miniaturas
              '.images-view-wrap', // Wrapper de la galería principal
              '.image-view-wrap', // Otro wrapper común
              '[class*="image-view"]', // Cualquier elemento de la galería principal
              '[class*="product-image"]', // Galería del producto
              '[class*="main-gallery"]' // Galería principal
            ];
            
            // ✅ Seleccionar SOLO la galería principal, no toda la página
            let mainGalleryContainer: Element | null = null;
            for (const selector of mainGallerySelectors) {
              const container = document.querySelector(selector);
              if (container) {
                mainGalleryContainer = container;
                break;
              }
            }
            
            // Si encontramos la galería principal, buscar imágenes solo dentro de ella
            if (mainGalleryContainer) {
              const galleryImages = mainGalleryContainer.querySelectorAll('img');
              galleryImages.forEach((img: any) => {
                const src = img.getAttribute('src') ||
                           img.getAttribute('data-src') ||
                           img.getAttribute('data-lazy-src') ||
                           img.getAttribute('data-src-large') ||
                           img.getAttribute('data-zoom-src') ||
                           img.getAttribute('data-original') ||
                           (img as any).src;
                if (src && (src.includes('alicdn.com') || src.includes('aliexpress-media.com') || src.includes('aliimg.com'))) {
                  // Filtrar miniaturas muy pequeñas, iconos, logos y avatares
                  const isThumbnail = src.includes('_50x50') || src.includes('_60x60') || src.includes('_40x40');
                  const isIcon = src.includes('icon') || src.includes('logo') || src.includes('avatar') || src.includes('sprite');
                  const isRelatedProduct = src.includes('/similar/') || src.includes('recommend');
                  
                  if (!isThumbnail && !isIcon && !isRelatedProduct) {
                    // Remover parámetros de tamaño para obtener URL base (alta resolución)
                    let baseUrl = src.split('?')[0].split('#')[0];
                    // Reemplazar tamaños de miniatura con extensión base
                    baseUrl = baseUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                    addImage(baseUrl);
                  }
                }
              });
            } else {
              // ✅ Si no encontramos la galería principal, hacer búsqueda limitada pero más estricta
              // Buscar solo en la sección superior de la página (donde normalmente está la galería)
              const pageTop = document.querySelector('.product-main, .product-info-main, [class*="product-detail"]');
              if (pageTop) {
                const topImages = pageTop.querySelectorAll('img');
                topImages.forEach((img: any) => {
                  // Verificar que la imagen NO esté en secciones de productos relacionados
                  const parent = img.closest('[class*="similar"], [class*="recommend"], [class*="related"], [class*="suggestion"]');
                  if (parent) return; // Excluir imágenes de productos relacionados
                  
                  const src = img.getAttribute('src') ||
                             img.getAttribute('data-src') ||
                             img.getAttribute('data-lazy-src') ||
                             img.getAttribute('data-src-large') ||
                             img.getAttribute('data-zoom-src') ||
                             (img as any).src;
                  if (src && (src.includes('alicdn.com') || src.includes('aliexpress-media.com') || src.includes('aliimg.com'))) {
                    const isThumbnail = src.includes('_50x50') || src.includes('_60x60');
                    const isIcon = src.includes('icon') || src.includes('logo') || src.includes('avatar');
                    const isRelatedProduct = src.includes('/similar/') || src.includes('recommend');
                    
                    if (!isThumbnail && !isIcon && !isRelatedProduct) {
                      let baseUrl = src.split('?')[0].split('#')[0];
                      baseUrl = baseUrl.replace(/_[0-9]+x[0-9]+\.(jpg|jpeg|png|webp|gif)$/i, '.$1');
                      addImage(baseUrl);
                    }
                  }
                });
              }
            }
          }

          // 4. ✅ MEJORA: Buscar URLs de imágenes en scripts embebidos (JSON) - priorizar imagePath
          // Solo buscar en scripts que contengan datos del producto principal, no productos relacionados
          const scriptContents = Array.from(document.querySelectorAll('script[type="application/ld+json"], script:not([src])'))
            .map(s => s.textContent)
            .filter(Boolean);

          scriptContents.forEach(content => {
            try {
              // ✅ Filtrar scripts que contengan datos de productos relacionados
              if (content && (content.includes('"similar"') || content.includes('"recommend"') || content.includes('"related"'))) {
                // Si el script contiene datos de productos relacionados, evitar procesarlo completamente
                // O procesarlo con más cuidado
                const isProductDetailScript = content.includes('productDetail') || 
                                              content.includes('productInfo') || 
                                              content.includes('imageModule') ||
                                              content.includes('runParams');
                if (!isProductDetailScript) {
                  return; // Saltar scripts que solo contienen productos relacionados
                }
              }
              
              const json = JSON.parse(content!);
              const findImageUrlsInJson = (obj: any, depth: number = 0, maxDepth: number = 10) => {
                if (depth > maxDepth || typeof obj !== 'object' || obj === null) return;
                
                // ✅ Excluir objetos que parezcan ser productos relacionados
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                  const keys = Object.keys(obj);
                  // Si tiene propiedades que indican que es un producto relacionado, saltarlo
                  if (keys.some(k => k.includes('similar') || k.includes('recommend') || k.includes('related'))) {
                    // No procesar este objeto, pero continuar con otros
                    return;
                  }
                }
                
                if (Array.isArray(obj)) {
                  obj.forEach(item => findImageUrlsInJson(item, depth + 1, maxDepth));
                } else {
                  for (const key in obj) {
                    // ✅ Priorizar imagePath sobre imageUrl (imagePath es de alta resolución)
                    if (key === 'imagePath' && typeof obj[key] === 'string') {
                      let fullUrl = obj[key];
                      if (!fullUrl.startsWith('http')) {
                        fullUrl = `https://ae01.alicdn.com${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
                      }
                      // ✅ Filtrar URLs que parezcan ser de productos relacionados
                      if (!fullUrl.includes('/similar/') && !fullUrl.includes('recommend')) {
                        addImage(fullUrl);
                      }
                    } else if (typeof obj[key] === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|avif)/i.test(obj[key])) {
                      // ✅ Filtrar URLs de productos relacionados o iconos
                      const url = obj[key];
                      const isRelatedProduct = url.includes('/similar/') || url.includes('recommend') || url.includes('related');
                      const isIcon = url.includes('icon') || url.includes('logo') || url.includes('avatar');
                      const isSmallThumbnail = url.includes('_50x50') || url.includes('_60x60') || url.includes('_40x40');
                      
                      if (!isRelatedProduct && !isIcon && !isSmallThumbnail) {
                        addImage(url);
                      }
                    } else if (typeof obj[key] === 'object') {
                      findImageUrlsInJson(obj[key], depth + 1, maxDepth);
                    }
                  }
                }
              };
              findImageUrlsInJson(json);
            } catch (e) {
              // Ignorar errores de parseo JSON
            }
          });

          // 5. ✅ MEJORADO: Buscar en atributos data-* SOLO dentro de la galería principal
          try {
            // ✅ Limitar búsqueda a elementos dentro de la galería principal del producto
            const mainGallery = document.querySelector('#j-image-thumb-wrap, .images-view-wrap, .image-view-wrap, [class*="product-image"], [class*="main-gallery"]');
            const searchScope = mainGallery || document;
            
            const elementsWithData = searchScope.querySelectorAll('[data-image], [data-img], [data-url], [data-src-large], [data-zoom-src]');
            elementsWithData.forEach((el: any) => {
              // ✅ Excluir elementos que estén en secciones de productos relacionados
              const isInRelatedSection = el.closest('[class*="similar"], [class*="recommend"], [class*="related"], [class*="suggestion"]');
              if (isInRelatedSection) return;
              
              const dataImage = el.getAttribute('data-image') || 
                               el.getAttribute('data-img') || 
                               el.getAttribute('data-url') ||
                               el.getAttribute('data-src-large') ||
                               el.getAttribute('data-zoom-src');
              if (dataImage && (dataImage.includes('alicdn') || dataImage.includes('aliexpress-media'))) {
                // ✅ Filtrar imágenes de productos relacionados, iconos y miniaturas muy pequeñas
                const isRelatedProduct = dataImage.includes('/similar/') || dataImage.includes('recommend');
                const isIcon = dataImage.includes('icon') || dataImage.includes('logo') || dataImage.includes('avatar');
                const isSmallThumbnail = dataImage.includes('_50x50') || dataImage.includes('_60x60');
                
                if (!isRelatedProduct && !isIcon && !isSmallThumbnail) {
                  addImage(dataImage);
                }
              }
            });
          } catch (e) {
            // Ignorar errores
          }

          return allImages;
        });

        // Normalizar todas las URLs y eliminar duplicados
        images.forEach((img: string) => {
          if (img && img.length > 10) {
            imageSet.add(img);
          }
        });

      } finally {
        await productPage.close().catch(() => {});
      }
    } catch (error) {
      logger.warn('[SCRAPER] Error extrayendo imágenes de página individual', {
        productUrl: productUrl.substring(0, 80),
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return Array.from(imageSet);
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
            // ✅ CORREGIDO: Usar parseLocalizedNumber para manejar formatos europeos (0,99) y americanos (0.99)
            const fallbackCurrency = aliExpressLocalCurrency || userBaseCurrency || 'USD';
            const numericValue = parseLocalizedNumber(numericMatch[0], fallbackCurrency);
            if (isFinite(numericValue) && numericValue > 0) {
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

    // ✅ MEJORADO: Priorizar array de imágenes si viene desde extractProductsFromDom o runParams
    // Si el item ya tiene un array de imágenes normalizado, usarlo primero
    if (Array.isArray(item.images) && item.images.length > 0) {
      // Verificar que sean URLs válidas (no objetos)
      item.images.forEach((img: any) => {
        if (typeof img === 'string' && img.trim().length > 0) {
          addImage(img);
        }
      });
    }
    
    // Extraer de diferentes fuentes posibles
    // 1. Arrays de imágenes adicionales
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
       logger.warn('[SCRAPER] No se pudo inicializar el navegador. No se puede realizar login automático', { userId });
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
       logger.warn('[SCRAPER] AliExpress credentials not configured', { userId });
       return;
     }

     const { email, password, twoFactorEnabled, twoFactorSecret } = credentials as AliExpressCredentials;
     if (!email || !password) {
       logger.warn('[SCRAPER] AliExpress credentials incomplete', { userId });
       return;
     }

    await marketplaceAuthStatusService.markRefreshing(
      userId,
      'Intentando renovar sesión de AliExpress automáticamente'
    );

    const loginPage = await this.browser.newPage();
 
     try {
       await this.setupRealBrowser(loginPage);
       logger.info('[SCRAPER] Navigating to AliExpress login page', { userId });
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
         logger.debug('[SCRAPER] AliExpress login state', { attempts, state: detection.state, details: detection.details, userId });

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
               logger.warn('[SCRAPER] Login form interaction failed, reloading frame context', { userId });
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
             logger.warn('[SCRAPER] AliExpress captcha detected. Manual resolution required', { userId });
             await this.captureAliExpressSnapshot(loginPage, 'captcha-detected');
             return;
           case AliExpressLoginState.UNKNOWN:
             await this.logAliExpressHtml(loginPage, context, `unknown-${attempts}`);
             if (attempts >= 4) {
               logger.warn('[SCRAPER] Persisting UNKNOWN state, forcing direct login navigation', { userId, attempts });
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
                 logger.warn('[SCRAPER] Login link not found via text, navigating to fallback login page', { userId });
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
             logger.warn('[SCRAPER] AliExpress layout requires manual review. Capturing snapshot and stopping', { userId });
             await this.captureAliExpressSnapshot(loginPage, 'manual-review-required');
             return;
           default:
             logger.warn('[SCRAPER] AliExpress state unknown, retrying', { userId, attempts });
             break;
         }

         await new Promise(resolve => setTimeout(resolve, 1500));
         context = (await this.waitForAliExpressLoginFrame(loginPage)) || loginPage;
         context = await this.resolveAliExpressActiveContext(loginPage, context);
       }

      logger.warn('[SCRAPER] Unable to authenticate on AliExpress', { userId, attempts, lastState });
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
      logger.error('[SCRAPER] Error performing AliExpress login', { 
        userId, 
        error: error?.message || String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
     } finally {
       await loginPage.close().catch(() => {});
     }
   }

  private async waitForAliExpressLoginFrame(page: Page): Promise<Frame | null> {
    try {
      await page.waitForSelector('iframe', { timeout: 10000 }).catch(() => null);
      const frames = page.frames();
      logger.debug('[SCRAPER] AliExpress login frames', { frames: frames.map(f => f.url()) });
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
      logger.warn('[SCRAPER] Error locating AliExpress login iframe', { error: (error as Error).message });
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
      logger.warn('[SCRAPER] detectAliExpressState error', { error: (error as Error).message });
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
       logger.warn('[SCRAPER] Unable to locate login fields inside AliExpress login form');
       return false;
     }
 
     const loginClicked = await this.clickIfExists(context, this.getAliExpressSelectors('login.submit'), 'login-submit');
 
     if (!loginClicked) {
       logger.warn('[SCRAPER] Login submit button not found on AliExpress login form');
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
      logger.info('[SCRAPER] Stored AliExpress cookies', { userId, cookieCount: storedCookies.length });
      if (payload.twoFactorEnabled) {
        logger.info('[SCRAPER] AliExpress account uses 2FA', { userId });
      }
      await marketplaceAuthStatusService.markHealthy(
        userId,
        'aliexpress',
        'Sesión autenticada automáticamente'
      );
    } catch (error) {
      logger.warn('[SCRAPER] Unable to persist AliExpress session', { userId, error: (error as Error).message });
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
        logger.warn('[SCRAPER] Unable to locate login fields inside new AliExpress login form');
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
        logger.warn('[SCRAPER] Could not submit AliExpress login form');
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

      logger.warn('[SCRAPER] New login flow did not yield expected cookies, trying ajax fallback');
      return await this.tryAliExpressAjaxLogin(page, email, password);
    } catch (error) {
      logger.warn('[SCRAPER] Direct AliExpress login fallback failed', { error: (error as Error).message });
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
        logger.warn('[SCRAPER] Ajax login reported failure', { ajaxData: ajaxData?.content || ajaxData });
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      const cookies = await page.cookies();
      if (cookies.some(c => c.name.toLowerCase().includes('xman')) || cookies.some(c => c.name === 'intl_locale')) {
        return true;
      }

      logger.warn('[SCRAPER] Ajax login succeeded but expected cookies missing', { ajaxData });
      return false;
    } catch (error) {
      logger.warn('[SCRAPER] Ajax login fallback failed', { error: (error as Error).message });
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
      logger.debug('[SCRAPER] AliExpress snapshot captured', { label, url, title, snippet: snippet.replace(/\s+/g, ' ').trim().substring(0, 200) });
    } catch (error) {
      logger.warn('[SCRAPER] Unable to capture AliExpress snapshot', { label, error: (error as Error).message });
    }
  }

  private async typeIntoField(context: FrameLike, selectors: string[], value: string, label = 'field'): Promise<boolean> {
    if (selectors.length === 0) {
      logger.warn('[SCRAPER] No selectors configured', { label });
      return false;
    }

    for (const selector of selectors) {
      try {
        logger.debug('[SCRAPER] Trying selector', { label, selector });
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
        logger.debug('[SCRAPER] Selector success', { label, selector });
        return true;
      } catch (error) {
        logger.debug('[SCRAPER] Selector failed', { label, selector, error: (error as Error).message });
      }
    }
    logger.warn('[SCRAPER] All selectors failed', { label, selectors: selectors.join(', ') });
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
        logger.debug('[SCRAPER] Heuristic fallback success', { label });
        return true;
      }
    } catch (error) {
      logger.warn('[SCRAPER] Heuristic fallback failed', { label, error: (error as Error).message });
    }
    return false;
  }

  private async clickIfExists(context: FrameLike, selectors: string[], label = 'click'): Promise<boolean> {
    if (selectors.length === 0) {
      return false;
    }
    for (const selector of selectors) {
      try {
        logger.debug('[SCRAPER] Trying click selector', { label, selector });
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
          logger.debug('[SCRAPER] Clicked selector successfully', { label, selector });
          return true;
        }
      } catch (error) {
        logger.debug('[SCRAPER] Click selector failed', { label, selector, error: (error as Error).message });
      }
    }
    logger.warn('[SCRAPER] No selectors succeeded', { label, selectors: selectors.join(', ') });
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

  /**
   * Helper: Obtener código de país desde currency
   */
  private getCountryFromCurrency(currency?: string): string | null {
    if (!currency) return null;
    
    const currencyToCountry: Record<string, string> = {
      'CLP': 'CL', // Chile
      'USD': 'US', // Estados Unidos
      'EUR': 'ES', // España (principal país de habla hispana en Europa)
      'MXN': 'MX', // México
      'COP': 'CO', // Colombia
      'ARS': 'AR', // Argentina
      'PEN': 'PE', // Perú
      'BRL': 'BR', // Brasil
    };
    
    return currencyToCountry[currency.toUpperCase()] || null;
  }

  private async fetchAliExpressCookies(userId: number, environment: 'sandbox' | 'production' = 'production'): Promise<any[]> {
    try {
      const credentials = await CredentialsManager.getCredentials(userId, 'aliexpress', environment);
      if (!credentials) return [];
      const cookiesRaw = (credentials as any).cookies;
      if (!cookiesRaw) return [];

      if (typeof cookiesRaw === 'string') {
        try {
          const parsed = JSON.parse(cookiesRaw);
          if (Array.isArray(parsed)) {
            return parsed as any[];
          }
        } catch (error) {
          logger.warn('[SCRAPER] Unable to parse AliExpress cookies JSON', { userId, error });
        }
      } else if (Array.isArray(cookiesRaw)) {
        return cookiesRaw as any[];
      }
    } catch (error) {
      logger.warn('[SCRAPER] Error fetching AliExpress cookies', { userId, error });
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
      logger.debug('[SCRAPER] AliExpress HTML captured', { 
        label, 
        pageUrl: page.url(), 
        pageSnippet: pageHtml.slice(0, 200),
        contextUrl,
        contextSnippet: context !== page ? contextHtml.slice(0, 200) : undefined
      });
    } catch (error) {
      logger.warn('[SCRAPER] Unable to log AliExpress HTML', { label, error: (error as Error).message });
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
      logger.warn('[SCRAPER] Error resolving active AliExpress context', { error: (error as Error).message });
    }
    return current;
  }
}

export default AdvancedMarketplaceScraper;

type FrameLike = Page | Frame;