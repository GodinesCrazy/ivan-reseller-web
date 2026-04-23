import { cjShopifyUsaConfigService } from './cj-shopify-usa-config.service';
import {
  CJ_SHOPIFY_USA_REQUIRED_SCOPES,
  CJ_SHOPIFY_USA_REQUIRED_WEBHOOK_TOPICS,
} from '../cj-shopify-usa.constants';
import { env } from '../../../config/env';
import { AppError, ErrorCode } from '../../../middleware/error.middleware';

type ShopifyTokenCacheEntry = {
  accessToken: string;
  scope: string[];
  expiresAtMs: number;
};

type ShopifyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ShopifyGraphqlUserError = {
  field?: string[] | null;
  message: string;
};

export type StorefrontVerificationResult = {
  shopDomain: string;
  storefrontUrl: string;
  status: number | null;
  finalUrl: string | null;
  passwordGate: boolean;
  buyerFacingOk: boolean;
  hasAddToCart: boolean;
  hasPrice: boolean;
  markers: string[];
  error?: string;
};

type ShopifyProbeData = {
  shop: {
    name: string;
    currencyCode: string;
    billingAddress?: { countryCodeV2?: string | null } | null;
    primaryDomain?: { url?: string | null } | null;
  };
  currentAppInstallation?: {
    accessScopes?: Array<{ handle: string }>;
  } | null;
  locations?: {
    nodes?: Array<{
      id: string;
      name: string;
      isActive?: boolean | null;
      fulfillsOnlineOrders?: boolean | null;
    }>;
  } | null;
  publications?: {
    nodes?: Array<{
      id: string;
      name: string;
      autoPublish?: boolean | null;
      supportsFuturePublishing?: boolean | null;
    }>;
  } | null;
  webhookSubscriptions?: {
    nodes?: Array<{
      id: string;
      topic: string;
      uri: string;
    }>;
  } | null;
};

const tokenCache = new Map<string, ShopifyTokenCacheEntry>();

function trimOrEmpty(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeShopifyMediaSource(value: unknown): string {
  let src = trimOrEmpty(value);
  if (!src) return '';

  if (src.startsWith('//')) {
    src = `https:${src}`;
  } else if (src.startsWith('http:')) {
    src = src.replace('http:', 'https:');
  }

  try {
    const decoded = decodeURI(src);
    if (decoded === src) {
      src = encodeURI(src);
    }
  } catch {
    // Keep the source as-is; Shopify will return mediaUserErrors for invalid URLs.
  }

  return src;
}

export function normalizeShopifyShopDomain(raw: string): string {
  const input = trimOrEmpty(raw).toLowerCase();
  if (!input) {
    throw new AppError(
      'Shopify shop domain not configured. Set SHOPIFY_SHOP in env or shopifyStoreUrl in CJ Shopify USA settings.',
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  let hostname = input;
  if (input.includes('://')) {
    try {
      hostname = new URL(input).hostname.toLowerCase();
    } catch {
      throw new AppError(
        'Invalid Shopify shop URL. Use a store handle or {shop}.myshopify.com.',
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
  } else {
    hostname = input.replace(/^https?:\/\//, '').split('/')[0] || input;
  }

  if (!hostname) {
    throw new AppError(
      'Invalid Shopify shop value. Use a store handle or {shop}.myshopify.com.',
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  if (!hostname.includes('.')) {
    return `${hostname}.myshopify.com`;
  }

  if (!hostname.endsWith('.myshopify.com')) {
    throw new AppError(
      'Shopify auth requires the store myshopify domain, not a custom storefront domain.',
      400,
      ErrorCode.VALIDATION_ERROR,
      { receivedHost: hostname },
    );
  }

  return hostname;
}

export function buildShopifyStorefrontUrl(shopDomain: string, productHandle: string): string {
  const normalizedShopDomain = normalizeShopifyShopDomain(shopDomain);
  const handle = trimOrEmpty(productHandle).replace(/^\/+|\/+$/g, '');
  if (!handle) {
    throw new AppError('Shopify product handle is required to build storefront URL.', 400, ErrorCode.VALIDATION_ERROR);
  }
  if (/^https?:\/\//i.test(handle) || handle.includes('/')) {
    throw new AppError('Shopify product handle must be a handle, not a full or partial URL.', 400, ErrorCode.VALIDATION_ERROR);
  }
  return `https://${normalizedShopDomain}/products/${encodeURIComponent(handle)}`;
}

function ensureCredentials() {
  const clientId = trimOrEmpty(env.SHOPIFY_CLIENT_ID);
  const clientSecret = trimOrEmpty(env.SHOPIFY_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new AppError(
      'Shopify client credentials are not configured in backend env.',
      503,
      ErrorCode.CREDENTIALS_ERROR,
      {
        requiredEnv: ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
      },
    );
  }
  return { clientId, clientSecret };
}

function getWebhookBaseUrl(): string {
  const backendUrl = trimOrEmpty(env.BACKEND_URL);
  if (backendUrl) {
    return backendUrl.replace(/\/$/, '');
  }

  const apiUrl = trimOrEmpty(env.API_URL);
  if (apiUrl) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      // Ignore malformed API_URL here and continue with Railway fallback.
    }
  }

  const railwayStatic = trimOrEmpty(process.env.RAILWAY_STATIC_URL);
  if (railwayStatic) {
    return `https://${railwayStatic.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }

  throw new AppError(
    'Cannot build Shopify webhook URL because BACKEND_URL is not configured.',
    503,
    ErrorCode.SERVICE_UNAVAILABLE,
    {
      requiredEnv: ['BACKEND_URL'],
    },
  );
}

function getRequiredWebhookUris() {
  const base = getWebhookBaseUrl();
  return {
    ORDERS_CREATE: `${base}/api/cj-shopify-usa/webhooks/orders-create`,
    APP_UNINSTALLED: `${base}/api/cj-shopify-usa/webhooks/app-uninstalled`,
  } as const;
}

export class CjShopifyUsaAdminService {
  async resolveShopDomain(userId: number): Promise<string> {
    if (trimOrEmpty(env.SHOPIFY_SHOP)) {
      return normalizeShopifyShopDomain(env.SHOPIFY_SHOP);
    }

    const settings = await cjShopifyUsaConfigService.getOrCreateSettings(userId);
    if (trimOrEmpty(settings.shopifyStoreUrl)) {
      return normalizeShopifyShopDomain(settings.shopifyStoreUrl);
    }

    throw new AppError(
      'Shopify shop domain is missing. Set SHOPIFY_SHOP in env or save shopifyStoreUrl in CJ Shopify USA settings.',
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  async getAccessToken(userId: number): Promise<ShopifyTokenCacheEntry & { shopDomain: string }> {
    const { clientId, clientSecret } = ensureCredentials();
    const shopDomain = await this.resolveShopDomain(userId);

    const cached = tokenCache.get(shopDomain);
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return { ...cached, shopDomain };
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    let response: Response;
    try {
      response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (error) {
      throw new AppError(
        `Shopify token exchange failed: ${error instanceof Error ? error.message : String(error)}`,
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      scope?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !trimOrEmpty(payload.access_token)) {
      const reason =
        trimOrEmpty(payload.error_description) ||
        trimOrEmpty(payload.error) ||
        `HTTP ${response.status}`;
      throw new AppError(
        `Shopify token exchange was rejected for ${shopDomain}: ${reason}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const entry: ShopifyTokenCacheEntry = {
      accessToken: payload.access_token!,
      scope: trimOrEmpty(payload.scope)
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
      expiresAtMs: Date.now() + Math.max(60, Number(payload.expires_in || 86_399)) * 1000,
    };

    tokenCache.set(shopDomain, entry);
    return { ...entry, shopDomain };
  }

  async graphql<T>(input: {
    userId: number;
    query: string;
    variables?: Record<string, unknown>;
  }): Promise<T> {
    const token = await this.getAccessToken(input.userId);

    let response: Response;
    try {
      response = await fetch(
        `https://${token.shopDomain}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token.accessToken,
          },
          body: JSON.stringify({
            query: input.query,
            variables: input.variables ?? {},
          }),
        },
      );
    } catch (error) {
      throw new AppError(
        `Shopify GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as ShopifyGraphqlResponse<T>;
    if (!response.ok) {
      const reason =
        payload.errors?.map((entry) => trimOrEmpty(entry.message)).filter(Boolean).join('; ') ||
        `HTTP ${response.status}`;
      throw new AppError(
        `Shopify GraphQL request failed: ${reason}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    if (payload.errors?.length) {
      throw new AppError(
        `Shopify GraphQL returned errors: ${payload.errors
          .map((entry) => trimOrEmpty(entry.message))
          .filter(Boolean)
          .join('; ')}`,
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    if (!payload.data) {
      throw new AppError(
        'Shopify GraphQL returned an empty payload.',
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    return payload.data;
  }

  async probeConnection(userId: number) {
    const token = await this.getAccessToken(userId);

    // Use scopes from the token exchange response — available without any extra GraphQL call.
    // This is the most reliable source of granted scopes for client_credentials apps.
    const grantedScopesFromToken = token.scope;

    // Phase 1: minimal shop info + currentAppInstallation scopes. These fields are accessible
    // with any authenticated Shopify token regardless of granted scopes.
    type ShopBasicData = {
      shop: {
        name: string;
        currencyCode: string;
        billingAddress?: { countryCodeV2?: string | null } | null;
        primaryDomain?: { url?: string | null } | null;
      };
      currentAppInstallation?: {
        accessScopes?: Array<{ handle: string }>;
      } | null;
    };

    const shopData = await this.graphql<ShopBasicData>({
      userId,
      query: `
        query CjShopifyUsaProbeShop {
          shop {
            name
            currencyCode
            billingAddress {
              countryCodeV2
            }
            primaryDomain {
              url
            }
          }
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    });

    // Merge scopes: prefer GraphQL-reported scopes; fall back to token exchange scopes.
    const graphqlScopes =
      shopData.currentAppInstallation?.accessScopes?.map((s) => trimOrEmpty(s.handle)).filter(Boolean) ?? [];
    const grantedScopes = graphqlScopes.length > 0 ? graphqlScopes : grantedScopesFromToken;
    const missingScopes = CJ_SHOPIFY_USA_REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));

    // Phase 2: locations — requires read_locations scope.
    let locations: NonNullable<ShopifyProbeData['locations']>['nodes'] = [];
    if (grantedScopes.includes('read_locations')) {
      try {
        const locData = await this.graphql<Pick<ShopifyProbeData, 'locations'>>({
          userId,
          query: `
            query CjShopifyUsaProbeLocations {
              locations(first: 20) {
                nodes {
                  id
                  name
                  isActive
                  fulfillsOnlineOrders
                }
              }
            }
          `,
        });
        locations = locData.locations?.nodes ?? [];
      } catch {
        // Non-fatal: location data is informational for the probe
      }
    }

    // Phase 3: publications — requires read_publications scope.
    let publications: NonNullable<ShopifyProbeData['publications']>['nodes'] = [];
    if (grantedScopes.includes('read_publications')) {
      try {
        const pubData = await this.graphql<Pick<ShopifyProbeData, 'publications'>>({
          userId,
          query: `
            query CjShopifyUsaProbePublications {
              publications(first: 20) {
                nodes {
                  id
                  name
                  autoPublish
                  supportsFuturePublishing
                }
              }
            }
          `,
        });
        publications = pubData.publications?.nodes ?? [];
      } catch {
        // Non-fatal: publication data is informational for the probe
      }
    }

    // Phase 4: webhookSubscriptions — requires write_webhooks or similar; try optimistically.
    let webhookSubscriptions: NonNullable<ShopifyProbeData['webhookSubscriptions']>['nodes'] = [];
    try {
      const whData = await this.graphql<Pick<ShopifyProbeData, 'webhookSubscriptions'>>({
        userId,
        query: `
          query CjShopifyUsaProbeWebhooks {
            webhookSubscriptions(first: 20) {
              nodes {
                id
                topic
                uri
              }
            }
          }
        `,
      });
      webhookSubscriptions = whData.webhookSubscriptions?.nodes ?? [];
    } catch {
      // Non-fatal: webhook data is informational for the probe
    }

    return {
      shopDomain: token.shopDomain,
      accessTokenExpiresAt: new Date(token.expiresAtMs).toISOString(),
      shop: {
        name: trimOrEmpty(shopData.shop?.name),
        currencyCode: trimOrEmpty(shopData.shop?.currencyCode),
        countryCode: trimOrEmpty(shopData.shop?.billingAddress?.countryCodeV2),
        primaryDomainUrl: trimOrEmpty(shopData.shop?.primaryDomain?.url),
      },
      grantedScopes,
      missingScopes,
      locations,
      publications,
      webhookSubscriptions,
    };
  }

  async ensureWebhookSubscriptions(userId: number) {
    const probe = await this.probeConnection(userId);
    const requiredUris = getRequiredWebhookUris();
    const existing = new Map(
      probe.webhookSubscriptions.map((subscription) => [
        `${subscription.topic}::${subscription.uri}`,
        subscription,
      ]),
    );

    const created: Array<{ id: string; topic: string; uri: string }> = [];
    for (const topic of CJ_SHOPIFY_USA_REQUIRED_WEBHOOK_TOPICS) {
      const uri = requiredUris[topic];
      if (existing.has(`${topic}::${uri}`)) {
        continue;
      }

      const data = await this.graphql<{
        webhookSubscriptionCreate: {
          webhookSubscription?: { id: string; topic: string; uri: string } | null;
          userErrors: ShopifyGraphqlUserError[];
        };
      }>({
        userId,
        query: `
          mutation CjShopifyUsaRegisterWebhook(
            $topic: WebhookSubscriptionTopic!
            $webhookSubscription: WebhookSubscriptionInput!
          ) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
              webhookSubscription {
                id
                topic
                uri
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          topic,
          webhookSubscription: { uri },
        },
      });

      const userErrors = data.webhookSubscriptionCreate.userErrors ?? [];
      if (userErrors.length > 0 || !data.webhookSubscriptionCreate.webhookSubscription) {
        throw new AppError(
          `Shopify rejected webhook registration for ${topic}: ${userErrors
            .map((entry) => entry.message)
            .join('; ') || 'unknown error'}`,
          400,
          ErrorCode.EXTERNAL_API_ERROR,
        );
      }

      created.push(data.webhookSubscriptionCreate.webhookSubscription);
    }

    return {
      created,
      expected: Object.entries(requiredUris).map(([topic, uri]) => ({ topic, uri })),
      existing: probe.webhookSubscriptions,
    };
  }

  async upsertProduct(input: {
    userId: number;
    identifierId?: string | null;
    handle?: string | null;
    title: string;
    descriptionHtml?: string | null;
    vendor?: string | null;
    productType?: string | null;
    tags?: string[];
    sku: string;
    price: number;
    media?: Array<{
      originalSource: string;
      mediaContentType: 'IMAGE';
      alt?: string;
    }>;
    status?: 'ACTIVE' | 'DRAFT';
  }) {
    const normalizedMedia = input.media?.map((m) => {
      const src = normalizeShopifyMediaSource(m.originalSource);
      return {
        ...m,
        originalSource: src,
      };
    }).filter((m) => Boolean(m.originalSource));

    if (normalizedMedia?.length) {
      console.log(`[ShopifyAdmin] Prepared ${normalizedMedia.length} media items. First URL: ${normalizedMedia[0].originalSource}`);
    }

    const data = await this.graphql<{
      productSet: {
        product?: {
          id: string;
          handle: string;
          status: string;
          variants?: {
            nodes?: Array<{
              id: string;
              sku: string;
              price: string;
              inventoryItem?: { id: string } | null;
            }>;
          } | null;
        } | null;
        userErrors: ShopifyGraphqlUserError[];
      };
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaUpsertProduct(
          $input: ProductSetInput!
          $identifier: ProductSetIdentifiers
        ) {
          productSet(synchronous: true, input: $input, identifier: $identifier) {
            product {
              id
              handle
              status
              variants(first: 10) {
                nodes {
                  id
                  sku
                  price
                  inventoryItem {
                    id
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        identifier: input.identifierId ? { id: input.identifierId } : undefined,
        input: {
          title: input.title,
          handle: trimOrEmpty(input.handle) || undefined,
          descriptionHtml: trimOrEmpty(input.descriptionHtml) || undefined,
          vendor: trimOrEmpty(input.vendor) || undefined,
          productType: trimOrEmpty(input.productType) || undefined,
          status: input.status || 'ACTIVE',
          tags: input.tags?.filter(Boolean) ?? [],
          productOptions: [
            {
              name: 'Title',
              position: 1,
              values: [{ name: 'Default Title' }],
            },
          ],
          variants: [
            {
              optionValues: [
                {
                  optionName: 'Title',
                  name: 'Default Title',
                },
              ],
              sku: input.sku,
              price: Number(input.price.toFixed(2)),
              taxable: true,
              inventoryPolicy: 'DENY',
              inventoryItem: {
                tracked: true,
              },
            },
          ],
        },
      },
    });

    const errors = data.productSet.userErrors ?? [];
    const product = data.productSet.product;

    if (errors.length > 0 || !product) {
      throw new AppError(
        `Shopify product upsert failed: ${errors.map((entry) => entry.message).join('; ') || 'unknown error'}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    const variant =
      product.variants?.nodes?.find((node) => trimOrEmpty(node.sku) === trimOrEmpty(input.sku)) ||
      product.variants?.nodes?.[0];

    if (!variant?.inventoryItem?.id) {
      throw new AppError(
        'Shopify product upsert returned no inventory item for the variant.',
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    // Phase Debug: log the upsert results for image publication verification
    console.log(`[ShopifyAdmin] upsertProduct result: productId=${product.id}, handle=${product.handle}, mediaCount=${normalizedMedia?.length ?? 0}`);

    return {
      productId: product.id,
      handle: product.handle,
      status: product.status,
      variantId: variant.id,
      inventoryItemId: variant.inventoryItem.id,
    };
  }

  async setInventoryQuantity(input: {
    userId: number;
    inventoryItemId: string;
    locationId: string;
    quantity: number;
    referenceDocumentUri: string;
    idempotencyKey: string;
  }) {
    const data = await this.graphql<{
      inventorySetQuantities: {
        userErrors: Array<{ message: string }>;
      };
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaSetInventory(
          $input: InventorySetQuantitiesInput!
          $idempotencyKey: String!
        ) {
          inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        idempotencyKey: input.idempotencyKey,
        input: {
          name: 'available',
          reason: 'correction',
          referenceDocumentUri: input.referenceDocumentUri,
          quantities: [
            {
              inventoryItemId: input.inventoryItemId,
              locationId: input.locationId,
              quantity: Math.max(0, Math.floor(input.quantity)),
              changeFromQuantity: null,
            },
          ],
        },
      },
    });

    const errors = data.inventorySetQuantities.userErrors ?? [];
    if (errors.length > 0) {
      throw new AppError(
        `Shopify inventory sync failed: ${errors.map((entry) => entry.message).join('; ')}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }

  async publishProductToPublication(input: {
    userId: number;
    productId: string;
    publicationId: string;
  }) {
    const data = await this.graphql<{
      publishablePublish: {
        userErrors: ShopifyGraphqlUserError[];
        publishable?: {
          publishedOnPublication?: boolean;
        } | null;
      };
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaPublishProduct($id: ID!, $publicationId: ID!) {
          publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
            publishable {
              publishedOnPublication(publicationId: $publicationId)
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        id: input.productId,
        publicationId: input.publicationId,
      },
    });

    const errors = data.publishablePublish.userErrors ?? [];
    const published = Boolean(data.publishablePublish.publishable?.publishedOnPublication);
    if (!published || errors.length > 0) {
      throw new AppError(
        `Shopify publication failed: ${errors.map((entry) => entry.message).join('; ') || 'product not published'}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }

  async unpublishProductFromPublication(input: {
    userId: number;
    productId: string;
    publicationId: string;
  }) {
    const data = await this.graphql<{
      publishableUnpublish: {
        userErrors: ShopifyGraphqlUserError[];
        publishable?: {
          publishedOnPublication?: boolean;
        } | null;
      };
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaUnpublishProduct($id: ID!, $publicationId: ID!) {
          publishableUnpublish(id: $id, input: { publicationId: $publicationId }) {
            publishable {
              publishedOnPublication(publicationId: $publicationId)
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        id: input.productId,
        publicationId: input.publicationId,
      },
    });

    const errors = data.publishableUnpublish.userErrors ?? [];
    const stillPublished = Boolean(data.publishableUnpublish.publishable?.publishedOnPublication);
    if (errors.length > 0 || stillPublished) {
      throw new AppError(
        `Shopify unpublish failed: ${errors.map((entry) => entry.message).join('; ') || 'product still published on publication'}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }
  }

  async verifyStorefrontProductPage(input: {
    userId: number;
    productHandle: string;
  }): Promise<StorefrontVerificationResult> {
    const token = await this.getAccessToken(input.userId);
    const storefrontUrl = buildShopifyStorefrontUrl(token.shopDomain, input.productHandle);

    try {
      const response = await fetch(storefrontUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 Ivan Reseller Storefront Integrity Auditor',
        },
      });

      const html = await response.text();
      const finalUrl = response.url;
      const lowerHtml = html.toLowerCase();
      const lowerFinalUrl = finalUrl.toLowerCase();
      const handle = trimOrEmpty(input.productHandle).toLowerCase();

      const markers = [
        'Enter store using password',
        '/password',
        'Opening soon',
        'store using password',
        'password',
        'coming soon',
        'not open to the public',
        '404',
        'not found',
      ].filter((marker) =>
        lowerHtml.includes(marker.toLowerCase()) ||
        lowerFinalUrl.includes(marker.toLowerCase()),
      );

      const passwordGate =
        lowerFinalUrl.includes('/password') ||
        lowerHtml.includes('enter store using password') ||
        lowerHtml.includes('opening soon');
      const hasAddToCart =
        /\/cart\/add|add to cart|agregar al carrito|data-type="add-to-cart-form"|name="add"/i.test(html);
      const hasPrice = /\$\s?\d|usd/i.test(html);
      const finalUrlMatchesHandle =
        lowerFinalUrl.includes(`/products/${encodeURIComponent(handle)}`) ||
        lowerFinalUrl.includes(`/products/${handle}`);
      const hasNotFoundMarker = /404|not found/i.test(html.slice(0, 3000));
      const buyerFacingOk =
        response.status >= 200 &&
        response.status < 300 &&
        finalUrlMatchesHandle &&
        !passwordGate &&
        !hasNotFoundMarker &&
        hasAddToCart &&
        hasPrice;

      return {
        shopDomain: token.shopDomain,
        storefrontUrl,
        status: response.status,
        finalUrl,
        passwordGate,
        buyerFacingOk,
        hasAddToCart,
        hasPrice,
        markers,
      };
    } catch (error) {
      return {
        shopDomain: token.shopDomain,
        storefrontUrl,
        status: null,
        finalUrl: null,
        passwordGate: false,
        buyerFacingOk: false,
        hasAddToCart: false,
        hasPrice: false,
        markers: ['FETCH_ERROR'],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getProductMediaCount(input: { userId: number; productId: string }) {
    const data = await this.graphql<{
      product?: {
        media?: {
          nodes?: Array<{ id: string }>;
        } | null;
      } | null;
    }>({
      userId: input.userId,
      query: `
        query CjShopifyUsaProductMedia($productId: ID!) {
          product(id: $productId) {
            media(first: 50) {
              nodes {
                id
              }
            }
          }
        }
      `,
      variables: { productId: input.productId },
    });
    return data.product?.media?.nodes?.length ?? 0;
  }

  async productCreateMedia(input: {
    userId: number;
    productId: string;
    media: Array<{
      originalSource: string;
      mediaContentType: 'IMAGE';
      alt?: string;
    }>;
  }) {
    const data = await this.graphql<{
      productCreateMedia?: {
        media?: Array<{ id: string; status: string }> | null;
        mediaUserErrors?: ShopifyGraphqlUserError[] | null;
        userErrors?: ShopifyGraphqlUserError[] | null;
      } | null;
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaProductCreateMedia(
          $productId: ID!
          $media: [CreateMediaInput!]!
        ) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              id
              status
            }
            mediaUserErrors {
              field
              message
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        productId: input.productId,
        media: input.media.map((m) => ({
          originalSource: normalizeShopifyMediaSource(m.originalSource),
          mediaContentType: m.mediaContentType,
          alt: trimOrEmpty(m.alt) || undefined,
        })).filter((m) => Boolean(m.originalSource)),
      },
    });

    const errors = [
      ...(data.productCreateMedia?.mediaUserErrors ?? []),
      ...(data.productCreateMedia?.userErrors ?? []),
    ];
    const media = data.productCreateMedia?.media ?? [];

    if (errors.length > 0) {
      throw new AppError(
        `Shopify productCreateMedia failed: ${errors.map((e) => e.message).join('; ')}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    if (input.media.length > 0 && media.length === 0) {
      throw new AppError(
        'Shopify productCreateMedia returned no media for the submitted image URLs.',
        502,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    return media;
  }

  async updateProductStatus(input: {
    userId: number;
    productId: string;
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  }) {
    const data = await this.graphql<{
      productUpdate?: {
        product?: { id: string; status: string } | null;
        userErrors?: ShopifyGraphqlUserError[] | null;
      } | null;
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaUpdateProductStatus($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        product: {
          id: input.productId,
          status: input.status,
        },
      },
    });

    const errors = data.productUpdate?.userErrors ?? [];
    const product = data.productUpdate?.product;
    if (errors.length > 0 || !product) {
      throw new AppError(
        `Shopify product status update failed: ${errors.map((entry) => entry.message).join('; ') || 'unknown error'}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    return product;
  }

  async listRecentOrders(input: {
    userId: number;
    first: number;
    sinceIso?: string;
    orderId?: string;
  }) {
    const queryParts: string[] = [];
    if (trimOrEmpty(input.orderId)) {
      queryParts.push(`id:${trimOrEmpty(input.orderId)}`);
    }
    if (trimOrEmpty(input.sinceIso)) {
      queryParts.push(`created_at:>=${trimOrEmpty(input.sinceIso)}`);
    }

    const data = await this.graphql<{
      orders: {
        nodes: Array<{
          id: string;
          name: string;
          createdAt: string;
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
          currentTotalPriceSet?: {
            shopMoney?: {
              amount: string;
              currencyCode: string;
            } | null;
          } | null;
          shippingAddress?: {
            name?: string | null;
            address1?: string | null;
            address2?: string | null;
            city?: string | null;
            provinceCode?: string | null;
            zip?: string | null;
            countryCodeV2?: string | null;
            phone?: string | null;
          } | null;
          lineItems?: {
            nodes?: Array<{
              id: string;
              sku?: string | null;
              quantity: number;
              product?: { id: string; title: string } | null;
              variant?: { id: string; title: string; sku?: string | null } | null;
            }>;
          } | null;
          fulfillmentOrders?: {
            nodes?: Array<{
              id: string;
              status: string;
              requestStatus: string;
              assignedLocation?: {
                location?: {
                  id: string;
                  name: string;
                } | null;
              } | null;
              lineItems?: {
                nodes?: Array<{
                  id: string;
                  remainingQuantity: number;
                  totalQuantity: number;
                  lineItem?: {
                    id: string;
                    sku?: string | null;
                  } | null;
                }>;
              } | null;
            }>;
          } | null;
        }>;
      };
    }>({
      userId: input.userId,
      query: `
        query CjShopifyUsaOrders($first: Int!, $query: String) {
          orders(first: $first, reverse: true, sortKey: PROCESSED_AT, query: $query) {
            nodes {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              shippingAddress {
                name
                address1
                address2
                city
                provinceCode
                zip
                countryCodeV2
                phone
              }
              lineItems(first: 50) {
                nodes {
                  id
                  sku
                  quantity
                  product {
                    id
                    title
                  }
                  variant {
                    id
                    title
                    sku
                  }
                }
              }
              fulfillmentOrders(first: 20) {
                nodes {
                  id
                  status
                  requestStatus
                  assignedLocation {
                    location {
                      id
                      name
                    }
                  }
                  lineItems(first: 50) {
                    nodes {
                      id
                      remainingQuantity
                      totalQuantity
                      lineItem {
                        id
                        sku
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        first: Math.max(1, Math.min(50, Math.floor(input.first))),
        query: queryParts.length > 0 ? queryParts.join(' AND ') : undefined,
      },
    });

    return data.orders.nodes ?? [];
  }

  async createFulfillment(input: {
    userId: number;
    fulfillmentOrderId: string;
    fulfillmentOrderLineItemId?: string | null;
    quantity?: number | null;
    trackingNumber: string;
    trackingUrl?: string | null;
    carrierCode?: string | null;
    notifyCustomer?: boolean;
  }) {
    const lineItems =
      trimOrEmpty(input.fulfillmentOrderLineItemId) && Number(input.quantity || 0) > 0
        ? [
            {
              id: input.fulfillmentOrderLineItemId,
              quantity: Math.max(1, Math.floor(Number(input.quantity))),
            },
          ]
        : [];

    const data = await this.graphql<{
      fulfillmentCreate: {
        fulfillment?: { id: string; status: string } | null;
        userErrors: ShopifyGraphqlUserError[];
      };
    }>({
      userId: input.userId,
      query: `
        mutation CjShopifyUsaCreateFulfillment(
          $fulfillment: FulfillmentInput!
          $message: String
        ) {
          fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
            fulfillment {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        message: 'Tracking synced from CJ by Ivan Reseller Integration',
        fulfillment: {
          notifyCustomer: input.notifyCustomer === true,
          trackingInfo: {
            number: input.trackingNumber,
            url: trimOrEmpty(input.trackingUrl) || undefined,
            company: trimOrEmpty(input.carrierCode) || undefined,
            numbers: [input.trackingNumber],
            urls: trimOrEmpty(input.trackingUrl) ? [trimOrEmpty(input.trackingUrl)] : undefined,
          },
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: input.fulfillmentOrderId,
              fulfillmentOrderLineItems: lineItems,
            },
          ],
        },
      },
    });

    const errors = data.fulfillmentCreate.userErrors ?? [];
    if (!data.fulfillmentCreate.fulfillment || errors.length > 0) {
      throw new AppError(
        `Shopify fulfillment create failed: ${errors.map((entry) => entry.message).join('; ') || 'unknown error'}`,
        400,
        ErrorCode.EXTERNAL_API_ERROR,
      );
    }

    return data.fulfillmentCreate.fulfillment;
  }

  /**
   * Verifica el estado del storefront de Shopify para determinar si está
   * protegido por password gate o es público.
   *
   * NOTA: El password gate de Shopify NO puede ser controlado mediante la API
   * de administración. Requiere acción manual en el admin panel de Shopify o
   * mediante Shopify CLI.
   */
  async checkStorefrontStatus(userId: number, productHandle: string): Promise<{
    shopDomain: string;
    storefrontUrl: string;
    status: number | null;
    finalUrl: string | null;
    passwordGate: boolean;
    buyerFacingOk: boolean;
    markers: string[];
    error?: string;
  }> {
    return this.verifyStorefrontProductPage({ userId, productHandle });
  }
}

export const cjShopifyUsaAdminService = new CjShopifyUsaAdminService();
