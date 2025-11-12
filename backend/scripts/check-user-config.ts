import '../src/config/env';
import { prisma } from '../src/config/database';
import { auditUserConfiguration } from '../src/services/config-audit.service';

async function main() {
  const usernameArg = process.argv.find(arg => arg.startsWith('--username='));
  const username = usernameArg ? usernameArg.split('=')[1] : 'cona';

  console.log(`🔍 Auditando configuración mínima para usuario: ${username}`);

  const userRecord = await prisma.user.findUnique({
    where: { username },
  });

  if (!userRecord) {
    console.error('❌ Usuario no encontrado');
    process.exit(1);
  }

  const audit = await auditUserConfiguration(userRecord.id);

  console.log('👤 Usuario:', {
    id: audit.user.id,
    username: audit.user.username,
    role: audit.user.role,
    isActive: audit.user.isActive,
    createdAt: audit.user.createdAt,
  });

  if (audit.workflowConfig) {
    console.log('⚙️  WorkflowConfig:', {
      environment: audit.workflowConfig.environment,
      workflowMode: audit.workflowConfig.workflowMode,
      stageScrape: audit.workflowConfig.stageScrape,
      stageAnalyze: audit.workflowConfig.stageAnalyze,
      stagePublish: audit.workflowConfig.stagePublish,
    });
  } else {
    console.warn('⚠️  Usuario sin configuración de workflow. Se usarán valores por defecto.');
  }

  console.log('🔐 APIs configuradas:', audit.configuredApis.map(item => ({
    apiName: item.apiName,
    environment: item.environment,
    scope: item.scope,
    ownerUserId: item.ownerUserId,
    sharedByUserId: item.sharedByUserId,
    isActive: item.isActive,
    updatedAt: item.updatedAt,
  })));

  console.log('\n✅ APIs críticas:');
  for (const entry of audit.criticalApis) {
    console.log(`\n🧩 ${entry.apiName.toUpperCase()} credenciales:`);
    for (const env of entry.environments) {
      if (env.error) {
        console.log(`  • ${env.environment}: Error -> ${env.error}`);
      } else {
        console.log(`  • ${env.environment}:`, env.summary || '—');
      }
    }
  }

  if (audit.optionalApis.length) {
    console.log('\nℹ️  APIs opcionales (mejoran precisión pero no bloquean el flujo):');
  }
  for (const entry of audit.optionalApis) {
    console.log(`\n🧩 ${entry.apiName.toUpperCase()} credenciales:`);
    for (const env of entry.environments) {
      if (env.error) {
        console.log(`  • ${env.environment}: Error -> ${env.error}`);
      } else {
        console.log(`  • ${env.environment}:`, env.summary || '—');
      }
    }
  }

  if (audit.authStatuses.length > 0) {
    console.log('\n📊 Estado de autenticación de marketplaces:');
    audit.authStatuses.forEach(status => {
      console.log(`  • ${status.marketplace}: ${status.status} (${status.message || 'sin mensaje'})`);
    });
  } else {
    console.log('\nℹ️  Sin registros en marketplace_auth_status para este usuario.');
  }

  if (audit.manualSession) {
    console.log('\n🕒 Última sesión manual AliExpress:', {
      status: audit.manualSession.status,
      createdAt: audit.manualSession.createdAt,
      expiresAt: audit.manualSession.expiresAt,
      completedAt: audit.manualSession.completedAt,
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
