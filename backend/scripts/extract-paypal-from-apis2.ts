#!/usr/bin/env tsx
/**
 * Extrae credenciales PayPal Sandbox desde APIS2.txt (ra�z del repo o backend/).
 * Escribe PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT en backend/.env.local.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
const BACKEND = path.join(ROOT, 'backend');
const APIS2_PATHS = [
  path.join(ROOT, 'APIS2.txt'),
  path.join(BACKEND, 'APIS2.txt'),
];
const ENV_LOCAL = path.join(BACKEND, '.env.local');

function findApis2(): string {
  for (const p of APIS2_PATHS) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error('APIS2.txt no encontrado en ra�z del repo ni en backend/');
}

function extractPaypal(content: string): { clientId: string; clientSecret: string } {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  let sandboxClientId = '';
  let clientSecret = '';
  let seenSandbox = false;
  let clientIdAfterSandbox = '';
  let clientIdWithSecret = '';
  let secretValue = '';
  let defaultAppClientId = '';
  let defaultAppSecret = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^Sandbox:?\s*$/i.test(line)) {
      seenSandbox = true;
      continue;
    }
    if (seenSandbox && /Client ID\s+/i.test(line)) {
      const m = line.match(/Client ID\s+([A-Za-z0-9_.-]+)/i);
      if (m && m[1].length >= 20) clientIdAfterSandbox = m[1];
      seenSandbox = false;
    }
    const clientIdMatch = line.match(/Client ID\s+([A-Za-z0-9_.-]+)/i);
    if (clientIdMatch && clientIdMatch[1].length >= 20) {
      const nextLine = lines[i + 1] || '';
      const secretNext = nextLine.match(/^Secret\s+([A-Za-z0-9_.-]+)/i);
      if (secretNext && secretNext[1].length >= 20) {
        defaultAppClientId = clientIdMatch[1];
        defaultAppSecret = secretNext[1];
      }
      clientIdWithSecret = clientIdMatch[1];
    }
    const secretMatch = line.match(/secret\s+Key\s*([A-Za-z0-9_.-]+)/i);
    if (secretMatch && secretMatch[1].length >= 20) secretValue = secretMatch[1];
    const secretOnlyMatch = line.match(/^Secret\s+([A-Za-z0-9_.-]+)/i);
    if (secretOnlyMatch && secretOnlyMatch[1].length >= 20 && !defaultAppSecret) secretValue = secretOnlyMatch[1];
  }

  if (defaultAppClientId && defaultAppSecret) {
    return { clientId: defaultAppClientId, clientSecret: defaultAppSecret };
  }

  clientSecret = secretValue;
  if (!clientSecret) {
    const anySecret = content.match(/secret\s+Key\s*([A-Za-z0-9_.-]+)/i) || content.match(/^Secret\s+([A-Za-z0-9_.-]+)/im);
    if (anySecret) clientSecret = anySecret[1].trim();
  }
  if (!clientSecret) throw new Error('No se pudo extraer Secret de APIS2.txt');

  sandboxClientId = clientIdAfterSandbox || clientIdWithSecret;
  if (!sandboxClientId) {
    const anyClient = content.match(/Client ID\s+([A-Za-z0-9_.-]{20,})/i);
    if (anyClient) sandboxClientId = anyClient[1].trim();
  }
  if (!sandboxClientId) throw new Error('No se pudo extraer Client ID de APIS2.txt');

  return { clientId: sandboxClientId, clientSecret };
}

function main() {
  const content = findApis2();
  const { clientId, clientSecret } = extractPaypal(content);

  let existing = '';
  if (fs.existsSync(ENV_LOCAL)) {
    existing = fs.readFileSync(ENV_LOCAL, 'utf8');
    existing = existing.replace(/\n*PAYPAL_CLIENT_ID=.*/g, '').replace(/\n*PAYPAL_CLIENT_SECRET=.*/g, '').replace(/\n*PAYPAL_ENVIRONMENT=.*/g, '');
  }

  const block = [
    '',
    '# PayPal Sandbox (extra�do desde APIS2.txt)',
    `PAYPAL_CLIENT_ID=${clientId}`,
    `PAYPAL_CLIENT_SECRET=${clientSecret}`,
    'PAYPAL_ENVIRONMENT=sandbox',
  ].join('\n');

  const out = (existing.trim() + block).replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(ENV_LOCAL, out, 'utf8');
  console.log('[EXTRACT] PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET escritos en backend/.env.local');
  console.log('[EXTRACT] clientIdLength=', clientId.length, 'secretLength=', clientSecret.length);
}

main();
