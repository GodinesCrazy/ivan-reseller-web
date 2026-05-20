import { CredentialsManager } from '../../../services/credentials-manager.service';

type PicoAiProviderName = 'openai' | 'groq' | 'gemini' | 'heuristic';

interface GenerateContentOpts {
  userId?: number;
  title: string;
  priceUsd: number;
  handle: string | null;
  platform: 'pinterest' | 'instagram' | 'tiktok';
}

type PicoAiProviderConfig = {
  provider: Exclude<PicoAiProviderName, 'heuristic'>;
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
};

type PicoAiTextRequest = {
  userId?: number;
  prompt: string;
  temperature: number;
  maxTokens: number;
  json?: boolean;
};

type PicoAiReadiness = {
  aiContent: boolean;
  activeAiProvider: PicoAiProviderName;
  aiProviders: Record<PicoAiProviderName, boolean>;
};

const DEFAULT_PROVIDER_ORDER: PicoAiProviderName[] = ['openai', 'groq', 'gemini', 'heuristic'];

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function configuredOrder(): PicoAiProviderName[] {
  const raw = cleanText(process.env.PICO_AI_PROVIDER_ORDER);
  const fromEnv = raw
    .split(',')
    .map((item) => item.trim().toLowerCase() as PicoAiProviderName)
    .filter((item): item is PicoAiProviderName => DEFAULT_PROVIDER_ORDER.includes(item));
  const merged = fromEnv.length > 0 ? fromEnv : DEFAULT_PROVIDER_ORDER;
  return Array.from(new Set<PicoAiProviderName>([...merged, 'heuristic']));
}

function isFallbackableAiError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();
  return (
    lower.includes('insufficient_quota') ||
    lower.includes('rate_limit') ||
    lower.includes('quota') ||
    lower.includes('billing') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('402') ||
    lower.includes('timeout') ||
    lower.includes('no content') ||
    lower.includes('json')
  );
}

function stripJsonEnvelope(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseStrictJson<T>(content: string): T {
  return JSON.parse(stripJsonEnvelope(content)) as T;
}

async function credentialsFor(
  userId: number | undefined,
  provider: Exclude<PicoAiProviderName, 'heuristic'>,
): Promise<PicoAiProviderConfig | null> {
  const credentials = await CredentialsManager.getCredentials(userId ?? 0, provider, 'production').catch(() => null);
  const apiKey = cleanText(credentials?.apiKey || credentials?.[`${provider.toUpperCase()}_API_KEY`]);
  if (!apiKey) return null;

  if (provider === 'openai') {
    return {
      provider,
      apiKey,
      organization: cleanText(credentials?.organization || process.env.OPENAI_ORGANIZATION) || undefined,
      baseUrl: cleanText(credentials?.baseUrl || process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE) || 'https://api.openai.com/v1',
      model: cleanText(credentials?.model || process.env.OPENAI_MODEL) || 'gpt-4o-mini',
    };
  }

  if (provider === 'groq') {
    return {
      provider,
      apiKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: cleanText(credentials?.model || process.env.GROQ_MODEL) || 'llama-3.3-70b-versatile',
    };
  }

  return {
    provider,
    apiKey,
    model: cleanText(credentials?.model || credentials?.reviewModel || process.env.GEMINI_MODEL || process.env.GEMINI_REVIEW_MODEL) || 'gemini-2.0-flash',
  };
}

async function providerReadiness(userId?: number): Promise<PicoAiReadiness> {
  const [openai, groq, gemini] = await Promise.all([
    credentialsFor(userId, 'openai'),
    credentialsFor(userId, 'groq'),
    credentialsFor(userId, 'gemini'),
  ]);
  const aiProviders: Record<PicoAiProviderName, boolean> = {
    openai: Boolean(openai),
    groq: Boolean(groq),
    gemini: Boolean(gemini),
    heuristic: true,
  };
  const activeAiProvider = configuredOrder().find((provider) => aiProviders[provider]) || 'heuristic';
  return {
    aiContent: Boolean(openai || groq || gemini),
    activeAiProvider,
    aiProviders,
  };
}

async function invokeOpenAiCompatible(config: PicoAiProviderConfig, request: PicoAiTextRequest): Promise<string> {
  const response = await fetch(`${config.baseUrl?.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`${config.provider} API Error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No content returned from ${config.provider}`);
  return content.trim();
}

async function invokeGemini(config: PicoAiProviderConfig, request: PicoAiTextRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        ...(request.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini API Error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!content) throw new Error('No content returned from gemini');
  return content;
}

async function generateAiText(request: PicoAiTextRequest): Promise<string> {
  const failures: Array<{ provider: PicoAiProviderName; error: string }> = [];

  for (const provider of configuredOrder()) {
    if (provider === 'heuristic') continue;
    const config = await credentialsFor(request.userId, provider);
    if (!config) continue;

    try {
      return provider === 'gemini'
        ? await invokeGemini(config, request)
        : await invokeOpenAiCompatible(config, request);
    } catch (error) {
      failures.push({ provider, error: error instanceof Error ? error.message : String(error) });
      if (!isFallbackableAiError(error)) {
        console.warn(`[ContentService] ${provider} failed with non-standard error; trying next provider`, error);
      } else {
        console.warn(`[ContentService] ${provider} unavailable for PICO content; trying next provider`, error);
      }
    }
  }

  throw new Error(`No configured AI provider returned content. Attempts: ${failures.map((item) => `${item.provider}:${item.error}`).join(' | ') || 'none'}`);
}

export const cjShopifyUsaContentService = {
  getAiReadiness(userId?: number): Promise<PicoAiReadiness> {
    return providerReadiness(userId);
  },

  /**
   * PICO content engine:
   * OpenAI -> Groq -> Gemini -> local heuristic.
   */
  async generateSocialCaption(opts: GenerateContentOpts): Promise<string> {
    const prompt = `
You are a highly converting social media manager for 'PawVault', a premium pet supplies store.
Write an engaging, viral-style organic caption for a product.
Product Title: ${opts.title}
Price: $${opts.priceUsd}
Platform: ${opts.platform}

Requirements:
- First line MUST be a catchy hook (question or bold statement).
- Highlight the practical benefit for pet parents.
- Keep it under 350 characters.
- Include 3-5 highly relevant hashtags.
- Use 1-3 emojis max.
- Do NOT include URL placeholders or phrases like "Link in bio" (the platform handles the button).
    `.trim();

    try {
      return await generateAiText({
        userId: opts.userId,
        prompt,
        temperature: 0.7,
        maxTokens: 150,
      });
    } catch (error) {
      console.error('[ContentService] AI social caption failed, falling back to heuristic', error);
      return this.generateWithHeuristic(opts);
    }
  },

  async generateBlogArticle(
    title: string,
    description: string,
    userId?: number,
  ): Promise<{ title: string; contentHtml: string; keyword: string }> {
    const prompt = `
You are an expert SEO copywriter for "PawVault", a premium store exclusively for dogs and cats.
Write a highly engaging, SEO-optimized blog article about this product.
Product Title: ${title}
Product Description: ${description}

Requirements:
1. Come up with a long-tail "problem-solution" SEO keyword (e.g., "how to calm a stressed dog", "best cat bed for winter").
2. Write a catchy Blog Title incorporating the keyword.
3. Write the article content in HTML format. Use <h1> for the title, <h2> for sections, and <p> for paragraphs. DO NOT use markdown syntax like \`\`\`html.
4. The content must be between 400-600 words.
5. Focus on the benefits of the product to the pet owner. Do not mention "dropshipping", "supplier", or any Chinese origins.
6. The tone should be expert, pet-friendly, and persuasive.
7. Return the response in strict JSON format with keys: "title", "contentHtml", "keyword".
    `.trim();

    try {
      const content = await generateAiText({ userId, prompt, temperature: 0.7, maxTokens: 1500, json: true });
      const parsed = parseStrictJson<{ title?: string; contentHtml?: string; keyword?: string }>(content);
      if (!parsed.title || !parsed.contentHtml || !parsed.keyword) {
        throw new Error('Blog response missing title, contentHtml or keyword');
      }
      return {
        title: parsed.title.trim(),
        contentHtml: parsed.contentHtml.trim(),
        keyword: parsed.keyword.trim(),
      };
    } catch (error) {
      console.error('[ContentService] AI blog generation failed, using heuristic article', error);
      return this.generateBlogWithHeuristic(title, description);
    }
  },

  async generateWithOpenAI(opts: GenerateContentOpts, apiKey: string): Promise<string> {
    return invokeOpenAiCompatible(
      { provider: 'openai', apiKey, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
      {
        userId: opts.userId,
        temperature: 0.7,
        maxTokens: 150,
        prompt: `
You are a highly converting social media manager for 'PawVault', a premium pet supplies store.
Write an engaging, viral-style organic caption for a product.
Product Title: ${opts.title}
Price: $${opts.priceUsd}
Platform: ${opts.platform}
        `.trim(),
      },
    );
  },

  generateWithHeuristic(opts: GenerateContentOpts): string {
    const titleLower = opts.title.toLowerCase();
    const isCat = titleLower.includes('cat') || titleLower.includes('kitten');
    const isDog = titleLower.includes('dog') || titleLower.includes('puppy');
    const isBed = titleLower.includes('bed') || titleLower.includes('sofa') || titleLower.includes('mat');
    const isToy = titleLower.includes('toy') || titleLower.includes('teaser') || titleLower.includes('ball');
    const isGrooming = titleLower.includes('brush') || titleLower.includes('comb') || titleLower.includes('nail');

    const hooks = [];

    if (isCat) {
      hooks.push('¿Tu gato ignora todos sus juguetes? Este le va a encantar 😻');
      hooks.push('El secreto para un michi feliz y relajado 👇');
    } else if (isDog) {
      hooks.push('¿Paseos caóticos o mucha energía? Tenemos la solución 🐕');
      hooks.push('Tu mejor amigo merece lo mejor. Mira esto 👇');
    } else {
      hooks.push('Simplifica tu rutina diaria de cuidado animal ✨');
      hooks.push('¿Amas a tu mascota? Esto es un game-changer 🐾');
    }

    if (isBed) hooks.push('El descanso perfecto para tu mascota está aquí 💤');
    if (isToy) hooks.push('Horas de diversión y estimulación mental garantizadas 🧠✨');
    if (isGrooming) hooks.push('Mantén su pelaje impecable sin estrés en casa 🛁');

    const randomHook = hooks[Math.floor(Math.random() * hooks.length)];

    const hashtags = ['#PawVault', '#PetLovers', '#MascotasFelices'];
    if (isCat) hashtags.push('#CatLife');
    if (isDog) hashtags.push('#DogLife');
    if (opts.platform === 'pinterest') hashtags.push('#PetSupplies', '#HomeDecor');

    return `${randomHook}\n\nDescubre el nuevo ${opts.title}. Calidad premium diseñada para facilitar tu vida.\n\n${hashtags.join(' ')}`;
  },

  async generateBlogWithOpenAI(
    title: string,
    description: string,
    apiKey: string,
  ): Promise<{ title: string; contentHtml: string; keyword: string }> {
    const prompt = `
You are an expert SEO copywriter for "PawVault", a premium store exclusively for dogs and cats.
Write a highly engaging, SEO-optimized blog article about this product.
Product Title: ${title}
Product Description: ${description}

Return strict JSON with keys: "title", "contentHtml", "keyword".
    `.trim();
    const content = await invokeOpenAiCompatible(
      { provider: 'openai', apiKey, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
      { prompt, temperature: 0.7, maxTokens: 1500, json: true },
    );
    const parsed = parseStrictJson<{ title?: string; contentHtml?: string; keyword?: string }>(content);
    if (!parsed.title || !parsed.contentHtml || !parsed.keyword) {
      throw new Error('Blog response missing title, contentHtml or keyword');
    }
    return {
      title: parsed.title.trim(),
      contentHtml: parsed.contentHtml.trim(),
      keyword: parsed.keyword.trim(),
    };
  },

  generateBlogWithHeuristic(title: string, description: string): { title: string; contentHtml: string; keyword: string } {
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    const keyword = cleanTitle.toLowerCase().includes('cat')
      ? `best cat product for everyday comfort`
      : cleanTitle.toLowerCase().includes('dog')
        ? `best dog product for daily routines`
        : `best pet product for daily routines`;
    const articleTitle = `How ${cleanTitle} Helps Pet Parents Simplify Daily Care`;
    const safeDescription = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const contentHtml = `
<h1>${articleTitle}</h1>
<p>Pet parents want products that feel practical, safe, and easy to use every day. ${cleanTitle} is positioned as a simple upgrade for homes that care about comfort, routine, and better moments with dogs and cats.</p>
<h2>Why this product matters</h2>
<p>${safeDescription || 'This product supports a smoother pet-care routine with a focus on usefulness, comfort, and everyday quality.'}</p>
<h2>Daily benefits for pet parents</h2>
<p>A good pet product should solve a real need without making the routine more complicated. This option is selected for shoppers who want a cleaner, calmer, or more enjoyable experience at home.</p>
<h2>Who it is for</h2>
<p>It is a strong fit for pet parents who compare quality, convenience, and value before buying. The product can support gifting, routine care, enrichment, rest, or grooming depending on the pet's needs.</p>
<h2>Final take</h2>
<p>If you are looking for a practical PawVault pick, ${cleanTitle} offers a focused way to improve everyday pet care while keeping the buying decision simple.</p>
    `.trim();
    return { title: articleTitle, contentHtml, keyword };
  },

  async generateSeoRefresh(
    currentTitle: string,
    currentDescription: string,
    userId?: number,
  ): Promise<{ title: string; descriptionHtml: string; intent: string }> {
    const prompt = `
You are an expert e-commerce SEO strategist for "PawVault", a premium pet supplies store.
A product listing has had no sales for 30+ days. Rewrite its Shopify title and description with a NEW buyer intent angle.

Current title: ${currentTitle}
Current description: ${currentDescription}

Requirements:
1. Pick a distinct purchase intent (e.g. gift-focused, problem-solution, premium quality, seasonal comfort).
2. Write a new product title (max 70 chars, natural English, no supplier codes).
3. Write descriptionHtml using <p> and <ul><li> only (no <h1>). 120-220 words, persuasive and pet-parent friendly.
4. Do not mention dropshipping, CJ, or supplier origins.
5. Return strict JSON: { "title", "descriptionHtml", "intent" } where intent is a short label (e.g. "gift_angle").
    `.trim();

    try {
      const content = await generateAiText({ userId, prompt, temperature: 0.75, maxTokens: 900, json: true });
      const parsed = parseStrictJson<{ title?: string; descriptionHtml?: string; intent?: string }>(content);
      if (!parsed.title || !parsed.descriptionHtml) {
        throw new Error('SEO refresh response missing title or descriptionHtml');
      }
      return {
        title: parsed.title.trim(),
        descriptionHtml: parsed.descriptionHtml.trim(),
        intent: cleanText(parsed.intent) || 'repositioned',
      };
    } catch (error) {
      console.error('[ContentService] AI SEO refresh failed, using heuristic refresh', error);
      return this.generateSeoRefreshHeuristic(currentTitle, currentDescription);
    }
  },

  generateSeoRefreshHeuristic(
    currentTitle: string,
    currentDescription: string,
  ): { title: string; descriptionHtml: string; intent: string } {
    const compactTitle = currentTitle.replace(/\s+/g, ' ').trim().slice(0, 62);
    const title = compactTitle.toLowerCase().includes('pet')
      ? compactTitle
      : `${compactTitle} for Pets`.slice(0, 70);
    const plain = currentDescription.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title,
      intent: 'practical_daily_care',
      descriptionHtml: `
<p>Give your pet-care routine a practical upgrade with ${title}. This PawVault pick is positioned for pet parents who want useful quality, clear value, and a product that fits naturally into everyday life.</p>
<ul>
  <li>Designed for daily routines with dogs and cats.</li>
  <li>Helpful for shoppers looking for convenience, comfort, or enrichment.</li>
  <li>Selected to keep the buying decision simple and pet-focused.</li>
</ul>
<p>${plain || 'A simple choice for pet parents who want reliable everyday support without unnecessary complexity.'}</p>
      `.trim(),
    };
  },

  async generateVideoSocialCopy(input: {
    userId?: number;
    title: string;
    priceUsd: number;
    handle: string | null;
  }): Promise<{ caption: string; hashtags: string[] }> {
    const prompt = `
You write viral short-form video captions for PawVault (premium pet products).
Product: ${input.title}
Price: $${input.priceUsd || 'see store'}

Return strict JSON:
- "caption": hook line + 1 benefit sentence, max 180 chars, 1-2 emojis max
- "hashtags": array of 5-8 viral pet hashtags (include #PawVault)
    `.trim();

    try {
      const content = await generateAiText({
        userId: input.userId,
        prompt,
        temperature: 0.8,
        maxTokens: 200,
        json: true,
      });
      const parsed = parseStrictJson<{ caption?: string; hashtags?: string[] }>(content);
      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).slice(0, 8)
        : ['#PawVault', '#DogLife', '#CatLife', '#PetFinds'];
      return {
        caption: cleanText(parsed.caption) || input.title,
        hashtags,
      };
    } catch (error) {
      console.error('[ContentService] Video copy AI failed, using heuristic', error);
      return this.generateVideoSocialCopyHeuristic(input);
    }
  },

  async generateVideoSocialCopyWithOpenAI(
    input: { title: string; priceUsd: number; handle: string | null },
    apiKey: string,
  ): Promise<{ caption: string; hashtags: string[] }> {
    const content = await invokeOpenAiCompatible(
      { provider: 'openai', apiKey, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
      {
        prompt: `Return strict JSON with caption and hashtags for this PawVault product: ${input.title}`,
        temperature: 0.8,
        maxTokens: 200,
        json: true,
      },
    );
    const parsed = parseStrictJson<{ caption?: string; hashtags?: string[] }>(content);
    return {
      caption: cleanText(parsed.caption) || input.title,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#PawVault', '#DogLife', '#CatLife', '#PetFinds'],
    };
  },

  generateVideoSocialCopyHeuristic(input: { title: string }): { caption: string; hashtags: string[] } {
    const lower = input.title.toLowerCase();
    const hashtags = ['#PawVault', '#PetLovers', '#PetFinds', '#DogMom', '#CatMom'];
    if (lower.includes('dog')) hashtags.push('#DogLife');
    if (lower.includes('cat')) hashtags.push('#CatLife');
    return {
      caption: `Pet parents are loving this 👇 ${input.title}`,
      hashtags: hashtags.slice(0, 8),
    };
  },
};
