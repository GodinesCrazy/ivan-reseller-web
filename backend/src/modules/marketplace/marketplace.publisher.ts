import type { PublishableProduct, PublishResult, ValidationResult, PublishMode } from './marketplace.types';

export interface MarketplacePublisher {
  publishProduct(product: PublishableProduct, mode: PublishMode): Promise<PublishResult>;
  validateCredentials(): Promise<ValidationResult>;
  testConnection(): Promise<boolean>;
}
