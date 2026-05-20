const mockGetCredentials = jest.fn();

jest.mock('../../../../services/credentials-manager.service', () => ({
  CredentialsManager: {
    getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
  },
}));

describe('cj-shopify-usa-content.service PICO AI fallback', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    mockGetCredentials.mockReset();
    process.env = { ...originalEnv, PICO_AI_PROVIDER_ORDER: 'openai,groq,gemini,heuristic' };
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('falls back from OpenAI insufficient_quota to Groq for video copy', async () => {
    mockGetCredentials.mockImplementation(async (_userId: number, apiName: string) => {
      if (apiName === 'openai') return { apiKey: 'openai-key' };
      if (apiName === 'groq') return { apiKey: 'groq-key', model: 'llama-3.3-70b-versatile' };
      return null;
    });
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('api.openai.com')) {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error":{"code":"insufficient_quota"}}',
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"caption":"Groq caption","hashtags":["#PawVault","#PetFinds"]}' } }],
        }),
      } as Response;
    }) as jest.Mock;

    const { cjShopifyUsaContentService } = await import('../cj-shopify-usa-content.service');
    const result = await cjShopifyUsaContentService.generateVideoSocialCopy({
      userId: 1,
      title: 'Dog Travel Bowl',
      priceUsd: 19.99,
      handle: 'dog-travel-bowl',
    });

    expect(result.caption).toBe('Groq caption');
    expect(result.hashtags).toEqual(['#PawVault', '#PetFinds']);
    expect((global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
    ]);
  });

  it('falls back from OpenAI and Groq to Gemini for SEO refresh', async () => {
    mockGetCredentials.mockImplementation(async (_userId: number, apiName: string) => {
      if (apiName === 'openai') return { apiKey: 'openai-key' };
      if (apiName === 'groq') return { apiKey: 'groq-key' };
      if (apiName === 'gemini') return { apiKey: 'gemini-key', model: 'gemini-2.0-flash' };
      return null;
    });
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('api.openai.com') || url.includes('api.groq.com')) {
        return {
          ok: false,
          status: 429,
          text: async () => '{"error":{"code":"rate_limit_exceeded"}}',
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"title":"Gemini SEO Title","descriptionHtml":"<p>Gemini copy.</p>","intent":"comfort_angle"}',
                  },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as jest.Mock;

    const { cjShopifyUsaContentService } = await import('../cj-shopify-usa-content.service');
    const result = await cjShopifyUsaContentService.generateSeoRefresh('Old title', 'Old description', 1);

    expect(result).toEqual({
      title: 'Gemini SEO Title',
      descriptionHtml: '<p>Gemini copy.</p>',
      intent: 'comfort_angle',
    });
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
  });

  it('uses heuristic blog content when all AI providers fail', async () => {
    mockGetCredentials.mockResolvedValue({ apiKey: 'provider-key' });
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"error":{"code":"insufficient_quota"}}',
    })) as jest.Mock;

    const { cjShopifyUsaContentService } = await import('../cj-shopify-usa-content.service');
    const result = await cjShopifyUsaContentService.generateBlogArticle('Cat Window Hammock', 'A comfy perch for cats.', 1);

    expect(result.title).toContain('Cat Window Hammock');
    expect(result.keyword).toContain('cat');
    expect(result.contentHtml).toContain('<h1>');
  });

  it('reports aiContent readiness when Groq is configured without OpenAI', async () => {
    mockGetCredentials.mockImplementation(async (_userId: number, apiName: string) => {
      if (apiName === 'groq') return { apiKey: 'groq-key' };
      return null;
    });

    const { cjShopifyUsaContentService } = await import('../cj-shopify-usa-content.service');
    const readiness = await cjShopifyUsaContentService.getAiReadiness(1);

    expect(readiness.aiContent).toBe(true);
    expect(readiness.activeAiProvider).toBe('groq');
    expect(readiness.aiProviders).toMatchObject({ openai: false, groq: true, gemini: false, heuristic: true });
  });
});
