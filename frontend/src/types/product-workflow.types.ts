/**
 * Types for Product Workflow Status (Frontend)
 * Matching backend types for consistency
 */

export type WorkflowStage = 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService';
export type StageStatus = 'completed' | 'pending' | 'in-progress' | 'failed' | 'skipped' | 'not-needed' | 'active';
export type StageMode = 'manual' | 'automatic' | 'guided';
export type ProductStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'INACTIVE';
export type SaleStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';

export interface StageInfo {
  status: StageStatus;
  mode: StageMode;
  completedAt?: string;
  listingId?: string;
  marketplace?: string;
  orderId?: string;
  purchaseLogId?: number;
  trackingNumber?: string;
  shippedAt?: string;
  estimatedDelivery?: string;
  openTickets?: number;
  lastInteraction?: string;
  nextAction?: string;
}

export interface TimelineEvent {
  stage: WorkflowStage;
  action: string;
  timestamp: string;
  status: StageStatus;
  actor?: 'system' | 'user';
  details?: string;
}

export interface ProductWorkflowStatus {
  productId: number;
  productStatus: ProductStatus;
  currentStage: WorkflowStage;
  environment: 'sandbox' | 'production';
  stages: {
    scrape: StageInfo;
    analyze: StageInfo;
    publish: StageInfo;
    purchase: StageInfo;
    fulfillment: StageInfo;
    customerService: StageInfo;
  };
  timeline: TimelineEvent[];
}

