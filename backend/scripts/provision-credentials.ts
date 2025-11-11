import '../src/config/env';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { marketplaceAuthStatusService } from '../src/services/marketplace-auth-status.service';
import type { ApiEnvironment, ApiName } from '../src/types/api-credentials.types';
import type { CredentialScope } from '@prisma/client';

const SENSITIVE_KEYWORDS = ['password', 'secret', 'token', 'key', 'cert', 'client'];

interface GlobalCredentialConfig {
  apiName: ApiName;
  environment?: ApiEnvironment;
  credentials: Record<string, any>;
  owner?: string;
  sharedBy?: string;
  scope?: CredentialScope;
}

interface UserCredentialConfig {
  apiName: ApiName;
  environment?: ApiEnvironment;
  scope?: CredentialScope;
  credentials: Record<string, any>;
  sharedBy?: string;
}

interface UserConfig {
  username: string;
  credentials: UserCredentialConfig[];
}

interface ProvisionConfig {
  globals?: GlobalCredentialConfig[];
  users?: UserConfig[];
}

interface SummaryRecord {
  apiName: ApiName;
  environment: ApiEnvironment;
  scope: CredentialScope;
  ownerUserId: number;
  sharedByUserId: number | null;
}

function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function summarizeCredentials(raw: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYWORDS.some(keyword => lowerKey.includes(keyword));
      summary[key] = isSensitive ? maskValue(value.trim()) : value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
    } else if (Array.isArray(value)) {
      summary[key] = [`items:${value.length}`];
    } else if (typeof value === 'object') {
      summary[key] = Object.keys(value);
    }
  }
  return summary;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find(arg => arg.startsWith('--file='));
  const dryRun = args.includes('--dry-run');
  const skipVerify = args.includes('--skip-verify');
  if (!fileArg) {
    console.error('❌ Debes indicar un archivo JSON con --file=path/to/config.json');
    process.exit(1);
  }
  const filePath = fileArg.split('=')[1];
  if (!filePath) {
    console.error('❌ Ruta de archivo inválida.');
    process.exit(1);
  }
  return {
    configPath: path.resolve(process.cwd(), filePath),
    dryRun,
    verify: !skipVerify,
  };
}

async function loadConfig(configPath: string): Promise<ProvisionConfig> {
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Archivo de configuración no encontrado: ${configPath}`);
    process.exit(1);
  }
  const raw = await fs.promises.readFile(configPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Config debe ser un objeto JSON');
    }
    return parsed;
  } catch (error: any) {
    console.error('❌ No se pudo parsear el archivo JSON:', error?.message || error);
    process.exit(1);
  }
}

async function resolveUserId(username: string, fallbackRole: 'ADMIN' | 'USER' = 'ADMIN'): Promise<number> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (user) {
    return user.id;
  }
  const fallback = await prisma.user.findFirst({ where: { role: fallbackRole } });
  if (fallback) {
    console.warn(`⚠️  Usuario "${username}" no encontrado. Usando ${fallback.username} (${fallback.role}) como fallback.`);
    return fallback.id;
  }
  throw new Error(`Usuario "${username}" no encontrado y no hay fallback disponible.`);
}

async function provisionGlobals(
  entries: GlobalCredentialConfig[] = [],
  options: { dryRun: boolean }
): Promise<SummaryRecord[]> {
  const summaries: SummaryRecord[] = [];
  for (const entry of entries) {
    const apiName = entry.apiName;
    const env: ApiEnvironment = entry.environment || 'production';
    const scope: CredentialScope = entry.scope || 'global';
    const ownerUsername = entry.owner || 'admin';
    const sharedByUsername = entry.sharedBy || ownerUsername;

    const ownerUserId = await resolveUserId(ownerUsername, 'ADMIN');
    const sharedByUserId = sharedByUsername ? await resolveUserId(sharedByUsername, 'ADMIN') : ownerUserId;

    console.log(`🌍 Configurando credencial global ${apiName} (${env}) para ${ownerUsername}`);

    if (!options.dryRun) {
      await CredentialsManager.saveCredentials(ownerUserId, apiName, entry.credentials, env, {
        scope,
        sharedByUserId,
      });
    }

    summaries.push({
      apiName,
      environment: env,
      scope,
      ownerUserId,
      sharedByUserId: sharedByUserId ?? null,
    });
  }
  return summaries;
}

async function provisionUserCredentials(
  users: UserConfig[] = [],
  options: { dryRun: boolean }
): Promise<{ summaries: SummaryRecord[]; touchedUserIds: Set<number> }> {
  const summaries: SummaryRecord[] = [];
  const touchedUserIds = new Set<number>();

  for (const userEntry of users) {
    const userId = await resolveUserId(userEntry.username, 'USER');
    touchedUserIds.add(userId);
    for (const credential of userEntry.credentials) {
      const apiName = credential.apiName;
      const env: ApiEnvironment = credential.environment || 'production';
      const scope: CredentialScope = credential.scope || 'user';
      let sharedByUserId: number | null = null;

      if (credential.sharedBy) {
        sharedByUserId = await resolveUserId(credential.sharedBy, 'ADMIN');
      }

      console.log(`👤 Configurando credencial ${apiName} (${env}) para ${userEntry.username} [scope=${scope}]`);

      if (!options.dryRun) {
        await CredentialsManager.saveCredentials(userId, apiName, credential.credentials, env, {
          scope,
          sharedByUserId,
        });
      }

      summaries.push({
        apiName,
        environment: env,
        scope,
        ownerUserId: userId,
        sharedByUserId,
      });
    }
  }

  return { summaries, touchedUserIds };
}

async function verifyUsers(userIds: Set<number>): Promise<void> {
  for (const userId of userIds) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) continue;

    console.log(`\n🔎 Verificación para ${user.username} (ID ${user.id})`);
    const configured = await CredentialsManager.listConfiguredApis(user.id);
    configured.forEach(item => {
      console.log(`  • ${item.apiName} [${item.environment}] scope=${item.scope} active=${item.isActive}`);
    });

    const keyApis: ApiName[] = ['aliexpress', 'ebay', 'amazon', 'mercadolibre', 'scraperapi', 'zenrows', 'groq'];
    for (const apiName of keyApis) {
      const creds = await CredentialsManager.getCredentials(user.id, apiName, 'production', { includeGlobal: true });
      const summary = summarizeCredentials(creds as Record<string, any>);
      if (summary) {
        console.log(`    ▸ ${apiName}:`, summary);
      }
    }

    const aliStatus = await marketplaceAuthStatusService.getStatus(user.id, 'aliexpress');
    if (aliStatus) {
      console.log(
        `    ▸ AliExpress status: ${aliStatus.status} (${aliStatus.message || 'sin mensaje'}) updatedAt=${aliStatus.updatedAt}`
      );
    }
  }
}

async function main() {
  const { configPath, dryRun, verify } = parseArgs();
  const config = await loadConfig(configPath);
  const touchedUsers = new Set<number>();

  console.log(`📦 Procesando configuración desde ${configPath}`);

  if (config.globals?.length) {
    await provisionGlobals(config.globals, { dryRun });
    // Registrar owners como usuarios tocados para verificación
    for (const entry of config.globals) {
      const ownerId = await resolveUserId(entry.owner || 'admin', 'ADMIN');
      touchedUsers.add(ownerId);
    }
  }

  if (config.users?.length) {
    const result = await provisionUserCredentials(config.users, { dryRun });
    result.touchedUserIds.forEach(id => touchedUsers.add(id));
  }

  if (dryRun) {
    console.log('\n✅ Dry-run completado. Ninguna credencial fue guardada.');
  } else {
    console.log('\n✅ Provisionamiento completado.');
  }

  if (verify && touchedUsers.size > 0) {
    await verifyUsers(touchedUsers);
  }
}

main()
  .catch(error => {
    console.error('❌ Error durante el provisionamiento:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

