import sharp from 'sharp';
import {
  composePortadaHeroWithRecipe,
  DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER,
  HERO_CANVAS_PX,
  LEGACY_P103_RECIPE_ID,
  listAutomaticPortadaRecipeSpecs,
} from '../ml-portada-recipes.service';

describe('ml-portada-recipes.service (P107)', () => {
  async function minimalCutout(): Promise<Buffer> {
    const gray = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#c8c8c8' },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: 400, height: 400, channels: 3, background: '#eeeeee' },
    })
      .composite([{ input: gray, gravity: 'centre' }])
      .ensureAlpha()
      .png()
      .toBuffer();
  }

  it('lists six default recipes', () => {
    expect(listAutomaticPortadaRecipeSpecs().length).toBe(6);
    expect(DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER.length).toBe(6);
  });

  it('each default recipe yields HERO_CANVAS square PNG', async () => {
    const cutout = await minimalCutout();
    for (const id of DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER) {
      const out = await composePortadaHeroWithRecipe(cutout, id);
      expect(out).not.toBeNull();
      const meta = await sharp(out!).metadata();
      expect(meta.width).toBe(HERO_CANVAS_PX);
      expect(meta.height).toBe(HERO_CANVAS_PX);
    }
  });

  it('legacy P103 recipe id composes', async () => {
    const cutout = await minimalCutout();
    const out = await composePortadaHeroWithRecipe(cutout, LEGACY_P103_RECIPE_ID);
    expect(out).not.toBeNull();
  });
});
