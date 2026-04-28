export const TOPDAWG_SHOPIFY_USA_API_CREDENTIAL_NAME = 'shopify' as const;

export const TOPDAWG_SHOPIFY_USA_REQUIRED_SCOPES = [
  'read_products', 'write_products',
  'read_orders',
  'read_inventory', 'write_inventory',
  'read_locations',
  'read_publications', 'write_publications',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
] as const;

export const TOPDAWG_SHOPIFY_USA_REQUIRED_WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'APP_UNINSTALLED',
] as const;

export const TOPDAWG_SHOPIFY_USA_LISTING_STATUS = {
  DRAFT:             'DRAFT',
  PUBLISHING:        'PUBLISHING',
  ACTIVE:            'ACTIVE',
  FAILED:            'FAILED',
  PAUSED:            'PAUSED',
  ARCHIVED:          'ARCHIVED',
  RECONCILE_PENDING: 'RECONCILE_PENDING',
  RECONCILE_FAILED:  'RECONCILE_FAILED',
} as const;

export const TOPDAWG_SHOPIFY_USA_ORDER_STATUS = {
  DETECTED:          'DETECTED',
  VALIDATED:         'VALIDATED',
  TD_ORDER_PLACING:  'TD_ORDER_PLACING',
  TD_ORDER_PLACED:   'TD_ORDER_PLACED',
  TD_ORDER_CONFIRMED:'TD_ORDER_CONFIRMED',
  TD_PAYMENT_PENDING:'TD_PAYMENT_PENDING',
  TD_PAYMENT_COMPLETED:'TD_PAYMENT_COMPLETED',
  TD_FULFILLING:     'TD_FULFILLING',
  TD_SHIPPED:        'TD_SHIPPED',
  TRACKING_ON_SHOPIFY:'TRACKING_ON_SHOPIFY',
  COMPLETED:         'COMPLETED',
  FAILED:            'FAILED',
  NEEDS_MANUAL:      'NEEDS_MANUAL',
} as const;

export const TOPDAWG_SHOPIFY_USA_ALERT_TYPE = {
  ORDER_FAILED:         'ORDER_FAILED',
  ORDER_NEEDS_MANUAL:   'ORDER_NEEDS_MANUAL',
  TRACKING_MISSING:     'TRACKING_MISSING',
  REFUND_PENDING:       'REFUND_PENDING',
  SHOPIFY_DISCONNECTED: 'SHOPIFY_DISCONNECTED',
} as const;

export const TOPDAWG_SHOPIFY_USA_TRACE_STEP = {
  REQUEST_START:          'request.start',
  REQUEST_COMPLETE:       'request.complete',
  REQUEST_ERROR:          'request.error',
  TD_SEARCH_START:        'td.search.start',
  TD_SEARCH_SUCCESS:      'td.search.success',
  TD_SEARCH_ERROR:        'td.search.error',
  TD_ORDER_CREATE_START:  'td.order.create.start',
  TD_ORDER_CREATE_SUCCESS:'td.order.create.success',
  TD_ORDER_CREATE_ERROR:  'td.order.create.error',
  TD_ORDER_STATUS_START:  'td.order.status.start',
  TD_ORDER_STATUS_SUCCESS:'td.order.status.success',
  TD_ORDER_STATUS_ERROR:  'td.order.status.error',
  TD_TRACKING_START:      'td.tracking.start',
  TD_TRACKING_SUCCESS:    'td.tracking.success',
  TD_TRACKING_ERROR:      'td.tracking.error',
  LISTING_DRAFT_START:    'listing.draft.start',
  LISTING_DRAFT_CREATED:  'listing.draft.created',
  LISTING_PUBLISH_START:  'listing.publish.start',
  LISTING_PUBLISH_SUCCESS:'listing.publish.success',
  LISTING_PUBLISH_ERROR:  'listing.publish.error',
  ORDER_IMPORT_START:     'order.import.start',
  ORDER_IMPORT_SUCCESS:   'order.import.success',
  ORDER_IMPORT_ERROR:     'order.import.error',
  TRACKING_SYNC_START:    'tracking.sync.start',
  TRACKING_SYNC_SUCCESS:  'tracking.sync.success',
  TRACKING_SYNC_ERROR:    'tracking.sync.error',
  QUALIFICATION_START:    'qualification.start',
  QUALIFICATION_RESULT:   'qualification.result',
  ALERT_CREATED:          'alert.created',
  ALERT_RESOLVED:         'alert.resolved',
} as const;
