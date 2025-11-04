import crypto from 'crypto';

export interface SigV4Params {
  method: string;
  service: string; // e.g., 'execute-api'
  region: string;  // e.g., 'us-east-1'
  host: string;    // e.g., 'sellingpartnerapi-na.amazon.com'
  path: string;    // e.g., '/catalog/2022-04-01/items'
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  payloadHash?: string; // default: 'UNSIGNED-PAYLOAD'
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

function toAmzDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return {
    amzDate: `${y}${m}${d}T${hh}${mm}${ss}Z`,
    dateStamp: `${y}${m}${d}`,
  };
}

function encodeRFC3986(str: string) {
  return encodeURIComponent(str)
    .replace(/[!*'()]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalQueryString(query?: Record<string, string | number | undefined>) {
  if (!query) return '';
  const parts: string[] = [];
  Object.keys(query)
    .filter(k => query[k] !== undefined)
    .sort()
    .forEach((k) => {
      const v = String(query[k]!);
      parts.push(`${encodeRFC3986(k)}=${encodeRFC3986(v)}`);
    });
  return parts.join('&');
}

function hashHex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

export function signAwsRequest(params: SigV4Params) {
  const method = params.method.toUpperCase();
  const service = params.service;
  const region = params.region;
  const host = params.host;
  const path = params.path || '/';
  const queryStr = canonicalQueryString(params.query);
  const { amzDate, dateStamp } = toAmzDate();

  // Headers to sign
  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    ...(params.sessionToken ? { 'x-amz-security-token': params.sessionToken } : {}),
  };
  // Merge any extra headers before canonicalization (lowercase)
  if (params.headers) {
    for (const [k, v] of Object.entries(params.headers)) {
      headers[k.toLowerCase()] = v;
    }
  }

  // Payload hash per SP-API best practice
  const payloadHash = params.payloadHash || 'UNSIGNED-PAYLOAD';

  // Canonical headers string
  const sortedHeaderKeys = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k].trim()}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderKeys.join(';');

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    queryStr,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(params.secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `${algorithm} Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      ...headers,
      Authorization: authorizationHeader,
      'x-amz-content-sha256': payloadHash,
    },
    amzDate,
    signedHeaders,
  };
}

export default signAwsRequest;

