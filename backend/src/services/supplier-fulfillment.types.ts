export type SupplierKey = 'cj' | 'aliexpress';

export interface SupplierOrderSnapshot {
  supplier: SupplierKey;
  supplierOrderId: string;
  internalOrderId: string;
  status: string;
  paymentStatus: string;
  trackingNumber?: string;
  trackingUrl?: string;
  logisticName?: string;
  rawStatus?: string;
  syncAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSupplierOrderInput {
  orderId: string;
  userId: number;
  supplier?: SupplierKey;
  metadata?: Record<string, unknown>;
}

/** Outcome of paySupplierOrder (audit-friendly, non-secret). */
export type SupplierPayOutcome =
  | 'payment_dry_run_eligibility'
  | 'payment_skipped_no_execute_flag'
  | 'payment_blocked_guardrail'
  | 'payment_ineligible_state'
  | 'payment_skipped_already_paid'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_unsafe_to_execute';

export interface SupplierOrderActionInput {
  orderId: string;
  userId: number;
  /** When true, only reads CJ order detail — never calls payBalance. */
  dryRun?: boolean;
  /**
   * Real CJ payBalance requires both this flag and `CJ_PHASE_D_ALLOW_PAY=true`.
   * Default false: safe dry-run / eligibility only.
   */
  executePay?: boolean;
  /** When `CJ_PAY_REQUIRE_CONFIRM_TOKEN=true`, must match `CJ_PAY_CONFIRM_TOKEN` (server env). */
  payConfirmToken?: string;
}
