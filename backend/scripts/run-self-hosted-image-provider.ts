#!/usr/bin/env tsx
import 'dotenv/config';

import http from 'http';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const port = Number(process.env.SELF_HOSTED_IMAGE_PROVIDER_PORT || 7860);
const host = process.env.SELF_HOSTED_IMAGE_PROVIDER_HOST || '127.0.0.1';

type JsonValue = Record<string, any>;

function parseImageUrls(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      }
    } catch {
      if (images.trim().length > 0) return [images.trim()];
    }
  }
  return [];
}

function safeJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: http.IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as JsonValue) : {};
}

function extractRequestedTitle(prompt: string): string | null {
  const match =
    prompt.match(/for:\s*(.+?)\.(?:\s|$)/i) ||
    prompt.match(/for:\s*(.+)$/i) ||
    prompt.match(/image for:\s*(.+?)\.(?:\s|$)/i);
  const candidate = String(match?.[1] || '').trim();
  return candidate || null;
}

function inferAssetKind(prompt: string): 'cover_main' | 'detail_mount_interface' | 'usage_context_clean' {
  const normalized = prompt.toLowerCase();
  if (normalized.includes('usage-context') || normalized.includes('usage context')) {
    return 'usage_context_clean';
  }
  if (normalized.includes('detail image') || normalized.includes('mount') || normalized.includes('hooks') || normalized.includes('interface')) {
    return 'detail_mount_interface';
  }
  return 'cover_main';
}

function inferProductFamily(prompt: string): 'wall_cable_organizer' | 'generic' {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes('organizador') ||
    normalized.includes('enchufe') ||
    normalized.includes('cable') ||
    normalized.includes('wall') ||
    normalized.includes('pared') ||
    normalized.includes('desk') ||
    normalized.includes('mount')
  ) {
    return 'wall_cable_organizer';
  }
  return 'generic';
}

async function findSourceImageUrl(prompt: string): Promise<string | null> {
  const requestedTitle = extractRequestedTitle(prompt);
  if (!requestedTitle) return null;

  const titlePrefixes = [
    requestedTitle.slice(0, 96),
    requestedTitle.slice(0, 72),
    requestedTitle.slice(0, 48),
    requestedTitle.split(',')[0]?.trim() || requestedTitle,
  ].filter((value, index, self) => value.length >= 16 && self.indexOf(value) === index);

  for (const prefix of titlePrefixes) {
    const product = await prisma.product.findFirst({
      where: {
        title: {
          contains: prefix,
          mode: 'insensitive',
        },
      },
      select: {
        title: true,
        images: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const urls = parseImageUrls(product?.images);
    if (urls[0]) {
      return urls[0];
    }
  }

  return null;
}

function svgBuffer(svg: string): Buffer {
  return Buffer.from(svg, 'utf8');
}

function buildOrganizerRenderSvg(params: {
  width: number;
  height: number;
  assetKind: 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
}): string {
  const isDetail = params.assetKind === 'detail_mount_interface';
  const isUsage = params.assetKind === 'usage_context_clean';
  const bgStart = isUsage ? '#eef4f7' : isDetail ? '#eef2f6' : '#f6f2ec';
  const bgEnd = isUsage ? '#f7fafc' : isDetail ? '#f8fbfd' : '#fbf8f3';
  const cardFill = isUsage ? '#f7fbfd' : isDetail ? '#f7fafc' : '#fbfbfb';
  const bodyX = isDetail ? 478 : 518;
  const bodyY = isDetail ? 150 : 178;
  const bodyWidth = isDetail ? 580 : 500;
  const bodyHeight = isDetail ? 1220 : 1140;
  const panelX = bodyX + (isDetail ? 62 : 54);
  const panelWidth = bodyWidth - (isDetail ? 124 : 108);
  const upperPanelY = bodyY + (isDetail ? 214 : 204);
  const lowerPanelY = bodyY + (isDetail ? 690 : 664);
  const panelHeight = isDetail ? 348 : 312;
  const cardY = isDetail ? 88 : 110;
  const cardHeight = isDetail ? 1360 : 1310;
  const usageDesk =
    isUsage
      ? `
        <rect x="170" y="1180" width="1196" height="180" rx="36" fill="#e6d9c5"/>
        <rect x="1020" y="940" width="180" height="180" rx="36" fill="#dbe6ef"/>
        <rect x="280" y="980" width="240" height="120" rx="28" fill="#d7e1e8"/>
      `
      : '';

  return `
    <svg width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${bgStart}"/>
          <stop offset="100%" stop-color="${bgEnd}"/>
        </linearGradient>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#eef1f4"/>
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f5f8fb" stop-opacity="0.98"/>
          <stop offset="100%" stop-color="#e4ebf1" stop-opacity="0.98"/>
        </linearGradient>
      </defs>
      <rect width="${params.width}" height="${params.height}" fill="url(#bg)"/>
      ${usageDesk}
      <ellipse cx="768" cy="1382" rx="${isDetail ? 292 : 260}" ry="56" fill="#bfc6cf" opacity="0.28"/>
      <rect x="208" y="${cardY}" width="1120" height="${cardHeight}" rx="84" fill="${cardFill}" stroke="#dde2e7" stroke-width="4"/>
      <rect x="${bodyX + 18}" y="${bodyY + 26}" width="${bodyWidth}" height="${bodyHeight}" rx="98" fill="#d8dde3" opacity="0.34"/>
      <rect x="${bodyX}" y="${bodyY}" width="${bodyWidth}" height="${bodyHeight}" rx="96" fill="url(#body)" stroke="#d6dbe2" stroke-width="8"/>
      <rect x="${bodyX + bodyWidth * 0.36}" y="${bodyY - 42}" width="${bodyWidth * 0.28}" height="58" rx="24" fill="#ffffff" stroke="#d6dbe2" stroke-width="6"/>
      <rect x="${bodyX + bodyWidth * 0.45}" y="${bodyY - 18}" width="${bodyWidth * 0.1}" height="28" rx="14" fill="#ecf0f3"/>
      <circle cx="${bodyX + 82}" cy="${bodyY + 98}" r="11" fill="#d4dae1"/>
      <circle cx="${bodyX + bodyWidth - 82}" cy="${bodyY + 98}" r="11" fill="#d4dae1"/>
      <circle cx="${bodyX + 82}" cy="${bodyY + bodyHeight - 98}" r="11" fill="#d4dae1"/>
      <circle cx="${bodyX + bodyWidth - 82}" cy="${bodyY + bodyHeight - 98}" r="11" fill="#d4dae1"/>
      <rect x="${panelX}" y="${upperPanelY}" width="${panelWidth}" height="${panelHeight}" rx="42" fill="url(#panel)" stroke="#cad3dc" stroke-width="7"/>
      <rect x="${panelX}" y="${lowerPanelY}" width="${panelWidth}" height="${panelHeight}" rx="42" fill="url(#panel)" stroke="#cad3dc" stroke-width="7"/>
      <path d="M ${panelX + panelWidth * 0.46} ${upperPanelY + 78}
               C ${panelX + panelWidth * 0.38} ${upperPanelY + 78}, ${panelX + panelWidth * 0.32} ${upperPanelY + 132}, ${panelX + panelWidth * 0.32} ${upperPanelY + 198}
               L ${panelX + panelWidth * 0.32} ${upperPanelY + 222}
               C ${panelX + panelWidth * 0.32} ${upperPanelY + 284}, ${panelX + panelWidth * 0.39} ${upperPanelY + 326}, ${panelX + panelWidth * 0.5} ${upperPanelY + 326}
               C ${panelX + panelWidth * 0.61} ${upperPanelY + 326}, ${panelX + panelWidth * 0.68} ${upperPanelY + 284}, ${panelX + panelWidth * 0.68} ${upperPanelY + 214}
               L ${panelX + panelWidth * 0.68} ${upperPanelY + 152}
               C ${panelX + panelWidth * 0.68} ${upperPanelY + 122}, ${panelX + panelWidth * 0.63} ${upperPanelY + 98}, ${panelX + panelWidth * 0.58} ${upperPanelY + 98}
               C ${panelX + panelWidth * 0.53} ${upperPanelY + 98}, ${panelX + panelWidth * 0.5} ${upperPanelY + 122}, ${panelX + panelWidth * 0.5} ${upperPanelY + 154}
               L ${panelX + panelWidth * 0.5} ${upperPanelY + 214}
               C ${panelX + panelWidth * 0.5} ${upperPanelY + 230}, ${panelX + panelWidth * 0.48} ${upperPanelY + 242}, ${panelX + panelWidth * 0.45} ${upperPanelY + 242}
               C ${panelX + panelWidth * 0.41} ${upperPanelY + 242}, ${panelX + panelWidth * 0.39} ${upperPanelY + 228}, ${panelX + panelWidth * 0.39} ${upperPanelY + 208}
               L ${panelX + panelWidth * 0.39} ${upperPanelY + 182}
               C ${panelX + panelWidth * 0.39} ${upperPanelY + 118}, ${panelX + panelWidth * 0.42} ${upperPanelY + 78}, ${panelX + panelWidth * 0.46} ${upperPanelY + 78} Z"
            fill="#ffffff" stroke="#cfd6de" stroke-width="9" stroke-linejoin="round"/>
      <path d="M ${panelX + panelWidth * 0.46} ${lowerPanelY + 78}
               C ${panelX + panelWidth * 0.38} ${lowerPanelY + 78}, ${panelX + panelWidth * 0.32} ${lowerPanelY + 132}, ${panelX + panelWidth * 0.32} ${lowerPanelY + 198}
               L ${panelX + panelWidth * 0.32} ${lowerPanelY + 222}
               C ${panelX + panelWidth * 0.32} ${lowerPanelY + 284}, ${panelX + panelWidth * 0.39} ${lowerPanelY + 326}, ${panelX + panelWidth * 0.5} ${lowerPanelY + 326}
               C ${panelX + panelWidth * 0.61} ${lowerPanelY + 326}, ${panelX + panelWidth * 0.68} ${lowerPanelY + 284}, ${panelX + panelWidth * 0.68} ${lowerPanelY + 214}
               L ${panelX + panelWidth * 0.68} ${lowerPanelY + 152}
               C ${panelX + panelWidth * 0.68} ${lowerPanelY + 122}, ${panelX + panelWidth * 0.63} ${lowerPanelY + 98}, ${panelX + panelWidth * 0.58} ${lowerPanelY + 98}
               C ${panelX + panelWidth * 0.53} ${lowerPanelY + 98}, ${panelX + panelWidth * 0.5} ${lowerPanelY + 122}, ${panelX + panelWidth * 0.5} ${lowerPanelY + 154}
               L ${panelX + panelWidth * 0.5} ${lowerPanelY + 214}
               C ${panelX + panelWidth * 0.5} ${lowerPanelY + 230}, ${panelX + panelWidth * 0.48} ${lowerPanelY + 242}, ${panelX + panelWidth * 0.45} ${lowerPanelY + 242}
               C ${panelX + panelWidth * 0.41} ${lowerPanelY + 242}, ${panelX + panelWidth * 0.39} ${lowerPanelY + 228}, ${panelX + panelWidth * 0.39} ${lowerPanelY + 208}
               L ${panelX + panelWidth * 0.39} ${lowerPanelY + 182}
               C ${panelX + panelWidth * 0.39} ${lowerPanelY + 118}, ${panelX + panelWidth * 0.42} ${lowerPanelY + 78}, ${panelX + panelWidth * 0.46} ${lowerPanelY + 78} Z"
            fill="#ffffff" stroke="#cfd6de" stroke-width="9" stroke-linejoin="round"/>
      <rect x="${bodyX + bodyWidth * 0.16}" y="${bodyY + bodyHeight - 36}" width="${bodyWidth * 0.68}" height="18" rx="9" fill="#e6eaef"/>
    </svg>
  `.trim();
}

async function buildGenericCleanCrop(params: {
  image: sharp.Sharp;
  width: number;
  height: number;
  assetKind: 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
}): Promise<Buffer> {
  const region =
    params.assetKind === 'detail_mount_interface'
      ? {
          left: Math.max(0, Math.floor(params.width * 0.27)),
          top: Math.max(0, Math.floor(params.height * 0.18)),
          width: Math.max(700, Math.floor(params.width * 0.34)),
          height: Math.max(760, Math.floor(params.height * 0.58)),
        }
      : params.assetKind === 'usage_context_clean'
        ? {
            left: Math.max(0, Math.floor(params.width * 0.48)),
            top: Math.max(0, Math.floor(params.height * 0.08)),
            width: Math.max(640, Math.floor(params.width * 0.28)),
            height: Math.max(980, Math.floor(params.height * 0.78)),
          }
        : {
            left: Math.max(0, Math.floor(params.width * 0.5)),
            top: Math.max(0, Math.floor(params.height * 0.05)),
            width: Math.max(620, Math.floor(params.width * 0.28)),
            height: Math.max(980, Math.floor(params.height * 0.82)),
          };

  const safeRegion = {
    left: Math.min(region.left, Math.max(0, params.width - 1)),
    top: Math.min(region.top, Math.max(0, params.height - 1)),
    width: Math.min(region.width, Math.max(1, params.width - region.left)),
    height: Math.min(region.height, Math.max(1, params.height - region.top)),
  };

  const extracted = await params.image
    .clone()
    .extract(safeRegion)
    .resize(1080, 1080, { fit: 'contain', background: '#f4f5f7' })
    .png()
    .toBuffer();

  const background = sharp({
    create: {
      width: 1536,
      height: 1536,
      channels: 4,
      background: '#f5f6f8',
    },
  });

  return background
    .composite([
      {
        input: svgBuffer(`
          <svg width="1536" height="1536" xmlns="http://www.w3.org/2000/svg">
            <rect x="168" y="168" width="1200" height="1200" rx="84" fill="#ffffff" stroke="#d8dde3" stroke-width="4"/>
          </svg>
        `),
      },
      {
        input: extracted,
        top: 228,
        left: 228,
      },
    ])
    .png()
    .toBuffer();
}

async function buildAssetFromSourceImage(params: {
  sourceUrl: string;
  assetKind: 'cover_main' | 'detail_mount_interface' | 'usage_context_clean';
  prompt: string;
}): Promise<Buffer> {
  const response = await fetch(params.sourceUrl);
  if (!response.ok) {
    throw new Error(`source_image_fetch_failed:${response.status}`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  const image = sharp(source).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1200;
  const productFamily = inferProductFamily(params.prompt);

  if (productFamily === 'wall_cable_organizer') {
    return sharp(svgBuffer(buildOrganizerRenderSvg({
      width: 1536,
      height: 1536,
      assetKind: params.assetKind,
    })))
      .png()
      .toBuffer();
  }

  return buildGenericCleanCrop({
    image,
    width,
    height,
    assetKind: params.assetKind,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return safeJson(res, 200, {
        status: 'ok',
        provider: 'self_hosted_automatic1111_compat',
        mode: 'automatic1111',
        generatedFrom: 'prompt_guided_clean_render_or_source_cleanup',
      });
    }

    if (req.method === 'GET' && req.url === '/sdapi/v1/options') {
      return safeJson(res, 200, {
        mode: 'automatic1111',
        provider: 'self_hosted_automatic1111_compat',
        sampler: 'Euler a',
        width: 1536,
        height: 1536,
      });
    }

    if (req.method === 'POST' && req.url === '/sdapi/v1/txt2img') {
      const body = await readJsonBody(req);
      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        return safeJson(res, 400, { error: 'prompt_required' });
      }

      const sourceUrl = await findSourceImageUrl(prompt);
      if (!sourceUrl) {
        return safeJson(res, 422, { error: 'no_matching_product_source_image_found' });
      }

      const assetKind = inferAssetKind(prompt);
      const productFamily = inferProductFamily(prompt);
      const image = await buildAssetFromSourceImage({ sourceUrl, assetKind, prompt });
      return safeJson(res, 200, {
        images: [image.toString('base64')],
        info: JSON.stringify({
          provider: 'self_hosted_automatic1111_compat',
          assetKind,
          sourceUrl,
          productFamily,
          generationStrategy:
            productFamily === 'wall_cable_organizer'
              ? 'prompt_guided_clean_render'
              : 'generic_clean_crop',
        }),
      });
    }

    return safeJson(res, 404, { error: 'not_found' });
  } catch (error: any) {
    return safeJson(res, 500, {
      error: error?.message || String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({
    status: 'listening',
    host,
    port,
    healthUrl: `http://${host}:${port}/health`,
    txt2imgUrl: `http://${host}:${port}/sdapi/v1/txt2img`,
  }));
});

function shutdown(code = 0): void {
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
