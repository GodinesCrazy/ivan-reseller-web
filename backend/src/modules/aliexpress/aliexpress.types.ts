/**
 * Tipos para la integración con AliExpress Affiliate API
 */

export interface AliExpressOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface AliExpressTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
}

export interface AliExpressAffiliateLinkParams {
  productId: string;
  productUrl?: string;
  trackingId: string;
  promotionName?: string;
  promotionUrl?: string;
}

export interface AliExpressAffiliateLinkResponse {
  promotionUrl: string;
  trackingId: string;
  productId: string;
  success: boolean;
  errorMessage?: string;
}

export interface AliExpressProductSearchParams {
  keywords: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  pageNo?: number;
  pageSize?: number;
  sort?: string;
}

export interface AliExpressProduct {
  productId: string;
  productTitle: string;
  productUrl: string;
  productImageUrl: string;
  originalPrice: string;
  salePrice: string;
  discount: string;
  currency: string;
  commissionRate: string;
  commission: string;
  shopUrl: string;
  shopName: string;
}

export interface AliExpressProductSearchResponse {
  products: AliExpressProduct[];
  totalResults: number;
  pageNo: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AliExpressOAuthState {
  state: string;
  timestamp: number;
  redirectUrl?: string;
}

