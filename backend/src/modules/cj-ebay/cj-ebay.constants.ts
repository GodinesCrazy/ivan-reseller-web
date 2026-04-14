/**
 * CJ → eBay USA vertical — constants (FASE 3A).
 * API credential name for CJ must match ApiCredential.apiName when implemented (FASE 3B).
 */
export const CJ_EBAY_API_CREDENTIAL_NAME = 'cj-dropshipping' as const;

export const CJ_EBAY_TRACE_STEP = {
  REQUEST_START: 'request.start',
  REQUEST_COMPLETE: 'request.complete',
  REQUEST_ERROR: 'request.error',
  /** Payload enviado a CJ `freightCalculate` (sin secretos). */
  CJ_FREIGHT_REQUEST: 'cj.freight.request',
  /** Respuesta cruda / duración tras `freightCalculate`. */
  CJ_FREIGHT_RESPONSE: 'cj.freight.response',
  CJ_FREIGHT_ERROR: 'cj.freight.error',
  QUALIFICATION_START: 'qualification.start',
  QUALIFICATION_RESULT: 'qualification.result',
  PRICING_PREVIEW: 'pricing.preview',
  PRICING_ERROR: 'pricing.error',
  /** FASE 3D — listing engine */
  LISTING_DRAFT_START: 'listing.draft.start',
  LISTING_DRAFT_CREATED: 'listing.draft.created',
  LISTING_PUBLISH_START: 'listing.publish.start',
  LISTING_PUBLISH_SUCCESS: 'listing.publish.success',
  LISTING_PUBLISH_ERROR: 'listing.publish.error',
  LISTING_PAUSE: 'listing.pause',
  /** FASE 3E — órdenes */
  ORDER_IMPORT_START: 'order.import.start',
  ORDER_IMPORT_SUCCESS: 'order.import.success',
  ORDER_IMPORT_ERROR: 'order.import.error',
  ORDER_PLACE_START: 'order.place.start',
  ORDER_PLACE_SUCCESS: 'order.place.success',
  ORDER_PLACE_ERROR: 'order.place.error',
  TRACKING_SYNC_START: 'tracking.sync.start',
  TRACKING_SYNC_SUCCESS: 'tracking.sync.success',
  TRACKING_SYNC_ERROR: 'tracking.sync.error',
  /** FASE 3E.1 — llamadas reales a CJ Shopping Order API */
  CJ_ORDER_CREATE_START: 'cj.order.create.start',
  CJ_ORDER_CREATE_SUCCESS: 'cj.order.create.success',
  CJ_ORDER_CREATE_ERROR: 'cj.order.create.error',
  CJ_ORDER_STATUS_START: 'cj.order.status.start',
  CJ_ORDER_STATUS_SUCCESS: 'cj.order.status.success',
  CJ_ORDER_STATUS_ERROR: 'cj.order.status.error',
  CJ_TRACKING_START: 'cj.tracking.start',
  CJ_TRACKING_SUCCESS: 'cj.tracking.success',
  CJ_TRACKING_ERROR: 'cj.tracking.error',
  /** FASE 3E.3 — confirm / pay balance (doc Shopping) */
  CJ_ORDER_CONFIRM_START: 'cj.order.confirm.start',
  CJ_ORDER_CONFIRM_SUCCESS: 'cj.order.confirm.success',
  CJ_ORDER_CONFIRM_ERROR: 'cj.order.confirm.error',
  CJ_ORDER_PAY_START: 'cj.order.pay.start',
  CJ_ORDER_PAY_SUCCESS: 'cj.order.pay.success',
  CJ_ORDER_PAY_ERROR: 'cj.order.pay.error',
} as const;

/** Modo post-`createOrderV2` (payType=3): ver §FASE 3E.3 en plan maestro. */
export const CJ_EBAY_POST_CREATE_CHECKOUT_MODE = {
  MANUAL: 'MANUAL',
  AUTO_CONFIRM_PAY: 'AUTO_CONFIRM_PAY',
} as const;

/** Estados `cj_ebay_orders.status` (FASE 3E / 3E.3). */
export const CJ_EBAY_ORDER_STATUS = {
  DETECTED: 'DETECTED',
  VALIDATED: 'VALIDATED',
  CJ_ORDER_PLACING: 'CJ_ORDER_PLACING',
  /** Transitorio tras HTTP create OK (compat. eventos). */
  CJ_ORDER_PLACED: 'CJ_ORDER_PLACED',
  /** Pedido existe en CJ; falta confirm/pay si payType=3 y flujo manual o auto pendiente. */
  CJ_ORDER_CREATED: 'CJ_ORDER_CREATED',
  /** Durante `PATCH confirmOrder`. */
  CJ_ORDER_CONFIRMING: 'CJ_ORDER_CONFIRMING',
  /** `confirmOrder` CJ OK; listo para `payBalance` (doc: suele alinearse con UNPAID en CJ). */
  CJ_ORDER_CONFIRMED: 'CJ_ORDER_CONFIRMED',
  /** Pendiente de cargo a balance (opcional UI; puede coincidir con CONFIRMED). */
  CJ_PAYMENT_PENDING: 'CJ_PAYMENT_PENDING',
  /** Durante `POST payBalance`. */
  CJ_PAYMENT_PROCESSING: 'CJ_PAYMENT_PROCESSING',
  /** Pago balance CJ OK; antes de pasar a fulfillment CJ. */
  CJ_PAYMENT_COMPLETED: 'CJ_PAYMENT_COMPLETED',
  CJ_FULFILLING: 'CJ_FULFILLING',
  CJ_SHIPPED: 'CJ_SHIPPED',
  TRACKING_ON_EBAY: 'TRACKING_ON_EBAY',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  NEEDS_MANUAL: 'NEEDS_MANUAL',
} as const;

/** Estados persistidos en `cj_ebay_listings.status` (FASE 3D). */
export const CJ_EBAY_LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;
