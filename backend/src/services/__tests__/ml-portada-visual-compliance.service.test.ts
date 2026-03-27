import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
  evaluateMlPortadaNaturalLookGateFromBuffer,
  evaluateMlPortadaStrictGate,
  evaluateMlPortadaStrictGateFromBuffer,
} from '../ml-portada-visual-compliance.service';

describe('evaluateMlPortadaStrictGate', () => {
  it('passes on uniform light catalog-like square', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'clean.png');
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' },
    })
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(true);
    expect(r.signals).toEqual([]);
  });

  it('evaluateMlPortadaStrictGateFromBuffer matches file path for same pixels', async () => {
    const buf = await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#eaecee' },
    })
      .png()
      .toBuffer();
    const a = await evaluateMlPortadaStrictGateFromBuffer(buf);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'x.png');
    await fs.writeFile(p, buf);
    const b = await evaluateMlPortadaStrictGate(p);
    expect(a.pass).toBe(b.pass);
    expect(a.signals).toEqual(b.signals);
  });

  it('fails on strong top horizontal strip (promotional banner risk)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'strip.png');
    const hStrip = 140;
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#f8f9fa' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 1200, height: hStrip, channels: 3, background: '#111111' },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(r.signals.some((s) => s.includes('top_band'))).toBe(true);
  });

  it('fails on left sidebar graphic strip (collage/promo risk)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'sidebar.png');
    const wStrip = 220;
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#f4f4f4' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: wStrip, height: 1200, channels: 3, background: '#0a0a0a' },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(r.signals.some((s) => s.includes('left_sidebar') || s.includes('left_band'))).toBe(true);
  });

  it('fails on dense horizontal strokes in top region (text-like overlay)', async () => {
    const w = 1200;
    const h = 1200;
    const svg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect fill="#f5f5f5" width="100%" height="100%"/>
        ${Array.from({ length: 45 }, (_, i) => {
          const y = 20 + i * 6;
          return `<text x="40" y="${y}" font-size="14" fill="#222">LINE_${i}_PROMO_TEXT</text>`;
        }).join('')}
      </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await evaluateMlPortadaStrictGateFromBuffer(buf);
    expect(r.pass).toBe(false);
    expect(
      r.signals.some(
        (s) =>
          s.includes('horizontal_stroke') ||
          s.includes('fragmentation') ||
          s.includes('top_band') ||
          s.includes('busy_with_peripheral')
      )
    ).toBe(true);
  });

  it('fails closed on vertical split seam (two-panel collage)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'split.png');
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#f0f0f0' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 580, height: 1100, channels: 3, background: '#c0c0c0' },
          })
            .png()
            .toBuffer(),
          left: 40,
          top: 50,
        },
        {
          input: await sharp({
            create: { width: 580, height: 1100, channels: 3, background: '#a8a8a8' },
          })
            .png()
            .toBuffer(),
          left: 620,
          top: 50,
        },
      ])
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(
      r.signals.some(
        (s) => s.includes('vertical_split') || s.includes('fragmentation') || s.includes('frame_edges')
      )
    ).toBe(true);
  });

  it('fails on UI chrome + dense content band (screenshot-like framing)', async () => {
    const w = 1000;
    const h = 1000;
    const svg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect fill="#e8e8e8" width="100%" height="100%"/>
        <rect fill="#2c2c2c" x="0" y="0" width="${w}" height="72"/>
        <rect fill="#ffffff" x="24" y="96" width="952" height="560" stroke="#999" stroke-width="3"/>
        ${Array.from({ length: 30 }, (_, i) => {
          const y = 110 + i * 16;
          return `<line x1="40" y1="${y}" x2="960" y2="${y}" stroke="#444" stroke-width="2"/>`;
        }).join('')}
      </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await evaluateMlPortadaStrictGateFromBuffer(buf);
    expect(r.pass).toBe(false);
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('borderline elevated top band fails closed (uncertainty)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'border.png');
    const hStrip = 95;
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#fafafa' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 1200, height: hStrip, channels: 3, background: '#9a9a9a' },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(
      r.signals.some(
        (s) => s.includes('uncertain') || s.includes('top_band') || s.includes('promo_or_text')
      )
    ).toBe(true);
  });

  it('fails when background is gray/off-white despite no text-like structure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'offwhite.png');
    await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#f2f3f5' },
    })
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(r.signals.some((s) => s.includes('white_background'))).toBe(true);
  });

  it('fails when corners/border are not white enough', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-port-'));
    const p = path.join(dir, 'border-gray.png');
    const base = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 1200, height: 1200, channels: 3, background: '#eceff1' },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();
    await sharp(base)
      .composite([
        {
          input: await sharp({
            create: { width: 860, height: 860, channels: 3, background: '#ffffff' },
          })
            .png()
            .toBuffer(),
          left: 170,
          top: 170,
        },
      ])
      .png()
      .toFile(p);
    const r = await evaluateMlPortadaStrictGate(p);
    expect(r.pass).toBe(false);
    expect(r.signals.some((s) => s.includes('white_background'))).toBe(true);
  });
});

describe('evaluateMlPortadaNaturalLookGateFromBuffer', () => {
  it('fails on empty-white canvas (no usable subject interior)', async () => {
    const buf = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const r = await evaluateMlPortadaNaturalLookGateFromBuffer(buf);
    expect(r.pass).toBe(false);
    expect(r.signals.length).toBeGreaterThan(0);
  });

});
