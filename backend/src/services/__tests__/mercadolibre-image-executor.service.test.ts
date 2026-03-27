import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
import { CredentialsManager } from '../credentials-manager.service';
import { executeMercadoLibreImageAssetPack } from '../mercadolibre-image-executor.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

async function createPngBase64(color: string): Promise<string> {
  const buffer = await sharp({
    create: {
      width: 1536,
      height: 1536,
      channels: 3,
      background: color,
    },
  }).png().toBuffer();
  return buffer.toString('base64');
}

async function seedPack(productId: number): Promise<string> {
  const dir = path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', `product-${productId}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'ml-asset-pack.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        productId,
        generatedAt: new Date().toISOString(),
        reviewedProofState: 'pending_real_files',
        remediationPathSelected: 'internal_generated_asset_pack',
        assets: [
          {
            assetKey: 'cover_main',
            required: true,
            filename: null,
            promptFilename: 'cover_main.prompt.txt',
            approvalState: 'pending_generation',
            assetSource: 'internal_generated',
            notes: null,
          },
          {
            assetKey: 'detail_mount_interface',
            required: true,
            filename: null,
            promptFilename: 'detail_mount_interface.prompt.txt',
            approvalState: 'pending_generation',
            assetSource: 'internal_generated',
            notes: null,
          },
          {
            assetKey: 'usage_context_clean',
            required: false,
            filename: null,
            promptFilename: 'usage_context_clean.prompt.txt',
            approvalState: 'pending_generation',
            assetSource: 'internal_generated',
            notes: null,
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );
  await fs.writeFile(path.join(dir, 'cover_main.prompt.txt'), 'clean product hero', 'utf8');
  await fs.writeFile(path.join(dir, 'detail_mount_interface.prompt.txt'), 'clean product detail', 'utf8');
  await fs.writeFile(path.join(dir, 'usage_context_clean.prompt.txt'), 'clean context image', 'utf8');
  return dir;
}

describe('mercadolibre-image-executor.service', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    mockedAxios.post.mockReset();
    delete process.env.SELF_HOSTED_IMAGE_PROVIDER_ENABLED;
    delete process.env.SELF_HOSTED_IMAGE_PROVIDER_BASE_URL;
    delete process.env.SELF_HOSTED_IMAGE_PROVIDER_MODE;
    delete process.env.SELF_HOSTED_IMAGE_PROVIDER_MODEL;
    delete process.env.SELF_HOSTED_IMAGE_PROVIDER_API_KEY;
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991001'), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991002'), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991003'), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991004'), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), '..', 'artifacts', 'ml-image-packs', 'product-991005'), { recursive: true, force: true });
  });

  it('returns provider_unavailable when OpenAI credentials are missing', async () => {
    await seedPack(991001);
    jest.spyOn(CredentialsManager, 'getCredentialEntry').mockResolvedValue(null);

    const result = await executeMercadoLibreImageAssetPack({
      userId: 1,
      productId: 991001,
    });

    expect(result.status).toBe('provider_unavailable');
    expect(result.providerAvailable).toBe(false);
    expect(result.blockingReasons).toContain('no_internal_image_provider_configured');
  });

  it('writes approved required assets when generation and review succeed', async () => {
    const dir = await seedPack(991002);
    const pngBase64 = await createPngBase64('#ffffff');

    jest.spyOn(CredentialsManager, 'getCredentialEntry').mockResolvedValue({
      id: 1,
      provider: 'openai',
      scope: 'production',
      credentials: {
        apiKey: 'test-key',
        organization: 'test-org',
        model: 'gpt-4o-mini',
      },
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      apiName: 'openai',
    } as any);

    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.includes('/images/generations')) {
        return {
          data: {
            data: [{ b64_json: pngBase64 }],
          },
        } as any;
      }
      if (url.includes('/chat/completions')) {
        return {
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ approved: true, reasons: [] }),
                },
              },
            ],
          },
        } as any;
      }
      throw new Error(`unexpected_url:${url}`);
    });

    const result = await executeMercadoLibreImageAssetPack({
      userId: 1,
      productId: 991002,
    });

    expect(result.status).toBe('completed');
    expect(result.generatedCount).toBeGreaterThanOrEqual(2);
    expect(result.approvedCount).toBeGreaterThanOrEqual(2);
    await expect(fs.access(path.join(dir, 'cover_main.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, 'detail_mount_interface.png'))).resolves.toBeUndefined();

    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'ml-asset-pack.json'), 'utf8'));
    expect(manifest.reviewedProofState).toBe('files_ready_pending_manual_upload');
    const cover = manifest.assets.find((asset: any) => asset.assetKey === 'cover_main');
    const detail = manifest.assets.find((asset: any) => asset.assetKey === 'detail_mount_interface');
    expect(cover.approvalState).toBe('approved');
    expect(detail.approvalState).toBe('approved');
  });

  it('falls back to gemini when openai is billing blocked', async () => {
    const dir = await seedPack(991003);
    const pngBase64 = await createPngBase64('#dddddd');

    jest.spyOn(CredentialsManager, 'getCredentialEntry').mockImplementation(async (_userId, apiName) => {
      if (apiName === 'openai') {
        return {
          id: 11,
          scope: 'user',
          credentials: {
            apiKey: 'openai-key',
            model: 'gpt-4o-mini',
          },
          isActive: true,
          ownerUserId: 1,
        } as any;
      }
      if (apiName === 'gemini') {
        return {
          id: 12,
          scope: 'user',
          credentials: {
            apiKey: 'gemini-key',
            model: 'gemini-2.0-flash-preview-image-generation',
            reviewModel: 'gemini-2.0-flash',
          },
          isActive: true,
          ownerUserId: 1,
        } as any;
      }
      return null;
    });

    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.includes('api.openai.com') && url.includes('/images/generations')) {
        const error: any = new Error('Billing hard limit has been reached.');
        error.response = {
          status: 400,
          data: { error: { message: 'Billing hard limit has been reached.' } },
        };
        throw error;
      }
      if (url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent')) {
        return {
          data: {
            candidates: [
              {
                content: {
                  parts: url.includes('gemini-2.0-flash-preview-image-generation')
                    ? [{ inlineData: { mimeType: 'image/png', data: pngBase64 } }]
                    : [{ text: JSON.stringify({ approved: true, reasons: [] }) }],
                },
              },
            ],
          },
        } as any;
      }
      if (url.includes('api.openai.com') && url.includes('/chat/completions')) {
        return {
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ approved: true, reasons: [] }),
                },
              },
            ],
          },
        } as any;
      }
      throw new Error(`unexpected_url:${url}`);
    });

    const result = await executeMercadoLibreImageAssetPack({
      userId: 1,
      productId: 991003,
    });

    expect(result.providerName).toBe('gemini');
    expect(result.attemptedProviders.map((item) => item.providerName)).toEqual(['openai', 'gemini']);
    expect(result.providerAudit.primaryProviderState).toBe('provider_available_billing_blocked');
    expect(result.providerAudit.fallbackProviderState).toBe('fallback_provider_available');
    await expect(fs.access(path.join(dir, 'cover_main.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, 'detail_mount_interface.png'))).resolves.toBeUndefined();
  });

  it('selects self-hosted provider when OpenAI and Gemini are unavailable', async () => {
    const dir = await seedPack(991004);
    const pngBase64 = await createPngBase64('#cccccc');

    process.env.SELF_HOSTED_IMAGE_PROVIDER_ENABLED = 'true';
    process.env.SELF_HOSTED_IMAGE_PROVIDER_BASE_URL = 'http://127.0.0.1:7860';
    process.env.SELF_HOSTED_IMAGE_PROVIDER_MODE = 'automatic1111';

    jest.spyOn(CredentialsManager, 'getCredentialEntry').mockResolvedValue(null);

    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.includes('/sdapi/v1/txt2img')) {
        return {
          data: {
            images: [pngBase64],
          },
        } as any;
      }
      throw new Error(`unexpected_url:${url}`);
    });

    const result = await executeMercadoLibreImageAssetPack({
      userId: 1,
      productId: 991004,
    });

    expect(result.providerName).toBe('self_hosted');
    expect(result.attemptedProviders.map((item) => item.providerName)).toEqual(['self_hosted']);
    expect(result.providerAudit.tertiaryProvider).toBe('self_hosted');
    expect(result.providerAudit.tertiaryProviderState).toBe('self_hosted_available');
    expect(result.generatedCount).toBeGreaterThanOrEqual(2);
    expect(result.approvedCount).toBe(0);
    expect(result.status).toBe('partial');
    await expect(fs.access(path.join(dir, 'cover_main.png'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, 'detail_mount_interface.png'))).resolves.toBeUndefined();
  });

  it('reports self-hosted misconfigured when enabled without base url', async () => {
    await seedPack(991005);
    process.env.SELF_HOSTED_IMAGE_PROVIDER_ENABLED = 'true';
    jest.spyOn(CredentialsManager, 'getCredentialEntry').mockResolvedValue(null);

    const result = await executeMercadoLibreImageAssetPack({
      userId: 1,
      productId: 991005,
    });

    expect(result.status).toBe('provider_unavailable');
    expect(result.providerAudit.tertiaryProvider).toBe('self_hosted');
    expect(result.providerAudit.tertiaryProviderState).toBe('self_hosted_misconfigured');
  });
});
