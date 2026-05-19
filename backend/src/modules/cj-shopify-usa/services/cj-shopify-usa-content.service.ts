import { prisma } from '../../../config/database';

interface GenerateContentOpts {
  title: string;
  priceUsd: number;
  handle: string | null;
  platform: 'pinterest' | 'instagram' | 'tiktok';
}

export const cjShopifyUsaContentService = {
  /**
   * Hybrid Content Engine:
   * Uses OpenAI API if OPENAI_API_KEY is available.
   * Otherwise falls back to an advanced heuristic template engine.
   */
  async generateSocialCaption(opts: GenerateContentOpts): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      try {
        return await this.generateWithOpenAI(opts, apiKey);
      } catch (error) {
        console.error('[ContentService] OpenAI generation failed, falling back to heuristic', error);
        return this.generateWithHeuristic(opts);
      }
    }

    return this.generateWithHeuristic(opts);
  },
  async generateBlogArticle(title: string, description: string): Promise<{ title: string, contentHtml: string, keyword: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        return await this.generateBlogWithOpenAI(title, description, apiKey);
      } catch (error) {
        console.error('[ContentService] OpenAI blog generation failed', error);
        throw error;
      }
    }
    throw new Error('OPENAI_API_KEY is required for blog generation');
  },

  async generateWithOpenAI(opts: GenerateContentOpts, apiKey: string): Promise<string> {
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error: ${err}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content returned from OpenAI');

    return content.trim();
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

  async generateBlogWithOpenAI(title: string, description: string, apiKey: string): Promise<{ title: string, contentHtml: string, keyword: string }> {
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error: ${err}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content returned from OpenAI');

    return JSON.parse(content.trim());
  },

  async generateSeoRefresh(
    currentTitle: string,
    currentDescription: string,
  ): Promise<{ title: string; descriptionHtml: string; intent: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for SEO refresh');
    }

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error: ${err}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content returned from OpenAI');

    const parsed = JSON.parse(content.trim()) as {
      title?: string;
      descriptionHtml?: string;
      intent?: string;
    };
    if (!parsed.title || !parsed.descriptionHtml) {
      throw new Error('SEO refresh response missing title or descriptionHtml');
    }

    return {
      title: parsed.title.trim(),
      descriptionHtml: parsed.descriptionHtml.trim(),
      intent: String(parsed.intent || 'repositioned').trim(),
    };
  },

  async generateVideoSocialCopy(input: {
    title: string;
    priceUsd: number;
    handle: string | null;
  }): Promise<{ caption: string; hashtags: string[] }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        return await this.generateVideoSocialCopyWithOpenAI(input, apiKey);
      } catch (error) {
        console.error('[ContentService] Video copy OpenAI failed, using heuristic', error);
      }
    }
    return this.generateVideoSocialCopyHeuristic(input);
  },

  async generateVideoSocialCopyWithOpenAI(
    input: { title: string; priceUsd: number; handle: string | null },
    apiKey: string,
  ): Promise<{ caption: string; hashtags: string[] }> {
    const prompt = `
You write viral short-form video captions for PawVault (premium pet products).
Product: ${input.title}
Price: $${input.priceUsd || 'see store'}

Return strict JSON:
- "caption": hook line + 1 benefit sentence, max 180 chars, 1-2 emojis max
- "hashtags": array of 5-8 viral pet hashtags (include #PawVault)
    `.trim();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content from OpenAI');

    const parsed = JSON.parse(content.trim()) as { caption?: string; hashtags?: string[] };
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).slice(0, 8)
      : ['#PawVault', '#DogLife', '#CatLife', '#PetFinds'];
    return {
      caption: String(parsed.caption || input.title).trim(),
      hashtags,
    };
  },

  generateVideoSocialCopyHeuristic(input: {
    title: string;
  }): { caption: string; hashtags: string[] } {
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
