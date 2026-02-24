export interface Opportunity {
  id?: number | null;
  title: string;
  imageUrl?: string;
  productUrl?: string;
  costUsd?: number;
  suggestedPriceUsd?: number;
  profitMargin?: number;
  roiPercentage?: number;
  confidenceScore?: number;
  source?: string;
}
