import sharp from 'sharp';
import { rankPortadaSourceBuffersForP103 } from '../ml-portada-source-ranking.service';

describe('rankPortadaSourceBuffersForP103', () => {
  it('orders a clear product-on-white candidate ahead of a near-blank bright field', async () => {
    const nearBlank = await sharp({
      create: { width: 1100, height: 1100, channels: 3, background: '#f9f9f9' },
    })
      .jpeg({ quality: 88 })
      .toBuffer();

    const cw = 520;
    const ch = 520;
    const raw = Buffer.alloc(cw * ch * 3);
    for (let i = 0; i < raw.length; i += 3) {
      const p = (i / 3) | 0;
      const x = p % cw;
      const y = Math.floor(p / cw);
      raw[i] = 120 + ((x + y * 4) % 80);
      raw[i + 1] = 118 + ((x * 2 + y) % 76);
      raw[i + 2] = 122 + ((x + y * 6) % 74);
    }
    const blob = await sharp(raw, { raw: { width: cw, height: ch, channels: 3 } }).png().toBuffer();
    const withSubject = await sharp({
      create: { width: 1100, height: 1100, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: blob, gravity: 'centre' }])
      .png()
      .toBuffer();

    const ranked = await rankPortadaSourceBuffersForP103([
      { buffer: nearBlank, url: 'https://supplier.example/a.jpg', objectKey: 'Saaa' },
      { buffer: withSubject, url: 'https://supplier.example/b.jpg', objectKey: 'Sbbb' },
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.url).toBe('https://supplier.example/b.jpg');
    expect(ranked[0]!.rank).toBe(1);
  });
});
