#!/usr/bin/env tsx
/**
 * Configura parámetros de autopilot para generación de ganancias (solo configuración, no cambia lógica).
 * Objetivo: mínimo margen ?25% (minRoiPct), beneficio mínimo ?$15 (minProfitUsd).
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const MIN_ROI_PCT = 25;
const MIN_PROFIT_USD = 15;

async function main(): Promise<number> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: 'autopilot_config' },
  });

  const defaultConfig = {
    enabled: true,
    cycleIntervalMinutes: 60,
    publicationMode: 'automatic' as const,
    targetMarketplace: 'ebay',
    maxOpportunitiesPerCycle: 10,
    searchQueries: ['organizador cocina', 'luces solares', 'auriculares bluetooth', 'soporte móvil coche', 'bandas resistencia'],
    workingCapital: 500,
    minProfitUsd: 10,
    minRoiPct: 50,
    optimizationEnabled: false,
  };

  let merged = { ...defaultConfig, minRoiPct: MIN_ROI_PCT, minProfitUsd: MIN_PROFIT_USD };
  if (existing?.value) {
    try {
      const saved = JSON.parse(existing.value as string) as Record<string, unknown>;
      merged = { ...merged, ...saved, minRoiPct: MIN_ROI_PCT, minProfitUsd: MIN_PROFIT_USD };
    } catch {
      // keep merged with new values
    }
  }

  await prisma.systemConfig.upsert({
    where: { key: 'autopilot_config' },
    create: { key: 'autopilot_config', value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });

  console.log('[AUTOPILOT-CONFIG] Parámetros actualizados: minRoiPct=%d, minProfitUsd=%d', MIN_ROI_PCT, MIN_PROFIT_USD);
  return 0;
}

main()
  .then((code) => {
    prisma.$disconnect();
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
