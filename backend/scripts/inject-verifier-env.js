#!/usr/bin/env node
/**
 * Replace REPLACE_ME in .env.local with generated secrets (INTERNAL_RUN_SECRET, JWT_SECRET, ENCRYPTION_KEY)
 * and with process.env values for API keys/DATABASE_URL when present.
 * Loads .env and .env.local first so process.env has existing values.
 * Usage: from backend/: node scripts/inject-verifier-env.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cwd = process.cwd();
const envLocalPath = path.join(cwd, '.env.local');
const envPath = path.join(cwd, '.env');

function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// Load .env then .env.local so process.env has all values (we copy into .env.local without overwriting existing real values)
require('dotenv').config({ path: envPath });
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: true });
}

if (!fs.existsSync(envLocalPath)) {
  console.error('.env.local not found. Run npm run bootstrap-env first.');
  process.exit(1);
}

let content = fs.readFileSync(envLocalPath, 'utf8');
const replacements = [];
const lines = content.split(/\r?\n/);
const keyValue = new Map();
const keysInFile = [];
lines.forEach((line) => {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) {
    keyValue.set(m[1], m[2]);
    keysInFile.push(m[1]);
  }
});

function setValue(key, value) {
  const escaped = String(value).replace(/\r/g, '').replace(/\n/g, '\\n');
  keyValue.set(key, escaped);
  replacements.push(key);
}

// Keys we generate (>=64 chars) if missing or REPLACE_ME
const generatedKeys = ['INTERNAL_RUN_SECRET', 'JWT_SECRET', 'ENCRYPTION_KEY'];
for (const key of generatedKeys) {
  const current = keyValue.get(key);
  const use = process.env[key] && process.env[key] !== 'REPLACE_ME' && !String(process.env[key]).startsWith('REPLACE_ME')
    ? process.env[key]
    : generateSecret(64);
  if (!current || current === 'REPLACE_ME' || current.startsWith('REPLACE_ME')) setValue(key, use);
}

// Keys we take from process.env if set
const envKeys = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'SERP_API_KEY', 'GOOGLE_TRENDS_API_KEY', 'DATABASE_URL'];
for (const key of envKeys) {
  const envVal = process.env[key];
  if (envVal && envVal !== 'REPLACE_ME' && !String(envVal).startsWith('REPLACE_ME')) {
    const current = keyValue.get(key);
    if (!current || current === 'REPLACE_ME' || current.startsWith('REPLACE_ME')) setValue(key, envVal);
  }
}

// Rebuild: update existing KEY= lines, append missing keys
const keysInFileSet = new Set(keysInFile);
const appendOrder = ['INTERNAL_RUN_SECRET', 'SERP_API_KEY', 'GOOGLE_TRENDS_API_KEY', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'PORT'];
let outLines = lines.map((line) => {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) return line;
  const key = m[1];
  return keyValue.has(key) ? `${key}=${keyValue.get(key)}` : line;
});
for (const key of appendOrder) {
  if (keyValue.has(key) && !keysInFileSet.has(key)) {
    outLines.push(`${key}=${keyValue.get(key)}`);
  }
}
fs.writeFileSync(envLocalPath, outLines.join('\n'), 'utf8');
console.log('Injected/updated in .env.local:', replacements.join(', ') || '(none)');
