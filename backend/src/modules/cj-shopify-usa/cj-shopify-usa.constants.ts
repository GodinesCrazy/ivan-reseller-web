/**
 * CJ → Shopify USA vertical — constants.
 * API credential name for Shopify must match ApiCredential.apiName when implemented.
 */
export const CJ_SHOPIFY_USA_API_CREDENTIAL_NAME = 'shopify' as const;
export const CJ_SHOPIFY_USA_CJ_API_CREDENTIAL_NAME = 'cj-dropshipping' as const;

/**
 * Shopify Dev Dashboard apps installed on the same org/store use client_credentials grant.
 * These scopes are the minimum set for the current CJ → Shopify USA backend:
 * - product draft/publish
 * - inventory source-of-truth sync
 * - order ingestion
 * - merchant-managed fulfillment/tracking push
 * - publication lookup/publish
 */
export const CJ_SHOPIFY_USA_REQUIRED_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_publications',
  'write_publications',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
] as const;

export const CJ_SHOPIFY_USA_REQUIRED_WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'APP_UNINSTALLED',
] as const;

export const CJ_SHOPIFY_USA_TRACE_STEP = {
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
  LISTING_FORCE_RESET: 'listing.force.reset',
  LISTING_PAUSE: 'listing.pause',
  LISTING_UNPUBLISH: 'listing.unpublish',
  LISTING_RECONCILE_START: 'listing.reconcile.start',
  LISTING_RECONCILE_SUCCESS: 'listing.reconcile.success',
  LISTING_RECONCILE_PUBLISHED: 'listing.reconcile.published',
  LISTING_RECONCILE_PENDING: 'listing.reconcile.pending',
  LISTING_RECONCILE_FAILED: 'listing.reconcile.failed',
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

export const CJ_SHOPIFY_USA_POST_CREATE_CHECKOUT_MODE = {
  MANUAL: 'MANUAL',
  AUTO_CONFIRM_PAY: 'AUTO_CONFIRM_PAY',
} as const;

export const CJ_SHOPIFY_USA_ORDER_STATUS = {
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
  TRACKING_ON_SHOPIFY: 'TRACKING_ON_SHOPIFY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NEEDS_MANUAL: 'NEEDS_MANUAL',
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
} as const;

export const CJ_SHOPIFY_USA_PAYMENT_BLOCK_REASON = {
  CJ_BALANCE_INSUFFICIENT: 'CJ_BALANCE_INSUFFICIENT',
  PAYMENT_METHOD_UNSUPPORTED: 'PAYMENT_METHOD_UNSUPPORTED',
  PAY_BALANCE_V2_NOT_IMPLEMENTED: 'PAY_BALANCE_V2_NOT_IMPLEMENTED',
} as const;

export const CJ_SHOPIFY_USA_REFUND_STATUS = {
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

export const CJ_SHOPIFY_USA_ALERT_TYPE = {
  REFUND_PENDING: 'REFUND_PENDING',
  RETURN_IN_PROGRESS: 'RETURN_IN_PROGRESS',
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
  ORDER_FAILED: 'ORDER_FAILED',
  ORDER_NEEDS_MANUAL: 'ORDER_NEEDS_MANUAL',
  TRACKING_MISSING: 'TRACKING_MISSING',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  REFUND_FAILED: 'REFUND_FAILED',
  ORDER_LOSS: 'ORDER_LOSS',
  SHOPIFY_DISCONNECTED: 'SHOPIFY_DISCONNECTED',
} as const;

export const CJ_SHOPIFY_USA_LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  RECONCILE_PENDING: 'RECONCILE_PENDING',
  RECONCILE_FAILED: 'RECONCILE_FAILED',
} as const;
