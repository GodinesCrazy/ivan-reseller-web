/**
 * AliExpress Signature Service
 *
 * TOP algorithm for token exchange: appSecret + (key1value1+key2value2+...) + appSecret.
 * SHA256, hex UPPERCASE. NO path, NO redirect_uri in params or base string.
 */

import crypto from 'crypto';
import logger from '../config/logger';

/**
 * AliExpress TOP signature algorithm for token exchange.
 * Base string = appSecret + (key1value1+key2value2+...) + appSecret.
 * Does NOT include: API path, URL, redirect_uri, or query symbols.
 * Uses SHA256 (not HMAC). Output: hex UPPERCASE.
 *
 * @param params - Parameters for signing (exclude 'sign')
 * @param appSecret - App secret (never logged)
 * @returns Uppercase hex SHA256 signature
 */
export function generateTopSignature(params: Record<string, string>, appSecret: string): string {
  appSecret = String(appSecret || '').replace(/\s+/g, ' ').replace(/[\uFEFF\u00A0]/g, '').trim();
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) {
      paramsForSigning[key] = String(value);
    }
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map((k) => k + paramsForSigning[k]).join('');
  const baseString = appSecret + concatenatedString + appSecret;
  const sign = crypto
    .createHash('sha256')
    .update(baseString, 'utf8')
    .digest('hex')
    .toUpperCase();

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('[ALIEXPRESS-SIGNATURE] generateTopSignature', {
      sortedParams: sortedKeys,
      baseStringLength: baseString.length,
      sign: sign.substring(0, 16) + '...',
    });
  }
  return sign;
}

/**
 * System Interface: HMAC-SHA256(path + sorted_params, app_secret)
 * Per openservice.aliexpress.com doc 1386 - required for auth/token/create.
 *
 * @param apiPath - API path starting with "/" (e.g., "/rest/auth/token/create")
 * @param params - Parameters for signing (exclude 'sign')
 * @param appSecret - App secret (HMAC key)
 * @returns Uppercase hex HMAC-SHA256 signature
 */
export function generateTokenCreateSignatureHmacSystemInterface(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) {
      paramsForSigning[key] = String(value);
    }
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map((k) => k + paramsForSigning[k]).join('');
  const baseString = normalizedPath + concatenatedString;

  const sign = crypto
    .createHmac('sha256', appSecret)
    .update(baseString, 'utf8')
    .digest('hex')
    .toUpperCase();

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('[ALIEXPRESS-SIGNATURE] generateTokenCreateSignatureHmacSystemInterface', {
      apiPath: normalizedPath,
      paramsCount: sortedKeys.length,
      sign: sign.substring(0, 16) + '...',
    });
  }
  return sign;
}

/**
 * Generate AliExpress signature (Case 2 - NO appSecret, NO extra params).
 * Used for /rest/auth/token/create - params: app_key, code, sign_method, timestamp ONLY.
 * @param apiPath - e.g. "/rest/auth/token/create"
 * @param params - params for signing (exclude 'sign')
 */
export function generateAliExpressSignatureNoSecret(
  apiPath: string,
  params: Record<string, string>
): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort();
  let base = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  for (const key of sortedKeys) {
    base += key + params[key];
  }
  const hash = crypto
    .createHash('sha256')
    .update(base, 'utf8')
    .digest('hex')
    .toUpperCase();
  logger.info('[ALIEXPRESS-SIGNATURE] Token create Case 2', {
    SIGN_BASE_STRING: base,
    SIGN_GENERATED: hash,
    paramsCount: sortedKeys.length,
  });
  return hash;
}

/**
 * Generate AliExpress signature according to Case 2: System Interfaces
 * 
 * STRICT COMPLIANCE:
 * - Formula: hex(sha256(api_path + concatenated_sorted_parameters))
 * - Parameters sorted alphabetically by key (ASCII order)
 * - Exclude "sign" from signature calculation
 * - Use raw values (no JSON encoding)
 * - Concatenate as: key1value1key2value2...
 * - DO NOT prepend or append app_secret
 * 
 * @param apiPath - API path starting with "/" (e.g., "/rest/auth/token/create")
 * @param params - Parameters object (will be sorted and used for signature)
 * @param appSecret - App secret (NOT included in signature base string, only for logging)
 * @returns Uppercase hex string of SHA256 hash
 */
export function generateAliExpressSignature(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  // Ensure apiPath starts with "/"
  const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  
  // Remove "sign" from params if exists (sign is NOT included in signature calculation)
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) {
      paramsForSigning[key] = String(value); // Ensure string format
    }
  }
  
  // Sort parameters alphabetically by ASCII order (strict)
  const sortedKeys = Object.keys(paramsForSigning).sort();
  
  // Concatenate key+value pairs without separators: key1value1key2value2...
  const concatenatedString = sortedKeys
    .map(key => `${key}${paramsForSigning[key]}`)
    .join('');
  
  // Signature base: api_path + concatenated_sorted_parameters (Case 2 — no app_secret)
  const signatureBaseString = normalizedApiPath + concatenatedString;
  const rawHash = crypto.createHash('sha256').update(signatureBaseString, 'utf8').digest('hex');
  const signature = rawHash.toLowerCase();
  
  logger.debug('[ALIEXPRESS-SIGNATURE] Case 2', { apiPath: normalizedApiPath, paramsCount: sortedKeys.length });
  return signature;
}

/**
 * Token exchange: doc formula {app_secret}{sortedString}{app_secret}, UPPERCASE(HEX(SHA256)).
 * No apiPath in string. GET /rest/auth/token/create.
 */
export function generateAliExpressSignatureWithSecret(
  _apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) {
      paramsForSigning[key] = String(value);
    }
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  let sortedKeyValueString = '';
  for (const key of sortedKeys) {
    sortedKeyValueString += key + paramsForSigning[key];
  }
  const stringToSign = appSecret + sortedKeyValueString + appSecret;
  return crypto
    .createHash('sha256')
    .update(stringToSign, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * Prepare parameters for AliExpress API request
 * Sorts parameters and generates signature
 * 
 * @param apiPath - API path (e.g., "/rest/auth/token/create")
 * @param params - Parameters object
 * @param appSecret - App secret
 * @returns Parameters object with signature added
 */
export function prepareAliExpressParams(
  apiPath: string,
  params: Record<string, string | number | undefined>,
  appSecret: string
): Record<string, string> {
  // Convert all values to strings and filter out undefined/null
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      stringParams[key] = String(value);
    }
  }
  
  // Generate signature
  const sign = generateAliExpressSignature(apiPath, stringParams, appSecret);
  
  // Add signature to params
  return {
    ...stringParams,
    sign,
  };
}

/**
 * Token-create endpoint: some environments expect traditional TOP style
 * hex(sha256(app_secret + sorted_params_concat + app_secret))
 * Use for /rest/auth/token/create when Case 2 returns IncompleteSignature.
 */
export function generateTokenCreateSignature(
  params: Record<string, string>,
  appSecret: string
): string {
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) {
      paramsForSigning[key] = String(value);
    }
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  const signatureBaseString = appSecret + concatenatedString + appSecret;
  const signature = crypto.createHash('sha256').update(signatureBaseString, 'utf8').digest('hex').toUpperCase();
  return signature;
}

/** Token create with MD5 (app_secret+params+app_secret). Try lowercase hex. */
export function generateTokenCreateSignatureMD5(params: Record<string, string>, appSecret: string): string {
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) paramsForSigning[key] = String(value);
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  const signatureBaseString = appSecret + concatenatedString + appSecret;
  const signature = crypto.createHash('md5').update(signatureBaseString, 'utf8').digest('hex').toLowerCase();
  logger.debug('[ALIEXPRESS-SIGNATURE] Token MD5', { paramsCount: sortedKeys.length });
  return signature;
}

/**
 * Token exchange: MD5 with apiPath per ALIEXPRESS_FINAL_WORKING_REPORT.
 * Formula: hex(md5(appSecret + apiPath + key1value1+key2value2+... + appSecret))
 * Params sorted by key (ASCII), excluding 'sign'. Use with sign_method=md5 and GMT+8 timestamp.
 */
export function generateAliExpressSignatureMD5(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) paramsForSigning[key] = String(value);
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  const signatureBaseString = appSecret + normalizedApiPath + concatenatedString + appSecret;
  const signature = crypto.createHash('md5').update(signatureBaseString, 'utf8').digest('hex').toLowerCase();
  logger.debug('[ALIEXPRESS-SIGNATURE] MD5 with apiPath', { apiPath: normalizedApiPath, paramsCount: sortedKeys.length });
  return signature;
}

/**
 * HMAC-SHA256 with appSecret bookends (message = appSecret + sortedParams + appSecret, key = appSecret).
 * Per external docs: HMAC-SHA256(appSecret + key1value1... + appSecret, appSecret), UPPERCASE hex.
 */
export function generateHmacSha256WithBookends(
  params: Record<string, string>,
  appSecret: string
): string {
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) paramsForSigning[key] = String(value);
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  const stringToSign = appSecret + concatenatedString + appSecret;
  return crypto
    .createHmac('sha256', appSecret)
    .update(stringToSign, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * HMAC-MD5 per Alibaba TOP (sign_method=hmac).
 * Base string = sorted params only; key = app_secret. Output UPPERCASE hex.
 */
export function generateHmacMd5TopStyle(params: Record<string, string>, appSecret: string): string {
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) paramsForSigning[key] = String(value);
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  return crypto
    .createHmac('md5', appSecret)
    .update(concatenatedString, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * Case 2 base string signed with HMAC-SHA256 (key = app_secret).
 * Some Alibaba docs use HMAC; try if plain SHA256 fails.
 */
export function generateAliExpressSignatureHmac(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  const normalizedApiPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const paramsForSigning: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sign' && value !== undefined && value !== null) paramsForSigning[key] = String(value);
  }
  const sortedKeys = Object.keys(paramsForSigning).sort();
  const concatenatedString = sortedKeys.map(k => `${k}${paramsForSigning[k]}`).join('');
  const signatureBaseString = normalizedApiPath + concatenatedString;
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(signatureBaseString, 'utf8')
    .digest('hex')
    .toLowerCase();
  logger.debug('[ALIEXPRESS-SIGNATURE] HMAC', { apiPath: normalizedApiPath, paramsCount: sortedKeys.length });
  return signature;
}
