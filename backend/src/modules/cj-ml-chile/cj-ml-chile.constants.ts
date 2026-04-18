/**
 * CJ → ML Chile vertical — constants (MVP).
 * Totalmente aislado de CJ→eBay USA y legacy ML.
 */

export const CJ_ML_CHILE_API_CREDENTIAL_NAME = 'cj-dropshipping' as const;
export const ML_CHILE_SITE_ID = 'MLC' as const;

/** IVA Chile 19% (Ley 20.780 + servicios digitales Oct 2025). */
export const CL_IVA_RATE = 0.19;

/** % comisión ML Chile por defecto (variable según categoría; 12% es referencia general). */
export const MLC_DEFAULT_FEE_PCT = 12;

/** % fee Mercado Pago (procesamiento pago seller). */
export const MP_DEFAULT_PAYMENT_FEE_PCT = 5.18;

/** % buffer incidentes por defecto. */
export const DEFAULT_INCIDENT_BUFFER_PCT = 2;

export const CJ_ML_CHILE_TRACE_STEP = {
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
  FX_CONVERT: 'fx.convert',
  FX_ERROR: 'fx.error',
  LISTING_DRAFT_START: 'listing.draft.start',
  LISTING_DRAFT_CREATED: 'listing.draft.created',
  LISTING_PUBLISH_START: 'listing.publish.start',
  LISTING_PUBLISH_SUCCESS: 'listing.publish.success',
  LISTING_PUBLISH_ERROR: 'listing.publish.error',
  LISTING_PAUSE: 'listing.pause',
  LISTING_FORCE_RESET: 'listing.force.reset',
  ORDER_IMPORT_START: 'order.import.start',
  ORDER_IMPORT_SUCCESS: 'order.import.success',
  ORDER_IMPORT_ERROR: 'order.import.error',
  CJ_ORDER_CREATE_START: 'cj.order.create.start',
  CJ_ORDER_CREATE_SUCCESS: 'cj.order.create.success',
  CJ_ORDER_CREATE_ERROR: 'cj.order.create.error',
  CJ_ORDER_CONFIRM_START: 'cj.order.confirm.start',
  CJ_ORDER_CONFIRM_SUCCESS: 'cj.order.confirm.success',
  CJ_ORDER_CONFIRM_ERROR: 'cj.order.confirm.error',
  CJ_ORDER_PAY_START: 'cj.order.pay.start',
  CJ_ORDER_PAY_SUCCESS: 'cj.order.pay.success',
  CJ_ORDER_PAY_ERROR: 'cj.order.pay.error',
  CJ_ORDER_PAY_BALANCE_BLOCKED: 'cj.order.pay.balance_blocked',
  TRACKING_SYNC_START: 'tracking.sync.start',
  TRACKING_SYNC_SUCCESS: 'tracking.sync.success',
  TRACKING_SYNC_ERROR: 'tracking.sync.error',
  ALERT_CREATED: 'alert.created',
  ALERT_RESOLVED: 'alert.resolved',
  WAREHOUSE_CHILE_CONFIRMED: 'warehouse.chile.confirmed',
  WAREHOUSE_CHILE_NOT_FOUND: 'warehouse.chile.not_found',
} as const;

export const CJ_ML_CHILE_LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  /** Producto no viable para este canal (sin warehouse Chile confirmado en MVP). */
  NOT_VIABLE: 'NOT_VIABLE',
} as const;

export const CJ_ML_CHILE_ORDER_STATUS = {
  DETECTED: 'DETECTED',
  VALIDATED: 'VALIDATED',
  CJ_ORDER_PLACING: 'CJ_ORDER_PLACING',
  CJ_ORDER_CREATED: 'CJ_ORDER_CREATED',
  CJ_ORDER_CONFIRMING: 'CJ_ORDER_CONFIRMING',
  CJ_ORDER_CONFIRMED: 'CJ_ORDER_CONFIRMED',
  CJ_PAYMENT_PENDING: 'CJ_PAYMENT_PENDING',
  CJ_PAYMENT_PROCESSING: 'CJ_PAYMENT_PROCESSING',
  CJ_PAYMENT_COMPLETED: 'CJ_PAYMENT_COMPLETED',
  CJ_FULFILLING: 'CJ_FULFILLING',
  CJ_SHIPPED: 'CJ_SHIPPED',
  TRACKING_ON_ML: 'TRACKING_ON_ML',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NEEDS_MANUAL: 'NEEDS_MANUAL',
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
} as const;

export const CJ_ML_CHILE_ALERT_TYPE = {
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
  ORDER_FAILED: 'ORDER_FAILED',
  ORDER_NEEDS_MANUAL: 'ORDER_NEEDS_MANUAL',
  TRACKING_MISSING: 'TRACKING_MISSING',
  WAREHOUSE_CHILE_UNAVAILABLE: 'WAREHOUSE_CHILE_UNAVAILABLE',
  FX_RATE_STALE: 'FX_RATE_STALE',
  MARGIN_BELOW_MIN: 'MARGIN_BELOW_MIN',
  ORDER_LOSS: 'ORDER_LOSS',
} as const;

export const CJ_ML_CHILE_EVAL_DECISION = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PENDING: 'PENDING',
  NOT_VIABLE: 'NOT_VIABLE',
} as const;
