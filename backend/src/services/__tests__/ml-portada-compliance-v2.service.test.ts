/**
 * Tests for ml-portada-compliance-v2.service.ts
 *
 * Uses synthetic Sharp-generated images to assert each compliance gate independently.
 * No external network calls; all images are created in-memory.
 *
 * Regression rules (from FASE G of the compliance redesign):
 *  - Cover with text → reject (textLogo gate)
 *  - Cover with logo/overlay → reject (textLogo gate)
 *  - Non-white background → reject (whiteBg gate)
 *  - Product over-exposed / washed out → reject (overExposure gate)
 *  - Product not centred or too small → reject (composition gate)
 *  - Blurry image → reject (sharpness gate)
 *  - Clean e-commerce cover (dark product centred on white) → accept
 */
import sharp from 'sharp';
import { evaluatePortadaComplianceV2 } from '../ml-portada-compliance-v2.service';

const SZ = 600; // canvas size for synthetic test images

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a white canvas with a dark centred rectangle representing the product. */
async function makeCleanCover(
  opts: {
    productColor?: { r: number; g: number; b: number };
    productFill?: number; // 0–1 fraction of canvas
    bgColor?: { r: number; g: number; b: number };
    blur?: number;
  } = {}
): Promise<Buffer> {
  const { productColor = { r: 30, g: 80, b: 160 }, productFill = 0.65, bgColor = { r: 255, g: 255, b: 255 }, blur = 0 } = opts;
  const pSide = Math.round(SZ * productFill);
  const offset = Math.floor((SZ - pSide) / 2);
  const productPng = await sharp({
    create: { width: pSide, height: pSide, channels: 3, background: productColor },
  }).png().toBuffer();
  let img = sharp({
    create: { width: SZ, height: SZ, channels: 3, background: bgColor },
  }).composite([{ input: productPng, left: offset, top: offset }]);
  if (blur > 0) img = img.blur(blur) as typeof img;
  return img.jpeg({ quality: 90 }).toBuffer();
}

/** Creates a canvas with a horizontal text-like stripe of alternating pixels at the top. */
async function makeCoverWithTextBand(): Promise<Buffer> {
  // A raw buffer with a high-frequency horizontal stripe at the top (simulates text).
  const pixels = Buffer.alloc(SZ * SZ * 3, 255); // white base
  // Fill top 10% with alternating black/white horizontal stripes → high stroke density
  for (let y = 5; y < Math.floor(SZ * 0.10); y++) {
    for (let x = 0; x < SZ; x++) {
      const v = (x % 4 < 2) ? 0 : 255;
      const o = (y * SZ + x) * 3;
      pixels[o] = v; pixels[o + 1] = v; pixels[o + 2] = v;
    }
  }
  // Also add a dark centred product block
  const pSide = Math.round(SZ * 0.5);
  const offset = Math.floor((SZ - pSide) / 2);
  for (let y = offset; y < offset + pSide; y++) {
    for (let x = offset; x < offset + pSide; x++) {
      const o = (y * SZ + x) * 3;
      pixels[o] = 30; pixels[o + 1] = 80; pixels[o + 2] = 160;
    }
  }
  return sharp(pixels, { raw: { width: SZ, height: SZ, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

/** Creates a cover with a gray background (#dcdcdc — the old Phase 2 fallback). */
async function makeCoverWithGrayBg(): Promise<Buffer> {
  return makeCleanCover({ bgColor: { r: 220, g: 220, b: 220 } });
}

/** Creates a cover with a coloured (non-white) background. */
async function makeCoverWithColouredBg(): Promise<Buffer> {
  return makeCleanCover({ bgColor: { r: 180, g: 140, b: 100 } });
}

/** Creates a cover where the product is tiny (very small relative to canvas). */
async function makeCoverWithTinyProduct(): Promise<Buffer> {
  return makeCleanCover({ productFill: 0.15 });
}

/** Creates a cover where the product fills almost the entire canvas (no margin). */
async function makeCoverWithOverfill(): Promise<Buffer> {
  return makeCleanCover({ productFill: 0.97 });
}

/**
 * Creates a uniformly medium-gray canvas (no product, no edges).
 * Laplacian variance of a truly uniform image = ~0, well below SH_LAPLACIAN_VAR_MIN.
 * This directly exercises the sharpness gate with a pathological but valid case.
 */
async function makeBlurryCleanCover(): Promise<Buffer> {
  // A uniform gray canvas has zero Laplacian variance — as blurry as possible.
  // We use a mid-gray (128,128,128) so it also fails the white-background check,
  // making the overall compliance clearly false.
  return sharp({ create: { width: SZ, height: SZ, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .png()
    .toBuffer();
}

/** Creates a cover where the product is nearly all white (washed out / over-exposed). */
async function makeCoverWithWashedOutProduct(): Promise<Buffer> {
  return makeCleanCover({ productColor: { r: 250, g: 250, b: 250 } });
}

/** Creates a cover with a product that is off-centre (shifted to the right). */
async function makeCoverWithOffCentreProduct(): Promise<Buffer> {
  const productColor = { r: 30, g: 80, b: 160 };
  const pSide = Math.round(SZ * 0.5);
  // Place product at far right
  const left = SZ - pSide - 10;
  const top = Math.floor((SZ - pSide) / 2);
  const productPng = await sharp({
    create: { width: pSide, height: pSide, channels: 3, background: productColor },
  }).png().toBuffer();
  return sharp({
    create: { width: SZ, height: SZ, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).composite([{ input: productPng, left, top }]).jpeg({ quality: 90 }).toBuffer();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluatePortadaComplianceV2', () => {
  // ── Passing case ────────────────────────────────────────────────────────────
  it('accepts a clean e-commerce cover: dark product centred on pure white', async () => {
    const buf = await makeCleanCover();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(75);
    expect(report.checks.whiteBg.pass).toBe(true);
    expect(report.checks.textLogo.pass).toBe(true);
    expect(report.checks.objectComposition.pass).toBe(true);
    expect(report.checks.overExposure.pass).toBe(true);
    expect(report.checks.sharpness.pass).toBe(true);
  });

  // ── White background failures ───────────────────────────────────────────────
  it('rejects a cover with gray background (#dcdcdc — old Phase 2 output)', async () => {
    const buf = await makeCoverWithGrayBg();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(report.checks.whiteBg.pass).toBe(false);
    expect(report.checks.whiteBg.signals.some((s) => s.includes('white_bg'))).toBe(true);
  });

  it('rejects a cover with a coloured non-white background', async () => {
    const buf = await makeCoverWithColouredBg();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(report.checks.whiteBg.pass).toBe(false);
  });

  // ── Text / logo failures ────────────────────────────────────────────────────
  it('rejects a cover with a text-like stripe at the top (simulated promo/banner)', async () => {
    const buf = await makeCoverWithTextBand();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(report.checks.textLogo.pass).toBe(false);
    expect(report.checks.textLogo.signals.some((s) => s.includes('text_logo'))).toBe(true);
  });

  // ── Composition failures ────────────────────────────────────────────────────
  it('rejects a cover where the product is too small (15% fill)', async () => {
    const buf = await makeCoverWithTinyProduct();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(report.checks.objectComposition.pass).toBe(false);
    expect(
      report.checks.objectComposition.signals.some((s) => s.includes('product_too_small'))
    ).toBe(true);
  });

  it('rejects a cover where the product has no margins (97% fill)', async () => {
    const buf = await makeCoverWithOverfill();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(report.checks.objectComposition.pass).toBe(false);
  });

  it('rejects a cover where the product is significantly off-centre', async () => {
    const buf = await makeCoverWithOffCentreProduct();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    expect(
      report.checks.objectComposition.signals.some((s) => s.includes('not_centred'))
    ).toBe(true);
  });

  // ── Over-exposure failures ──────────────────────────────────────────────────
  it('rejects a cover where the product is washed out (near-white product on white bg)', async () => {
    const buf = await makeCoverWithWashedOutProduct();
    const report = await evaluatePortadaComplianceV2(buf);
    // Either the over-exposure gate or the composition gate (product invisible) should reject.
    const rejected = !report.checks.overExposure.pass || !report.checks.objectComposition.pass;
    expect(rejected).toBe(true);
    expect(report.compliant).toBe(false);
  });

  // ── Sharpness failures ──────────────────────────────────────────────────────
  it('rejects a uniform gray canvas (zero sharpness, non-white background)', async () => {
    // A uniform gray canvas: zero Laplacian variance + gray background + no visible product.
    // Multiple checks must fail simultaneously (white-bg, sharpness, composition).
    const buf = await makeBlurryCleanCover();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.compliant).toBe(false);
    // Sharpness: uniform canvas has zero Laplacian variance
    expect(report.checks.sharpness.pass).toBe(false);
    // White background: gray is not white
    expect(report.checks.whiteBg.pass).toBe(false);
    // Composition: no product detected in uniform gray
    expect(report.checks.objectComposition.pass).toBe(false);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  it('returns non-compliant with score 0 when buffer is empty', async () => {
    const report = await evaluatePortadaComplianceV2(Buffer.alloc(0));
    expect(report.compliant).toBe(false);
    expect(report.overallScore).toBe(0);
  });

  it('returns structured check objects with all required fields', async () => {
    const buf = await makeCleanCover();
    const report = await evaluatePortadaComplianceV2(buf);
    for (const key of ['whiteBg', 'textLogo', 'objectComposition', 'overExposure', 'sharpness', 'multiProduct'] as const) {
      expect(typeof report.checks[key].pass).toBe('boolean');
      expect(typeof report.checks[key].score).toBe('number');
      expect(Array.isArray(report.checks[key].signals)).toBe(true);
    }
  });

  it('overall score is between 0 and 100', async () => {
    const buf = await makeCleanCover();
    const report = await evaluatePortadaComplianceV2(buf);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });
});
