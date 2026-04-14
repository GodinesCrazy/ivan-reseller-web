/**
 * ebay-image-upload.service.ts
 *
 * Upload processed image buffers to eBay Picture Services (EPS)
 * using the Trading API UploadSiteHostedPictures call.
 *
 * eBay returns permanent EPS-hosted URLs that can be used with the
 * Inventory API (imageUrls field in createOrReplaceInventoryItem).
 *
 * Workflow:
 *   1. processEbayImages() → JPEG buffers in memory
 *   2. uploadToEbayEps()   → EPS URLs
 *   3. URLs passed to Inventory API → eBay listing with clean images
 *
 * Alternative fallback: If upload fails, the system falls back to original
 * AliExpress CDN URLs (validated but not processed).
 */

import axios from 'axios';
import logger from '../config/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EbayEpsUploadResult {
  success: boolean;
  epsUrl: string | null;
  error?: string;
}

export interface EbayBulkUploadResult {
  uploadedUrls: string[];
  failedCount: number;
  results: EbayEpsUploadResult[];
}

interface EbayEpsCredentials {
  /** eBay OAuth access token (bearer) */
  token: string;
  /** Whether using sandbox */
  sandbox: boolean;
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function buildUploadXmlRequest(pictureName: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">',
    '  <RequesterCredentials>',
    '    <eBayAuthToken>__TOKEN__</eBayAuthToken>',
    '  </RequesterCredentials>',
    `  <PictureName>${escapeXml(pictureName)}</PictureName>`,
    '  <PictureSet>Supersize</PictureSet>',
    '</UploadSiteHostedPicturesRequest>',
  ].join('\n');
}

function escapeXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractFullUrl(xmlResponse: string): string | null {
  // Extract <FullURL> from the XML response
  const match = xmlResponse.match(/<FullURL>(.*?)<\/FullURL>/i);
  return match?.[1] || null;
}

function extractEpsError(xmlResponse: string): string | null {
  const shortMatch = xmlResponse.match(/<ShortMessage>(.*?)<\/ShortMessage>/i);
  const longMatch = xmlResponse.match(/<LongMessage>(.*?)<\/LongMessage>/i);
  return longMatch?.[1] || shortMatch?.[1] || null;
}

function extractAck(xmlResponse: string): string {
  const match = xmlResponse.match(/<Ack>(.*?)<\/Ack>/i);
  return match?.[1]?.trim()?.toLowerCase() || 'unknown';
}

// ── Upload Implementation ────────────────────────────────────────────────────

/**
 * Upload a single JPEG buffer to eBay EPS via Trading API.
 * Returns the EPS-hosted URL on success.
 */
export async function uploadImageToEbayEps(
  jpegBuffer: Buffer,
  credentials: EbayEpsCredentials,
  options?: {
    pictureName?: string;
    retries?: number;
  }
): Promise<EbayEpsUploadResult> {
  const pictureName = options?.pictureName || `product_${Date.now()}`;
  const maxRetries = Math.max(1, Math.min(5, Number(options?.retries) || 2));

  const baseUrl = credentials.sandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const xmlBody = buildUploadXmlRequest(pictureName).replace('__TOKEN__', credentials.token);

  // Build multipart boundary
  const boundary = `----EbayEPS${Date.now()}${Math.random().toString(36).slice(2)}`;

  // Build multipart body manually: XML part + image part
  const xmlPart = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="XML Payload"',
    'Content-Type: text/xml;charset=utf-8',
    '',
    xmlBody,
    '',
  ].join('\r\n');

  const imagePart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="image"; filename="${pictureName}.jpg"`,
    'Content-Type: image/jpeg',
    'Content-Transfer-Encoding: binary',
    '',
    '',
  ].join('\r\n');

  const endPart = `\r\n--${boundary}--\r\n`;

  // Combine: xmlPart + imagePart header + binary image + end boundary
  const bodyParts = [
    Buffer.from(xmlPart, 'utf-8'),
    Buffer.from(imagePart, 'utf-8'),
    jpegBuffer,
    Buffer.from(endPart, 'utf-8'),
  ];
  const fullBody = Buffer.concat(bodyParts);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(baseUrl, fullBody, {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(fullBody.length),
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
          'X-EBAY-API-SITEID': '0', // US
        },
        timeout: 60_000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
        responseType: 'text',
        transformResponse: [(data: any) => data], // prevent JSON parse
      });

      const xmlResp = String(response.data || '');
      const ack = extractAck(xmlResp);

      if (ack === 'success' || ack === 'warning') {
        const epsUrl = extractFullUrl(xmlResp);
        if (epsUrl) {
          logger.info('[EBAY-EPS-UPLOAD] Image uploaded successfully', {
            pictureName,
            epsUrl: epsUrl.substring(0, 100),
            attempt,
          });
          return { success: true, epsUrl };
        }
        logger.warn('[EBAY-EPS-UPLOAD] Success ack but no FullURL in response', { pictureName, attempt });
      }

      const epsError = extractEpsError(xmlResp);
      logger.warn('[EBAY-EPS-UPLOAD] Upload failed', {
        pictureName,
        ack,
        error: epsError,
        attempt,
        maxRetries,
      });

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    } catch (err: any) {
      logger.warn('[EBAY-EPS-UPLOAD] Upload request error', {
        pictureName,
        attempt,
        maxRetries,
        error: err?.message,
        status: err?.response?.status,
      });

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  return { success: false, epsUrl: null, error: 'All upload attempts failed' };
}

/**
 * Upload multiple processed image buffers to eBay EPS.
 * Limited concurrency to avoid throttling.
 */
export async function uploadImagesToEbayEps(
  images: Array<{ jpegBuffer: Buffer; sourceUrl: string }>,
  credentials: EbayEpsCredentials,
  options?: {
    concurrency?: number;
    productId?: number;
  }
): Promise<EbayBulkUploadResult> {
  const concurrency = Math.max(1, Math.min(3, Number(options?.concurrency) || 2));
  const label = `product-${options?.productId ?? 'unknown'}`;

  logger.info('[EBAY-EPS-UPLOAD] Starting bulk upload', {
    label,
    totalImages: images.length,
    concurrency,
  });

  const results = await mapWithConcurrency(
    images,
    concurrency,
    async (img, index) => {
      const pictureName = `p${options?.productId || 0}_img${index}_${Date.now()}`;
      return uploadImageToEbayEps(img.jpegBuffer, credentials, {
        pictureName,
        retries: 2,
      });
    }
  );

  const uploadedUrls = results
    .filter((r) => r.success && r.epsUrl)
    .map((r) => r.epsUrl!);
  const failedCount = results.filter((r) => !r.success).length;

  logger.info('[EBAY-EPS-UPLOAD] Bulk upload complete', {
    label,
    uploaded: uploadedUrls.length,
    failed: failedCount,
  });

  return { uploadedUrls, failedCount, results };
}

// ── Concurrency helper ──────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}
