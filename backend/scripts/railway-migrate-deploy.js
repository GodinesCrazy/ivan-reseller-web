#!/usr/bin/env node
/**
 * Railway preDeploy: prisma migrate deploy with retries only when Postgres rejects
 * new connections (too many clients). Typical during rolling deploy.
 *
 * Env:
 *   MIGRATE_MAX_ATTEMPTS (default 3)
 *   MIGRATE_RETRY_DELAY_SEC (default 10)
 *   MIGRATE_COMMAND_TIMEOUT_SEC (default 30)
 *   MIGRATE_FAIL_ON_SATURATION=true to fail deploy if all retries hit only saturation
 */
const { spawnSync } = require('child_process');

const railwayServiceName = String(process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_SERVICE || '');
if (railwayServiceName === 'ivan-reseller-web') {
  console.log('[railway-migrate-deploy] Skipping Prisma migrate for ivan-reseller-web duplicate service.');
  process.exit(0);
}

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

const maxAttempts = Math.max(1, Number(process.env.MIGRATE_MAX_ATTEMPTS || 3));
const delaySec = Math.max(5, Number(process.env.MIGRATE_RETRY_DELAY_SEC || 10));
const commandTimeoutMs = Math.max(10, Number(process.env.MIGRATE_COMMAND_TIMEOUT_SEC || 30)) * 1000;
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
      timeout: commandTimeoutMs,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
      process.exit(0);
    }

    const combined = (result.stdout || '') + (result.stderr || '');
    if (result.error && result.error.code === 'ETIMEDOUT') {
      console.error(
        `[railway-migrate-deploy] Prisma migrate excedio ${commandTimeoutMs / 1000}s en el intento ${attempt}/${maxAttempts}.`
      );
    } else if (!isConnectionSaturated(combined)) {
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
