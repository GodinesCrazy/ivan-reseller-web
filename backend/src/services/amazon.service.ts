import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { signAwsRequest } from '../utils/aws-sigv4';
import { retryMarketplaceOperation } from '../utils/retry.util';
import { logger } from '../config/logger';

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
      
      logger.info('Amazon SP-API credentials configured successfully');
    } catch (error) {
      logger.error('Failed to configure Amazon credentials', { error });
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

      logger.info('Amazon SP-API authentication successful');
      return accessToken;
    } catch (error) {
      logger.error('Amazon authentication failed', { error });
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

      logger.info('Amazon listing created', { sku: product.sku, status: listingResult.status });
      return listingResult;

    } catch (error) {
      logger.error('Failed to create Amazon listing', { error, sku: product.sku });
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

      logger.info('Amazon inventory updated', { sku, quantity });
      return true;

    } catch (error: any) {
      const classified = this.classifyAmazonError(error);
      logger.error('Failed to update Amazon inventory', { 
        error: classified.message,
        type: classified.type,
        retryable: classified.retryable,
        sku, 
        quantity,
        stack: error.stack 
      });
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

      logger.info('Retrieved Amazon inventory items', { count: inventory.length });
      return inventory;

    } catch (error: any) {
      const classified = this.classifyAmazonError(error);
      logger.error('Failed to get Amazon inventory', { 
        error: classified.message,
        type: classified.type,
        retryable: classified.retryable,
        stack: error.stack 
      });
      return [];
    }
  }

  /**
   * Update listing price on Amazon (Pricing API)
   */
  async updatePrice(sku: string, price: number, currency?: string): Promise<boolean> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/listings/2021-08-01/items/${this.credentials?.marketplace}/${encodeURIComponent(sku)}`;
      const body: any = {
        productType: 'PRODUCT',
        patches: [
          {
            op: 'replace',
            path: '/attributes/price',
            value: [
              {
                marketplace_id: this.credentials?.marketplace,
                value_with_tax: {
                  amount: price,
                  currency: currency || 'USD',
                },
              },
            ],
          },
        ],
      };

      const headers = this.signHeaders('PATCH', path);
      const response = await this.httpClient.patch(path, body, { headers });

      const ok = response.status >= 200 && response.status < 300;
      if (ok) {
        logger.info('Amazon price updated', { sku, price });
      } else {
        logger.warn('Amazon price update responded non-2xx', { sku, status: response.status });
      }
      return ok;
    } catch (error: any) {
      const classified = this.classifyAmazonError(error);
      logger.error('Failed to update Amazon price', { 
        error: classified.message, 
        type: classified.type,
        retryable: classified.retryable,
        sku, 
        price,
        stack: error.stack 
      });
      return false;
    }
  }

  /**
   * Get seller listings (basic pagination via nextToken)
   */
  async getMyListings(limit: number = 20, nextToken?: string): Promise<{ items: any[]; nextToken?: string }> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = '/listings/2021-08-01/items';
      const params: any = {
        marketplaceIds: this.credentials?.marketplace,
        pageSize: Math.min(Math.max(limit, 1), 100),
      };
      if (nextToken) params.nextToken = nextToken;

      const headers = this.signHeaders('GET', path, params);
      const response = await this.httpClient.get(path, { params, headers });

      const items = response.data?.items || [];
      const token = response.data?.nextToken;
      logger.info('Fetched Amazon listings', { count: items.length, hasNext: Boolean(token) });
      return { items, nextToken: token };
    } catch (error: any) {
      const classified = this.classifyAmazonError(error);
      logger.error('Failed to fetch Amazon listings', { 
        error: classified.message,
        type: classified.type,
        retryable: classified.retryable,
        stack: error.stack 
      });
      return { items: [] };
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

      logger.info('Found Amazon categories', { count: categories.length, searchTerm });
      return categories;

    } catch (error) {
      logger.error('Failed to get Amazon categories', { error, searchTerm });
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

      logger.info('Found Amazon products', { count: products.length, query });
      return products;

    } catch (error) {
      logger.error('Failed to search Amazon products', { error, query });
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
      if (isValid) {
        logger.info('Amazon connection test successful');
      } else {
        logger.warn('Amazon connection test failed');
      }
      return isValid;

    } catch (error) {
      logger.error('Amazon connection test failed', { error });
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
        logger.warn('Amazon feed poll attempt failed', { attempt: attempt + 1, error });
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
        credentials as any,
        'production',
        { scope: 'global', sharedByUserId: 1 }
      );
    } catch (e) {
      logger.warn('Failed to persist Amazon credentials', { error: e });
    }
  }

  /**
   * Update marketplace listing record related to Amazon
   */
  private async updateProductInDatabase(sku: string, updates: any): Promise<void> {
    try {
      // Try to update existing marketplace listing for Amazon by SKU
      await prisma.marketplaceListing.updateMany({
        where: {
          marketplace: 'amazon',
          sku: sku,
        },
        data: {
          listingId: updates?.amazonASIN ?? undefined,
          listingUrl: updates?.listingUrl ?? undefined,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.warn('Failed to update Amazon marketplace listing record', { error, sku });
    }
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
   * ✅ A4: Update multiple prices in bulk (Pricing API)
   */
  async updatePricesBulk(updates: Array<{ sku: string; price: number; currency?: string }>): Promise<{
    success: number;
    failed: number;
    results: Array<{ sku: string; success: boolean; error?: string }>;
  }> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    const results: Array<{ sku: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const update of updates) {
      try {
        const success = await this.updatePrice(update.sku, update.price, update.currency);
        results.push({ sku: update.sku, success });
        if (success) {
          successCount++;
        } else {
          failedCount++;
          results[results.length - 1].error = 'Price update failed';
        }
      } catch (error: any) {
        failedCount++;
        results.push({
          sku: update.sku,
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    }

    logger.info('Amazon bulk price update completed', { total: updates.length, success: successCount, failed: failedCount });
    return { success: successCount, failed: failedCount, results };
  }

  /**
   * ✅ A4: Update multiple inventory quantities in bulk (FBA Inventory API)
   */
  async updateInventoryBulk(updates: Array<{ sku: string; quantity: number }>): Promise<{
    success: number;
    failed: number;
    results: Array<{ sku: string; success: boolean; error?: string }>;
  }> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    const results: Array<{ sku: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const update of updates) {
      try {
        const success = await this.updateInventoryQuantity(update.sku, update.quantity);
        results.push({ sku: update.sku, success });
        if (success) {
          successCount++;
        } else {
          failedCount++;
          results[results.length - 1].error = 'Inventory update failed';
        }
      } catch (error: any) {
        failedCount++;
        results.push({
          sku: update.sku,
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    }

    logger.info('Amazon bulk inventory update completed', { total: updates.length, success: successCount, failed: failedCount });
    return { success: successCount, failed: failedCount, results };
  }

  /**
   * ✅ A4: Get orders from Amazon (Orders API v0)
   */
  async getOrders(params?: {
    createdAfter?: Date;
    createdBefore?: Date;
    lastUpdatedAfter?: Date;
    lastUpdatedBefore?: Date;
    orderStatuses?: string[];
    fulfillmentChannels?: string[];
    paymentMethods?: string[];
    maxResultsPerPage?: number;
    nextToken?: string;
  }): Promise<{ orders: any[]; nextToken?: string }> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = '/orders/v0/orders';
      const queryParams: any = {
        MarketplaceIds: this.credentials?.marketplace,
        MaxResultsPerPage: Math.min(Math.max(params?.maxResultsPerPage || 20, 1), 100),
      };

      if (params?.createdAfter) {
        queryParams.CreatedAfter = params.createdAfter.toISOString();
      }
      if (params?.createdBefore) {
        queryParams.CreatedBefore = params.createdBefore.toISOString();
      }
      if (params?.lastUpdatedAfter) {
        queryParams.LastUpdatedAfter = params.lastUpdatedAfter.toISOString();
      }
      if (params?.lastUpdatedBefore) {
        queryParams.LastUpdatedBefore = params.lastUpdatedBefore.toISOString();
      }
      if (params?.orderStatuses && params.orderStatuses.length > 0) {
        queryParams.OrderStatuses = params.orderStatuses;
      }
      if (params?.fulfillmentChannels && params.fulfillmentChannels.length > 0) {
        queryParams.FulfillmentChannels = params.fulfillmentChannels;
      }
      if (params?.paymentMethods && params.paymentMethods.length > 0) {
        queryParams.PaymentMethods = params.paymentMethods;
      }
      if (params?.nextToken) {
        queryParams.NextToken = params.nextToken;
      }

      const headers = this.signHeaders('GET', path, queryParams);
      const response = await this.httpClient.get(path, { params: queryParams, headers });

      const orders = response.data?.payload?.Orders || [];
      const nextToken = response.data?.payload?.NextToken;

      logger.info('Retrieved Amazon orders', { count: orders.length, hasNext: Boolean(nextToken) });
      return { orders, nextToken };
    } catch (error: any) {
      logger.error('Failed to get Amazon orders', { error: error.message, stack: error.stack });
      return { orders: [] };
    }
  }

  /**
   * ✅ A4: Get specific order by order ID (Orders API v0)
   */
  async getOrder(orderId: string): Promise<any | null> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/orders/v0/orders/${orderId}`;
      const queryParams = {
        MarketplaceIds: this.credentials?.marketplace,
      };

      const headers = this.signHeaders('GET', path, queryParams);
      const response = await this.httpClient.get(path, { params: queryParams, headers });

      const order = response.data?.payload;
      if (order) {
        logger.info('Retrieved Amazon order', { orderId });
      }
      return order || null;
    } catch (error: any) {
      logger.error('Failed to get Amazon order', { error: error.message, orderId });
      return null;
    }
  }

  /**
   * ✅ A4: Get order items for a specific order (Orders API v0)
   */
  async getOrderItems(orderId: string): Promise<any[]> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/orders/v0/orders/${orderId}/orderItems`;
      const headers = this.signHeaders('GET', path);
      const response = await this.httpClient.get(path, { headers });

      const items = response.data?.payload?.OrderItems || [];
      logger.info('Retrieved Amazon order items', { orderId, count: items.length });
      return items;
    } catch (error: any) {
      logger.error('Failed to get Amazon order items', { error: error.message, orderId });
      return [];
    }
  }

  /**
   * ✅ A4: Update listing (Listings API)
   */
  async updateListing(sku: string, updates: {
    title?: string;
    description?: string;
    price?: number;
    quantity?: number;
    images?: string[];
  }): Promise<boolean> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/listings/2021-08-01/items/${this.credentials?.marketplace}/${encodeURIComponent(sku)}`;
      const patches: any[] = [];

      if (updates.title !== undefined) {
        patches.push({
          op: 'replace',
          path: '/attributes/title',
          value: [{ marketplace_id: this.credentials?.marketplace, value: updates.title }]
        });
      }

      if (updates.description !== undefined) {
        patches.push({
          op: 'replace',
          path: '/attributes/product_description',
          value: [{ marketplace_id: this.credentials?.marketplace, value: updates.description }]
        });
      }

      if (updates.price !== undefined) {
        patches.push({
          op: 'replace',
          path: '/attributes/price',
          value: [{
            marketplace_id: this.credentials?.marketplace,
            value_with_tax: {
              amount: updates.price,
              currency: 'USD'
            }
          }]
        });
      }

      if (updates.quantity !== undefined) {
        patches.push({
          op: 'replace',
          path: '/attributes/quantity',
          value: [{ marketplace_id: this.credentials?.marketplace, value: updates.quantity }]
        });
      }

      if (updates.images && updates.images.length > 0) {
        patches.push({
          op: 'replace',
          path: '/attributes/images',
          value: [{
            marketplace_id: this.credentials?.marketplace,
            images: updates.images.map(url => ({ link: url }))
          }]
        });
      }

      if (patches.length === 0) {
        logger.warn('No updates provided for listing', { sku });
        return false;
      }

      const body = {
        productType: 'PRODUCT',
        patches
      };

      const headers = this.signHeaders('PATCH', path);
      const response = await this.httpClient.patch(path, body, { headers });

      const success = response.status >= 200 && response.status < 300;
      if (success) {
        logger.info('Amazon listing updated', { sku });
        await this.updateProductInDatabase(sku, { lastSyncAmazon: new Date() });
      } else {
        logger.warn('Amazon listing update responded non-2xx', { sku, status: response.status });
      }
      return success;
    } catch (error: any) {
      logger.error('Failed to update Amazon listing', { error: error.message, sku, stack: error.stack });
      return false;
    }
  }

  /**
   * ✅ A4: Delete listing (Listings API)
   */
  async deleteListing(sku: string): Promise<boolean> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/listings/2021-08-01/items/${this.credentials?.marketplace}/${encodeURIComponent(sku)}`;
      const headers = this.signHeaders('DELETE', path);
      const response = await this.httpClient.delete(path, { headers });

      const success = response.status >= 200 && response.status < 300;
      if (success) {
        logger.info('Amazon listing deleted', { sku });
        // Update local database to mark as deleted (remove listingId to mark as deleted)
        await prisma.marketplaceListing.updateMany({
          where: { marketplace: 'amazon', sku },
          data: { listingId: null, updatedAt: new Date() }
        });
      } else {
        logger.warn('Amazon listing deletion responded non-2xx', { sku, status: response.status });
      }
      return success;
    } catch (error: any) {
      logger.error('Failed to delete Amazon listing', { error: error.message, sku, stack: error.stack });
      return false;
    }
  }

  /**
   * ✅ A4: Get listing by SKU (Listings API)
   */
  async getListingBySku(sku: string): Promise<any | null> {
    if (!this.credentials?.accessToken) {
      await this.authenticate();
    }

    try {
      const path = `/listings/2021-08-01/items/${this.credentials?.marketplace}/${encodeURIComponent(sku)}`;
      const queryParams = {
        includedData: 'summaries,attributes,issues'
      };
      const headers = this.signHeaders('GET', path, queryParams);
      const response = await this.httpClient.get(path, { params: queryParams, headers });

      const listing = response.data;
      if (listing) {
        logger.info('Retrieved Amazon listing', { sku });
      }
      return listing || null;
    } catch (error: any) {
      logger.error('Failed to get Amazon listing', { error: error.message, sku, stack: error.stack });
      return null;
    }
  }

  /**
   * ✅ A4: Classify Amazon API errors for better error handling
   */
  private classifyAmazonError(error: any): {
    type: 'rate_limit' | 'auth' | 'feed_error' | 'inventory_error' | 'pricing_error' | 'listing_error' | 'order_error' | 'unknown';
    message: string;
    retryable: boolean;
    statusCode?: number;
  } {
    const statusCode = error.response?.status || error.status;
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Unknown error';
    const errorCode = error.response?.data?.errors?.[0]?.code || error.code;

    // Rate limiting
    if (statusCode === 429 || errorCode === 'QuotaExceeded') {
      return {
        type: 'rate_limit',
        message: 'Amazon API rate limit exceeded. Please wait before retrying.',
        retryable: true,
        statusCode: 429
      };
    }

    // Authentication errors
    if (statusCode === 401 || statusCode === 403 || errorCode === 'Unauthorized' || errorCode === 'InvalidAccessToken') {
      return {
        type: 'auth',
        message: 'Amazon API authentication failed. Please check your credentials.',
        retryable: false,
        statusCode
      };
    }

    // Feed processing errors
    if (errorCode?.includes('Feed') || errorCode?.includes('Processing') || errorMessage?.includes('feed')) {
      return {
        type: 'feed_error',
        message: `Amazon feed processing error: ${errorMessage}`,
        retryable: true,
        statusCode
      };
    }

    // Inventory errors
    if (errorCode?.includes('Inventory') || errorMessage?.includes('inventory') || errorMessage?.includes('FBA')) {
      return {
        type: 'inventory_error',
        message: `Amazon inventory error: ${errorMessage}`,
        retryable: true,
        statusCode
      };
    }

    // Pricing errors
    if (errorCode?.includes('Pricing') || errorMessage?.includes('price') || errorMessage?.includes('Pricing')) {
      return {
        type: 'pricing_error',
        message: `Amazon pricing error: ${errorMessage}`,
        retryable: false,
        statusCode
      };
    }

    // Listing errors
    if (errorCode?.includes('Listing') || errorMessage?.includes('listing') || errorMessage?.includes('SKU')) {
      return {
        type: 'listing_error',
        message: `Amazon listing error: ${errorMessage}`,
        retryable: false,
        statusCode
      };
    }

    // Order errors
    if (errorCode?.includes('Order') || errorMessage?.includes('order')) {
      return {
        type: 'order_error',
        message: `Amazon order error: ${errorMessage}`,
        retryable: true,
        statusCode
      };
    }

    // Unknown error
    return {
      type: 'unknown',
      message: errorMessage,
      retryable: statusCode >= 500 || statusCode === 429,
      statusCode
    };
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

