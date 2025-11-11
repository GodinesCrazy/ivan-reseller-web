// @ts-nocheck
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { signAwsRequest } from '../utils/aws-sigv4';
import { retryMarketplaceOperation } from '../utils/retry.util';
import logger from '../config/logger';

// Amazon SP-API Configuration
interface AmazonCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  region: 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'ap-northeast-1';
  marketplace: 'ATVPDKIKX0DER' | 'A2EUQ1WTGCTBG2' | 'A1AM78C64UM0Y8' | 'A1VC38T7YXB528';
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsSessionToken?: string;
}

interface AmazonProduct {
  asin?: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  images: string[];
  category: string;
  brand?: string;
  manufacturer?: string;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
    unit: 'inches' | 'centimeters';
    weightUnit: 'pounds' | 'grams';
  };
  attributes: Record<string, any>;
}

interface AmazonListingResponse {
  success: boolean;
  asin?: string;
  sku: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'ERROR';
  message?: string;
  errors?: string[];
}

interface AmazonInventoryItem {
  sku: string;
  asin?: string;
  quantity: number;
  reservedQuantity?: number;
  inboundQuantity?: number;
  availableQuantity: number;
  lastUpdated: Date;
}

class AmazonService {
  private credentials: AmazonCredentials | null = null;
  private httpClient: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://sellingpartnerapi-na.amazon.com'; // Default to North America
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Ivan-Reseller/1.0'
      }
    });
  }

  /**
   * Search catalog items by keywords (SP-API Catalog Items 2022-04-01)
   * NOTE: Requires proper AWS SigV4 signing in real environment. This is a structural stub.
   */
  async searchCatalog(params: { keywords: string; marketplaceId?: string; includedData?: string[]; limit?: number }): Promise<Array<{
    asin?: string;
    title?: string;
    price?: number;
    currency?: string;
    url?: string;
  }>> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    const marketplaceId = params.marketplaceId || 'ATVPDKIKX0DER';
    const includedData = params.includedData?.join(',') || 'summaries,images,attributes';
    const q = new URLSearchParams();
    q.set('keywords', params.keywords);
    q.set('marketplaceIds', marketplaceId);
    q.set('includedData', includedData);
    if (params.limit) q.set('pageSize', String(Math.min(Math.max(params.limit, 1), 20)));

    try {
      const path = '/catalog/2022-04-01/items';
      const queryParams = Object.fromEntries(q.entries());
      const signed = this.signHeaders('GET', path, queryParams as any);
      const { data } = await this.httpClient.get(`${path}?${q.toString()}`, {
        headers: { ...signed },
      });
      const items = (data?.items || []) as any[];
      return items.map((it: any) => ({
        asin: it.asin,
        title: it.summaries?.[0]?.itemName,
        price: parseFloat(it.summaries?.[0]?.buyBoxPrices?.[0]?.price?.amount || '0'),
        currency: it.summaries?.[0]?.buyBoxPrices?.[0]?.price?.currencyCode || 'USD',
        url: it.summaries?.[0]?.detailPageURL,
      }));
    } catch (_e) {
      return [];
    }
  }

  /**
   * Configure Amazon SP-API credentials
   */
  async setCredentials(credentials: AmazonCredentials): Promise<void> {
    try {
      this.credentials = credentials;
      
      // Set regional endpoint
      this.baseUrl = this.getRegionalEndpoint(credentials.region);
      this.httpClient.defaults.baseURL = this.baseUrl;

      // Test credentials by getting marketplace info
      await this.testConnection();
      
      // Save credentials to database (encrypted)
      await this.saveCredentials(credentials);
      
      console.log('✅ Amazon SP-API credentials configured successfully');
    } catch (error) {
      console.error('❌ Failed to configure Amazon credentials:', error);
      throw new Error(`Amazon API configuration failed: ${error}`);
    }
  }

  /**
   * Get regional endpoint for SP-API
   */
  private getRegionalEndpoint(region: string): string {
    const endpoints = {
      'us-east-1': 'https://sellingpartnerapi-na.amazon.com',
      'us-west-2': 'https://sellingpartnerapi-na.amazon.com',
      'eu-west-1': 'https://sellingpartnerapi-eu.amazon.com',
      'ap-northeast-1': 'https://sellingpartnerapi-fe.amazon.com'
    };
    return endpoints[region] || endpoints['us-east-1'];
  }

  /**
   * Authenticate with Amazon SP-API using LWA (Login with Amazon)
   */
  async authenticate(): Promise<string> {
    if (!this.credentials) {
      throw new Error('Amazon credentials not configured');
    }

    try {
      const form = new URLSearchParams();
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', this.credentials.refreshToken);
      form.set('client_id', this.credentials.clientId);
      form.set('client_secret', this.credentials.clientSecret);
      // ✅ Usar retry para autenticación (crítico)
      const result = await retryMarketplaceOperation(
        () => axios.post('https://api.amazon.com/auth/o2/token', form.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }),
        'amazon',
        {
          maxRetries: 3,
          initialDelay: 2000,
          onRetry: (attempt, error, delay) => {
            logger.warn(`Retrying authenticate for Amazon (attempt ${attempt})`, {
              error: error.message,
              delay,
            });
          },
        }
      );

      if (!result.success || !result.data) {
        throw new Error(`Failed to authenticate after retries: ${result.error?.message || 'Unknown error'}`);
      }

      const response = result.data;
      const accessToken = response.data.access_token;
      
      // Update credentials with new access token
      if (this.credentials) {
        this.credentials.accessToken = accessToken;
      }

      // Set authorization header
      this.httpClient.defaults.headers['x-amz-access-token'] = accessToken;

      console.log('✅ Amazon SP-API authentication successful');
      return accessToken;
    } catch (error) {
      console.error('❌ Amazon authentication failed:', error);
      throw new Error(`Amazon authentication failed: ${error}`);
    }
  }

  /**
   * Create product listing on Amazon
   */
  async createListing(product: AmazonProduct): Promise<AmazonListingResponse> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      // Amazon SP-API uses XML for product submissions
      const productXML = this.buildProductXML(product);

      // Submit product via Feeds API
      const feedsPath = '/feeds/2021-06-30/feeds';
      
      // ✅ Usar retry para crear listing (operación crítica)
      const result = await retryMarketplaceOperation(
        async () => {
          const feedPayload = {
            feedType: 'POST_PRODUCT_DATA',
            marketplaceIds: [this.credentials?.marketplace],
            inputFeedDocumentId: await this.uploadFeedDocument(productXML)
          } as any;
          const feedHeaders = this.signHeaders('POST', feedsPath);
          const feedResponse = await this.httpClient.post(feedsPath, feedPayload, { headers: { ...feedHeaders } });

          const feedId = feedResponse.data.feedId;
          
          // Poll for feed processing result
          const pollResult = await this.pollFeedResult(feedId);

          return pollResult;
        },
        'amazon',
        {
          maxRetries: 4,
          initialDelay: 2000,
          onRetry: (attempt, error, delay) => {
            logger.warn(`Retrying createListing for Amazon (attempt ${attempt})`, {
              sku: product.sku,
              error: error.message,
              delay,
            });
          },
        }
      );

      if (!result.success || !result.data) {
        throw new Error(`Failed to create Amazon listing after retries: ${result.error?.message || 'Unknown error'}`);
      }

      const listingResult = result.data;

      // Update local database
      await this.updateProductInDatabase(product.sku, {
        amazonASIN: listingResult.asin,
        amazonStatus: listingResult.status,
        lastSyncAmazon: new Date()
      });

      console.log(`✅ Amazon listing created: SKU ${product.sku}, Status: ${listingResult.status}`);
      return listingResult;

    } catch (error) {
      console.error('❌ Failed to create Amazon listing:', error);
      return {
        success: false,
        sku: product.sku,
        status: 'ERROR',
        message: `Creation failed: ${error}`,
        errors: [String(error)]
      };
    }
  }

  /**
   * Update inventory quantity on Amazon
   */
  async updateInventoryQuantity(sku: string, quantity: number): Promise<boolean> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/fba/inventory/v1/summaries`;
      const payload: any = { skus: [sku], marketplaceId: this.credentials?.marketplace, quantity };
      const headers = this.signHeaders('PATCH', path);
      const response = await this.httpClient.patch(path, payload, { headers });

      // Update local database
      await this.updateProductInDatabase(sku, {
        quantity: quantity,
        lastSyncAmazon: new Date()
      });

      console.log(`✅ Amazon inventory updated: SKU ${sku}, Quantity: ${quantity}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to update Amazon inventory:', error);
      return false;
    }
  }

  /**
   * Get inventory summary from Amazon
   */
  async getInventorySummary(): Promise<AmazonInventoryItem[]> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = '/fba/inventory/v1/summaries';
      const params: any = {
        granularityType: 'Marketplace',
        granularityId: this.credentials?.marketplace,
        marketplaceIds: this.credentials?.marketplace
      };
      const headers = this.signHeaders('GET', path, params);
      const response = await this.httpClient.get(path, { params, headers });

      const inventory: AmazonInventoryItem[] = response.data.inventorySummaries?.map((item: any) => ({
        sku: item.sellerSku,
        asin: item.asin,
        quantity: item.totalQuantity || 0,
        reservedQuantity: item.reservedQuantity || 0,
        inboundQuantity: item.inboundWorkingQuantity || 0,
        availableQuantity: item.researchingQuantity || 0,
        lastUpdated: new Date()
      }));

      console.log(`✅ Retrieved ${inventory.length} Amazon inventory items`);
      return inventory;

    } catch (error) {
      console.error('❌ Failed to get Amazon inventory:', error);
      return [];
    }
  }

  /**
   * Get product categories from Amazon
   */
  async getProductCategories(searchTerm: string): Promise<any[]> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = '/catalog/2022-04-01/items';
      const params: any = {
        keywords: searchTerm,
        marketplaceIds: this.credentials?.marketplace,
        includedData: 'categories,identifiers,summaries'
      };
      const headers = this.signHeaders('GET', path, params);
      const response = await this.httpClient.get(path, { params, headers });

      const categories = (response.data.items || []).map((item: any) => ({
        categoryId: item.categories?.[0]?.categoryId,
        categoryName: item.categories?.[0]?.categoryName,
        parentCategory: item.categories?.[0]?.parent,
        requirements: item.categories?.[0]?.requirements || []
      }));

      console.log(`✅ Found ${categories.length} Amazon categories for: ${searchTerm}`);
      return categories;

    } catch (error) {
      console.error('❌ Failed to get Amazon categories:', error);
      return [];
    }
  }

  /**
   * Search for similar products on Amazon
   */
  async searchProducts(query: string, limit: number = 10): Promise<any[]> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = '/catalog/2022-04-01/items';
      const params: any = {
        keywords: query,
        marketplaceIds: this.credentials?.marketplace,
        includedData: 'summaries,images,productTypes,salesRanks',
        pageSize: limit
      };
      const headers = this.signHeaders('GET', path, params);
      const response = await this.httpClient.get(path, { params, headers });

      const products = (response.data.items || []).map((item: any) => ({
        asin: item.asin,
        title: item.summaries?.[0]?.itemName,
        brand: item.summaries?.[0]?.brand,
        price: item.summaries?.[0]?.lowestPrice?.amount,
        currency: item.summaries?.[0]?.lowestPrice?.currencyCode,
        category: item.productTypes?.[0]?.displayName,
        salesRank: item.salesRanks?.[0]?.rank,
        image: item.images?.[0]?.images?.[0]?.link
      }));

      console.log(`✅ Found ${products.length} Amazon products for: ${query}`);
      return products;

    } catch (error) {
      console.error('❌ Failed to search Amazon products:', error);
      return [];
    }
  }

  /**
   * Test Amazon SP-API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.credentials?.accessToken) {
        await this.authenticate();
      }

      const path = '/sellers/v1/marketplaceParticipations';
      const headers = this.signHeaders('GET', path);
      const response = await this.httpClient.get(path, { headers });

      const isValid = response.status === 200 && response.data.payload;
      console.log(isValid ? '✅ Amazon connection test successful' : '❌ Amazon connection test failed');
      return isValid;

    } catch (error) {
      console.error('❌ Amazon connection test failed:', error);
      return false;
    }
  }

  /**
   * Build product XML for Amazon submission
   */
  private buildProductXML(product: AmazonProduct): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
    <AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <Header>
        <DocumentVersion>1.01</DocumentVersion>
        <MerchantIdentifier>${this.credentials?.clientId}</MerchantIdentifier>
      </Header>
      <MessageType>Product</MessageType>
      <Message>
        <MessageID>1</MessageID>
        <Product>
          <SKU>${product.sku}</SKU>
          <StandardProductID>
            <Type>UPC</Type>
            <Value>${product.attributes.upc || 'N/A'}</Value>
          </StandardProductID>
          <ProductTaxCode>A_GEN_NOTAX</ProductTaxCode>
          <DescriptionData>
            <Title>${this.escapeXML(product.title)}</Title>
            <Brand>${this.escapeXML(product.brand || 'Generic')}</Brand>
            <Description>${this.escapeXML(product.description)}</Description>
            <BulletPoint>${this.escapeXML(product.description.substring(0, 500))}</BulletPoint>
            <Manufacturer>${this.escapeXML(product.manufacturer || product.brand || 'Generic')}</Manufacturer>
          </DescriptionData>
        </Product>
      </Message>
    </AmazonEnvelope>`;
  }

  /**
   * Upload feed document to Amazon
   */
  private async uploadFeedDocument(content: string): Promise<string> {
    // Implementation for uploading feed document
    // This would involve creating a feed document and uploading content
    const path = '/feeds/2021-06-30/documents';
    const body = { contentType: 'text/xml; charset=UTF-8' };
    const headers = this.signHeaders('POST', path);
    const feedDocResponse = await this.httpClient.post(path, body, { headers });

    const uploadUrl = feedDocResponse.data.url;
    const feedDocumentId = feedDocResponse.data.feedDocumentId;

    // Upload content to presigned URL
    await axios.put(uploadUrl, content, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8'
      }
    });

    return feedDocumentId;
  }

  /**
   * Poll feed processing result
   */
  private async pollFeedResult(feedId: string, maxAttempts: number = 20): Promise<AmazonListingResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const path = `/feeds/2021-06-30/feeds/${feedId}`;
        const headers = this.signHeaders('GET', path);
        const response = await this.httpClient.get(path, { headers });

        const processingStatus = response.data.processingStatus;
        
        if (processingStatus === 'DONE') {
          return {
            success: true,
            sku: response.data.sku || 'unknown',
            status: 'ACTIVE',
            asin: response.data.asin
          };
        } else if (processingStatus === 'FATAL') {
          return {
            success: false,
            sku: response.data.sku || 'unknown',
            status: 'ERROR',
            message: 'Feed processing failed'
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`Poll attempt ${attempt + 1} failed:`, error);
      }
    }

    return {
      success: false,
      sku: 'unknown',
      status: 'ERROR',
      message: 'Feed processing timeout'
    };
  }

  /**
   * Get authentication headers for SP-API requests
   */
  private signHeaders(method: string, path: string, query?: Record<string, string>, payloadHash?: string): Record<string, string> {
    if (!this.credentials?.accessToken) {
      throw new Error('No access token available');
    }
    const base = new URL(this.baseUrl);
    const { accessKeyId, secretAccessKey, sessionToken } = this.getAwsCreds();
    const signed = signAwsRequest({
      method,
      service: 'execute-api',
      region: this.credentials!.region,
      host: base.host,
      path,
      query,
      payloadHash: payloadHash || 'UNSIGNED-PAYLOAD',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    });
    return {
      ...signed.headers,
      'x-amz-access-token': this.credentials!.accessToken!,
    };
  }

  private getAwsCreds() {
    const accessKeyId = this.credentials?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID || process.env.AMAZON_ACCESS_KEY || '';
    const secretAccessKey = this.credentials?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || process.env.AMAZON_SECRET_KEY || '';
    const sessionToken = this.credentials?.awsSessionToken || process.env.AWS_SESSION_TOKEN;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS credentials for SigV4');
    }
    return { accessKeyId, secretAccessKey, sessionToken };
  }

  /**
   * Save encrypted credentials to database
   */
  private async saveCredentials(credentials: AmazonCredentials): Promise<void> {
    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      await CredentialsManager.saveCredentials(
        1,
        'amazon',
        credentials,
        'production',
        { scope: 'global', sharedByUserId: 1 }
      );
    } catch (e) {
      console.warn('Failed to persist Amazon credentials', e);
    }
  }

  /**
   * Update product in database
   */
  private async updateProductInDatabase(sku: string, updates: any): Promise<void> {
    await prisma.product.updateMany({
      where: { sku: sku },
      data: updates
    });
  }

  /**
   * Encrypt sensitive credentials
   */
  private encryptCredentials(data: string): string {
    const secret = process.env.ENCRYPTION_KEY || 'default-key';
    const key = crypto.scryptSync(secret, 'ivan-reseller-salt', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get marketplace-specific configuration
   */
  public static getMarketplaceConfig(marketplace: string) {
    const configs = {
      'US': {
        marketplaceId: 'ATVPDKIKX0DER',
        region: 'us-east-1',
        currency: 'USD',
        endpoint: 'https://sellingpartnerapi-na.amazon.com'
      },
      'CA': {
        marketplaceId: 'A2EUQ1WTGCTBG2',
        region: 'us-east-1',
        currency: 'CAD',
        endpoint: 'https://sellingpartnerapi-na.amazon.com'
      },
      'UK': {
        marketplaceId: 'A1F83G8C2ARO7P',
        region: 'eu-west-1',
        currency: 'GBP',
        endpoint: 'https://sellingpartnerapi-eu.amazon.com'
      },
      'DE': {
        marketplaceId: 'A1PA6795UKMFR9',
        region: 'eu-west-1',
        currency: 'EUR',
        endpoint: 'https://sellingpartnerapi-eu.amazon.com'
      },
      'JP': {
        marketplaceId: 'A1VC38T7YXB528',
        region: 'ap-northeast-1',
        currency: 'JPY',
        endpoint: 'https://sellingpartnerapi-fe.amazon.com'
      }
    };

    return configs[marketplace] || configs['US'];
  }
}

export { AmazonService, AmazonCredentials, AmazonProduct, AmazonListingResponse, AmazonInventoryItem };

