import axios from 'axios';
import sharp from 'sharp';
import {
  enforceEbayImageCompliance,
} from '../ebay-image-compliance.service';

jest.mock('axios');
jest.mock('../ml-portada-visual-compliance.service', () => ({
  evaluateMlPortadaStrictGateFromBuffer: jest.fn(async () => ({
    pass: true,
    signals: [],
    metrics: {},
  })),
}));
jest.mock('../ml-portada-compliance-v2.service', () => ({
  evaluatePortadaComplianceV2: jest.fn(async () => ({
    compliant: true,
    overallScore: 98,
    checks: {
      whiteBg: { pass: true, score: 100, signals: [] },
      textLogo: { pass: true, score: 100, signals: [] },
      objectComposition: { pass: true, score: 100, signals: [] },
      overExposure: { pass: true, score: 100, signals: [] },
      sharpness: { pass: true, score: 100, signals: [] },
      multiProduct: { pass: true, score: 100, signals: [] },
    },
    rejectionReasons: [],
  })),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

async function makeCleanImageBuffer(
  size: number,
  format: 'jpeg' | 'webp' = 'jpeg'
): Promise<Buffer> {
  const productSide = Math.floor(size * 0.62);
  const offset = Math.floor((size - productSide) / 2);
  const product = await sharp({
    create: {
      width: productSide,
      height: productSide,
      channels: 3,
      background: { r: 36, g: 84, b: 160 },
    },
  })
    .png()
    .toBuffer();

  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).composite([{ input: product, left: offset, top: offset }]);

  if (format === 'webp') {
    return base.webp({ quality: 92 }).toBuffer();
  }
  return base.jpeg({ quality: 92 }).toBuffer();
}

describe('enforceEbayImageCompliance', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  test('accepts compliant images and rejects unsupported webp', async () => {
    const cleanJpeg = await makeCleanImageBuffer(1700, 'jpeg');
    const cleanWebp = await makeCleanImageBuffer(1700, 'webp');

    mockedAxios.get.mockImplementation(async (url: any) => {
      const u = String(url || '');
      if (u.includes('ok.jpg')) {
        return {
          data: cleanJpeg,
          headers: { 'content-type': 'image/jpeg' },
        } as any;
      }
      if (u.includes('bad.webp')) {
        return {
          data: cleanWebp,
          headers: { 'content-type': 'image/webp' },
        } as any;
      }
      throw new Error(`unexpected_url:${u}`);
    });

    const result = await enforceEbayImageCompliance([
      'https://example.com/ok.jpg',
      'https://example.com/bad.webp',
    ]);

    expect(result.acceptedUrls).toEqual(['https://example.com/ok.jpg']);
    expect(result.rejectedCount).toBe(1);
    expect(
      result.audits
        .find((audit) => audit.sourceUrl.includes('bad.webp'))
        ?.reasons.some((reason) => reason.includes('unsupported_format:webp'))
    ).toBe(true);
  });

  test('accepts ali-like transcode when source URL is jpg but fetched bytes are webp', async () => {
    const cleanWebp = await makeCleanImageBuffer(1700, 'webp');

    mockedAxios.get.mockResolvedValue({
      data: cleanWebp,
      headers: { 'content-type': 'image/webp' },
    } as any);

    const result = await enforceEbayImageCompliance([
      'https://ae01.alicdn.com/kf/Sabc1234.jpg',
    ]);

    expect(result.acceptedUrls).toEqual([
      'https://ae01.alicdn.com/kf/Sabc1234.jpg',
    ]);
    expect(
      result.audits[0]?.warnings.some((warning) =>
        warning.includes('fetched_as_webp_transcode')
      )
    ).toBe(true);
  });

  test('rejects images below minimum 500px longest side', async () => {
    const tiny = await makeCleanImageBuffer(420, 'jpeg');

    mockedAxios.get.mockResolvedValue({
      data: tiny,
      headers: { 'content-type': 'image/jpeg' },
    } as any);

    const result = await enforceEbayImageCompliance([
      'https://example.com/tiny.jpg',
    ]);

    expect(result.acceptedUrls).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(
      result.audits[0]?.reasons.some((reason) =>
        reason.includes('longest_side_too_small')
      )
    ).toBe(true);
  });
});
