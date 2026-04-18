/**
 * CJ → ML Chile — response DTOs.
 */

export interface CjMlChileHealthResponse {
  ok: boolean;
  module: 'cj-ml-chile';
  timestamp: string;
  checks: {
    cjCredentials: boolean;
    mlCredentials: boolean;
    fxService: boolean;
    dbMigrated: boolean;
  };
}

export interface CjMlChileOverviewResponse {
  products: { total: number; evaluated: number; approved: number };
  listings: { total: number; active: number; draft: number; failed: number };
  orders: { total: number; active: number; completed: number };
  alerts: { open: number; critical: number };
  profit: {
    totalRevenueCLP: number;
    totalRevenueUsd: number;
    totalProfitUsd: number;
    listingsActive: number;
  };
}

export interface CjMlChileConfigResponse {
  settings: {
    minMarginPct: number | null;
    minProfitUsd: number | null;
    minStock: number;
    maxShippingUsd: number | null;
    mlcFeePct: number;
    mpPaymentFeePct: number;
    incidentBufferPct: number;
    requireChileWarehouse: boolean;
    rejectOnUnknownShipping: boolean;
  };
  systemReadiness: {
    cjConnected: boolean;
    mlConnected: boolean;
    fxAvailable: boolean;
  };
}
