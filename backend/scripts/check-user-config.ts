import '../src/config/env';
import { prisma } from '../src/config/database';
import { CredentialsManager } from '../src/services/credentials-manager.service';
import { marketplaceAuthStatusService } from '../src/services/marketplace-auth-status.service';
import type { ApiName, ApiEnvironment } from '../src/types/api-credentials.types';

const SENSITIVE_KEYWORDS = [
  'password',
  'secret',
  'token',
  'key',
  'cert',
  'client',
];

type CredentialSummary = Record<string, string | number | boolean | string[]>;

function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function summarizeCredentials(raw: Record<string, any> | null | undefined): CredentialSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary: CredentialSummary = {};
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

async function describeApiCredential(
  userId: number,
  apiName: ApiName,
  environments: ApiEnvironment[] = ['production']
) {
  const reports: Record<string, CredentialSummary | null> = {};
  for (const env of environments) {
    try {
      const creds = await CredentialsManager.getCredentials(userId, apiName, env);
      reports[env] = summarizeCredentials(creds as unknown as Record<string, any>);
    } catch (error: any) {
      reports[env] = null;
      console.error(`⚠️  Error leyendo credenciales de ${apiName} (${env}):`, error?.message || error);
    }
  }
  return reports;
}

async function main() {
  const usernameArg = process.argv.find(arg => arg.startsWith('--username='));
  const username = usernameArg ? usernameArg.split('=')[1] : 'cona';

  console.log(`🔍 Auditando configuración mínima para usuario: ${username}`);

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      workflowConfig: true,
    },
  });

  if (!user) {
    console.error('❌ Usuario no encontrado');
    process.exit(1);
  }

  console.log('👤 Usuario:', {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  });

  if (user.workflowConfig) {
    console.log('⚙️  WorkflowConfig:', {
      environment: user.workflowConfig.environment,
      workflowMode: user.workflowConfig.workflowMode,
      stageScrape: user.workflowConfig.stageScrape,
      stageAnalyze: user.workflowConfig.stageAnalyze,
      stagePublish: user.workflowConfig.stagePublish,
    });
  } else {
    console.warn('⚠️  Usuario sin configuración de workflow. Se usarán valores por defecto.');
  }

  const configuredApis = await CredentialsManager.listConfiguredApis(user.id);
  console.log('🔐 APIs configuradas:', configuredApis.map(item => ({
    apiName: item.apiName,
    environment: item.environment,
    scope: item.scope,
    ownerUserId: item.ownerUserId,
    sharedByUserId: item.sharedByUserId,
    isActive: item.isActive,
    updatedAt: item.updatedAt,
  })));

  const keyApis: Array<{ name: ApiName; envs?: ApiEnvironment[] }> = [
    { name: 'aliexpress' },
    { name: 'ebay', envs: ['sandbox', 'production'] },
    { name: 'amazon', envs: ['sandbox', 'production'] },
    { name: 'mercadolibre', envs: ['sandbox', 'production'] },
    { name: 'scraperapi' },
    { name: 'zenrows' },
    { name: 'groq' },
  ];

  for (const entry of keyApis) {
    const report = await describeApiCredential(user.id, entry.name, entry.envs || ['production']);
    console.log(`
🧩 ${entry.name.toUpperCase()} credenciales:`);
    for (const [env, summary] of Object.entries(report)) {
      console.log(`  • ${env}:`, summary || '—');
    }
  }

  const authStatuses = await marketplaceAuthStatusService.listByUser(user.id);
  if (authStatuses.length > 0) {
    console.log('\n📊 Estado de autenticación de marketplaces:');
    authStatuses.forEach(status => {
      console.log(`  • ${status.marketplace}: ${status.status} (${status.message || 'sin mensaje'})`);
    });
  } else {
    console.log('\nℹ️  Sin registros en marketplace_auth_status para este usuario.');
  }

  const latestManualSession = await prisma.manualAuthSession.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (latestManualSession) {
    console.log('\n🕒 Última sesión manual AliExpress:', {
      status: latestManualSession.status,
      createdAt: latestManualSession.createdAt,
      expiresAt: latestManualSession.expiresAt,
      completedAt: latestManualSession.completedAt,
    });
  } else {
    console.log('\nℹ️  No se encontraron sesiones manuales registradas.');
  }
}

main()
  .catch(error => {
    console.error('❌ Error en la auditoría:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
