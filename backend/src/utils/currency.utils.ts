import fxService from '../services/fx.service';

const CURRENCY_SYMBOL_PATTERNS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: 'USD', patterns: [/\bUSD\b/i, /\bUS\s*\$/i, /\$USD\b/i, /\bDólar(?:es)?\b/i] },
  { code: 'EUR', patterns: [/\bEUR\b/i, /€/] },
  { code: 'GBP', patterns: [/\bGBP\b/i, /£/] },
  { code: 'JPY', patterns: [/\bJPY\b/i, /¥/, /円/] },
  { code: 'CAD', patterns: [/\bCAD\b/i, /C\$/] },
  { code: 'AUD', patterns: [/\bAUD\b/i, /A\$/] },
  { code: 'MXN', patterns: [/\bMXN\b/i, /\bMX\$/i, /\bPeso Mexicano\b/i] },
  { code: 'CLP', patterns: [/\bCLP\b/i, /\bCLP\$/i, /\$\s*CLP\b/i] },
  { code: 'COP', patterns: [/\bCOP\b/i, /\bCOL\$/i, /\bPeso Colombiano\b/i] },
  { code: 'ARS', patterns: [/\bARS\b/i, /\bAR\$/i, /\bPeso Argentino\b/i] },
  { code: 'BRL', patterns: [/\bBRL\b/i, /R\$/] },
  { code: 'PEN', patterns: [/\bPEN\b/i, /S\/\//] },
  { code: 'CHF', patterns: [/\bCHF\b/i] },
  { code: 'CNY', patterns: [/\bCNY\b/i, /\bRMB\b/i, /¥/] },
  { code: 'KRW', patterns: [/\bKRW\b/i, /₩/] },
  { code: 'HKD', patterns: [/\bHKD\b/i, /HK\$/] },
  { code: 'INR', patterns: [/\bINR\b/i, /₹/] },
  { code: 'TRY', patterns: [/\bTRY\b/i, /₺/] },
  { code: 'ZAR', patterns: [/\bZAR\b/i, /R\b/] },
  { code: 'VND', patterns: [/\bVND\b/i, /₫/] },
  { code: 'PHP', patterns: [/\bPHP\b/i, /₱/] },
  { code: 'IDR', patterns: [/\bIDR\b/i, /Rp\b/] },
  { code: 'THB', patterns: [/\bTHB\b/i, /฿/] },
  { code: 'AED', patterns: [/\bAED\b/i, /د\.إ/] },
];

function detectCurrencyFromText(texts: Array<string | undefined | null>): string | null {
  const joined = texts.filter(Boolean).map(String).join(' ');
  if (!joined) return null;
  
  // ✅ Prioridad 1: Buscar códigos de moneda explícitos (CLP, USD, EUR, etc.)
  for (const entry of CURRENCY_SYMBOL_PATTERNS) {
    if (entry.patterns.some(regex => regex.test(joined))) {
      return entry.code;
    }
  }
  
  // ✅ Prioridad 2: Detección heurística basada en formato numérico
  // CLP típicamente usa punto como separador de miles y valores altos (>1000)
  // Ejemplo: "$26.600" en Chile es CLP, no USD
  const pricePattern = joined.match(/[\$]?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
  if (pricePattern) {
    const priceStr = pricePattern[1];
    // Si tiene punto como separador de miles (formato chileno) y valor > 1000, probablemente es CLP
    if (priceStr.includes('.') && !priceStr.includes(',')) {
      const numericValue = parseFloat(priceStr.replace(/\./g, ''));
      // Valores > 1000 con formato chileno (punto como separador de miles) suelen ser CLP
      if (numericValue > 1000 && numericValue < 1000000) {
        // Verificar contexto: si hay indicadores de Chile o español
        const lowerJoined = joined.toLowerCase();
        if (lowerJoined.includes('chile') || lowerJoined.includes('clp') || 
            lowerJoined.includes('peso') || lowerJoined.includes('envío desde chile')) {
          return 'CLP';
        }
        // Si el valor es muy alto para USD pero razonable para CLP, asumir CLP
        // $26.600 sería ~$30 USD, lo cual es razonable
        if (numericValue > 10000 && numericValue < 500000) {
          return 'CLP';
        }
      }
    }
  }
  
  return null;
}

function cleanCurrencyCandidate(candidate?: unknown): string | null {
  if (!candidate) return null;
  let value = String(candidate).trim();
  if (!value) return null;
  const directMatch = value.match(/[A-Z]{3}/i);
  if (directMatch) {
    return directMatch[0].toUpperCase();
  }
  return null;
}

function determineSeparators(raw: string): { thousand: string | null; decimal: string | null } {
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  // Both separators present
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      return { thousand: '.', decimal: ',' };
    }
    return { thousand: ',', decimal: '.' };
  }

  if (lastComma > -1) {
    const decimals = raw.length - lastComma - 1;
    if (decimals === 0 || decimals > 2) {
      return { thousand: ',', decimal: null };
    }
    return { thousand: '.', decimal: ',' };
  }

  if (lastDot > -1) {
    const decimals = raw.length - lastDot - 1;
    if (decimals === 0 || decimals > 2) {
      return { thousand: '.', decimal: null };
    }
    return { thousand: ',', decimal: '.' };
  }

  return { thousand: null, decimal: null };
}

export function parseLocalizedNumber(value: unknown, currency?: string): number {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }

  const stringValue = String(value ?? '').trim();
  if (!stringValue) return 0;

  // Remove non numeric chars except comma, dot, minus
  let cleaned = stringValue.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return 0;

  const { thousand, decimal } = determineSeparators(cleaned);

  if (thousand) {
    const thousandRegex = new RegExp(`\\${thousand}`, 'g');
    cleaned = cleaned.replace(thousandRegex, '');
  }

  if (decimal) {
    const decimalRegex = new RegExp(`\\${decimal}`, 'g');
    cleaned = cleaned.replace(decimalRegex, '.');
  }

  // If currency typically has no decimals, round to integer
  const zeroDecimalCurrencies = new Set(['CLP', 'JPY', 'KRW', 'VND', 'IDR']);
  if (!decimal && zeroDecimalCurrencies.has((currency || '').toUpperCase())) {
    cleaned = cleaned.replace(/\./g, '');
  }

  const parsed = parseFloat(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

export function resolveCurrency(
  itemHints: Array<unknown>,
  textHints: Array<string | undefined | null>,
  fallback: string = 'USD'
): string {
  for (const hint of itemHints) {
    const candidate = cleanCurrencyCandidate(hint);
    if (candidate) {
      return candidate;
    }
  }

  const fromText = detectCurrencyFromText(textHints);
  if (fromText) {
    return fromText;
  }

  return fallback.toUpperCase();
}

export interface PriceResolutionInput {
  raw: unknown;
  itemCurrencyHints?: Array<unknown>;
  textHints?: Array<string | undefined | null>;
  fallbackCurrency?: string;
}

export function resolvePrice(input: PriceResolutionInput): {
  amount: number;
  sourceCurrency: string;
  amountInBase: number;
  baseCurrency: string;
} {
  const baseCurrency = fxService.getBase();
  const sourceCurrency = resolveCurrency(
    input.itemCurrencyHints || [],
    input.textHints || [],
    input.fallbackCurrency || baseCurrency
  );

  const amount = parseLocalizedNumber(input.raw, sourceCurrency);
  
  // ✅ Logging detallado para diagnóstico de conversión
  const logger = require('../config/logger').logger;
  logger.debug('[CURRENCY] Resolving price', {
    raw: String(input.raw).substring(0, 50),
    detectedCurrency: sourceCurrency,
    parsedAmount: amount,
    baseCurrency,
    textHints: input.textHints?.slice(0, 3).map(t => String(t).substring(0, 30))
  });
  
  const amountInBase = fxService.convert(amount, sourceCurrency, baseCurrency);
  
  // ✅ Logging de conversión
  if (sourceCurrency !== baseCurrency) {
    logger.debug('[CURRENCY] Conversion result', {
      from: sourceCurrency,
      to: baseCurrency,
      originalAmount: amount,
      convertedAmount: amountInBase,
      rate: amount > 0 ? amountInBase / amount : 0
    });
  }

  return {
    amount,
    sourceCurrency,
    amountInBase,
    baseCurrency,
  };
}

export interface PriceRangeResolutionInput {
  rawRange?: Array<unknown>;
  itemCurrencyHints?: Array<unknown>;
  textHints?: Array<string | undefined | null>;
  fallbackCurrency?: string;
}

export interface PriceRangeResolutionResult {
  minAmount: number;
  maxAmount: number;
  currency: string;
  minAmountInBase: number;
  maxAmountInBase: number;
  baseCurrency: string;
}

function collectNumericCandidates(value: unknown, push: (num: number) => void, currency: string) {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value === 'number') {
    if (isFinite(value) && value > 0) {
      push(value);
    }
    return;
  }

  if (typeof value === 'string') {
    const matches = value.match(/[-]?\d[\d.,]*/g);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        const numeric = parseLocalizedNumber(match, currency);
        if (numeric > 0) {
          push(numeric);
        }
      }
      return;
    }

    const numeric = parseLocalizedNumber(value, currency);
    if (numeric > 0) {
      push(numeric);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(entry => collectNumericCandidates(entry, push, currency));
    return;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keysToInspect = [
      'min',
      'max',
      'minPrice',
      'maxPrice',
      'minActivityPrice',
      'maxActivityPrice',
      'minValue',
      'maxValue',
      'priceMin',
      'priceMax',
      'activityMinPrice',
      'activityMaxPrice',
      'initial',
      'final',
      'from',
      'to',
      'value',
    ];

    for (const key of keysToInspect) {
      if (key in obj) {
        collectNumericCandidates(obj[key], push, currency);
      }
    }
  }
}

export function resolvePriceRange(
  input: PriceRangeResolutionInput
): PriceRangeResolutionResult | null {
  const baseCurrency = fxService.getBase();
  const currency = resolveCurrency(
    input.itemCurrencyHints || [],
    input.textHints || [],
    input.fallbackCurrency || baseCurrency
  );

  const numbers = new Set<number>();
  const push = (num: number) => {
    if (!isFinite(num) || num <= 0) return;
    numbers.add(Number(num.toFixed(4)));
  };

  if (input.rawRange) {
    for (const candidate of input.rawRange) {
      collectNumericCandidates(candidate, push, currency);
    }
  }

  if (input.textHints) {
    for (const hint of input.textHints) {
      if (!hint) continue;
      collectNumericCandidates(hint, push, currency);
    }
  }

  const values = Array.from(numbers).filter(v => v > 0);
  if (values.length === 0) {
    return null;
  }

  const minAmount = Math.min(...values);
  const maxAmount = Math.max(...values);

  const minAmountInBase = fxService.convert(minAmount, currency, baseCurrency);
  const maxAmountInBase = fxService.convert(maxAmount, currency, baseCurrency);

  return {
    minAmount,
    maxAmount,
    currency,
    minAmountInBase,
    maxAmountInBase,
    baseCurrency,
  };
}

