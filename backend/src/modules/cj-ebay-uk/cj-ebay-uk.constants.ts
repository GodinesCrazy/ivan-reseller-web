/**
 * CJ → eBay UK vertical — constants.
 * Mirrors cj-ebay.constants.ts; destination = United Kingdom (GB).
 * Key differences: GBP currency, UK VAT 20%, eBay UK siteId=3, GB warehouse probing.
 */

export const CJ_EBAY_UK_API_CREDENTIAL_NAME = 'cj-dropshipping' as const;

export const CJ_EBAY_UK_TRACE_STEP = {
  REQUEST_START: 'request.start',
  REQUEST_COMPLETE: 'request.complete',
  REQUEST_ERROR: 'request.error',
  CJ_FREIGHT_REQUEST: 'cj.freight.request',
  CJ_FREIGHT_RESPONSE: 'cj.freight.response',
  CJ_FREIGHT_ERROR: 'cj.freight.error',
  QUALIFICATION_START: 'qualification.start',
  QUALIFICATION_RESULT: 'qualification.result',
  PRICING_PREVIEW: 'pricing.preview',
  PRICING_ERROR: 'pricing.error',
  LISTING_DRAFT_START: 'listing.draft.start',
  LISTING_DRAFT_CREATED: 'listing.draft.created',
  LISTING_PUBLISH_START: 'listing.publish.start',
  LISTING_PUBLISH_SUCCESS: 'listing.publish.success',
  LISTING_PUBLISH_ERROR: 'listing.publish.error',
  LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK: 'listing.publish.account_policy_block',
  LISTING_PUBLISH_OFFER_ALREADY_EXISTS: 'listing.publish.offer_already_exists',
  LISTING_RECONCILE_START: 'listing.reconcile.start',
  LISTING_RECONCILE_SUCCESS: 'listing.reconcile.success',
  LISTING_RECONCILE_PUBLISHED: 'listing.reconcile.published',
  LISTING_RECONCILE_PENDING: 'listing.reconcile.pending',
  LISTING_RECONCILE_FAILED: 'listing.reconcile.failed',
  LISTING_EBAY_SNAPSHOT: 'listing.ebay.snapshot',
  LISTING_FORCE_RESET: 'listing.force.reset',
  LISTING_PAUSE: 'listing.pause',
  ORDER_IMPORT_START: 'order.import.start',
  ORDER_IMPORT_SUCCESS: 'order.import.success',
  ORDER_IMPORT_ERROR: 'order.import.error',
  ORDER_PLACE_START: 'order.place.start',
  ORDER_PLACE_SUCCESS: 'order.place.success',
  ORDER_PLACE_ERROR: 'order.place.error',
  TRACKING_SYNC_START: 'tracking.sync.start',
  TRACKING_SYNC_SUCCESS: 'tracking.sync.success',
  TRACKING_SYNC_ERROR: 'tracking.sync.error',
  CJ_ORDER_CREATE_START: 'cj.order.create.start',
  CJ_ORDER_CREATE_SUCCESS: 'cj.order.create.success',
  CJ_ORDER_CREATE_ERROR: 'cj.order.create.error',
  CJ_ORDER_STATUS_START: 'cj.order.status.start',
  CJ_ORDER_STATUS_SUCCESS: 'cj.order.status.success',
  CJ_ORDER_STATUS_ERROR: 'cj.order.status.error',
  CJ_TRACKING_START: 'cj.tracking.start',
  CJ_TRACKING_SUCCESS: 'cj.tracking.success',
  CJ_TRACKING_ERROR: 'cj.tracking.error',
  CJ_ORDER_CONFIRM_START: 'cj.order.confirm.start',
  CJ_ORDER_CONFIRM_SUCCESS: 'cj.order.confirm.success',
  CJ_ORDER_CONFIRM_ERROR: 'cj.order.confirm.error',
  CJ_ORDER_PAY_START: 'cj.order.pay.start',
  CJ_ORDER_PAY_SUCCESS: 'cj.order.pay.success',
  CJ_ORDER_PAY_ERROR: 'cj.order.pay.error',
  CJ_ORDER_PAY_BALANCE_BLOCKED: 'cj.order.pay.balance_blocked',
  REFUND_CREATED: 'refund.created',
  REFUND_STATUS_UPDATED: 'refund.status.updated',
  ALERT_CREATED: 'alert.created',
  ALERT_RESOLVED: 'alert.resolved',
} as const;

export const CJ_EBAY_UK_POST_CREATE_CHECKOUT_MODE = {
  MANUAL: 'MANUAL',
  AUTO_CONFIRM_PAY: 'AUTO_CONFIRM_PAY',
} as const;

export const CJ_EBAY_UK_ORDER_STATUS = {
  DETECTED: 'DETECTED',
  VALIDATED: 'VALIDATED',
  CJ_ORDER_PLACING: 'CJ_ORDER_PLACING',
  CJ_ORDER_PLACED: 'CJ_ORDER_PLACED',
  CJ_ORDER_CREATED: 'CJ_ORDER_CREATED',
  CJ_ORDER_CONFIRMING: 'CJ_ORDER_CONFIRMING',
  CJ_ORDER_CONFIRMED: 'CJ_ORDER_CONFIRMED',
  CJ_PAYMENT_PENDING: 'CJ_PAYMENT_PENDING',
  CJ_PAYMENT_PROCESSING: 'CJ_PAYMENT_PROCESSING',
  CJ_PAYMENT_COMPLETED: 'CJ_PAYMENT_COMPLETED',
  CJ_FULFILLING: 'CJ_FULFILLING',
  CJ_SHIPPED: 'CJ_SHIPPED',
  TRACKING_ON_EBAY: 'TRACKING_ON_EBAY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NEEDS_MANUAL: 'NEEDS_MANUAL',
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
} as const;

export const CJ_EBAY_UK_PAYMENT_BLOCK_REASON = {
  CJ_BALANCE_INSUFFICIENT: 'CJ_BALANCE_INSUFFICIENT',
  PAYMENT_METHOD_UNSUPPORTED: 'PAYMENT_METHOD_UNSUPPORTED',
  PAY_BALANCE_V2_NOT_IMPLEMENTED: 'PAY_BALANCE_V2_NOT_IMPLEMENTED',
} as const;

export const CJ_EBAY_UK_REFUND_STATUS = {
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_REJECTED: 'RETURN_REJECTED',
  RETURN_IN_TRANSIT: 'RETURN_IN_TRANSIT',
  RETURN_RECEIVED: 'RETURN_RECEIVED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUND_PARTIAL: 'REFUND_PARTIAL',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  REFUND_FAILED: 'REFUND_FAILED',
  NEEDS_MANUAL_REFUND: 'NEEDS_MANUAL_REFUND',
} as const;

export const CJ_EBAY_UK_ALERT_TYPE = {
  REFUND_PENDING: 'REFUND_PENDING',
  RETURN_IN_PROGRESS: 'RETURN_IN_PROGRESS',
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
  ORDER_FAILED: 'ORDER_FAILED',
  ORDER_NEEDS_MANUAL: 'ORDER_NEEDS_MANUAL',
  TRACKING_MISSING: 'TRACKING_MISSING',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  REFUND_FAILED: 'REFUND_FAILED',
  ORDER_LOSS: 'ORDER_LOSS',
} as const;

export const CJ_EBAY_UK_LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  ACCOUNT_POLICY_BLOCK: 'ACCOUNT_POLICY_BLOCK',
  OFFER_ALREADY_EXISTS: 'OFFER_ALREADY_EXISTS',
  RECONCILE_PENDING: 'RECONCILE_PENDING',
  RECONCILE_FAILED: 'RECONCILE_FAILED',
} as const;

/** eBay UK marketplace identifiers. */
export const EBAY_UK_SITE_ID = 3;
export const EBAY_UK_MARKETPLACE_ID = 'EBAY_GB';
export const EBAY_UK_CURRENCY = 'GBP';

/** CJ destination country for GB shipping quotes. */
export const CJ_EBAY_UK_DEST_COUNTRY = 'GB';

/**
 * UK VAT: eBay UK is marketplace facilitator for B2C orders ≤ £135.
 * eBay collects 20% VAT from buyer and remits to HMRC; deducts from seller payout.
 * Source: HMRC / eBay UK seller policies (effective Jan 2021).
 * HEURISTIC: Applies only to B2C orders. B2B and >£135 have different rules.
 */
export const UK_VAT_STANDARD_RATE_PCT = 20;
export const UK_VAT_MARKETPLACE_THRESHOLD_GBP = 135;

/** eBay UK FVF approximate default — slightly lower than USA (12.8% vs 13.25%). */
export const PRICING_UK_DEFAULT_EBAY_FEE_PCT = 12.8;
