/**
 * Lee la línea `CJ Key : <value>` desde `APIS2.txt` en la raíz del monorepo
 * y escribe/actualiza en `backend/.env`:
 *   CJ_API_KEY=...
 *   CJ_DROPSHIPPING_API_KEY=...  (mismo valor, compatibilidad)
 *
 * No imprime secretos completos. APIS2.txt debe estar en .gitignore (raíz).
 *
 * Uso: cd backend && npx tsx scripts/sync-cj-api-key-from-apis2.ts
 */
import * as fs from 'fs';
import * as path from 'path';

function mask(s: string): string {
  const t = s.trim();
  if (t.length < 8) return '****';
  return `****${t.slice(-4)}`;
}

function upsertEnvLine(env: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(env)) {
    return env.replace(re, line);
  }
  const sep = env.endsWith('\n') || env.length === 0 ? '' : '\n';
  return `${env}${sep}${line}\n`;
}

async function main(): Promise<void> {
  const backendRoot = path.join(__dirname, '..');
  const repoRoot = path.join(backendRoot, '..');
  const apis2Path = path.join(repoRoot, 'APIS2.txt');
  const envPath = path.join(backendRoot, '.env');

  if (!fs.existsSync(apis2Path)) {
    console.error('[sync-cj] APIS2.txt not found at', apis2Path);
    process.exit(1);
  }

  const raw = fs.readFileSync(apis2Path, 'utf8');
  const m = raw.match(/CJ\s+Key\s*:\s*(\S+)/i);
  if (!m?.[1]) {
    console.error('[sync-cj] Could not parse CJ Key from APIS2.txt');
    process.exit(1);
  }

  const apiKey = m[1].trim();
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  env = upsertEnvLine(env, 'CJ_API_KEY', apiKey);
  env = upsertEnvLine(env, 'CJ_DROPSHIPPING_API_KEY', apiKey);
  fs.writeFileSync(envPath, env, 'utf8');

  console.log('[sync-cj] Updated backend/.env');
  console.log('[sync-cj] CJ_API_KEY=', mask(apiKey));
  console.log('[sync-cj] CJ_DROPSHIPPING_API_KEY=', mask(apiKey), '(same value)');
}

void main().catch((e) => {
  console.error('[sync-cj]', e);
  process.exit(1);
});
