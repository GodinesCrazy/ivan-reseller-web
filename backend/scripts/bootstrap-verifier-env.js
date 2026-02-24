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

const defaults = {
  INTERNAL_RUN_SECRET: 'local-secret-123',
  SERP_API_KEY: '09092b14341c43ee95ef9a800d45038f19650a62d9e50ef6d139235f207eaac0',
  ALIEXPRESS_APP_KEY: 'REPLACE_ME',
  ALIEXPRESS_APP_SECRET: 'REPLACE_ME',
  DATABASE_URL: 'REPLACE_ME',
  JWT_SECRET: 'local-jwt-secret-12345678901234567890123456789012',
  ENCRYPTION_KEY: 'local-encryption-key-12345678901234567890123456',
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

// Overwrite with concrete defaults
map.set('INTERNAL_RUN_SECRET', defaults.INTERNAL_RUN_SECRET);
map.set('SERP_API_KEY', defaults.SERP_API_KEY);
map.set('JWT_SECRET', defaults.JWT_SECRET);
map.set('ENCRYPTION_KEY', defaults.ENCRYPTION_KEY);
map.set('PORT', defaults.PORT);

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
