/**
 * Centralized marketplace policy compliance: sanitization and validation.
 * Ensures titles and descriptions meet eBay, MercadoLibre, and Amazon policies.
 */

import {
  sanitizeTitleForML,
  sanitizeDescriptionForML,
  checkMLCompliance,
} from '../../services/mercadolibre.service';

export type MarketplaceName = 'ebay' | 'mercadolibre' | 'amazon';

export interface ComplianceResult {
  compliant: boolean;
  violations: string[];
}

/** IP policy: avoid "tipo X", "símil X", "réplica" for brands. Shared across eBay and ML. */
const IP_POLICY_REPLACEMENTS: [RegExp, string][] = [
  [/\btipo\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bsímil\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bsimil\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bréplica\s+de\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\breplica\s+de\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bidéntico\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bidentico\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bigual\s+a\s+([A-Za-z0-9áéíóúñÁÉÍÓÚÑÜ]+)/gi, 'compatible con $1'],
  [/\bréplica\b/gi, ''],
  [/\breplica\b/gi, ''],
];

function applyIPPolicySanitization(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  for (const [re, replacement] of IP_POLICY_REPLACEMENTS) {
    s = s.replace(re, replacement);
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** eBay: remove promotional phrases per Keyword Spam Policy */
const EBAY_PROMO_PATTERNS: RegExp[] = [
  /please\s+view\s+my\s+other\s+(?:eBay\s+)?listings(?:[^.]*)?/gi,
  /view\s+my\s+other\s+(?:eBay\s+)?listings(?:[^.]*)?/gi,
  /see\s+my\s+other\s+(?:eBay\s+)?listings(?:[^.]*)?/gi,
  /check\s+my\s+other\s+(?:eBay\s+)?listings(?:[^.]*)?/gi,
];

const EBAY_TITLE_MAX = 80;

function stripEbayPromo(text: string): string {
  let s = text;
  for (const re of EBAY_PROMO_PATTERNS) {
    s = s.replace(re, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** eBay: allowed chars in title - alphanumeric, spaces, basic punctuation */
const EBAY_INVALID_CHARS = /[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,\-\/()&'"]/gi;

export function sanitizeTitleForEbay(title: string): string {
  if (!title || typeof title !== 'string') return 'Product';
  let s = title.trim();
  s = applyIPPolicySanitization(s);
  s = stripEbayPromo(s);
  s = s.replace(EBAY_INVALID_CHARS, '').replace(/\s+/g, ' ').trim();
  if (s.length > EBAY_TITLE_MAX) s = s.substring(0, EBAY_TITLE_MAX - 3) + '...';
  return s || 'Product';
}

const EBAY_DESC_MAX = 50000;

export function sanitizeDescriptionForEbay(desc: string): string {
  if (!desc || typeof desc !== 'string') return 'Quality product.';
  let s = desc
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .trim();
  s = applyIPPolicySanitization(s);
  s = stripEbayPromo(s);
  s = s.replace(EBAY_INVALID_CHARS, '').replace(/\s+/g, ' ').trim();
  if (s.length > EBAY_DESC_MAX) s = s.substring(0, EBAY_DESC_MAX - 3) + '...';
  return s || 'Quality product.';
}

/** Amazon: decorative characters prohibited (Product Title Policy) */
const AMAZON_DECORATIVE_CHARS = /[!*$?_{}#|;^¬¦~<><<>>]/g;

/** Amazon: promotional phrases prohibited */
const AMAZON_PROMO_PATTERNS: RegExp[] = [
  /\bfree\s+shipping\b/gi,
  /\b100%\s*quality\s+guaranteed\b/gi,
  /\bhot\s+item\b/gi,
  /\bbest\s+seller\b/gi,
  /\blimited\s+time\b/gi,
  /\bact\s+now\b/gi,
  /\bbuy\s+now\b/gi,
  /\bclick\s+here\b/gi,
  /\bsale\s*!\s*/gi,
];

const AMAZON_TITLE_MAX = 200;

function stripAmazonPromo(text: string): string {
  let s = text;
  for (const re of AMAZON_PROMO_PATTERNS) {
    s = s.replace(re, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Normalize ALL CAPS to sentence case (Amazon policy) */
function normalizeCaps(text: string): string {
  if (!text || text.length < 3) return text;
  if (text === text.toUpperCase() && text.length > 5) {
    return text
      .toLowerCase()
      .replace(/^\w|\.\s*\w/g, (m) => m.toUpperCase());
  }
  return text;
}

export function sanitizeTitleForAmazon(title: string): string {
  if (!title || typeof title !== 'string') return 'Product';
  let s = title.trim();
  s = applyIPPolicySanitization(s);
  s = stripAmazonPromo(s);
  s = s.replace(AMAZON_DECORATIVE_CHARS, '').replace(/\s+/g, ' ').trim();
  s = normalizeCaps(s);
  if (s.length > AMAZON_TITLE_MAX) s = s.substring(0, AMAZON_TITLE_MAX - 3) + '...';
  return s || 'Product';
}

const AMAZON_DESC_MAX = 2000;

export function sanitizeDescriptionForAmazon(desc: string): string {
  if (!desc || typeof desc !== 'string') return 'Quality product.';
  let s = desc
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .trim();
  s = applyIPPolicySanitization(s);
  s = stripAmazonPromo(s);
  s = s.replace(AMAZON_DECORATIVE_CHARS, '').replace(/\s+/g, ' ').trim();
  s = normalizeCaps(s);
  if (s.length > AMAZON_DESC_MAX) s = s.substring(0, AMAZON_DESC_MAX - 3) + '...';
  return s || 'Quality product.';
}

/** Unified sanitization by marketplace */
export function sanitizeTitleForMarketplace(
  marketplace: MarketplaceName,
  title: string
): string {
  switch (marketplace) {
    case 'mercadolibre':
      return sanitizeTitleForML(title);
    case 'ebay':
      return sanitizeTitleForEbay(title);
    case 'amazon':
      return sanitizeTitleForAmazon(title);
    default:
      return title || 'Product';
  }
}

export function sanitizeDescriptionForMarketplace(
  marketplace: MarketplaceName,
  description: string
): string {
  switch (marketplace) {
    case 'mercadolibre':
      return sanitizeDescriptionForML(description);
    case 'ebay':
      return sanitizeDescriptionForEbay(description);
    case 'amazon':
      return sanitizeDescriptionForAmazon(description);
    default:
      return description || 'Quality product.';
  }
}

/** eBay violation patterns (read-only check) */
const EBAY_VIOLATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /view\s+my\s+other\s+listings/gi, label: 'promotional: view my other listings' },
  { pattern: /please\s+view\s+my\s+other/gi, label: 'promotional: please view my other listings' },
];

/** Amazon violation patterns (read-only check) */
const AMAZON_VIOLATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /[!*$?_{}#|;^¬¦~<>]/, label: 'decorative character' },
  { pattern: /\bfree\s+shipping\b/gi, label: 'promotional phrase: free shipping' },
  { pattern: /\bhot\s+item\b/gi, label: 'promotional phrase: hot item' },
  { pattern: /\bbest\s+seller\b/gi, label: 'promotional phrase: best seller' },
];

export function checkMarketplaceCompliance(
  marketplace: MarketplaceName,
  title: string,
  description: string
): ComplianceResult {
  const text = `${title || ''} ${description || ''}`;
  const violations: string[] = [];

  switch (marketplace) {
    case 'mercadolibre':
      return checkMLCompliance(title || '', description || '');
    case 'ebay':
      for (const { pattern, label } of EBAY_VIOLATION_PATTERNS) {
        if (text.match(pattern)) violations.push(label);
      }
      break;
    case 'amazon':
      for (const { pattern, label } of AMAZON_VIOLATION_PATTERNS) {
        if (text.match(pattern)) violations.push(label);
      }
      if (title && title === title.toUpperCase() && title.length > 5) {
        violations.push('ALL CAPS title');
      }
      break;
    default:
      break;
  }

  return {
    compliant: violations.length === 0,
    violations: [...new Set(violations)],
  };
}
