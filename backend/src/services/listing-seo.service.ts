/**
 * Listing SEO service — marketplace-specific title/description generation per spec.
 * Spec: ML = product+brand+model+key_feature+compatibility; eBay = keyword+feature+model+compatibility+use; Amazon = brand+product_type+feature+model+compatibility.
 * Respects char limits (e.g. eBay 80). Falls back to original title/description on failure.
 */

import { logger } from '../config/logger';
import { fastHttpClient } from '../config/http-client';

export type MarketplaceSEO = 'ebay' | 'mercadolibre' | 'amazon';

const TITLE_MAX: Record<MarketplaceSEO, number> = {
  ebay: 80,
  mercadolibre: 60,
  amazon: 200,
};

const MARKETPLACE_STRUCTURE: Record<MarketplaceSEO, string> = {
  mercadolibre:
    'Structure the title as: product + brand + model + key_feature + compatibility. Include a differentiating characteristic (specs, variant, use case) for duplicate policy.',
  ebay:
    'Structure the title as: keyword + feature + model + compatibility + use. Clear, keyword-rich.',
  amazon:
    'Structure the title as: brand + product_type + feature + model + compatibility. Professional product listing style.',
};

const LANG_MAP: Record<string, string> = {
  es: 'Write in Spanish (es).',
  en: 'Write in English (en).',
  de: 'Write in German (de).',
  fr: 'Write in French (fr).',
  it: 'Write in Italian (it).',
  pt: 'Write in Portuguese (pt).',
};

function normalizeMarketplace(name: string): MarketplaceSEO {
  const s = (name || '').toLowerCase();
  if (s.includes('mercado') || s === 'ml') return 'mercadolibre';
  if (s.includes('ebay') || s === 'ebay') return 'ebay';
  if (s.includes('amazon') || s === 'amazon') return 'amazon';
  return 'ebay';
}

function truncateToLimit(title: string, mp: MarketplaceSEO): string {
  const max = TITLE_MAX[mp] ?? 80;
  if (!title || title.length <= max) return title.trim();
  const truncated = title.slice(0, max - 3).trim();
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > max * 0.7) return truncated.slice(0, lastSpace) + '...';
  return truncated + '...';
}

export interface ListingSEOProduct {
  title: string;
  description?: string | null;
  category?: string | null;
}

export class ListingSEOService {
  /**
   * Generate SEO title using marketplace-specific structure. Returns only the title (no explanations).
   */
  async generateTitle(
    product: ListingSEOProduct,
    marketplace: string,
    language: string,
    userId?: number,
    keywords?: string[]
  ): Promise<string> {
    const mp = normalizeMarketplace(marketplace);
    const langInstruction = LANG_MAP[language] || LANG_MAP['en'];
    const structure = MARKETPLACE_STRUCTURE[mp];
    const keywordLine =
      keywords && keywords.length > 0
        ? ` Include these search-relevant keywords naturally: ${keywords.slice(0, 8).join(', ')}.`
        : '';
    const maxChars = TITLE_MAX[mp];

    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId ?? 0, 'groq', 'production');
      if (!groqCreds?.apiKey) {
        return product.title;
      }

      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create SEO-optimized product titles for ${marketplace}. ${langInstruction} ${structure} Title must be under ${maxChars} characters. Return only the title, no quotes or explanations.`,
            },
            {
              role: 'user',
              content: `Create an optimized product title for ${marketplace}:\nOriginal: ${product.title}\nCategory: ${product.category || 'general'}${keywordLine}\n\nReturn only the optimized title (max ${maxChars} chars), no explanations.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 120,
        },
        {
          headers: {
            Authorization: `Bearer ${groqCreds.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        logger.warn('[LISTING-SEO] Invalid GROQ response for title', { marketplace: mp });
        return product.title;
      }
      const raw = content.trim().replace(/^["']|["']$/g, '');
      return truncateToLimit(raw || product.title, mp);
    } catch (error) {
      logger.debug('[LISTING-SEO] generateTitle failed, using original', {
        error: error instanceof Error ? error.message : String(error),
        marketplace: mp,
      });
      return product.title;
    }
  }

  /**
   * Generate SEO description using marketplace and language. Returns only the description.
   */
  async generateDescription(
    product: ListingSEOProduct,
    marketplace: string,
    language: string,
    userId?: number
  ): Promise<string> {
    const mp = normalizeMarketplace(marketplace);
    const langInstruction = LANG_MAP[language] || LANG_MAP['en'];
    const currentDescription = product.description || '';

    try {
      const { CredentialsManager } = await import('./credentials-manager.service');
      const groqCreds = await CredentialsManager.getCredentials(userId ?? 0, 'groq', 'production');
      if (!groqCreds?.apiKey) {
        return currentDescription || `Product: ${product.title}. Quality product.`;
      }

      const hasValidDesc =
        currentDescription.length >= 50 &&
        !currentDescription.toLowerCase().includes('fortalezas:') &&
        !currentDescription.toLowerCase().includes('recomendaciones:');
      const userPrompt = hasValidDesc
        ? `Optimize this product description for ${marketplace}:\nTitle: ${product.title}\nDescription: ${currentDescription}\nCategory: ${product.category || 'general'}\n\n${langInstruction} Return only the optimized description.`
        : `Write a compelling product description for ${marketplace} based on the title:\nTitle: ${product.title}\nCategory: ${product.category || 'general'}\n\n${langInstruction} 200-400 words, SEO-friendly. Return only the description.`;

      const response = await fastHttpClient.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a professional e-commerce copywriter. Create SEO-friendly product descriptions for ${marketplace}. ${langInstruction} Highlight features and benefits. 200-500 words. Return only the description.`,
            },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${groqCreds.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        return hasValidDesc ? currentDescription : `Product: ${product.title}. Quality product.`;
      }
      const desc = content.trim();
      return desc || (hasValidDesc ? currentDescription : `Product: ${product.title}. Quality product.`);
    } catch (error) {
      logger.debug('[LISTING-SEO] generateDescription failed', {
        error: error instanceof Error ? error.message : String(error),
        marketplace: mp,
      });
      return currentDescription || `Product: ${product.title}. Quality product.`;
    }
  }
}

export const listingSEOService = new ListingSEOService();
