import axios, { AxiosInstance } from 'axios';
import { AppError } from '../middleware/error.middleware';
import { URLSearchParams } from 'url';
import { retryMarketplaceOperation } from '../utils/retry.util';
import logger from '../config/logger';

export interface EbayCredentials {
  appId: string;
  devId: string;
  certId: string;
  token?: string;
  refreshToken?: string;
  sandbox: boolean;
}

export interface EbayProduct {
  title: string;
  description: string;
  categoryId: string;
  startPrice: number;
  buyItNowPrice?: number;
  quantity: number;
  condition: string;
  images: string[];
  shippingCost?: number;
  handlingTime?: number;
  returnPolicy?: string;
}

export interface EbayListingResponse {
  success: boolean;
  itemId?: string;
  listingUrl?: string;
  fees?: {
    insertionFee: number;
    finalValueFee: number;
  };
  error?: string;
}

export interface EBaySearchProduct {
  itemId: string;
  title: string;
  price: {
    value: string;
    currency: string;
  };
  condition: string;
  itemLocation: {
    country: string;
  };
  seller: {
    username: string;
    feedbackPercentage: string;
  };
  itemWebUrl: string;
  image: {
    imageUrl: string;
  };
  shippingOptions: Array<{
    shippingCost: {
      value: string;
      currency: string;
    };
    shippingServiceCode: string;
  }>;
  marketingPrice?: {
    originalPrice: {
      value: string;
      currency: string;
    };
    discountPercentage: string;
  };
}

export interface EBaySearchParams {
  keywords: string;
  categoryId?: string;
  filter?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  marketplace_id?: string;
}

export interface ArbitrageOpportunity {
  product: EBaySearchProduct;
  arbitrageScore: number;
  estimatedProfit: number;
  competitionLevel: 'low' | 'medium' | 'high';
  reasoning: string[];
  aiConfidence: number;
  trend: 'rising' | 'stable' | 'declining';
}

interface EbayServiceOptions {
  onCredentialsUpdate?: (creds: EbayCredentials & { sandbox: boolean }) => Promise<void>;
}

export class EbayService {
  private credentials?: EbayCredentials;
  private apiClient: AxiosInstance;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private onCredentialsUpdate?: EbayServiceOptions['onCredentialsUpdate'];

  constructor(credentials?: EbayCredentials, options: EbayServiceOptions = {}) {
    this.credentials = credentials;
    this.baseUrl = credentials?.sandbox 
      ? 'https://api.sandbox.ebay.com' 
      : 'https://api.ebay.com';
    this.onCredentialsUpdate = options.onCredentialsUpdate;
    
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        ...(credentials?.devId && { 'X-EBAY-API-DEV-NAME': credentials.devId }),
        ...(credentials?.appId && { 'X-EBAY-API-APP-NAME': credentials.appId }),
        ...(credentials?.certId && { 'X-EBAY-API-CERT-NAME': credentials.certId }),
      },
    });

    // Add request interceptor for authentication
    this.apiClient.interceptors.request.use((config) => {
      if (this.credentials?.token) {
        config.headers['Authorization'] = `Bearer ${this.credentials.token}`;
      }
      return config;
    });
  }

  private async persistUpdatedCredentials(): Promise<void> {
    if (!this.credentials || !this.onCredentialsUpdate) {
      return;
    }

    try {
      await this.onCredentialsUpdate({
        ...this.credentials,
        sandbox: !!this.credentials.sandbox,
      });
    } catch (error) {
      logger.warn('Failed to persist updated eBay credentials after token refresh', {
        error: (error as Error).message,
      });
    }
  }

  private async ensureAccessToken(force = false): Promise<void> {
    if (!this.credentials) {
      throw new AppError('eBay credentials not configured', 400);
    }

    const now = new Date();
    if (!force && this.credentials.token && this.tokenExpiry && this.tokenExpiry > now) {
      return;
    }

    if (this.credentials.refreshToken) {
      const { token, expiresIn } = await this.refreshAccessToken();
      this.credentials.token = token;
      this.accessToken = token;
      this.tokenExpiry = new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000);
      await this.persistUpdatedCredentials();
      return;
    }

    if (!this.credentials.token) {
      throw new AppError('Falta token OAuth de eBay. Reautoriza en Settings → API Settings → eBay.', 400);
    }
  }

  private async withAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureAccessToken();
      return await operation();
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.errors?.[0]?.message || error.message;

      if (status === 401 || /token/i.test(message)) {
        logger.warn('eBay API reported authentication error, attempting token refresh', {
          status,
          message,
        });
        await this.ensureAccessToken(true);
        return await operation();
      }

      throw error;
    }
  }

  /**
   * Create EbayService from environment variables (useful for server-side jobs/tests)
   */
  static fromEnv(): EbayService | null {
    const appId = process.env.EBAY_APP_ID;
    const devId = process.env.EBAY_DEV_ID;
    const certId = process.env.EBAY_CERT_ID;
    if (!appId || !devId || !certId) return null;
    const token = process.env.EBAY_OAUTH_TOKEN;
    const refreshToken = process.env.EBAY_REFRESH_TOKEN;
    return new EbayService({ appId, devId, certId, token, refreshToken, sandbox: false });
  }

  /**
   * Get eBay authentication URL for OAuth flow
   */
  getAuthUrl(redirectUri: string, scopes: string[] = ['sell.inventory.readonly', 'sell.inventory', 'sell.marketing.readonly', 'sell.marketing']): string {
    if (!this.credentials) {
      throw new Error('eBay credentials not configured');
    }
    
    // Limpiar el redirectUri - remover espacios al inicio y final
    // NO modificar el contenido interno porque eBay requiere coincidencia exacta
    const cleanRedirectUri = redirectUri.trim();
    
    // Logging para debugging
    logger.info('[EbayService] Generating OAuth URL', {
      sandbox: this.credentials.sandbox,
      appId: this.credentials.appId.substring(0, 20) + '...',
      redirectUri: cleanRedirectUri,
      redirectUriLength: cleanRedirectUri.length,
      scopes: scopes.join(' '),
    });
    
    // Construir URL manualmente para tener control total sobre la codificación
    // eBay requiere que redirect_uri coincida EXACTAMENTE con el registrado
    const authBase = this.credentials.sandbox 
      ? 'https://auth.sandbox.ebay.com/oauth2/authorize' 
      : 'https://auth.ebay.com/oauth2/authorize';
    
    // ✅ CORRECCIÓN: Verificar si el redirectUri necesita codificación
    // eBay RuName típicamente solo contiene: letras, números, guiones (-), guiones bajos (_)
    // Si tiene estos caracteres, NO codificar (eBay lo espera sin codificar)
    // Solo codificar si tiene caracteres que realmente requieren codificación URL
    const needsEncoding = /[^a-zA-Z0-9\-_.]/.test(cleanRedirectUri);
    const encodedRedirectUri = needsEncoding ? encodeURIComponent(cleanRedirectUri) : cleanRedirectUri;
    
    // Usar encodeURIComponent para cada parámetro individualmente
    // Esto asegura que caracteres especiales se codifiquen correctamente
    const params = [
      `client_id=${encodeURIComponent(this.credentials.appId)}`,
      `redirect_uri=${encodedRedirectUri}`, // Codificar solo si es necesario
      `response_type=${encodeURIComponent('code')}`,
      `scope=${encodeURIComponent(scopes.join(' '))}`,
      `state=${encodeURIComponent('state_' + Date.now())}`,
    ].join('&');
    
    const finalUrl = `${authBase}?${params}`;
    
    // Logging para debugging
    logger.debug('[EbayService] Redirect URI encoding decision', {
      redirectUri: cleanRedirectUri.substring(0, 30) + '...',
      needsEncoding,
      encoded: encodedRedirectUri.substring(0, 30) + '...',
    });
    
    // Logging de la URL final (solo primeros caracteres por seguridad)
    // Extraer parámetros de la URL para logging
    const urlForLogging = new URL(finalUrl);
    const paramsForLogging = urlForLogging.searchParams;
    
    logger.debug('[EbayService] Generated OAuth URL', {
      urlPreview: finalUrl.substring(0, 150) + '...',
      urlLength: finalUrl.length,
      hasClientId: paramsForLogging.has('client_id'),
      hasRedirectUri: paramsForLogging.has('redirect_uri'),
      redirectUriValue: paramsForLogging.get('redirect_uri')?.substring(0, 50) + '...',
    });
    
    return finalUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{ token: string; refreshToken: string; expiresIn: number }> {
    const tokenUrl = `${this.baseUrl}/identity/v1/oauth2/token`;
    
    logger.info('[EbayService] Exchanging authorization code for token', {
      service: 'ebay',
      sandbox: this.credentials?.sandbox,
      codeLength: code.length,
      redirectUriLength: redirectUri.length,
      redirectUriPreview: redirectUri.substring(0, 50) + '...',
      tokenUrl
    });
    
    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${this.credentials.appId}:${this.credentials.certId}`).toString('base64')}`,
          },
        }
      );

      logger.info('[EbayService] Token exchange successful', {
        service: 'ebay',
        sandbox: this.credentials?.sandbox,
        hasAccessToken: !!response.data.access_token,
        accessTokenLength: response.data.access_token?.length || 0,
        hasRefreshToken: !!response.data.refresh_token,
        refreshTokenLength: response.data.refresh_token?.length || 0,
        expiresIn: response.data.expires_in
      });

      return {
        token: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      const errorData = error.response?.data || {};
      const errorDescription = errorData.error_description || errorData.error || error.message;
      const errorCode = errorData.error || 'unknown_error';
      const statusCode = error.response?.status || 400;
      
      logger.error('[EbayService] Token exchange failed', {
        service: 'ebay',
        sandbox: this.credentials?.sandbox,
        error: errorDescription,
        errorCode,
        statusCode,
        errorResponse: errorData,
        redirectUriLength: redirectUri.length,
        redirectUriPreview: redirectUri.substring(0, 50) + '...'
      });
      
      throw new AppError(`eBay OAuth error: ${errorDescription}`, statusCode);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<{ token: string; expiresIn: number }> {
    if (!this.credentials.refreshToken) {
      throw new AppError('No refresh token available', 400);
    }

    try {
      // ✅ Usar retry para refresh token (crítico para mantener sesión)
      const result = await retryMarketplaceOperation(
        () => axios.post(
          `${this.baseUrl}/identity/v1/oauth2/token`,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.credentials.refreshToken!,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${this.credentials.appId}:${this.credentials.certId}`).toString('base64')}`,
          },
        }),
        'ebay',
        {
          maxRetries: 3,
          initialDelay: 2000,
          onRetry: (attempt, error, delay) => {
            logger.warn(`Retrying refreshAccessToken for eBay (attempt ${attempt})`, {
              error: error.message,
              delay,
            });
          },
        }
      );

      if (!result.success || !result.data) {
        throw new AppError(`Failed to refresh token after retries: ${result.error?.message || 'Unknown error'}`, 401);
      }

      const response = result.data;
      return {
        token: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      throw new AppError(`eBay token refresh error: ${error.response?.data?.error_description || error.message}`, 400);
    }
  }

  /**
   * Create or update inventory item
   */
  async createInventoryItem(sku: string, product: EbayProduct): Promise<any> {
    try {
      return await this.withAuthRetry(async () => {
        const inventoryData = {
          availability: {
            shipToLocationAvailability: {
              quantity: product.quantity,
            },
          },
          condition: product.condition || 'NEW',
          product: {
            title: product.title,
            description: product.description,
            imageUrls: product.images,
            aspects: {
              Brand: ['Generic'],
              Type: ['Product'],
            },
          },
        };

        const response = await this.apiClient.put(`/sell/inventory/v1/inventory_item/${sku}`, inventoryData);
        return response.data;
      });
    } catch (error: any) {
      throw new AppError(`eBay inventory creation error: ${error.response?.data?.errors?.[0]?.message || error.message}`, 400);
    }
  }

  /**
   * Create eBay listing from inventory item
   */
  async createListing(sku: string, product: EbayProduct): Promise<EbayListingResponse> {
    try {
      return await this.withAuthRetry(async () => {
        // First create inventory item
        await this.createInventoryItem(sku, product);

        const listingData = {
          categoryId: product.categoryId,
          merchantLocationKey: 'default_location',
          pricingSummary: {
            price: {
              currency: 'USD',
              value: product.startPrice.toString(),
            },
          },
          quantityLimitPerBuyer: 10,
          listingPolicies: {
            fulfillmentPolicyId: 'default_fulfillment',
            paymentPolicyId: 'default_payment',
            returnPolicyId: 'default_return',
          },
          ...(product.buyItNowPrice && {
            pricingSummary: {
              price: {
                currency: 'USD',
                value: product.buyItNowPrice.toString(),
              },
            },
          }),
        };

        const result = await retryMarketplaceOperation(
          async () => {
            const response = await this.apiClient.post(`/sell/inventory/v1/inventory_item/${sku}/offer`, listingData);
            const publishResponse = await this.apiClient.post(`/sell/inventory/v1/offer/${response.data.offerId}/publish`);
            return { publishResponse };
          },
          'ebay',
          {
            maxRetries: 3,
            onRetry: (attempt, error, delay) => {
              logger.warn(`Retrying createListing for eBay (attempt ${attempt})`, {
                sku,
                error: error.message,
                delay,
              });
            },
          }
        );

        if (!result.success || !result.data) {
          throw new AppError(`Failed to create eBay listing after retries: ${result.error?.message || 'Unknown error'}`, 400);
        }

        const { publishResponse } = result.data;

        return {
          success: true,
          itemId: publishResponse.data.listingId,
          listingUrl: `https://www.ebay.com/itm/${publishResponse.data.listingId}`,
          fees: {
            insertionFee: 0,
            finalValueFee: 0,
          },
        };
      });
    } catch (error: any) {
      throw new AppError(`eBay listing creation error: ${error.response?.data?.errors?.[0]?.message || error.message}`, 400);
    }
  }

  /**
   * Get eBay categories
   */
  async getCategories(parentId?: string): Promise<any[]> {
    try {
      return await this.withAuthRetry(async () => {
        const params = new URLSearchParams({
          CategorySiteID: '0',
          DetailLevel: 'ReturnAll',
          ...(parentId && { CategoryParent: parentId }),
        });

        const result = await retryMarketplaceOperation(
          () => this.apiClient.get(`/ws/api.dll?callname=GetCategories&${params.toString()}`),
          'ebay',
          {
            maxRetries: 2,
            onRetry: (attempt, error, delay) => {
              logger.warn(`Retrying getCategories for eBay (attempt ${attempt})`, {
                parentId,
                error: error.message,
                delay,
              });
            },
          }
        );

        if (!result.success || !result.data) {
          throw new AppError(`Failed to get categories after retries: ${result.error?.message || 'Unknown error'}`, 400);
        }

        const response = result.data;
        return response.data.CategoryArray?.Category || [];
      });
    } catch (error: any) {
      throw new AppError(`eBay categories fetch error: ${error.message}`, 400);
    }
  }

  /**
   * Get suggested category for a product
   */
  async suggestCategory(productTitle: string): Promise<string> {
    try {
      return await this.withAuthRetry(async () => {
        const result = await retryMarketplaceOperation(
          () => this.apiClient.get(`/commerce/taxonomy/v1/category_tree/0/get_category_suggestions`, {
            params: { q: productTitle },
          }),
          'ebay',
          {
            maxRetries: 2,
            onRetry: (attempt, error, delay) => {
              logger.warn(`Retrying suggestCategory for eBay (attempt ${attempt})`, {
                productTitle,
                error: error.message,
                delay,
              });
            },
          }
        );

        if (!result.success || !result.data) {
          throw new AppError(`Failed to get category suggestions after retries: ${result.error?.message || 'Unknown error'}`, 400);
        }

        const response = result.data;
        const suggestions = response.data.suggestions || [];
        return suggestions[0]?.category?.categoryId || '267';
      });
    } catch (error: any) {
      throw new AppError(`eBay category suggestion error: ${error.message}`, 400);
    }
  }

  /**
   * Update listing price on eBay
   * Uses Inventory API to update the offer price
   */
  async updateListingPrice(offerId: string, newPrice: number, currency: string = 'USD'): Promise<boolean> {
    try {
      return await this.withAuthRetry(async () => {
        // Get current offer details
        const offerResponse = await this.apiClient.get(`/sell/inventory/v1/offer/${offerId}`);
        const currentOffer = offerResponse.data;

        // Update pricing summary
        const updateData = {
          pricingSummary: {
            price: {
              currency,
              value: newPrice.toString(),
            },
          },
        };

        // Update the offer
        await retryMarketplaceOperation(
          async () => {
            await this.apiClient.put(`/sell/inventory/v1/offer/${offerId}`, {
              ...currentOffer,
              ...updateData,
            });
          },
          'ebay',
          {
            maxRetries: 3,
            onRetry: (attempt, error, delay) => {
              logger.warn(`Retrying updateListingPrice for eBay (attempt ${attempt})`, {
                offerId,
                error: error.message,
                delay,
              });
            },
          }
        );

        logger.info('eBay listing price updated successfully', { offerId, newPrice, currency });
        return true;
      });
    } catch (error: any) {
      logger.error('Failed to update eBay listing price', {
        offerId,
        newPrice,
        error: error.message,
        stack: error.stack,
      });
      throw new AppError(
        `eBay price update error: ${error.response?.data?.errors?.[0]?.message || error.message}`,
        400
      );
    }
  }

  /**
   * Update inventory quantity
   */
  async updateInventoryQuantity(sku: string, quantity: number): Promise<void> {
    try {
      await this.apiClient.put(`/sell/inventory/v1/inventory_item/${sku}`, {
        availability: {
          shipToLocationAvailability: {
            quantity,
          },
        },
      });
    } catch (error: any) {
      throw new AppError(`eBay inventory update error: ${error.response?.data?.errors?.[0]?.message || error.message}`, 400);
    }
  }

  /**
   * End/Delete eBay listing
   */
  async endListing(itemId: string, reason: string = 'NotAvailable'): Promise<void> {
    try {
      await this.apiClient.post(`/sell/inventory/v1/offer/${itemId}/withdraw`, {
        reason,
      });
    } catch (error: any) {
      throw new AppError(`eBay listing end error: ${error.response?.data?.errors?.[0]?.message || error.message}`, 400);
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get('/sell/account/v1/account');
      return response.data;
    } catch (error: any) {
      throw new AppError(`eBay account info error: ${error.response?.data?.errors?.[0]?.message || error.message}`, 400);
    }
  }

  /**
   * Test connection with current credentials
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // ✅ Si no hay token OAuth, no es un error crítico (aún se pueden guardar credenciales)
      if (!this.accessToken && !this.credentials.token) {
        return { 
          success: false, 
          message: 'OAuth token required. Complete OAuth authorization first. This is normal if you just saved credentials.' 
        };
      }

      await this.getAccountInfo();
      return { success: true, message: 'eBay connection successful' };
    } catch (error: any) {
      // ✅ Si es "Resource not found", puede ser normal en Sandbox o si la cuenta no tiene seller profile configurado
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
      
      if (errorMessage.includes('Resource not found') || errorMessage.includes('not found')) {
        // En Sandbox, esto puede ser normal - las cuentas de prueba pueden no tener todos los recursos
        if (this.credentials.sandbox) {
          return { 
            success: false, 
            message: 'Account info not available (common in Sandbox). Credentials saved successfully. Complete OAuth to use eBay API.' 
          };
        }
      }
      
      return { success: false, message: errorMessage };
    }
  }

  // ============= NUEVOS MÉTODOS PARA PRODUCCIÓN REAL =============

  /**
   * Obtener token de acceso OAuth 2.0
   */
  async getOAuthToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const tokenUrl = this.credentials.sandbox
        ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
        : 'https://api.ebay.com/identity/v1/oauth2/token';

      const credentials = Buffer.from(`${this.credentials.appId}:${this.credentials.certId}`).toString('base64');
      
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('scope', 'https://api.ebay.com/oauth/api_scope');

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
      
      return this.accessToken;
    } catch (error: any) {
      logger.error('Error getting eBay OAuth token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError('Failed to authenticate with eBay API', 401);
    }
  }

  /**
   * Buscar productos para oportunidades de arbitraje
   */
  async searchProductsForArbitrage(searchParams: EBaySearchParams): Promise<{
    products: EBaySearchProduct[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const token = await this.getOAuthToken();
      
      const url = `${this.baseUrl}/buy/browse/v1/item_summary/search`;
      
      const params: any = {
        q: searchParams.keywords,
        limit: searchParams.limit || 50,
        offset: searchParams.offset || 0,
      };

      if (searchParams.categoryId) {
        params.category_ids = searchParams.categoryId;
      }

      if (searchParams.filter) {
        params.filter = searchParams.filter;
      }

      if (searchParams.sort) {
        params.sort = searchParams.sort;
      }

      const response = await axios.get(url, {
        params,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': searchParams.marketplace_id || 'EBAY_US',
        },
      });

      const data = response.data;
      
      return {
        products: data.itemSummaries || [],
        totalCount: data.total || 0,
        hasMore: (data.offset + data.limit) < data.total,
      };
    } catch (error: any) {
      logger.error('Error searching eBay products for arbitrage', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError('Failed to search products on eBay', 400);
    }
  }

  /**
   * Analizar oportunidades de arbitraje con IA
   */
  async analyzeArbitrageOpportunities(keywords: string): Promise<ArbitrageOpportunity[]> {
    try {
      // Buscar productos con filtros optimizados para arbitraje
      const searchResult = await this.searchProductsForArbitrage({
        keywords,
        filter: 'conditions:{NEW},deliveryOptions:{FREE_SHIPPING}',
        sort: 'price',
        limit: 100,
      });

      const opportunities = searchResult.products.map(product => {
        return this.calculateArbitrageScore(product);
      });

      // Ordenar por score y retornar los mejores
      return opportunities
        .filter(opp => opp.arbitrageScore > 40) // Solo oportunidades prometedoras
        .sort((a, b) => b.arbitrageScore - a.arbitrageScore)
        .slice(0, 20); // Top 20 oportunidades
        
    } catch (error: any) {
      logger.error('Error analyzing arbitrage opportunities', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError('Failed to analyze arbitrage opportunities', 400);
    }
  }

  /**
   * Calcular score de arbitraje para un producto
   */
  private calculateArbitrageScore(product: EBaySearchProduct): ArbitrageOpportunity {
    const price = parseFloat(product.price.value);
    const hasDiscount = product.marketingPrice?.discountPercentage;
    const discountPercentage = hasDiscount ? parseFloat(product.marketingPrice!.discountPercentage) : 0;
    
    let arbitrageScore = 0;
    let estimatedProfit = 0;
    let aiConfidence = 50;
    const reasoning: string[] = [];
    
    // Factor precio (0-30 puntos)
    if (price > 10 && price < 100) {
      arbitrageScore += 25;
      reasoning.push('Precio en rango óptimo para reventa');
    } else if (price >= 100 && price < 300) {
      arbitrageScore += 20;
      reasoning.push('Precio moderado, buen potencial');
    } else if (price < 10) {
      arbitrageScore += 5;
      reasoning.push('Precio muy bajo, margen limitado');
    }
    
    // Factor descuento (0-25 puntos)
    if (discountPercentage > 50) {
      arbitrageScore += 25;
      estimatedProfit += price * 0.25;
      reasoning.push(`Descuento excelente (${discountPercentage}%)`);
    } else if (discountPercentage > 30) {
      arbitrageScore += 20;
      estimatedProfit += price * 0.18;
      reasoning.push(`Buen descuento (${discountPercentage}%)`);
    } else if (discountPercentage > 15) {
      arbitrageScore += 10;
      estimatedProfit += price * 0.12;
      reasoning.push(`Descuento moderado (${discountPercentage}%)`);
    }
    
    // Factor seller (0-20 puntos)
    const feedbackPercentage = parseFloat(product.seller.feedbackPercentage || '0');
    if (feedbackPercentage > 99) {
      arbitrageScore += 20;
      aiConfidence += 15;
      reasoning.push('Vendedor excelente (99%+ feedback)');
    } else if (feedbackPercentage > 95) {
      arbitrageScore += 15;
      aiConfidence += 10;
      reasoning.push('Vendedor confiable (95%+ feedback)');
    } else if (feedbackPercentage > 90) {
      arbitrageScore += 10;
      reasoning.push('Vendedor aceptable (90%+ feedback)');
    } else {
      aiConfidence -= 20;
      reasoning.push('Vendedor con bajo rating, riesgo alto');
    }
    
    // Factor shipping (0-15 puntos)
    const freeShipping = product.shippingOptions?.some(option => 
      parseFloat(option.shippingCost?.value || '999') === 0
    );
    if (freeShipping) {
      arbitrageScore += 15;
      reasoning.push('Envío gratuito incluido');
    } else {
      arbitrageScore += 5;
      reasoning.push('Shipping cost a considerar');
    }

    // Factor título/SEO (0-10 puntos)
    const titleLength = product.title.length;
    const hasNumbers = /\d/.test(product.title);
    const hasBrand = /\b(Apple|Samsung|Nike|Adidas|Sony|LG|Canon|Nikon)\b/i.test(product.title);
    
    if (titleLength > 50 && hasNumbers && hasBrand) {
      arbitrageScore += 10;
      reasoning.push('Título SEO optimizado con marca conocida');
    } else if (titleLength > 30) {
      arbitrageScore += 5;
      reasoning.push('Título decente para SEO');
    }

    // Determinar nivel de competencia
    let competitionLevel: 'low' | 'medium' | 'high' = 'medium';
    if (arbitrageScore > 70) {
      competitionLevel = 'low';
      aiConfidence += 10;
    } else if (arbitrageScore < 40) {
      competitionLevel = 'high';
      aiConfidence -= 10;
    }

    // Determinar tendencia (simplificado por ahora)
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    if (discountPercentage > 30) {
      trend = 'declining'; // Muchos descuentos = sobrestock
    } else if (arbitrageScore > 60) {
      trend = 'rising'; // Buena oportunidad = demanda creciente
    }

    // Asegurar que aiConfidence esté en rango válido
    aiConfidence = Math.max(10, Math.min(99, aiConfidence));

    return {
      product,
      arbitrageScore,
      estimatedProfit: Math.max(0, estimatedProfit),
      competitionLevel,
      reasoning,
      aiConfidence,
      trend,
    };
  }

  /**
   * Obtener productos trending por categoría
   */
  async getTrendingProducts(categoryId?: string, limit: number = 50): Promise<EBaySearchProduct[]> {
    try {
      const searchResult = await this.searchProductsForArbitrage({
        keywords: '',
        categoryId,
        sort: 'newlyListed',
        limit,
      });

      return searchResult.products;
    } catch (error: any) {
      logger.error('Error getting trending products', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError('Failed to get trending products from eBay', 400);
    }
  }

  /**
   * Verificar disponibilidad y precio actual de un producto
   */
  async checkProductAvailability(itemId: string): Promise<{
    available: boolean;
    currentPrice: number;
    priceChange: number;
    lastUpdated: Date;
    stockLevel?: number;
  }> {
    try {
      const token = await this.getOAuthToken();
      
      const url = `${this.baseUrl}/buy/browse/v1/item/${itemId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      });

      const product = response.data;
      
      return {
        available: product.availableQuantity > 0,
        currentPrice: parseFloat(product.price.value),
        priceChange: 0, // Necesitaríamos historial de precios
        lastUpdated: new Date(),
        stockLevel: product.availableQuantity,
      };
    } catch (error: any) {
      return {
        available: false,
        currentPrice: 0,
        priceChange: 0,
        lastUpdated: new Date(),
        stockLevel: 0,
      };
    }
  }

  /**
   * Buscar productos competidores para un título dado
   */
  async findCompetitors(productTitle: string): Promise<Array<{
    product: EBaySearchProduct;
    similarityScore: number;
    priceComparison: 'higher' | 'lower' | 'similar';
  }>> {
    try {
      // Extraer keywords principales del título
      const keywords = productTitle
        .split(' ')
        .filter(word => word.length > 3)
        .slice(0, 5) // Primeras 5 palabras clave
        .join(' ');

      const searchResult = await this.searchProductsForArbitrage({
        keywords,
        sort: 'price',
        limit: 20,
      });

      const basePrice = 0; // Necesitaríamos el precio de referencia
      
      return searchResult.products.map(product => {
        const productPrice = parseFloat(product.price.value);
        
        // Calcular similaridad básica (por ahora simple)
        const similarityScore = this.calculateTitleSimilarity(productTitle, product.title);
        
        let priceComparison: 'higher' | 'lower' | 'similar' = 'similar';
        if (basePrice > 0) {
          const priceDiff = Math.abs(productPrice - basePrice) / basePrice;
          if (priceDiff > 0.15) {
            priceComparison = productPrice > basePrice ? 'higher' : 'lower';
          }
        }

        return {
          product,
          similarityScore,
          priceComparison,
        };
      })
      .filter(comp => comp.similarityScore > 0.3) // Solo competidores relevantes
      .sort((a, b) => b.similarityScore - a.similarityScore);

    } catch (error: any) {
      logger.error('Error finding competitors', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new AppError('Failed to find competitors on eBay', 400);
    }
  }

  /**
   * Calcular similaridad entre títulos (algoritmo simple)
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.toLowerCase().split(' ').filter(w => w.length > 2);
    const words2 = title2.toLowerCase().split(' ').filter(w => w.length > 2);
    
    const commonWords = words1.filter(word => 
      words2.some(w2 => w2.includes(word) || word.includes(w2))
    );
    
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * Browse API: search products by keywords
   * Doc: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
   */
  async searchProducts(params: EBaySearchParams): Promise<EBaySearchProduct[]> {
    // Ensure token
    if (!this.credentials.token && this.credentials.refreshToken) {
      await this.refreshAccessToken().catch(() => undefined);
    }
    if (!this.credentials.token) {
      throw new AppError('Missing eBay OAuth token', 400);
    }

    const marketplaceId = params.marketplace_id || 'EBAY_US';
    const q = new URLSearchParams();
    q.set('q', params.keywords);
    if (params.categoryId) q.set('category_ids', params.categoryId);
    if (params.sort) q.set('sort', params.sort);
    q.set('limit', String(Math.min(Math.max(params.limit ?? 20, 1), 50)));
    if (params.offset) q.set('offset', String(params.offset));

    const url = `/buy/browse/v1/item_summary/search?${q.toString()}`;

    const { data } = await this.apiClient.get(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      },
    });

    const items = (data?.itemSummaries || []) as any[];
    const mapped: EBaySearchProduct[] = items.map((it) => ({
      itemId: it.itemId,
      title: it.title,
      price: { value: String(it.price?.value ?? '0'), currency: it.price?.currency || 'USD' },
      condition: it.condition || 'UNKNOWN',
      itemLocation: { country: it.itemLocation?.country || 'US' },
      seller: { username: it.seller?.username || 'unknown', feedbackPercentage: String(it.seller?.feedbackPercentage || '0') },
      itemWebUrl: it.itemWebUrl,
      image: { imageUrl: it.image?.imageUrl || '' },
      shippingOptions: (it.shippingOptions || []).map((s: any) => ({ shippingCost: { value: String(s.shippingCost?.value || '0'), currency: s.shippingCost?.currency || 'USD' }, shippingServiceCode: s.shippingServiceCode || '' })),
      marketingPrice: it.marketingPrice ? { originalPrice: { value: String(it.marketingPrice?.originalPrice?.value || '0'), currency: it.marketingPrice?.originalPrice?.currency || 'USD' }, discountPercentage: String(it.marketingPrice?.discountPercentage || '0') } : undefined,
    }));

    return mapped;
  }
}

export default EbayService;
