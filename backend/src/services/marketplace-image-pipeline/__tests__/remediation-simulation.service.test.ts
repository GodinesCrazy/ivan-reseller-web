import sharp from 'sharp';
import { runRemediationSimulationRanking } from '../remediation-simulation.service';
import { ML_CHILE_POLICY_PROFILE_V1 } from '../policy-profiles';
import type { ScoredImageCandidate } from '../types';

function makeCandidate(url: string, key: string, remFit: number): ScoredImageCandidate {
  return {
    objectKey: key,
    url,
    scores: {
      textLogoRisk: 50,
      backgroundSimplicity: 70,
      centeringBalance: 100,
      productOccupancy: 60,
      clutterPackagingRisk: 50,
      catalogLook: 55,
      conversionAttractiveness: 70,
      remediationFitness: remFit,
      remediationPotential: 45,
    },
    policyFitness: 50,
    conversionFitness: 60,
    combinedScore: 55,
    remediationFitnessReasons: [],
  };
}

describe('remediation-simulation.service', () => {
  const profile = ML_CHILE_POLICY_PROFILE_V1;

  it('ranks simulated preview so stronger hero composition wins over heuristic tie-break', async () => {
    const W = 900;
    const H = 900;
    const sideGood = 520;
    const offG = (W - sideGood) / 2;
    const bufStrong = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: sideGood, height: sideGood, channels: 3, background: '#222222' },
          })
            .png()
            .toBuffer(),
          left: Math.floor(offG),
          top: Math.floor(offG),
        },
      ])
      .png()
      .toBuffer();

    const sideBad = 220;
    const offB = (W - sideBad) / 2;
    const bufWeak = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: sideBad, height: sideBad, channels: 3, background: '#222222' },
          })
            .png()
            .toBuffer(),
          left: Math.floor(offB),
          top: Math.floor(offB),
        },
      ])
      .png()
      .toBuffer();

    const cStrong = makeCandidate('https://test.invalid/strong.jpg', 'strong_key', 70);
    const cWeak = makeCandidate('https://test.invalid/weak.jpg', 'weak_key', 85);

    const buffers = new Map<string, Buffer>([
      [cStrong.url, bufStrong],
      [cWeak.url, bufWeak],
    ]);

    const sim = await runRemediationSimulationRanking({
      profile,
      shortlist: [cWeak, cStrong],
      insetOverride: null,
      previewMaxInput: 900,
      loadBuffer: async (s) => buffers.get(s.url) ?? null,
      hiFiEnabled: false,
      hiFiTopCandidates: 0,
      hiFiMaxInput: 1400,
    });

    expect(sim.rows.length).toBeGreaterThan(0);
    expect(sim.rows.every((r) => r.fidelityTier === 'low')).toBe(true);
    expect(sim.rows[0]!.simScoreBase).toBeDefined();
    expect(sim.rows[0]!.simulationQuality.readabilityEstimate).toBeGreaterThanOrEqual(0);
    expect(sim.orderedCandidates[0]!.url).toBe(cStrong.url);
    expect(sim.winner).not.toBeNull();
    expect(sim.winner!.candidateUrl).toBe(cStrong.url);
    const strongRows = sim.rows.filter((r) => r.candidateUrl === cStrong.url);
    const weakRows = sim.rows.filter((r) => r.candidateUrl === cWeak.url);
    expect(Math.max(...strongRows.map((r) => r.simScore))).toBeGreaterThan(
      Math.max(...weakRows.map((r) => r.simScore), -1)
    );
  });

  it('records simAllCorePass false when preview fails hero', async () => {
    const W = 900;
    const H = 900;
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 120, height: 120, channels: 3, background: '#333333' },
          })
            .png()
            .toBuffer(),
          left: 390,
          top: 390,
        },
      ])
      .png()
      .toBuffer();

    const c = makeCandidate('https://test.invalid/tiny.jpg', 'tiny', 90);
    const sim = await runRemediationSimulationRanking({
      profile,
      shortlist: [c],
      insetOverride: null,
      previewMaxInput: 900,
      loadBuffer: async (s) => (s.url === c.url ? buf : null),
      hiFiEnabled: false,
      hiFiTopCandidates: 0,
      hiFiMaxInput: 1400,
    });

    expect(sim.rows.some((r) => r.recipeId === 'square_white_catalog_jpeg')).toBe(true);
    expect(sim.rows.every((r) => r.simAllCorePass === false)).toBe(true);
    expect(sim.allWeak).toBe(true);
  });

  it('runs high-fidelity preview rows for top candidates when P83 hi-fi is enabled', async () => {
    const W = 900;
    const H = 900;
    const side = 400;
    const off = (W - side) / 2;
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: side, height: side, channels: 3, background: '#1a1a1a' },
          })
            .png()
            .toBuffer(),
          left: Math.floor(off),
          top: Math.floor(off),
        },
      ])
      .png()
      .toBuffer();

    const a = makeCandidate('https://test.invalid/a.jpg', 'a', 80);
    const b = makeCandidate('https://test.invalid/b.jpg', 'b', 79);
    const buffers = new Map<string, Buffer>([
      [a.url, buf],
      [b.url, buf],
    ]);

    const sim = await runRemediationSimulationRanking({
      profile,
      shortlist: [a, b],
      insetOverride: null,
      previewMaxInput: 700,
      loadBuffer: async (s) => buffers.get(s.url) ?? null,
      hiFiEnabled: true,
      hiFiTopCandidates: 2,
      hiFiMaxInput: 1200,
    });

    expect(sim.hiFiInvoked).toBe(true);
    expect(sim.hiFiRowCount).toBeGreaterThan(0);
    expect(sim.rows.some((r) => r.fidelityTier === 'high')).toBe(true);
  });
});
