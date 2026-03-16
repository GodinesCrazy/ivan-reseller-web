/**
 * Apply early-stage autopilot config to existing DB or via API.
 * Usage:
 *   npx tsx scripts/apply-early-stage-autopilot-config.ts
 *     -> uses DATABASE_URL (Prisma). Use when DB has free connections.
 *   npx tsx scripts/apply-early-stage-autopilot-config.ts https://<backend-url>
 *     -> uses API (login + POST). Use when DB returns "too many clients".
 * Uses AUTOPILOT_LOGIN_USER / AUTOPILOT_LOGIN_PASSWORD (default admin/admin123) for API mode.
 */
import '../src/config/env';
import { prisma } from '../src/config/database';

function parseTokenFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/token=([^;]+)/);
  return match ? match[1].trim() : null;
}

async function loginForApi(baseUrl: string): Promise<string> {
  const user = process.env.AUTOPILOT_LOGIN_USER || 'admin';
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
  const url = `${baseUrl.replace(/\/$/, '')}/api/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Login failed ${res.status}. Use AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD for a valid admin user.`);
  }
  const tokenFromBody = data.token ?? data.data?.token;
  if (tokenFromBody) return tokenFromBody;
  const token = parseTokenFromSetCookie(res.headers.get('set-cookie'));
  if (!token) throw new Error('Login OK but no token in cookie or body.');
  return token;
}

async function applyViaApi(baseUrl: string): Promise<void> {
  const token = await loginForApi(baseUrl);
  const base = baseUrl.replace(/\/$/, '');
  // Use PUT /api/autopilot/config (exists in production); fallback if POST apply-early-stage-config returns 404
  const body = {
    cycleIntervalMinutes: 15,
    workingCapital: 5000,
    maxOpportunitiesPerCycle: 25,
    maxActiveProducts: 1000,
    maxDailyOrders: 50,
  };
  let res = await fetch(`${base}/api/autopilot/apply-early-stage-config`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404) {
    res = await fetch(`${base}/api/autopilot/config`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || res.status < 200 || res.status >= 300) {
    const msg = data.error || data.message || data.details || `Request failed ${res.status}`;
    throw new Error(`${msg} (HTTP ${res.status})`);
  }
  console.log('Early-stage autopilot config applied (via API).');
}

const EARLY_STAGE_OVERRIDES = {
  cycleIntervalMinutes: 15,
  workingCapital: 5000,
  maxOpportunitiesPerCycle: 25,
  maxActiveProducts: 1000,
  maxDailyOrders: 50,
};

const FULL_EARLY_STAGE_CONFIG = {
  enabled: false,
  cycleIntervalMinutes: 15,
  publicationMode: 'automatic' as const,
  targetMarketplace: 'mercadolibre',
  targetMarketplaces: ['mercadolibre', 'ebay'],
  maxOpportunitiesPerCycle: 25,
  maxActiveProducts: 1000,
  minSupplierPrice: 15,
  maxSupplierPrice: 120,
  workingCapital: 5000,
  minProfitUsd: 12,
  minRoiPct: 40,
  optimizationEnabled: true,
  maxDailyOrders: 50,
  targetCountry: 'CL',
  searchQueries: [
    'audifonos bluetooth premium', 'cargador inalambrico rapido', 'smartwatch deportivo',
    'camara seguridad wifi hd', 'parlante bluetooth portatil', 'teclado mecanico gamer',
    'auriculares gamer rgb', 'power bank 20000mah', 'aspiradora portatil auto',
    'humidificador ultrasonico', 'mouse inalambrico ergonomico', 'lampara led escritorio',
    'reloj inteligente fitness', 'soporte celular auto magnetico', 'proyector portatil mini',
    'drone mini camara', 'bascula digital bluetooth', 'purificador aire portatil',
    'maquina cortar pelo profesional', 'kit herramientas precision',
    'funda celular silicona', 'organizador escritorio madera', 'luz led tira rgb',
    'filtro agua grifo cocina', 'cepillo electrico dental', 'bolsa termica almuerzo',
    'guantes tactiles invierno', 'soporte laptop ajustable', 'termo acero inoxidable',
    'cortina ducha antimoho', 'alfombrilla raton grande', 'anillo luz selfie',
    'faja deportiva cintura', 'protector pantalla vidrio', 'organizador cables escritorio',
    'mini ventilador usb portatil', 'bolsa viaje organizadora', 'espejo maquillaje led',
    'soporte tablet cama', 'kit limpieza pantallas electronicas',
    'cargador solar portatil', 'luz nocturna sensor movimiento', 'candado huella digital',
    'camara accion deportiva', 'microfono usb podcast', 'hub usb tipo c',
    'router wifi repetidor', 'alarma hogar inteligente', 'monitor presion arterial',
    'irrigador dental portatil', 'maquina ruido blanco', 'cojin masaje cervical',
    'dispensador jabon automatico', 'organizador zapatos puerta', 'silla ergonomica cojin',
  ],
};

async function main() {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: 'autopilot_config' },
  });

  if (existing?.value) {
    const saved = JSON.parse(existing.value as string) as Record<string, unknown>;
    Object.assign(saved, EARLY_STAGE_OVERRIDES);
    await prisma.systemConfig.update({
      where: { key: 'autopilot_config' },
      data: { value: JSON.stringify(saved) },
    });
    console.log('Early-stage autopilot config applied (merged into existing config).');
  } else {
    await prisma.systemConfig.upsert({
      where: { key: 'autopilot_config' },
      create: {
        key: 'autopilot_config',
        value: JSON.stringify(FULL_EARLY_STAGE_CONFIG),
      },
      update: {
        value: JSON.stringify(FULL_EARLY_STAGE_CONFIG),
      },
    });
    console.log('Early-stage autopilot config applied (full config created).');
  }
}

const baseUrl = process.argv[2];
if (baseUrl && (baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))) {
  applyViaApi(baseUrl)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error applying early-stage config:', err);
      process.exit(1);
    });
} else {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error applying early-stage config:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
