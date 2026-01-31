import { trace } from '../utils/boot-trace';
trace('loading config-audit.service');

import { prisma } from '../config/database';
import { CredentialsManager } from './credentials-manager.service';
import { marketplaceAuthStatusService } from './marketplace-auth-status.service';
import {
  OPTIONAL_MARKETPLACES,
  REQUIRED_MARKETPLACES,
} from '../config/marketplaces.config';
import type { ApiEnvironment, ApiName } from '../types/api-credentials.types';

const ADDITIONAL_CRITICAL_APIS: ApiName[] = ['scraperapi', 'zenrows', 'groq'];

const SENSITIVE_KEYWORDS = ['password', 'secret', 'token', 'key', 'cert', 'client'];

interface CredentialEnvironmentSummary {
  environment: ApiEnvironment | 'production';
  summary: Record<string, any> | null;
  error?: string;
}

export interface ApiAuditEntry {
  apiName: ApiName;
  optional: boolean;
  environments: CredentialEnvironmentSummary[];
}

export interface ConfigAuditResult {
  user: {
    id: number;
    username: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  };
  workflowConfig: any | null;
  configuredApis: Awaited<ReturnType<typeof CredentialsManager.listConfiguredApis>>;
  criticalApis: ApiAuditEntry[];
  optionalApis: ApiAuditEntry[];
  authStatuses: Awaited<ReturnType<typeof marketplaceAuthStatusService.listByUser>>;
  manualSession: {
    status: string;
    createdAt: Date;
    expiresAt: Date | null;
    completedAt: Date | null;
  } | null;
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

async function describeApiCredential(
  userId: number,
  apiName: ApiName,
  environments: ApiEnvironment[] = ['production']
): Promise<CredentialEnvironmentSummary[]> {
  const reports: CredentialEnvironmentSummary[] = [];
  for (const env of environments) {
    try {
      const creds = await CredentialsManager.getCredentials(userId, apiName, env);
      reports.push({
        environment: env,
        summary: summarizeCredentials(creds as unknown as Record<string, any>),
      });
    } catch (error: any) {
      reports.push({
        environment: env,
        summary: null,
        error: error?.message || String(error),
      });
    }
  }
  return reports;
}

export async function auditUserConfiguration(userId: number): Promise<ConfigAuditResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { workflowConfig: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const configuredApis = await CredentialsManager.listConfiguredApis(userId);

  const criticalTargets: Array<{ name: ApiName; envs?: ApiEnvironment[] }> = [
    ...REQUIRED_MARKETPLACES.map((name) => ({ name, envs: ['production'] as ApiEnvironment[] })),
    ...ADDITIONAL_CRITICAL_APIS.map((name) => ({ name, envs: ['production'] as ApiEnvironment[] })),
  ];

  const optionalTargets: Array<{ name: ApiName; envs?: ApiEnvironment[] }> = OPTIONAL_MARKETPLACES.map(
    (name) => ({
      name,
      envs: ['sandbox', 'production'] as ApiEnvironment[],
    })
  );

  const criticalApis: ApiAuditEntry[] = [];
  for (const entry of criticalTargets) {
    criticalApis.push({
      apiName: entry.name,
      optional: false,
      environments: await describeApiCredential(userId, entry.name, entry.envs || ['production']),
    });
  }

  const optionalApis: ApiAuditEntry[] = [];
  for (const entry of optionalTargets) {
    optionalApis.push({
      apiName: entry.name,
      optional: true,
      environments: await describeApiCredential(userId, entry.name, entry.envs || ['production']),
    });
  }

  const authStatuses = await marketplaceAuthStatusService.listByUser(userId);

  const manualSession = await prisma.manualAuthSession.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
    workflowConfig: user.workflowConfig,
    configuredApis,
    criticalApis,
    optionalApis,
    authStatuses,
    manualSession: manualSession
      ? {
          status: manualSession.status,
          createdAt: manualSession.createdAt,
          expiresAt: manualSession.expiresAt,
          completedAt: manualSession.completedAt,
        }
      : null,
  };
}


