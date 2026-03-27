import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs/promises';

export type SelfHostedImageProviderMode = 'automatic1111';
export type SelfHostedImageReviewStrategy = 'fail_closed_pending_review';
export type SelfHostedImageProviderState =
  | 'self_hosted_available'
  | 'self_hosted_unavailable'
  | 'self_hosted_misconfigured'
  | 'self_hosted_generation_failed';

export interface SelfHostedImageProviderConfig {
  providerName: 'self_hosted';
  sourceLabel: string;
  baseUrl: string;
  apiKey?: string;
  imageModel: string;
  reviewModel: string;
  mode: SelfHostedImageProviderMode;
  negativePrompt: string;
  samplerName?: string;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  timeoutMs: number;
  reviewStrategy: SelfHostedImageReviewStrategy;
}

export interface SelfHostedImageProviderInspection {
  state: SelfHostedImageProviderState;
  config: SelfHostedImageProviderConfig | null;
  sourceLabel: string | null;
  notes: string[];
}

export interface SelfHostedImageReviewResult {
  approved: boolean;
  reasons: string[];
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripBase64Prefix(value: string): string {
  return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
}

export function inspectSelfHostedImageProvider(): SelfHostedImageProviderInspection {
  const enabled = parseBoolean(process.env.SELF_HOSTED_IMAGE_PROVIDER_ENABLED);
  const baseUrl = String(process.env.SELF_HOSTED_IMAGE_PROVIDER_BASE_URL || '').trim();
  const mode = (String(process.env.SELF_HOSTED_IMAGE_PROVIDER_MODE || '').trim().toLowerCase() ||
    'automatic1111') as SelfHostedImageProviderMode;
  const sourceLabel = baseUrl ? 'env:SELF_HOSTED_IMAGE_PROVIDER_BASE_URL' : 'env:SELF_HOSTED_IMAGE_PROVIDER_ENABLED';

  if (!enabled && !baseUrl) {
    return {
      state: 'self_hosted_unavailable',
      config: null,
      sourceLabel,
      notes: ['self_hosted_provider_not_enabled'],
    };
  }

  if (!baseUrl) {
    return {
      state: 'self_hosted_misconfigured',
      config: null,
      sourceLabel,
      notes: ['self_hosted_provider_missing_base_url'],
    };
  }

  if (mode !== 'automatic1111') {
    return {
      state: 'self_hosted_misconfigured',
      config: null,
      sourceLabel,
      notes: [`unsupported_self_hosted_mode:${mode}`],
    };
  }

  return {
    state: 'self_hosted_available',
    sourceLabel,
    notes: ['self_hosted_provider_configured'],
    config: {
      providerName: 'self_hosted',
      sourceLabel,
      baseUrl,
      apiKey: String(process.env.SELF_HOSTED_IMAGE_PROVIDER_API_KEY || '').trim() || undefined,
      imageModel:
        String(process.env.SELF_HOSTED_IMAGE_PROVIDER_MODEL || '').trim() ||
        'local_prompt_guided_clean_render',
      reviewModel: 'local_structural_fail_closed',
      mode,
      negativePrompt:
        String(process.env.SELF_HOSTED_IMAGE_PROVIDER_NEGATIVE_PROMPT || '').trim() ||
        'text, watermark, logo, arrows, banner, promotional badge, visible hands, collage, split composition, clutter, extra props',
      samplerName: String(process.env.SELF_HOSTED_IMAGE_PROVIDER_SAMPLER || '').trim() || undefined,
      steps: parseInteger(process.env.SELF_HOSTED_IMAGE_PROVIDER_STEPS, 28),
      cfgScale: parseFloatNumber(process.env.SELF_HOSTED_IMAGE_PROVIDER_CFG_SCALE, 6.5),
      width: parseInteger(process.env.SELF_HOSTED_IMAGE_PROVIDER_WIDTH, 1536),
      height: parseInteger(process.env.SELF_HOSTED_IMAGE_PROVIDER_HEIGHT, 1536),
      timeoutMs: parseInteger(process.env.SELF_HOSTED_IMAGE_PROVIDER_TIMEOUT_MS, 180000),
      reviewStrategy: 'fail_closed_pending_review',
    },
  };
}

export async function generateImageWithSelfHosted(
  config: SelfHostedImageProviderConfig,
  prompt: string
): Promise<Buffer> {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`;
  const response = await axios.post(
    endpoint,
    {
      prompt,
      negative_prompt: config.negativePrompt,
      width: config.width,
      height: config.height,
      steps: config.steps,
      cfg_scale: config.cfgScale,
      sampler_name: config.samplerName,
      batch_size: 1,
      n_iter: 1,
      restore_faces: false,
      send_images: true,
      save_images: false,
    },
    {
      timeout: config.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
    }
  );

  const images = Array.isArray(response.data?.images) ? response.data.images : [];
  const first = images[0];
  if (!first || typeof first !== 'string') {
    throw new Error('self_hosted_generation_missing_image');
  }

  const raw = Buffer.from(stripBase64Prefix(first), 'base64');
  return sharp(raw)
    .rotate()
    .resize(1536, 1536, { fit: 'cover' })
    .png()
    .toBuffer();
}

export async function reviewGeneratedImageWithSelfHosted(
  config: SelfHostedImageProviderConfig,
  _assetKey: string,
  assetPath: string
): Promise<SelfHostedImageReviewResult> {
  const meta = await sharp(await fs.readFile(assetPath)).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const squareLike = width > 0 && height > 0 ? Math.abs(width / height - 1) <= 0.15 : false;
  const min1200 = width >= 1200 && height >= 1200;

  if (!min1200 || !squareLike) {
    return {
      approved: false,
      reasons: [
        !min1200 ? 'self_hosted_generated_asset_below_1200x1200' : '',
        !squareLike ? 'self_hosted_generated_asset_not_square_like' : '',
      ].filter(Boolean),
    };
  }

  return {
    approved: false,
    reasons: [
      `self_hosted_review_strategy=${config.reviewStrategy}`,
      'self_hosted_generated_asset_requires_visual_review_confirmation',
    ],
  };
}
