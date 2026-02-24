#!/usr/bin/env tsx
/**
 * Verificaciùn de runtime del Autopilot: config, credenciales y estado.
 * Ejecutar con el backend en marcha para comprobar AUTOPILOT_RUNNING y SYSTEM_FULLY_OPERATIONAL.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
  override: true,
});

async function main(): Promise<number> {
  const { prisma } = await import('../src/config/database');
  const { apiAvailability } = await import('../src/services/api-availability.service');
  const { autopilotSystem } = await import('../src/services/autopilot.service');

  let autopilotEnabled = false;
  let credentialsOk = false;
  let isRunning = false;

  try {
    const configRecord = await prisma.systemConfig.findUnique({
      where: { key: 'autopilot_config' },
    });
    if (configRecord?.value) {
      const parsed = JSON.parse(configRecord.value as string) as { enabled?: boolean };
      autopilotEnabled = parsed.enabled === true;
    }

    const user = await prisma.user.findFirst({
      where: { isActive: true, paypalPayoutEmail: { not: null } },
      select: { id: true },
    });
    if (user) {
      const caps = await apiAvailability.getCapabilities(user.id);
      credentialsOk = caps.canScrapeAliExpress && caps.canPublishToEbay;
    }

    const status = autopilotSystem.getStatus();
    isRunning = status.isRunning;
  } catch (e) {
    console.error('[VERIFY]', (e as Error).message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('');
  const systemFullyOperational = isRunning && credentialsOk && autopilotEnabled;

  console.log('AUTOPILOT_RUNNING =', isRunning ? 'TRUE' : 'FALSE');
  console.log('AUTOMATIC_REVENUE_GENERATION =', credentialsOk && autopilotEnabled ? 'ACTIVE' : 'INACTIVE');
  console.log('SYSTEM_FULLY_OPERATIONAL =', systemFullyOperational ? 'TRUE' : 'FALSE');
  console.log('');
  console.log('[VERIFY] autopilot_config.enabled:', autopilotEnabled);
  console.log('[VERIFY] credentials (scraping + ebay):', credentialsOk);
  console.log('[VERIFY] autopilotSystem.getStatus().isRunning:', isRunning);
  console.log('');

  return systemFullyOperational ? 0 : 1;
}

main().then((c) => process.exit(c)).catch(() => process.exit(1));
