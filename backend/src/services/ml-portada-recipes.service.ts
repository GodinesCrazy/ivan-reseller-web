/**
 * P107 — Automatic Mercado Libre portada reconstruction recipes (multi-strategy compose on isolated cutout).
 * Used at scale: same isolation, multiple canvas/scale/background variants until one passes gates.
 */
import sharp from 'sharp';

export const HERO_CANVAS_PX = 1200;

export type PortadaRecipeId =
  | 'p107_white_078'
  | 'p107_white_072'
  | 'p107_white_076'
  | 'p107_white_085'
  | 'p107_neutral_f9_078'
  | 'p107_light_gray_f6_078';

export type PortadaRecipeSpec = {
  id: PortadaRecipeId;
  /** Max subject side as a fraction of canvas (fit inside). */
  subjectMaxRatio: number;
  background: { r: number; g: number; b: number };
};

const RECIPE_SPECS: PortadaRecipeSpec[] = [
  { id: 'p107_white_078', subjectMaxRatio: 0.78, background: { r: 255, g: 255, b: 255 } },
  { id: 'p107_white_072', subjectMaxRatio: 0.72, background: { r: 255, g: 255, b: 255 } },
  { id: 'p107_white_076', subjectMaxRatio: 0.76, background: { r: 255, g: 255, b: 255 } },
  { id: 'p107_white_085', subjectMaxRatio: 0.85, background: { r: 255, g: 255, b: 255 } },
  { id: 'p107_neutral_f9_078', subjectMaxRatio: 0.78, background: { r: 249, g: 249, b: 248 } },
  { id: 'p107_light_gray_f6_078', subjectMaxRatio: 0.78, background: { r: 246, g: 246, b: 246 } },
];

const SPEC_BY_ID: Record<PortadaRecipeId, PortadaRecipeSpec> = RECIPE_SPECS.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<PortadaRecipeId, PortadaRecipeSpec>
);

/** Default order: conservative white first, then margin/scale variants, then light neutrals. */
export const DEFAULT_AUTOMATIC_PORTADA_RECIPE_ORDER: PortadaRecipeId[] = RECIPE_SPECS.map((s) => s.id);

export function listAutomaticPortadaRecipeSpecs(): readonly PortadaRecipeSpec[] {
  return RECIPE_SPECS;
}

export function getPortadaRecipeSpec(id: PortadaRecipeId): PortadaRecipeSpec {
  return SPEC_BY_ID[id]!;
}

/**
 * Compose 1200×1200 marketplace portada from RGBA cutout (P103 isolation output).
 */
export async function composePortadaHeroWithRecipe(cutoutPng: Buffer, recipeId: PortadaRecipeId): Promise<Buffer | null> {
  const spec = SPEC_BY_ID[recipeId];
  if (!spec) return null;
  const maxSide = Math.floor(HERO_CANVAS_PX * spec.subjectMaxRatio);
  try {
    const resized = await sharp(cutoutPng)
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();

    return await sharp({
      create: {
        width: HERO_CANVAS_PX,
        height: HERO_CANVAS_PX,
        channels: 3,
        background: spec.background,
      },
    })
      .composite([{ input: resized, gravity: 'centre' }])
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Legacy P103 default = first recipe (0.78 white). */
export const LEGACY_P103_RECIPE_ID: PortadaRecipeId = 'p107_white_078';
