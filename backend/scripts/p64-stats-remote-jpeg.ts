#!/usr/bin/env tsx
import axios from 'axios';
import sharp from 'sharp';

async function stats(label: string, url: string) {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, validateStatus: () => true });
  if (r.status !== 200) {
    console.log(JSON.stringify({ label, http: r.status }));
    return;
  }
  const st = await sharp(Buffer.from(r.data)).stats();
  const mean = (st.channels[0].mean + st.channels[1].mean + st.channels[2].mean) / 3;
  const sd = (st.channels[0].stdev + st.channels[1].stdev + st.channels[2].stdev) / 3;
  console.log(
    JSON.stringify({
      label,
      bytes: r.data.length,
      meanRgb: Number(mean.toFixed(2)),
      stdevRgb: Number(sd.toFixed(2)),
    })
  );
}

async function main() {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.error('usage: p64-stats-remote-jpeg.ts <url> [...]');
    process.exit(1);
  }
  for (let i = 0; i < urls.length; i++) {
    await stats(`u${i}`, urls[i]!);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
