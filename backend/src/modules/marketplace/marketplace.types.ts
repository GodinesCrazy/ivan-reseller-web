export enum PublishMode {
  SIMULATED = 'SIMULATED',
  STAGING_REAL = 'STAGING_REAL',
  FULL_AUTO = 'FULL_AUTO',
}

export const DEFAULT_PUBLISH_MODE = PublishMode.STAGING_REAL;

export type PublishStatus = 'published' | 'failed' | 'skipped';

export interface PublishResult {
  status: PublishStatus;
  listingId?: string;
  listingUrl?: string;
  message?: string;
  rawResponse?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  status: 'OK' | 'NOT_CONFIGURED' | 'INVALID';
  missing?: string[];
  message?: string;
}

export interface PublishableProduct {
  id: number;
  userId: number;
  title: string;
  description?: string | null;
  suggestedPrice?: number | null;
  finalPrice?: number | null;
  currency?: string | null;
  category?: string | null;
  images?: string | null;
  targetCountry?: string | null;
}
