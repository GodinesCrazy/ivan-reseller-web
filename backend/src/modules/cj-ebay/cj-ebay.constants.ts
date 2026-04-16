/**
 * CJ → eBay USA vertical — constants (FASE 3A → 3F).
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
  /** Publish bloqueado: cuenta eBay no autorizada para overseas warehouse / ship-from China. No es error de contenido. */
  LISTING_PUBLISH_ACCOUNT_POLICY_BLOCK: 'listing.publish.account_policy_block',
  /** Publish devolvió eBay 25002: offer ya existe, listingId no recuperado → estado OFFER_ALREADY_EXISTS. */
  LISTING_PUBLISH_OFFER_ALREADY_EXISTS: 'listing.publish.offer_already_exists',
  /** Reconcile iniciado por operador desde OFFER_ALREADY_EXISTS / RECONCILE_PENDING. */
  LISTING_RECONCILE_START: 'listing.reconcile.start',
  /** Reconcile exitoso: listingId recuperado, estado → ACTIVE. */
  LISTING_RECONCILE_SUCCESS: 'listing.reconcile.success',
  /** Reconcile publicó la offer existente y recuperó listingId → ACTIVE. */
  LISTING_RECONCILE_PUBLISHED: 'listing.reconcile.published',
  /** Reconcile: listingId aún no disponible, estado → RECONCILE_PENDING. */
  LISTING_RECONCILE_PENDING: 'listing.reconcile.pending',
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
  /** FASE 3F — pago bloqueado por saldo CJ insuficiente */
  CJ_ORDER_PAY_BALANCE_BLOCKED: 'cj.order.pay.balance_blocked',
  /** FASE 3F — devoluciones / refunds */
  REFUND_CREATED: 'refund.created',
  REFUND_STATUS_UPDATED: 'refund.status.updated',
  /** FASE 3F — alertas */
  ALERT_CREATED: 'alert.created',
  ALERT_RESOLVED: 'alert.resolved',
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
  /**
   * FASE 3F — Pago a proveedor CJ bloqueado (balance insuficiente u otro guardrail).
   * La orden no puede continuar hasta que el operador recargue balance CJ o resuelva el método.
   * Ver `paymentBlockReason` en la tabla `cj_ebay_orders` para el motivo exacto.
   */
  SUPPLIER_PAYMENT_BLOCKED: 'SUPPLIER_PAYMENT_BLOCKED',
} as const;

/** Estados `cj_ebay_orders.status` ampliados (FASE 3F). */
export const CJ_EBAY_PAYMENT_BLOCK_REASON = {
  /** Balance CJ insuficiente al ejecutar payBalance. Requiere recarga manual. */
  CJ_BALANCE_INSUFFICIENT: 'CJ_BALANCE_INSUFFICIENT',
  /** Método de pago no soportado por la cuenta CJ en este flujo. */
  PAYMENT_METHOD_UNSUPPORTED: 'PAYMENT_METHOD_UNSUPPORTED',
  /** payBalanceV2 requerido pero no implementado aún. */
  PAY_BALANCE_V2_NOT_IMPLEMENTED: 'PAY_BALANCE_V2_NOT_IMPLEMENTED',
} as const;

/** Estados del ciclo de devoluciones/refunds (FASE 3F — semi-manual, CJ no expone API formal de returns). */
export const CJ_EBAY_REFUND_STATUS = {
  /** Comprador solicitó devolución en eBay o el operador abrió el caso. */
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  /** Operador aprobó la devolución. Esperando envío de vuelta. */
  RETURN_APPROVED: 'RETURN_APPROVED',
  /** Operador rechazó la devolución. Requiere seguimiento con eBay. */
  RETURN_REJECTED: 'RETURN_REJECTED',
  /** Artículo en tránsito de vuelta (comprador envió). */
  RETURN_IN_TRANSIT: 'RETURN_IN_TRANSIT',
  /** Artículo recibido (por CJ o por el operador). */
  RETURN_RECEIVED: 'RETURN_RECEIVED',
  /** Reembolso a emitir al comprador (pendiente de acción en eBay). */
  REFUND_PENDING: 'REFUND_PENDING',
  /** Reembolso parcial emitido. */
  REFUND_PARTIAL: 'REFUND_PARTIAL',
  /** Reembolso total completado. */
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  /** Reembolso fallido — requiere intervención manual. */
  REFUND_FAILED: 'REFUND_FAILED',
  /** Caso requiere resolución manual que no puede modelarse automáticamente. */
  NEEDS_MANUAL_REFUND: 'NEEDS_MANUAL_REFUND',
} as const;

/** Tipos de alerta del módulo CJ → eBay USA (FASE 3F). */
export const CJ_EBAY_ALERT_TYPE = {
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

/** Estados persistidos en `cj_ebay_listings.status` (FASE 3D). */
export const CJ_EBAY_LISTING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHING: 'PUBLISHING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  /**
   * Publish bloqueado por policy/cuenta eBay (no es error de contenido del listing).
   * Causas: eBay error 25019, Overseas Warehouse Block Policy, Location_Mismatch_Inventory_Block,
   * forward-deployed item, ship-from China no autorizado en la cuenta.
   * Requiere intervención manual del operador (aprobación eBay Global Seller / overseas warehouse).
   * El draft se conserva; NO reintentar publish hasta que la cuenta esté autorizada.
   */
  ACCOUNT_POLICY_BLOCK: 'ACCOUNT_POLICY_BLOCK',
  /**
   * La oferta ya existe en eBay (error 25002) pero el sistema no pudo obtener el listingId.
   * El offer SÍ existe en eBay (offerId guardado en ebayOfferId).
   * Usar el botón Reconciliar: el sistema consulta getOffers por SKU y actualiza a ACTIVE si resuelve.
   * NO pulsar Publicar — crearía otro intento ciego de offer duplicado.
   */
  OFFER_ALREADY_EXISTS: 'OFFER_ALREADY_EXISTS',
  /**
   * Reconcile ejecutado pero eBay aún no devuelve listingId (propagación pendiente).
   * offerId guardado. El sistema intentó GET por offerId + POST publish + GET por SKU.
   * Usar botón Reconciliar nuevamente después de reconcileRetryAfter.
   * NO pulsar Publicar — la offer ya existe.
   */
  RECONCILE_PENDING: 'RECONCILE_PENDING',
} as const;

