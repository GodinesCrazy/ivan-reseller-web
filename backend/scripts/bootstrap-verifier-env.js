#!/usr/bin/env node
/**
 * Phase A: Ensure backend/.env.local exists and has required verifier variables.
 * - If .env.local does not exist, copy from env.local.example.
 * - Set/ensure: INTERNAL_RUN_SECRET, SERP_API_KEY, JWT_SECRET, ENCRYPTION_KEY (concrete values).
 * - Ensure ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, DATABASE_URL exist (use process.env if set, else REPLACE_ME).
 * - Print warning for any variable still REPLACE_ME.
 */
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const envLocalPath = path.join(cwd, '.env.local');
const examplePath = path.join(cwd, 'env.local.example');

// Load .env then .env.local so process.env has existing values
require('dotenv').config({ path: envPath });
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: true });
}

if (!fs.existsSync(envLocalPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('env.local.example not found.');
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envLocalPath);
  console.log('Created .env.local from env.local.example.');
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const map = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) map.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return map;
}

// Never hardcode real secrets. Use REPLACE_ME; set real values via env or .env.local (gitignored).
const defaults = {
  INTERNAL_RUN_SECRET: 'REPLACE_ME',
  SERP_API_KEY: 'REPLACE_ME',
  ALIEXPRESS_APP_KEY: 'REPLACE_ME',
  ALIEXPRESS_APP_SECRET: 'REPLACE_ME',
  DATABASE_URL: 'REPLACE_ME',
  JWT_SECRET: 'REPLACE_ME',
  ENCRYPTION_KEY: 'REPLACE_ME',
  PORT: '4000',
};

const keyOrder = [
  'INTERNAL_RUN_SECRET',
  'SERP_API_KEY',
  'GOOGLE_TRENDS_API_KEY',
  'ALIEXPRESS_APP_KEY',
  'ALIEXPRESS_APP_SECRET',
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'PORT',
];

const map = parseEnvFile(envLocalPath);

// Set only REPLACE_ME or keep existing; for new .env.local generate random secrets for local dev (never commit)
const existingSecret = map.get('INTERNAL_RUN_SECRET');
map.set('INTERNAL_RUN_SECRET', existingSecret && existingSecret !== 'REPLACE_ME' ? existingSecret : defaults.INTERNAL_RUN_SECRET);
const existingSERP = map.get('SERP_API_KEY');
map.set('SERP_API_KEY', existingSERP && existingSERP !== 'REPLACE_ME' ? existingSERP : defaults.SERP_API_KEY);
const existingJWT = map.get('JWT_SECRET');
map.set('JWT_SECRET', existingJWT && existingJWT !== 'REPLACE_ME' && existingJWT.length >= 32 ? existingJWT : defaults.JWT_SECRET);
const existingEnc = map.get('ENCRYPTION_KEY');
map.set('ENCRYPTION_KEY', existingEnc && existingEnc !== 'REPLACE_ME' && existingEnc.length >= 32 ? existingEnc : defaults.ENCRYPTION_KEY);
map.set('PORT', map.get('PORT') || defaults.PORT);

// Use process.env when set and not placeholder; otherwise keep existing or REPLACE_ME
for (const key of ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'DATABASE_URL', 'SCRAPER_API_KEY']) {
  const envVal = process.env[key];
  if (envVal && envVal !== 'REPLACE_ME' && !String(envVal).startsWith('REPLACE_ME')) {
    map.set(key, envVal);
  } else if (!map.has(key) && defaults[key] !== undefined) {
    map.set(key, defaults[key]);
  } else if (!map.has(key) && key === 'SCRAPER_API_KEY') {
    map.set(key, 'REPLACE_ME');
  }
}

// Ensure GOOGLE_TRENDS_API_KEY in file if present in env (don't overwrite SERP)
if (process.env.GOOGLE_TRENDS_API_KEY && process.env.GOOGLE_TRENDS_API_KEY !== 'REPLACE_ME') {
  map.set('GOOGLE_TRENDS_API_KEY', process.env.GOOGLE_TRENDS_API_KEY);
}

// Warn on REPLACE_ME
const placeholders = [];
for (const [k, v] of map) {
  if (v === 'REPLACE_ME' || (typeof v === 'string' && v.startsWith('REPLACE_ME'))) {
    placeholders.push(k);
  }
}
if (placeholders.length > 0) {
  console.warn('[VERIFIER BOOTSTRAP] WARNING: The following variables are still REPLACE_ME:', placeholders.join(', '));
  console.warn('[VERIFIER BOOTSTRAP] Do NOT invent fake credentials. Continuing in discovery-only mode.');
}

// Rebuild file: preserve any other lines, then ensure keyOrder
const existingLines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
const existingKeys = new Set();
existingLines.forEach((line) => {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  if (m) existingKeys.add(m[1]);
});

const outLines = [];
const written = new Set();
for (const line of existingLines) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && map.has(m[1])) {
    outLines.push(`${m[1]}=${map.get(m[1])}`);
    written.add(m[1]);
  } else if (!m || !map.has(m[1])) {
    outLines.push(line);
  }
}
for (const key of keyOrder) {
  if (map.has(key) && !written.has(key)) {
    outLines.push(`${key}=${map.get(key)}`);
  }
}
fs.writeFileSync(envLocalPath, outLines.join('\n'), 'utf8');
console.log('Verifier env bootstrap done. Required vars ensured in .env.local.');
