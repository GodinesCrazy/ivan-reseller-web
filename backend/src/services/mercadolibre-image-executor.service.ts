import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { CredentialsManager, type CredentialEntry } from './credentials-manager.service';
import type { GeminiCredentials, OpenAICredentials } from '../types/api-credentials.types';
import {
  generateImageWithSelfHosted,
  inspectSelfHostedImageProvider,
  reviewGeneratedImageWithSelfHosted,
  type SelfHostedImageProviderConfig,
} from './self-hosted-image-provider.service';

export type MlImageExecutorStatus =
  | 'completed'
  | 'partial'
  | 'provider_unavailable'
  | 'manifest_missing'
  | 'failed';

export type MlImageProviderName = 'openai' | 'gemini' | 'self_hosted';
export type MlImageProviderState =
  | 'provider_healthy'
  | 'provider_available_billing_blocked'
  | 'provider_unavailable'
  | 'fallback_provider_available'
  | 'fallback_provider_unavailable'
  | 'self_hosted_available'
  | 'self_hosted_unavailable'
  | 'self_hosted_misconfigured'
  | 'self_hosted_generation_failed';

export interface MlImageExecutorAssetResult {
  assetKey: 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
  promptPath: string | null;
  localPath: string | null;
  generated: boolean;
  reviewed: boolean;
  approvalState: 'approved' | 'present_unapproved' | 'pending_generation' | 'failed';
  provider: string | null;
  model: string | null;
  reviewModel: string | null;
  notes: string | null;
}

export interface MlImageExecutorProviderAttempt {
  providerName: MlImageProviderName;
  sourceLabel: string;
  status: MlImageExecutorStatus;
  generatedCount: number;
  approvedCount: number;
  blockingReasons: string[];
}

export interface MlImageProviderRecoveryAudit {
  primaryProvider: MlImageProviderName | null;
  primaryProviderSource: string | null;
  primaryProviderState: MlImageProviderState;
  fallbackProvider: MlImageProviderName | null;
  fallbackProviderSource: string | null;
  fallbackProviderState: MlImageProviderState;
  tertiaryProvider: MlImageProviderName | null;
  tertiaryProviderSource: string | null;
  tertiaryProviderState: MlImageProviderState;
  recoveryRoute: 'use_primary' | 'fallback_to_secondary' | 'fallback_to_tertiary' | 'blocked';
  notes: string[];
}

export interface MlImageExecutorRunResult {
  status: MlImageExecutorStatus;
  rootDir: string;
  manifestPath: string;
  providerAvailable: boolean;
  providerName: MlImageProviderName | null;
  generatedCount: number;
  approvedCount: number;
  assetResults: MlImageExecutorAssetResult[];
  blockingReasons: string[];
  attemptedProviders: MlImageExecutorProviderAttempt[];
  providerAudit: MlImageProviderRecoveryAudit;
}

interface MlAssetManifestRecord {
  assetKey: 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
  required: boolean;
  filename?: string | null;
  promptFilename?: string | null;
  approvalState?: string | null;
  assetSource?: string | null;
  notes?: string | null;
  generatedAt?: string | null;
  generatedByAgent?: string | null;
  reviewedAt?: string | null;
  reviewedByAgent?: string | null;
  reviewSummary?: string | null;
}

interface MlAssetManifest {
  schemaVersion?: number;
  productId?: number;
  listingId?: string | null;
  generatedAt?: string;
  reviewedProofState?: string;
  remediationPathSelected?: string;
  assets?: MlAssetManifestRecord[];
}

interface ReviewResult {
  approved: boolean;
  reasons: string[];
}

interface ImageProviderConfig {
  providerName: MlImageProviderName;
  sourceLabel: string;
  apiKey?: string;
  baseUrl: string;
  imageModel: string;
  reviewModel: string;
  organization?: string;
  selfHosted?: SelfHostedImageProviderConfig;
}

interface ProviderCandidate {
  role: 'primary' | 'fallback' | 'tertiary';
  config: ImageProviderConfig;
}

const REQUIRED_ASSET_KEYS: Array<'cover_main' | 'detail_mount_interface' | 'usage_context_clean'> = [
  'cover_main',
  'detail_mount_interface',
  'usage_context_clean',
];

function summarizeProviderError(error: any): string {
  const status = error?.response?.status;
  const nestedMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error?.status ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    String(error);
  return status ? `http_${status}:${nestedMessage}` : nestedMessage;
}

function isBillingBlockedMessage(message: string | null | undefined): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('billing hard limit') ||
    normalized.includes('insufficient_quota') ||
    normalized.includes('quota exceeded') ||
    normalized.includes('credit balance is too low')
  );
}

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === 'backend') {
    return path.resolve(cwd, '..');
  }
  return cwd;
}

function getCanonicalMercadoLibreAssetPackDir(productId: number): string {
  return path.join(resolveWorkspaceRoot(), 'artifacts', 'ml-image-packs', `product-${productId}`);
}

function manifestPathFor(rootDir: string): string {
  return path.join(rootDir, 'ml-asset-pack.json');
}

async function readManifest(rootDir: string): Promise<MlAssetManifest | null> {
  try {
    const raw = await fs.readFile(manifestPathFor(rootDir), 'utf8');
    return JSON.parse(raw) as MlAssetManifest;
  } catch {
    return null;
  }
}

async function writeManifest(rootDir: string, manifest: MlAssetManifest): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(manifestPathFor(rootDir), JSON.stringify(manifest, null, 2), 'utf8');
}

function normalizeManifest(manifest: MlAssetManifest): MlAssetManifest {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  return {
    ...manifest,
    schemaVersion: 1,
    assets: REQUIRED_ASSET_KEYS.map((assetKey) => {
      const existing = assets.find((asset) => asset.assetKey === assetKey);
      return {
        assetKey,
        required: assetKey !== 'usage_context_clean',
        filename: existing?.filename ?? null,
        promptFilename: existing?.promptFilename ?? `${assetKey}.prompt.txt`,
        approvalState: existing?.approvalState ?? 'pending_generation',
        assetSource: existing?.assetSource ?? 'internal_generated',
        notes: existing?.notes ?? null,
        generatedAt: existing?.generatedAt ?? null,
        generatedByAgent: existing?.generatedByAgent ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
        reviewedByAgent: existing?.reviewedByAgent ?? null,
        reviewSummary: existing?.reviewSummary ?? null,
      } satisfies MlAssetManifestRecord;
    }),
  };
}

function sourceLabel(apiName: string, entry: CredentialEntry | null, envVar: string): string {
  if (entry?.id) {
    return `credentials_manager:${apiName}:${entry.scope}${entry.id ? `#${entry.id}` : ''}`;
  }
  return `env:${envVar}`;
}

async function resolveOpenAIConfig(userId: number): Promise<ImageProviderConfig | null> {
  const entry = await CredentialsManager.getCredentialEntry(userId, 'openai', 'production').catch(() => null);
  const creds = (entry?.credentials || null) as OpenAICredentials | null;
  if (!creds?.apiKey || !String(creds.apiKey).trim()) {
    return null;
  }
  return {
    providerName: 'openai',
    sourceLabel: sourceLabel('openai', entry, 'OPENAI_API_KEY'),
    apiKey: String(creds.apiKey).trim(),
    baseUrl:
      String(creds.baseUrl || process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || '').trim() ||
      'https://api.openai.com/v1',
    organization: String(creds.organization || '').trim() || undefined,
    imageModel:
      String(creds.imageModel || process.env.OPENAI_IMAGE_MODEL || '').trim() || 'gpt-image-1',
    reviewModel:
      String(creds.reviewModel || process.env.OPENAI_VISION_MODEL || creds.model || '').trim() || 'gpt-4o-mini',
  };
}

async function resolveGeminiConfig(userId: number): Promise<ImageProviderConfig | null> {
  const entry = await CredentialsManager.getCredentialEntry(userId, 'gemini', 'production').catch(() => null);
  const creds = (entry?.credentials || null) as GeminiCredentials | null;
  if (!creds?.apiKey || !String(creds.apiKey).trim()) {
    return null;
  }
  return {
    providerName: 'gemini',
    sourceLabel: sourceLabel('gemini', entry, 'GEMINI_API_KEY'),
    apiKey: String(creds.apiKey).trim(),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    imageModel:
      String(creds.model || process.env.GEMINI_IMAGE_MODEL || process.env.GEMINI_MODEL || '').trim() ||
      'gemini-2.0-flash-preview-image-generation',
    reviewModel:
      String(creds.reviewModel || process.env.GEMINI_REVIEW_MODEL || '').trim() ||
      'gemini-2.0-flash',
  };
}

async function resolveProviderCandidates(userId: number): Promise<ProviderCandidate[]> {
  const candidates: ProviderCandidate[] = [];
  const openai = await resolveOpenAIConfig(userId);
  if (openai) {
    candidates.push({ role: 'primary', config: openai });
  }
  const gemini = await resolveGeminiConfig(userId);
  if (gemini) {
    candidates.push({ role: openai ? 'fallback' : 'primary', config: gemini });
  }
  const selfHostedInspection = inspectSelfHostedImageProvider();
  if (selfHostedInspection.config) {
    candidates.push({
      role: candidates.length === 0 ? 'primary' : candidates.length === 1 ? 'fallback' : 'tertiary',
      config: {
        providerName: 'self_hosted',
        sourceLabel: selfHostedInspection.config.sourceLabel,
        baseUrl: selfHostedInspection.config.baseUrl,
        imageModel: selfHostedInspection.config.imageModel,
        reviewModel: selfHostedInspection.config.reviewModel,
        selfHosted: selfHostedInspection.config,
      },
    });
  }
  return candidates;
}

function emptyProviderAudit(candidates: ProviderCandidate[]): MlImageProviderRecoveryAudit {
  const primary = candidates.find((candidate) => candidate.role === 'primary') || null;
  const fallback = candidates.find((candidate) => candidate.role === 'fallback') || null;
  const selfHostedInspection = inspectSelfHostedImageProvider();
  const tertiary =
    candidates.find((candidate) => candidate.role === 'tertiary') ||
    (candidates.find((candidate) => candidate.config.providerName === 'self_hosted') ?? null);
  return {
    primaryProvider: primary?.config.providerName ?? null,
    primaryProviderSource: primary?.config.sourceLabel ?? null,
    primaryProviderState: primary ? 'provider_healthy' : 'provider_unavailable',
    fallbackProvider: fallback?.config.providerName ?? null,
    fallbackProviderSource: fallback?.config.sourceLabel ?? null,
    fallbackProviderState: fallback ? 'fallback_provider_available' : 'fallback_provider_unavailable',
    tertiaryProvider: tertiary?.config.providerName ?? 'self_hosted',
    tertiaryProviderSource: tertiary?.config.sourceLabel ?? selfHostedInspection.sourceLabel,
    tertiaryProviderState: selfHostedInspection.state,
    recoveryRoute: tertiary ? 'fallback_to_tertiary' : fallback ? 'fallback_to_secondary' : primary ? 'use_primary' : 'blocked',
    notes: [...selfHostedInspection.notes],
  };
}

function applyAttemptToAudit(
  audit: MlImageProviderRecoveryAudit,
  candidate: ProviderCandidate,
  attempt: MlImageExecutorProviderAttempt
): MlImageProviderRecoveryAudit {
  const next = { ...audit, notes: [...audit.notes] };
  const failureSummary = attempt.blockingReasons[0] || null;
  if (candidate.role === 'primary') {
    next.primaryProvider = candidate.config.providerName;
    next.primaryProviderSource = candidate.config.sourceLabel;
    next.primaryProviderState = failureSummary && isBillingBlockedMessage(failureSummary)
      ? 'provider_available_billing_blocked'
      : attempt.status === 'provider_unavailable'
        ? 'provider_unavailable'
        : 'provider_healthy';
    if (failureSummary) {
      next.notes.push(`primary:${candidate.config.providerName}:${failureSummary}`);
    }
  } else {
    if (candidate.role === 'tertiary') {
      next.tertiaryProvider = candidate.config.providerName;
      next.tertiaryProviderSource = candidate.config.sourceLabel;
      next.tertiaryProviderState =
        attempt.status === 'provider_unavailable'
          ? 'self_hosted_unavailable'
          : failureSummary
            ? 'self_hosted_generation_failed'
            : 'self_hosted_available';
      if (failureSummary) {
        next.notes.push(`tertiary:${candidate.config.providerName}:${failureSummary}`);
      }
      return next;
    }
    next.fallbackProvider = candidate.config.providerName;
    next.fallbackProviderSource = candidate.config.sourceLabel;
    next.fallbackProviderState = attempt.status === 'provider_unavailable'
      ? 'fallback_provider_unavailable'
      : 'fallback_provider_available';
    if (failureSummary) {
      next.notes.push(`fallback:${candidate.config.providerName}:${failureSummary}`);
    }
  }
  return next;
}

async function generateImageWithOpenAI(config: ImageProviderConfig, prompt: string): Promise<Buffer> {
  const response = await axios.post(
    `${config.baseUrl.replace(/\/$/, '')}/images/generations`,
    {
      model: config.imageModel,
      prompt,
      size: '1024x1024',
    },
    {
      timeout: 120000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
      },
    }
  );

  const b64 = response.data?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error('openai_image_generation_missing_b64');
  }
  const raw = Buffer.from(b64, 'base64');
  return sharp(raw)
    .rotate()
    .resize(1536, 1536, { fit: 'cover' })
    .png()
    .toBuffer();
}

async function reviewGeneratedImageWithOpenAI(
  config: ImageProviderConfig,
  assetKey: string,
  assetPath: string
): Promise<ReviewResult> {
  const imageBuffer = await fs.readFile(assetPath);
  const base64 = imageBuffer.toString('base64');

  const response = await axios.post(
    `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      model: config.reviewModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a MercadoLibre Chile image compliance reviewer. Respond with JSON only: {"approved":boolean,"reasons":[string]}. Reject if there is text, arrows, logos, watermarks, hands dominating, collage/split composition, incomplete/uncentered product, weak protagonist framing, or image below marketplace-safe quality.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Review this generated MercadoLibre asset for ${assetKey}. Approve only if it is a clean ML-safe product image.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64}`,
              },
            },
          ],
        },
      ],
    },
    {
      timeout: 120000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
      },
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('openai_image_review_missing_content');
  }
  const parsed = JSON.parse(content);
  return {
    approved: Boolean(parsed.approved),
    reasons: Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((value: unknown): value is string => typeof value === 'string')
      : [],
  };
}

function extractGeminiResponseParts(response: any): Array<Record<string, any>> {
  const candidates = Array.isArray(response?.data?.candidates) ? response.data.candidates : [];
  return candidates.flatMap((candidate: any) =>
    Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  );
}

function stripCodeFences(value: string): string {
  return value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

async function generateImageWithGemini(config: ImageProviderConfig, prompt: string): Promise<Buffer> {
  const response = await axios.post(
    `${config.baseUrl.replace(/\/$/, '')}/models/${config.imageModel}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    },
    {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const parts = extractGeminiResponseParts(response);
  const inlineDataPart = parts.find((part) => {
    const inlineData = part.inlineData || part.inline_data;
    return inlineData?.data;
  });
  const inlineData = inlineDataPart?.inlineData || inlineDataPart?.inline_data;
  const b64 = inlineData?.data;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error('gemini_image_generation_missing_inline_data');
  }
  const raw = Buffer.from(b64, 'base64');
  return sharp(raw)
    .rotate()
    .resize(1536, 1536, { fit: 'cover' })
    .png()
    .toBuffer();
}

async function reviewGeneratedImageWithGemini(
  config: ImageProviderConfig,
  assetKey: string,
  assetPath: string
): Promise<ReviewResult> {
  const imageBuffer = await fs.readFile(assetPath);
  const base64 = imageBuffer.toString('base64');
  const response = await axios.post(
    `${config.baseUrl.replace(/\/$/, '')}/models/${config.reviewModel}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Review this generated MercadoLibre asset for ${assetKey}. Respond with JSON only: {"approved":boolean,"reasons":[string]}. Reject if there is text, arrows, logos, watermarks, visible hands, collage/split composition, incomplete or uncentered product, weak protagonist framing, or poor marketplace quality.`,
            },
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64,
              },
            },
          ],
        },
      ],
    },
    {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const parts = extractGeminiResponseParts(response);
  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('gemini_image_review_missing_content');
  }
  const parsed = JSON.parse(stripCodeFences(text));
  return {
    approved: Boolean(parsed.approved),
    reasons: Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((value: unknown): value is string => typeof value === 'string')
      : [],
  };
}

async function generateImageWithProvider(config: ImageProviderConfig, prompt: string): Promise<Buffer> {
  if (config.providerName === 'self_hosted') {
    if (!config.selfHosted) {
      throw new Error('self_hosted_provider_not_configured');
    }
    return generateImageWithSelfHosted(config.selfHosted, prompt);
  }
  if (config.providerName === 'gemini') {
    return generateImageWithGemini(config, prompt);
  }
  return generateImageWithOpenAI(config, prompt);
}

async function reviewGeneratedImageWithProvider(
  config: ImageProviderConfig,
  assetKey: string,
  assetPath: string
): Promise<ReviewResult> {
  if (config.providerName === 'self_hosted') {
    if (!config.selfHosted) {
      throw new Error('self_hosted_provider_not_configured');
    }
    return reviewGeneratedImageWithSelfHosted(config.selfHosted, assetKey, assetPath);
  }
  if (config.providerName === 'gemini') {
    return reviewGeneratedImageWithGemini(config, assetKey, assetPath);
  }
  return reviewGeneratedImageWithOpenAI(config, assetKey, assetPath);
}

async function readPrompt(rootDir: string, assetKey: string, promptFilename?: string | null): Promise<string | null> {
  const filename = promptFilename || `${assetKey}.prompt.txt`;
  const promptPath = path.join(rootDir, filename);
  try {
    return await fs.readFile(promptPath, 'utf8');
  } catch {
    return null;
  }
}

function localFilenameForAsset(assetKey: string): string {
  return `${assetKey}.png`;
}

async function runProviderExecutor(params: {
  rootDir: string;
  manifest: MlAssetManifest;
  config: ImageProviderConfig;
}): Promise<MlImageExecutorRunResult> {
  const manifest = normalizeManifest(params.manifest);
  const assetResults: MlImageExecutorAssetResult[] = [];
  let generatedCount = 0;
  let approvedCount = 0;

  for (const asset of manifest.assets || []) {
    const prompt = await readPrompt(params.rootDir, asset.assetKey, asset.promptFilename);
    const promptPath = asset.promptFilename ? path.join(params.rootDir, asset.promptFilename) : null;

    if (!prompt) {
      assetResults.push({
        assetKey: asset.assetKey,
        promptPath,
        localPath: null,
        generated: false,
        reviewed: false,
        approvalState: 'failed',
        provider: params.config.providerName,
        model: params.config.imageModel,
        reviewModel: params.config.reviewModel,
        notes: 'prompt_missing',
      });
      asset.notes = 'prompt_missing';
      continue;
    }

    try {
      const generated = await generateImageWithProvider(params.config, prompt);
      const filename = localFilenameForAsset(asset.assetKey);
      const targetPath = path.join(params.rootDir, filename);
      await fs.mkdir(params.rootDir, { recursive: true });
      await fs.writeFile(targetPath, generated);
      generatedCount++;

      let approved = false;
      let reviewReasons: string[] = [];
      try {
        const review = await reviewGeneratedImageWithProvider(params.config, asset.assetKey, targetPath);
        approved = review.approved;
        reviewReasons = review.reasons;
      } catch (reviewError: any) {
        reviewReasons = [`review_unavailable:${summarizeProviderError(reviewError)}`];
      }

      asset.filename = filename;
      asset.generatedAt = new Date().toISOString();
      asset.generatedByAgent = `${params.config.providerName}_image_executor`;
      asset.reviewedAt = approved ? new Date().toISOString() : null;
      asset.reviewedByAgent = approved ? `${params.config.providerName}_image_reviewer` : null;
      asset.reviewSummary = reviewReasons.join('; ') || null;
      asset.assetSource = 'internal_generated';
      asset.approvalState = approved ? 'approved' : 'present_unapproved';
      asset.notes =
        approved
          ? `${params.config.providerName}_generated_and_reviewed`
          : reviewReasons.join('; ') || 'generated_but_not_approved';

      if (approved) approvedCount++;
      assetResults.push({
        assetKey: asset.assetKey,
        promptPath,
        localPath: targetPath,
        generated: true,
        reviewed: reviewReasons.length > 0 || approved,
        approvalState: approved ? 'approved' : 'present_unapproved',
        provider: params.config.providerName,
        model: params.config.imageModel,
        reviewModel: params.config.reviewModel,
        notes: asset.notes,
      });
    } catch (error: any) {
      asset.approvalState = 'failed';
      asset.notes = summarizeProviderError(error);
      assetResults.push({
        assetKey: asset.assetKey,
        promptPath,
        localPath: null,
        generated: false,
        reviewed: false,
        approvalState: 'failed',
        provider: params.config.providerName,
        model: params.config.imageModel,
        reviewModel: params.config.reviewModel,
        notes: asset.notes,
      });
    }
  }

  manifest.reviewedProofState =
    manifest.assets?.filter((asset) => asset.required !== false).every((asset) => asset.approvalState === 'approved')
      ? 'files_ready_pending_manual_upload'
      : 'pending_real_files';

  await writeManifest(params.rootDir, manifest);

  const blockingReasons = assetResults
    .filter((asset) => asset.approvalState !== 'approved' && asset.assetKey !== 'usage_context_clean')
    .map((asset) => `${asset.assetKey}:${asset.notes || asset.approvalState}`);

  return {
    status:
      generatedCount === 0
        ? 'failed'
        : blockingReasons.length === 0
          ? 'completed'
          : 'partial',
    rootDir: params.rootDir,
    manifestPath: manifestPathFor(params.rootDir),
    providerAvailable: true,
    providerName: params.config.providerName,
    generatedCount,
    approvedCount,
    assetResults,
    blockingReasons,
    attemptedProviders: [],
      providerAudit: {
        primaryProvider: null,
        primaryProviderSource: null,
        primaryProviderState: 'provider_unavailable',
        fallbackProvider: null,
        fallbackProviderSource: null,
        fallbackProviderState: 'fallback_provider_unavailable',
        tertiaryProvider: 'self_hosted',
        tertiaryProviderSource: inspectSelfHostedImageProvider().sourceLabel,
        tertiaryProviderState: inspectSelfHostedImageProvider().state,
        recoveryRoute: 'blocked',
        notes: inspectSelfHostedImageProvider().notes,
      },
    };
  }

export async function auditMercadoLibreImageProviderRecovery(params: {
  userId: number;
  lastAttempt?: MlImageExecutorRunResult | null;
}): Promise<MlImageProviderRecoveryAudit> {
  const candidates = await resolveProviderCandidates(params.userId);
  let audit = emptyProviderAudit(candidates);
  if (params.lastAttempt?.attemptedProviders?.length) {
    for (const attempt of params.lastAttempt.attemptedProviders) {
      const candidate = candidates.find((item) => item.config.providerName === attempt.providerName);
      if (candidate) {
        audit = applyAttemptToAudit(audit, candidate, attempt);
      }
    }
  }
  return audit;
}

export async function executeMercadoLibreImageAssetPack(params: {
  userId: number;
  productId: number;
}): Promise<MlImageExecutorRunResult> {
  const rootDir = getCanonicalMercadoLibreAssetPackDir(params.productId);
  const manifest = await readManifest(rootDir);
  if (!manifest) {
    return {
      status: 'manifest_missing',
      rootDir,
      manifestPath: manifestPathFor(rootDir),
      providerAvailable: false,
      providerName: null,
      generatedCount: 0,
      approvedCount: 0,
      assetResults: [],
      blockingReasons: ['ml_asset_pack_manifest_missing'],
      attemptedProviders: [],
      providerAudit: {
        primaryProvider: null,
        primaryProviderSource: null,
        primaryProviderState: 'provider_unavailable',
        fallbackProvider: null,
        fallbackProviderSource: null,
        fallbackProviderState: 'fallback_provider_unavailable',
        tertiaryProvider: 'self_hosted',
        tertiaryProviderSource: inspectSelfHostedImageProvider().sourceLabel,
        tertiaryProviderState: inspectSelfHostedImageProvider().state,
        recoveryRoute: 'blocked',
        notes: ['manifest_missing'],
      },
    };
  }

  const candidates = await resolveProviderCandidates(params.userId);
  let audit = emptyProviderAudit(candidates);
  if (candidates.length === 0) {
    return {
      status: 'provider_unavailable',
      rootDir,
      manifestPath: manifestPathFor(rootDir),
      providerAvailable: false,
      providerName: null,
      generatedCount: 0,
      approvedCount: 0,
      assetResults: [],
      blockingReasons: ['no_internal_image_provider_configured'],
      attemptedProviders: [],
      providerAudit: audit,
    };
  }

  const attempts: MlImageExecutorProviderAttempt[] = [];
  const combinedBlockingReasons: string[] = [];
  let lastResult: MlImageExecutorRunResult | null = null;

  for (const candidate of candidates) {
    const result = await runProviderExecutor({
      rootDir,
      manifest,
      config: candidate.config,
    });

    const attempt: MlImageExecutorProviderAttempt = {
      providerName: candidate.config.providerName,
      sourceLabel: candidate.config.sourceLabel,
      status: result.status,
      generatedCount: result.generatedCount,
      approvedCount: result.approvedCount,
      blockingReasons: result.blockingReasons,
    };
    attempts.push(attempt);
    audit = applyAttemptToAudit(audit, candidate, attempt);
    combinedBlockingReasons.push(...result.blockingReasons);
    lastResult = result;

    if (result.generatedCount > 0 || result.approvedCount > 0 || result.status === 'completed' || result.status === 'partial') {
      return {
        ...result,
        attemptedProviders: attempts,
        providerAudit: audit,
      };
    }
  }

  return {
    ...(lastResult || {
      status: 'failed' as const,
      rootDir,
      manifestPath: manifestPathFor(rootDir),
      providerAvailable: true,
      providerName: candidates[0]?.config.providerName ?? null,
      generatedCount: 0,
      approvedCount: 0,
      assetResults: [],
      blockingReasons: [],
      attemptedProviders: [],
      providerAudit: audit,
    }),
    blockingReasons: [...new Set(combinedBlockingReasons)],
    attemptedProviders: attempts,
    providerAudit: audit,
  };
}
