/**
 * PICO 3.4 — Platform publishers for rendered video (OAuth via env tokens).
 */

const STORE_BASE_URL = 'https://shop.ivanreseller.com';

export const cjShopifyUsaPicoSocialPublishService = {
  async publishTikTok(input: {
    videoUrl: string;
    caption: string;
    productUrl?: string;
  }): Promise<{ externalId: string; publishUrl?: string }> {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      throw new Error('TIKTOK_ACCESS_TOKEN is not configured');
    }

    // TikTok Content Posting API — init upload from URL then publish.
    // Full OAuth flow is store-level; token must be refreshed out-of-band.
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: input.caption.slice(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: input.videoUrl,
        },
      }),
    });

    const initData = (await initRes.json().catch(() => ({}))) as {
      data?: { publish_id?: string };
      error?: { message?: string };
    };

    if (!initRes.ok) {
      throw new Error(
        `TikTok init publish ${initRes.status}: ${initData.error?.message ?? JSON.stringify(initData).slice(0, 300)}`,
      );
    }

    const publishId = initData.data?.publish_id;
    if (!publishId) throw new Error('TikTok did not return publish_id');

    return {
      externalId: publishId,
      publishUrl: input.productUrl,
    };
  },

  async publishInstagramReel(input: {
    videoUrl: string;
    caption: string;
  }): Promise<{ externalId: string; publishUrl?: string }> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
    const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
    if (!accessToken || !igUserId) {
      throw new Error('INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
    }

    const createRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: input.videoUrl,
          caption: input.caption.slice(0, 2200),
          access_token: accessToken,
        }),
      },
    );

    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!createRes.ok || !createData.id) {
      throw new Error(
        `Instagram media create ${createRes.status}: ${createData.error?.message ?? JSON.stringify(createData).slice(0, 300)}`,
      );
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: accessToken,
        }),
      },
    );

    const publishData = (await publishRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!publishRes.ok || !publishData.id) {
      throw new Error(
        `Instagram publish ${publishRes.status}: ${publishData.error?.message ?? JSON.stringify(publishData).slice(0, 300)}`,
      );
    }

    return { externalId: publishData.id };
  },

  buildProductUrl(handle: string | null | undefined): string | undefined {
    const h = String(handle ?? '').trim();
    if (!h) return undefined;
    return `${STORE_BASE_URL}/products/${h}`;
  },
};
