#!/usr/bin/env node
/**
 * Create .env.local from env.local.example if .env.local does not exist.
 * Cross-platform (Node). Usage: node scripts/ensure-env-local.js
 */
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const example = path.join(cwd, 'env.local.example');
const target = path.join(cwd, '.env.local');

if (fs.existsSync(target)) {
  console.log('.env.local already exists; not overwriting.');
  process.exit(0);
}
if (!fs.existsSync(example)) {
  console.error('env.local.example not found; cannot create .env.local');
  process.exit(1);
}
fs.copyFileSync(example, target);
console.log('Created .env.local from env.local.example. Replace REPLACE_ME with real values.');
