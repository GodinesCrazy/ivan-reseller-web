/**
 * AliExpress Signature Service
 * 
 * Implements Case 2: System Interfaces signature method according to AliExpress Open Platform documentation.
 * 
 * Signature formula:
 * hex(sha256(api_path + concatenated_sorted_parameters))
 * 
 * Rules:
 * - Parameters must be sorted by ASCII order
 * - Do NOT include app_secret in parameters
 * - Do NOT include sign in signature base string
 * - The api_path MUST start with "/" (example: /rest/auth/token/create)
 */

import crypto from 'crypto';
import logger from '../config/logger';

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
  
  console.log('SIGN_BASE_STRING:', signatureBaseString);
  console.log('SIGN_GENERATED:', signature);
  console.log('[ALIEXPRESS SIGNATURE] API Path:', normalizedApiPath);
  console.log('[ALIEXPRESS SIGNATURE] Sorted Params:', sortedKeys.map(k => `${k}=${paramsForSigning[k]}`).join(', '));
  
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
  const signature = crypto.createHash('sha256').update(signatureBaseString, 'utf8').digest('hex').toLowerCase();
  console.log('SIGN_BASE_STRING (token traditional):', signatureBaseString.replace(appSecret, '***'));
  console.log('SIGN_GENERATED:', signature);
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
  console.log('SIGN_BASE_STRING (token MD5):', signatureBaseString.replace(appSecret, '***'));
  console.log('SIGN_GENERATED:', signature);
  return signature;
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
  console.log('SIGN_BASE_STRING (HMAC):', signatureBaseString);
  console.log('SIGN_GENERATED (HMAC):', signature);
  return signature;
}
