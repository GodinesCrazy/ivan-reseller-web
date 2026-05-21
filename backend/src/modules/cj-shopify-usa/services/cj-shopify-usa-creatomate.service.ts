/**
 * PICO 3.2 — Cloud video render via Creatomate (no FFmpeg on Railway).
 * @see https://creatomate.com/docs/api/rest-api/post-v1-renders
 */

const CREATOMATE_API = 'https://api.creatomate.com/v1';
const SLIDE_DURATION_SEC = 2.8;
const POLL_INTERVAL_MS = 4_000;
const MAX_POLL_ATTEMPTS = 45;

type CreatomateRenderStatus = 'planned' | 'waiting' | 'transcoding' | 'rendering' | 'succeeded' | 'failed';

type CreatomateRenderResponse = {
  id?: string;
  status?: CreatomateRenderStatus;
  url?: string;
  error_message?: string;
};

function cleanTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 62) return normalized;
  return `${normalized.slice(0, 59).trim()}...`;
}

function useTemplateRender(): boolean {
  const mode = String(process.env.PICO_VIDEO_RENDER_MODE || 'source').trim().toLowerCase();
  return mode === 'template' && Boolean(process.env.CREATOMATE_TEMPLATE_ID?.trim());
}

function buildSlideshowSource(imageUrls: string[], overlayText: string) {
  const duration = Math.max(1, imageUrls.length) * SLIDE_DURATION_SEC;
  const title = cleanTitle(overlayText);
  const imageElements = imageUrls.flatMap((source, index) => {
    const time = index * SLIDE_DURATION_SEC;
    return [
      {
        type: 'image',
        source,
        time,
        duration: SLIDE_DURATION_SEC,
        fit: 'cover',
        width: '100%',
        height: '100%',
        opacity: '22%',
      },
      {
        type: 'image',
        source,
        time,
        duration: SLIDE_DURATION_SEC,
        fit: 'contain',
        width: '92%',
        height: '72%',
        x: '50%',
        y: '42%',
        x_alignment: '50%',
        y_alignment: '50%',
      },
    ];
  });

  return {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    duration,
    fill_color: '#060912',
    elements: [
      {
        type: 'composition',
        track: 1,
        elements: imageElements,
      },
      {
        type: 'text',
        text: title,
        time: 0,
        duration,
        x: '50%',
        y: '83%',
        width: '88%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Montserrat',
        font_weight: '700',
        font_size: '4.2 vmin',
        fill_color: '#ffffff',
        stroke_color: '#000000',
        stroke_width: '0.25 vmin',
      },
      {
        type: 'text',
        text: 'PawVault pick',
        time: 0,
        duration,
        x: '50%',
        y: '90%',
        width: '70%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Montserrat',
        font_weight: '600',
        font_size: '2.7 vmin',
        fill_color: '#c8fff4',
      },
    ],
  };
}

export const cjShopifyUsaCreatomateService = {
  isConfigured(): boolean {
    return Boolean(process.env.CREATOMATE_API_KEY?.trim());
  },

  async createSlideshowRender(input: {
    imageUrls: string[];
    productTitle: string;
  }): Promise<{ renderId: string }> {
    const apiKey = process.env.CREATOMATE_API_KEY?.trim();
    if (!apiKey) throw new Error('CREATOMATE_API_KEY is not configured');

    const templateId = useTemplateRender() ? process.env.CREATOMATE_TEMPLATE_ID?.trim() : '';
    const body = templateId
      ? {
          template_id: templateId,
          modifications: {
            'Product-Title': input.productTitle.slice(0, 80),
            ...(input.imageUrls[0] ? { 'Image-1': input.imageUrls[0] } : {}),
            ...(input.imageUrls[1] ? { 'Image-2': input.imageUrls[1] } : {}),
            ...(input.imageUrls[2] ? { 'Image-3': input.imageUrls[2] } : {}),
          },
        }
      : { source: buildSlideshowSource(input.imageUrls, input.productTitle) };

    const res = await fetch(`${CREATOMATE_API}/renders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as CreatomateRenderResponse | CreatomateRenderResponse[];
    if (!res.ok) {
      throw new Error(`Creatomate create render ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    }

    const render = Array.isArray(data) ? data[0] : data;
    if (!render?.id) throw new Error('Creatomate did not return a render id');
    return { renderId: render.id };
  },

  async getRenderUrl(renderId: string): Promise<string> {
    const apiKey = process.env.CREATOMATE_API_KEY?.trim();
    if (!apiKey) throw new Error('CREATOMATE_API_KEY is not configured');

    const res = await fetch(`${CREATOMATE_API}/renders/${encodeURIComponent(renderId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as CreatomateRenderResponse;
    if (!res.ok) {
      throw new Error(`Creatomate render lookup ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    if (data.status === 'succeeded' && data.url) return data.url;
    if (data.status === 'failed') throw new Error(data.error_message || 'Creatomate render failed');
    throw new Error(`Creatomate render is not ready yet: ${data.status || 'unknown'}`);
  },

  async waitForRender(renderId: string): Promise<string> {
    const apiKey = process.env.CREATOMATE_API_KEY?.trim();
    if (!apiKey) throw new Error('CREATOMATE_API_KEY is not configured');

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(`${CREATOMATE_API}/renders/${renderId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = (await res.json().catch(() => ({}))) as CreatomateRenderResponse;
      if (!res.ok) {
        throw new Error(`Creatomate poll ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
      }

      if (data.status === 'succeeded' && data.url) return data.url;
      if (data.status === 'failed') {
        throw new Error(data.error_message || 'Creatomate render failed');
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`Creatomate render timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
  },
};
