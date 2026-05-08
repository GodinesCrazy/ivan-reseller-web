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
  }
};
