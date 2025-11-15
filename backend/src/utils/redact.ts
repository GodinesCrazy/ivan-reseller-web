/**
 * Utility functions to redact sensitive data from logs
 * Prevents exposure of credentials, tokens, and other sensitive information
 */

/**
 * Redact sensitive values from an object
 * Replaces sensitive fields with masked values
 */
export function redactSensitiveData<T extends Record<string, any>>(
  data: T,
  sensitiveFields: string[] = [
    'token',
    'authToken',
    'refreshToken',
    'accessToken',
    'clientSecret',
    'secret',
    'password',
    'apiKey',
    'api_key',
    'appId',
    'app_id',
    'devId',
    'dev_id',
    'certId',
    'cert_id',
    'clientId',
    'client_id',
    'sellerId',
    'seller_id',
    'accessKeyId',
    'access_key_id',
    'secretAccessKey',
    'secret_access_key',
    'twoFactorSecret',
    'two_factor_secret',
  ]
): Partial<T> {
  const redacted = { ...data };
  
  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    
    // Check if this field should be redacted
    const shouldRedact = sensitiveFields.some(field => 
      lowerKey.includes(field.toLowerCase())
    );
    
    if (shouldRedact && typeof redacted[key] === 'string') {
      const value = redacted[key] as string;
      if (value.length > 0) {
        // Show first 4 and last 4 characters, mask the rest
        if (value.length <= 8) {
          redacted[key] = '***' as any;
        } else {
          redacted[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}` as any;
        }
      }
    } else if (shouldRedact && redacted[key] !== null && redacted[key] !== undefined) {
      // For non-string sensitive values, just mask completely
      redacted[key] = '***' as any;
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null && !Array.isArray(redacted[key])) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(redacted[key] as Record<string, any>, sensitiveFields) as any;
    }
  }
  
  return redacted;
}

/**
 * Redact sensitive information from URLs
 * Removes query parameters that might contain tokens or sensitive data
 */
export function redactUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // List of sensitive query parameters
    const sensitiveParams = [
      'code',
      'state',
      'token',
      'access_token',
      'refresh_token',
      'auth_token',
      'api_key',
      'client_secret',
      'secret',
    ];
    
    // Remove sensitive query parameters
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '***REDACTED***');
      }
    });
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return a safe redacted version
    return url.substring(0, 50) + '...***REDACTED***';
  }
}

/**
 * Redact full URL but keep structure for debugging
 * Shows domain and path but redacts query parameters
 */
export function redactUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);
    const redacted = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    const hasParams = urlObj.searchParams.toString().length > 0;
    return hasParams ? `${redacted}?***REDACTED_PARAMS***` : redacted;
  } catch {
    return url.substring(0, 50) + '...***REDACTED***';
  }
}

/**
 * Redact credentials object completely
 * Returns only structure without values
 */
export function redactCredentials(credentials: Record<string, any>): Record<string, any> {
  const redacted: Record<string, any> = {};
  
  for (const key in credentials) {
    if (typeof credentials[key] === 'string' && credentials[key].length > 0) {
      redacted[key] = '***REDACTED***';
    } else if (typeof credentials[key] === 'object' && credentials[key] !== null) {
      redacted[key] = redactCredentials(credentials[key]);
    } else {
      redacted[key] = credentials[key];
    }
  }
  
  return redacted;
}

