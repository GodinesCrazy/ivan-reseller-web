/**
 * Creates PawVault logo PNG (512×512 icon + 200×60 horizontal wordmark)
 * and uploads both to the live Shopify theme as assets + favicon
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const sharp   = require('/c/Ivan_Reseller_Web/backend/node_modules/sharp');

const SHOP      = 'ivanreseller-2.myshopify.com';
const THEME_ID  = '161729773780';
const API_VER   = '2026-04';

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const { access_token } = await res.json();
  return access_token;
}

// ── Build SVG ──────────────────────────────────────────────────────────────

function buildIconSVG(size = 512) {
  const r  = size;
  const cr = Math.round(r * 0.28);  // corner radius ~28%
  const cx = r / 2;
  const cy = r / 2;

  // Paw proportions relative to 512px
  const scale = r / 512;
  const pad   = Math.round(72 * scale);

  // Main pad (large ellipse) — centered bottom
  const mpW  = Math.round(220 * scale);
  const mpH  = Math.round(180 * scale);
  const mpY  = Math.round(310 * scale);

  // 4 toe pads
  const toeR = Math.round(58 * scale);
  const toeY = Math.round(186 * scale);
  const toeXL = Math.round(148 * scale);
  const toeXML= Math.round(210 * scale);
  const toeXMR= Math.round(302 * scale);
  const toeXR = Math.round(364 * scale);

  // Accent dot top-right
  const dotR  = Math.round(32 * scale);
  const dotX  = Math.round(418 * scale);
  const dotY  = Math.round(90 * scale);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r}" height="${r}" viewBox="0 0 ${r} ${r}">
  <rect width="${r}" height="${r}" rx="${cr}" fill="#10233b"/>
  <!-- toe pads -->
  <ellipse cx="${toeXL}"  cy="${toeY}" rx="${Math.round(toeR*0.82)}" ry="${toeR}" fill="#f2a93b"/>
  <ellipse cx="${toeXML}" cy="${Math.round(toeY*0.88)}" rx="${toeR}"              ry="${Math.round(toeR*1.1)}" fill="#f2a93b"/>
  <ellipse cx="${toeXMR}" cy="${Math.round(toeY*0.88)}" rx="${toeR}"              ry="${Math.round(toeR*1.1)}" fill="#f2a93b"/>
  <ellipse cx="${toeXR}"  cy="${toeY}" rx="${Math.round(toeR*0.82)}" ry="${toeR}" fill="#f2a93b"/>
  <!-- main pad -->
  <ellipse cx="${cx}" cy="${mpY}" rx="${mpW/2}" ry="${mpH/2}" fill="#f2a93b"/>
  <!-- accent dot -->
  <circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="#8fc77a"/>
</svg>`;
}

function buildFaviconSVG() { return buildIconSVG(32); }

// ── Convert SVG → PNG ──────────────────────────────────────────────────────

async function svgToPng(svgString, outputSize) {
  const buf = Buffer.from(svgString, 'utf8');
  return sharp(buf)
    .resize(outputSize, outputSize)
    .png()
    .toBuffer();
}

// ── Upload to Shopify theme assets ─────────────────────────────────────────

async function uploadAsset(token, key, pngBuffer) {
  const base64 = pngBuffer.toString('base64');
  const res = await fetch(`https://${SHOP}/admin/api/${API_VER}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ asset: { key, attachment: base64 } }),
  });
  const json = await res.json();
  if (json.asset) return json.asset.public_url;
  throw new Error(`Upload failed for ${key}: ${JSON.stringify(json).slice(0, 120)}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('🐾 PawVault Logo Generator\n');

  const token = await getToken();
  console.log('✓ Token obtained');

  // 512×512 icon
  const icon512svg = buildIconSVG(512);
  const icon512png = await svgToPng(icon512svg, 512);
  writeFileSync('/c/Ivan_Reseller_Web/scripts/pawvault-icon-512.png', icon512png);
  console.log('✓ Icon 512×512 generated:', icon512png.length, 'bytes');

  // 32×32 favicon
  const fav32png = await svgToPng(buildIconSVG(512), 32);
  writeFileSync('/c/Ivan_Reseller_Web/scripts/pawvault-favicon-32.png', fav32png);
  console.log('✓ Favicon 32×32 generated');

  // Upload to Shopify theme
  try {
    const iconUrl = await uploadAsset(token, 'assets/pawvault-icon-512.png', icon512png);
    console.log('✓ Icon uploaded:', iconUrl);

    const favUrl = await uploadAsset(token, 'assets/pawvault-favicon.png', fav32png);
    console.log('✓ Favicon uploaded:', favUrl);

    console.log('\n📋 Next: Set favicon in Shopify Admin → Themes → Customize → Theme Settings → Favicon');
    console.log('   Select the file: assets/pawvault-favicon.png');
  } catch(e) {
    console.log('⚠ Upload error:', e.message);
    console.log('  Files saved locally at /c/Ivan_Reseller_Web/scripts/');
  }
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
