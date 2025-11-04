import axios, { AxiosInstance } from 'axios';
import { AppError } from '../middleware/error.middleware';

export interface MercadoLibreCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  siteId: string; // MLM (México), MLA (Argentina), MLB (Brasil), etc.
}

export interface MLProduct {
  title: string;
  description: string;
  categoryId: string;
  price: number;
  quantity: number;
  condition: string;
  images: string[];
  attributes?: Array<{
    id: string;
    value: string | number;
  }>;
  shipping?: {
    mode: string;
    cost?: number;
    freeShipping?: boolean;
  };
}

export interface MLListingResponse {
  itemId: string;
  permalink: string;
  status: string;
}

export class MercadoLibreService {
  private credentials: MercadoLibreCredentials;
  private apiClient: AxiosInstance;
  private baseUrl = 'https://api.mercadolibre.com';

  constructor(credentials: MercadoLibreCredentials) {
    this.credentials = credentials;
    
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.apiClient.interceptors.request.use((config) => {
      if (this.credentials.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
      }
      return config;
    });
  }

  /**
   * Get MercadoLibre authentication URL for OAuth flow
   */
  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
    });

    return `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: string;
    expiresIn: number;
  }> {
    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        userId: response.data.user_id,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      throw new AppError(`MercadoLibre OAuth error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
    if (!this.credentials.refreshToken) {
      throw new AppError('No refresh token available', 400);
    }

    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        grant_type: 'refresh_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
      });

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      throw new AppError(`MercadoLibre token refresh error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Create MercadoLibre listing
   */
  async createListing(product: MLProduct): Promise<MLListingResponse> {
    if (!this.credentials.accessToken || !this.credentials.userId) {
      throw new AppError('MercadoLibre authentication required', 401);
    }

    try {
      const listingData = {
        title: product.title,
        category_id: product.categoryId,
        price: product.price,
        currency_id: this.getSiteCurrency(this.credentials.siteId),
        available_quantity: product.quantity,
        condition: product.condition,
        listing_type_id: 'gold_special', // Can be gold_special, gold_pro, etc.
        description: {
          plain_text: product.description,
        },
        pictures: product.images.map(url => ({ source: url })),
        ...(product.attributes && { attributes: product.attributes }),
        ...(product.shipping && {
          shipping: {
            mode: product.shipping.mode || 'me2',
            local_pick_up: true,
            free_shipping: product.shipping.freeShipping || false,
            ...(product.shipping.cost && { cost: product.shipping.cost }),
          },
        }),
      };

      const response = await this.apiClient.post('/items', listingData);
      
      return {
        itemId: response.data.id,
        permalink: response.data.permalink,
        status: response.data.status,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.cause?.[0]?.message || 
                          error.message;
      throw new AppError(`MercadoLibre listing error: ${errorMessage}`, 400);
    }
  }

  /**
   * Get categories for site
   */
  async getCategories(siteId?: string): Promise<any[]> {
    const site = siteId || this.credentials.siteId;
    
    try {
      const response = await this.apiClient.get(`/sites/${site}/categories`);
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre categories error: ${error.message}`, 400);
    }
  }

  /**
   * Predict category for a product
   */
  async predictCategory(title: string, siteId?: string): Promise<string> {
    const site = siteId || this.credentials.siteId;
    
    try {
      const response = await this.apiClient.get(`/sites/${site}/category_predictor/predict`, {
        params: { title },
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      return 'MLA1051'; // Default to "Otros" category for Argentina
    } catch (error: any) {
      console.warn('MercadoLibre category prediction failed, using default:', error.message);
      return 'MLA1051'; // Default category
    }
  }

  /**
   * Get category attributes
   */
  async getCategoryAttributes(categoryId: string): Promise<any[]> {
    try {
      const response = await this.apiClient.get(`/categories/${categoryId}/attributes`);
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre category attributes error: ${error.message}`, 400);
    }
  }

  /**
   * Update listing quantity
   */
  async updateListingQuantity(itemId: string, quantity: number): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        available_quantity: quantity,
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre quantity update error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Update listing price
   */
  async updateListingPrice(itemId: string, price: number): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        price,
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre price update error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Pause/Close listing
   */
  async pauseListing(itemId: string): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        status: 'paused',
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre pause listing error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Close listing
   */
  async closeListing(itemId: string): Promise<void> {
    try {
      await this.apiClient.put(`/items/${itemId}`, {
        status: 'closed',
      });
    } catch (error: any) {
      throw new AppError(`MercadoLibre close listing error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get user information
   */
  async getUserInfo(): Promise<any> {
    if (!this.credentials.userId) {
      throw new AppError('User ID required', 400);
    }

    try {
      const response = await this.apiClient.get(`/users/${this.credentials.userId}`);
      return response.data;
    } catch (error: any) {
      throw new AppError(`MercadoLibre user info error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get user's listings
   */
  async getUserListings(status?: string, limit: number = 50): Promise<any[]> {
    if (!this.credentials.userId) {
      throw new AppError('User ID required', 400);
    }

    try {
      const params: any = { limit };
      if (status) {
        params.status = status;
      }

      const response = await this.apiClient.get(`/users/${this.credentials.userId}/items/search`, {
        params,
      });

      return response.data.results || [];
    } catch (error: any) {
      throw new AppError(`MercadoLibre listings error: ${error.response?.data?.message || error.message}`, 400);
    }
  }

  /**
   * Get currency for site
   */
  private getSiteCurrency(siteId: string): string {
    const currencies: { [key: string]: string } = {
      MLA: 'ARS', // Argentina
      MLB: 'BRL', // Brazil
      MLC: 'CLP', // Chile
      MCO: 'COP', // Colombia
      MCR: 'CRC', // Costa Rica
      MEC: 'USD', // Ecuador
      MLM: 'MXN', // Mexico
      MLU: 'UYU', // Uruguay
      MLV: 'VES', // Venezuela
      MPA: 'USD', // Panama
      MPE: 'PEN', // Peru
      MPT: 'USD', // Portugal
      MRD: 'DOP', // Dominican Republic
    };

    return currencies[siteId] || 'USD';
  }

  /**
   * Test connection with current credentials
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getUserInfo();
      return { success: true, message: 'MercadoLibre connection successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Search similar products (for pricing reference)
   */
  async searchSimilarProducts(query: string, categoryId?: string, limit: number = 10): Promise<any[]> {
    try {
      const params: any = {
        q: query,
        limit,
        site: this.credentials.siteId,
      };

      if (categoryId) {
        params.category = categoryId;
      }

      const response = await this.apiClient.get('/sites/search', { params });
      return response.data.results || [];
    } catch (error: any) {
      throw new AppError(`MercadoLibre search error: ${error.message}`, 400);
    }
  }

  /**
   * Search products by keywords using MercadoLibre public search API
   * Example: GET /sites/MLM/search?q=term
   */
  async searchProducts(params: { siteId: string; q: string; limit?: number; offset?: number }): Promise<Array<{
    id: string;
    title: string;
    price: number;
    currency_id: string;
    permalink: string;
    seller_id?: number;
    shipping?: { free_shipping?: boolean };
  }>> {
    const site = params.siteId || this.credentials.siteId || 'MLM';
    const q = new URLSearchParams();
    q.set('q', params.q);
    if (params.limit) q.set('limit', String(Math.min(Math.max(params.limit, 1), 50)));
    if (params.offset) q.set('offset', String(params.offset));

    const { data } = await this.apiClient.get(`/sites/${site}/search?${q.toString()}`);
    const results = (data?.results || []) as any[];
    return results.map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      currency_id: r.currency_id,
      permalink: r.permalink,
      seller_id: r.seller?.id,
      shipping: r.shipping,
    }));
  }
}

export default MercadoLibreService;
