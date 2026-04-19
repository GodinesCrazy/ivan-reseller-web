export interface CjShopifyUsaShippingQuoteResponse {
  amountUsd: number;
  currency: string;
  serviceName: string | null;
  carrier: string | null;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  confidence: 'CONFIRMED' | 'ESTIMATED' | 'UNKNOWN';
  originCountryCode: string;
}

export interface CjShopifyUsaPricingBreakdown {
  supplierCostUsd: number;
  shippingUsd: number;
  subtotalCostUsd: number;
  baseMarginUsd: number;
  incidentBufferUsd: number;
  transactionFeeUsd: number;
  finalPriceUsd: number;
  finalMarginPct: number;
}

export interface CjShopifyUsaQualificationResult {
  isViable: boolean;
  reasons: string[];
  pricingBreakdown: CjShopifyUsaPricingBreakdown | null;
  shippingQuote: CjShopifyUsaShippingQuoteResponse | null;
}

export interface ShopifyProductPayload {
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags?: string;
  variants: Array<{
    price: string;
    sku: string;
    option1: string;
    option2?: string;
    option3?: string;
    inventory_management: string;
    inventory_policy: string;
  }>;
  options: Array<{
    name: string;
    values: string[];
  }>;
  images: Array<{
    src: string;
  }>;
}
