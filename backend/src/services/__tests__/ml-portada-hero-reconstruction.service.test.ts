import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import * as imagePipeline from '../image-pipeline.service';
import {
  attemptMercadoLibreP103HeroPortadaFromUrls,
  composeMercadoLibreP103HeroOnWhite,
  isolateProductSubjectToPng,
} from '../ml-portada-hero-reconstruction.service';

describe('ml-portada-hero-reconstruction.service', () => {
  it('isolates a centered solid subject on a uniform light background and composes 1200 hero', async () => {
    const gw = 380;
    const gh = 380;
    const grayRaw = Buffer.alloc(gw * gh * 3);
    for (let i = 0; i < grayRaw.length; i += 3) {
      const p = (i / 3) | 0;
      const x = p % gw;
      const y = Math.floor(p / gw);
      grayRaw[i] = 95 + ((x + y * 2) % 28);
      grayRaw[i + 1] = 98 + ((x * 3 + y) % 26);
      grayRaw[i + 2] = 92 + ((x + y * 5) % 30);
    }
    const gray = await sharp(grayRaw, { raw: { width: gw, height: gh, channels: 3 } }).png().toBuffer();
    const supplierLike = await sharp({
      create: { width: 880, height: 880, channels: 3, background: '#ececec' },
    })
      .composite([{ input: gray, gravity: 'centre' }])
      .png()
      .toBuffer();

    const iso = await isolateProductSubjectToPng(supplierLike);
    expect(iso).not.toBeNull();
    const hero = await composeMercadoLibreP103HeroOnWhite(iso!.png);
    expect(hero).not.toBeNull();
    const meta = await sharp(hero!).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1200);
  });

  it('P105: when supplement hero is configured, does not fall back to supplier URLs after supplement fails gates', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p105-p103-'));
    const rel = 'hero_supp.png';
    const suppPath = path.join(tmp, rel);
    const tiny = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#f0f0f0' },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(suppPath, tiny);

    const supplierLike = await sharp({
      create: { width: 880, height: 880, channels: 3, background: '#ececec' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 380, height: 380, channels: 3, background: '#777777' },
          })
            .png()
            .toBuffer(),
          gravity: 'centre',
        },
      ])
      .png()
      .toBuffer();

    const spy = jest.spyOn(imagePipeline, 'processFromUrlSafe').mockImplementation(async (u: string) => {
      if (u.includes('supplier-good')) {
        return { buffer: supplierLike, contentType: 'image/png', width: 880, height: 880 };
      }
      return null;
    });

    const productData = {
      mlImagePipeline: { portadaSupplementHeroWorkspaceRelativePath: rel },
    };

    const res = await attemptMercadoLibreP103HeroPortadaFromUrls(['https://x.test/supplier-good.jpg'], {
      maxTrials: 8,
      productData,
      workspaceRoot: tmp,
    });

    spy.mockRestore();

    expect(res.ok).toBe(false);
    expect(res.trace.supplierTrialsSuppressedForSupplementHero).toBe(true);
    expect(res.trace.failClosedReason).toBe('portada_supplement_hero_exhausted_no_supplier_fallback');
    expect(res.trace.trials.length).toBeGreaterThanOrEqual(1);
    expect(res.trace.trials.every((t) => t.sourceKind !== 'supplier')).toBe(true);
  });
});
