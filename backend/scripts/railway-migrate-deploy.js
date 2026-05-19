#!/usr/bin/env node
/**
 * Railway preDeploy: prisma migrate deploy with retries only when Postgres rejects
 * new connections (too many clients). Typical during rolling deploy.
 *
 * Env:
 *   MIGRATE_MAX_ATTEMPTS (default 18)
 *   MIGRATE_RETRY_DELAY_SEC (default 20)
 *   MIGRATE_FAIL_ON_SATURATION=true to fail deploy if all retries hit only saturation
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
const failOnSaturation = String(process.env.MIGRATE_FAIL_ON_SATURATION || '').toLowerCase() === 'true';

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
    if (!isConnectionSaturated(combined)) {
      process.exit(result.status ?? 1);
    }

    if (attempt >= maxAttempts) {
      console.error(
        '[railway-migrate-deploy] Postgres siguio saturado tras todos los reintentos. ' +
          'No se aplicaron migraciones en preDeploy.'
      );
      if (failOnSaturation) {
        process.exit(result.status ?? 1);
      }
      console.error(
        '[railway-migrate-deploy] Continuando deploy para no dejar bloqueada la app. ' +
          'Aplica migraciones luego con: npm run prisma:migrate:deploy o node scripts/railway-migrate-deploy.js'
      );
      process.exit(0);
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
