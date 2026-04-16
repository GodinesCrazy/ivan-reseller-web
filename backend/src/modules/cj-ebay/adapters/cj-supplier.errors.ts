/**
 * Typed errors for CJ supplier HTTP layer (contract; implementation FASE 3B).
 */
export type CjSupplierErrorCode =
  | 'CJ_AUTH_INVALID'
  | 'CJ_AUTH_EXPIRED'
  | 'CJ_RATE_LIMIT'
  | 'CJ_INVALID_SKU'
  | 'CJ_OUT_OF_STOCK'
  | 'CJ_SHIPPING_UNAVAILABLE'
  | 'CJ_NETWORK'
  | 'CJ_UNKNOWN'
  /** createOrder / order status / CJ tracking — not wired in FASE 3B (see master plan). */
  | 'CJ_NOT_IMPLEMENTED'
  /**
   * FASE 3F — El balance CJ es insuficiente para cubrir el pago de la orden.
   * Detectado en la respuesta de `payBalance` (mensaje: "Insufficient balance", "balance is not enough", etc.).
   * La orden pasa a SUPPLIER_PAYMENT_BLOCKED. Requiere recarga manual del balance CJ por el operador.
   */
  | 'CJ_INSUFFICIENT_BALANCE';

export class CjSupplierError extends Error {
  readonly code: CjSupplierErrorCode;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly cjMessage?: string;

  constructor(
    message: string,
    options: {
      code: CjSupplierErrorCode;
      retryable?: boolean;
      httpStatus?: number;
      cjMessage?: string;
    }
  ) {
    super(message);
    this.name = 'CjSupplierError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus;
    this.cjMessage = options.cjMessage;
  }
}
