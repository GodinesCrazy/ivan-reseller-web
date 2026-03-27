/**
 * P103 — Rank raw supplier / gallery URLs for Mercado Libre portada reconstruction suitability.
 * Uses the same scoring model as the canonical pipeline candidate scorer (remediationFitness-first).
 */
import { enumerateMainCandidates, scoreImageCandidateFromBuffer } from './marketplace-image-pipeline/candidate-scoring.service';

export interface P103RankedSourceRow {
  rank: number;
  objectKey: string | null;
  url: string;
  combinedScore: number;
  remediationFitness: number;
  textLogoRisk: number;
  backgroundSimplicity: number;
  catalogLook: number;
  reasons: string[];
}

export function listMercadoLibrePortadaSourceCandidates(urls: string[]): { url: string; objectKey: string | null }[] {
  return enumerateMainCandidates(urls);
}

export async function rankPortadaSourceBuffersForP103(
  entries: { buffer: Buffer; url: string; objectKey: string | null }[]
): Promise<P103RankedSourceRow[]> {
  if (entries.length === 0) return [];

  const scored = await Promise.all(
    entries.map(async (e) => {
      const c = await scoreImageCandidateFromBuffer(e.buffer, e.objectKey, e.url);
      return { e, c };
    })
  );

  scored.sort((a, b) => {
    let d = b.c.scores.remediationFitness - a.c.scores.remediationFitness;
    if (Math.abs(d) > 0.65) return d;
    d = a.c.scores.textLogoRisk - b.c.scores.textLogoRisk;
    if (Math.abs(d) > 0.65) return d;
    d = b.c.scores.backgroundSimplicity - a.c.scores.backgroundSimplicity;
    if (Math.abs(d) > 0.65) return d;
    return b.c.combinedScore - a.c.combinedScore;
  });

  return scored.map((x, idx) => ({
    rank: idx + 1,
    objectKey: x.e.objectKey,
    url: x.e.url,
    combinedScore: x.c.combinedScore,
    remediationFitness: x.c.scores.remediationFitness,
    textLogoRisk: x.c.scores.textLogoRisk,
    backgroundSimplicity: x.c.scores.backgroundSimplicity,
    catalogLook: x.c.scores.catalogLook,
    reasons: x.c.remediationFitnessReasons,
  }));
}
