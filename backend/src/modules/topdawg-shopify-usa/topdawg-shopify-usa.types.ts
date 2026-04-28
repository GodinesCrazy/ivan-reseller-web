export type TopDawgProduct = {
  sku: string;
  title: string;
  description: string;
  images: string[];
  wholesaleCost: number;
  msrp: number;
  category: string;
  brand: string;
  upc?: string;
  variants: TopDawgVariant[];
};

export type TopDawgVariant = {
  sku: string;
  title: string;
  wholesaleCost: number;
  msrp: number;
  stockQty: number;
  attributes: Record<string, string>;
};

export type TopDawgOrderRequest = {
  orderRef: string;
  shippingAddress: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
  items: Array<{ sku: string; qty: number }>;
};

export type TopDawgOrderStatus = {
  orderId: string;
  status: string;
  tracking?: {
    number: string;
    carrier: string;
    url?: string;
  };
  items: Array<{ sku: string; qty: number; shipped: number }>;
};

export type TopDawgShopifyUsaPricingBreakdown = {
  wholesaleCostUsd: number;
  shippingEstimateUsd: number;
  paymentFeeUsd: number;
  platformFeeUsd: number;
  totalCostUsd: number;
  suggestedPriceUsd: number;
  compareAtPriceUsd: number;
  marginPct: number;
  profitUsd: number;
};

export type TopDawgShopifyUsaQualificationResult = {
  approved: boolean;
  reason: string;
  pricing: TopDawgShopifyUsaPricingBreakdown;
};
