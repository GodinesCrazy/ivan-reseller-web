#!/usr/bin/env node
/**
 * Generates cryptographically secure JWT_SECRET, INTERNAL_RUN_SECRET, ENCRYPTION_KEY
 * and writes/updates them in backend/.env.local only. Never commits; .env.local is gitignored.
 * Usage: cd backend && node scripts/rotate-secrets-env.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const envPath = path.join(backendDir, '.env.local');

function generate() {
  return crypto.randomBytes(64).toString('hex');
}

function parseEnv(filePath) {
  const m = new Map();
  if (!fs.existsSync(filePath)) return m;
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) m.set(match[1], match[2].replace(/^["']|["']$/g, '').trim());
  });
  return m;
}

function writeEnv(filePath, map) {
  const lines = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, '', 'utf8');
}
const map = parseEnv(envPath);
map.set('JWT_SECRET', generate());
map.set('INTERNAL_RUN_SECRET', generate());
map.set('ENCRYPTION_KEY', generate());
writeEnv(envPath, map);
console.log('[ROTATE-SECRETS] Updated .env.local with new JWT_SECRET, INTERNAL_RUN_SECRET, ENCRYPTION_KEY (crypto.randomBytes(64).toString("hex")).');
console.log('[ROTATE-SECRETS] Copy these values to Railway Variables for production.');
