/**
 * Regional Config Service
 * Helper to get user's default region from RegionalConfig (SystemConfig).
 */
import { prisma } from '../config/database';

export interface RegionalConfigItem {
  id?: number;
  country: string;
  countryCode: string;
  marketplace: string;
  active?: boolean;
  [key: string]: unknown;
}

/**
 * Get default region (countryCode lowercase) for opportunities/impuestos.
 * Returns first active config's countryCode, or null if none.
 */
export async function getDefaultRegionForUser(userId: number): Promise<string | null> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: `regional_configs_${userId}` },
  });
  if (!config?.value) return null;
  let configs: RegionalConfigItem[];
  try {
    configs = JSON.parse(config.value) as RegionalConfigItem[];
  } catch {
    return null;
  }
  const active = Array.isArray(configs)
    ? configs.find((c) => c.active !== false && c.countryCode && c.countryCode.length === 2)
    : null;
  return active ? active.countryCode.toLowerCase() : null;
}
