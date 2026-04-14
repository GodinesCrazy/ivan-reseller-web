/**
 * CJ Open API 2.0 — Shopping / Order (documentación oficial).
 *
 * Fuentes:
 * - Create Order V2: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-1-create-order-v2post
 * - Query Order: https://developers.cjdropshipping.com/en/api/api2/api/shopping.html#_1-7-query-order-get
 *
 * Base: https://developers.cjdropshipping.com/api2.0/v1/
 */

/** POST — cuerpo JSON según tabla oficial (vid/sku, payType, logisticName, etc.). */
export const CJ_SHOPPING_CREATE_ORDER_V2_PATH = 'shopping/order/createOrderV2' as const;

/**
 * GET — query params: `orderId` (obligatorio). Soporta custom order id o CJ order id (doc).
 * Ejemplo doc: `.../getOrderDetail?orderId=210711100018043276`
 */
export const CJ_SHOPPING_GET_ORDER_DETAIL_PATH = 'shopping/order/getOrderDetail' as const;

/** PATCH — cuerpo oficial `{ "orderId": "<cjOrderId>" }`. */
export const CJ_SHOPPING_CONFIRM_ORDER_PATH = 'shopping/order/confirmOrder' as const;

/** POST — cuerpo oficial `{ "orderId": "<cjOrderId>" }`. */
export const CJ_SHOPPING_PAY_BALANCE_PATH = 'shopping/pay/payBalance' as const;

export const CJ_SHOPPING_ORDER_DOC =
  'https://developers.cjdropshipping.com/en/api/api2/api/shopping.html' as const;
