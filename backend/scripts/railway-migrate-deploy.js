#!/usr/bin/env node
/**
 * Railway preDeploy: prisma migrate deploy with retries only when Postgres rejects
 * new connections (too many clients). Typical during rolling deploy.
 *
 * Env: MIGRATE_MAX_ATTEMPTS (default 18), MIGRATE_RETRY_DELAY_SEC (default 20)
 */
const { spawnSync } = require('child_process');

function withConnectionLimit(url, limit) {
  if (!url || !limit) return url;
  if (/connection_limit=/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${encodeURIComponent(String(limit))}`;
}

function isConnectionSaturated(text) {
  const s = String(text || '').toLowerCase();
  return (
    s.includes('too many clients') ||
    s.includes('too many connections') ||
    s.includes('sorry, too many clients')
  );
}

const maxAttempts = Math.max(1, Number(process.env.MIGRATE_MAX_ATTEMPTS || 18));
const delaySec = Math.max(5, Number(process.env.MIGRATE_RETRY_DELAY_SEC || 20));

const env = {
  ...process.env,
  DATABASE_URL: withConnectionLimit(process.env.DATABASE_URL, 1),
};

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
      process.exit(0);
    }

    const combined = (result.stdout || '') + (result.stderr || '');
    if (!isConnectionSaturated(combined) || attempt >= maxAttempts) {
      process.exit(result.status ?? 1);
    }

    console.error(
      `[railway-migrate-deploy] Postgres saturado (too many clients), intento ${attempt}/${maxAttempts}. ` +
        `Esperando ${delaySec}s (suelen liberarse conexiones al cerrar el deploy anterior)…`
    );
    await new Promise((r) => setTimeout(r, delaySec * 1000));
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
