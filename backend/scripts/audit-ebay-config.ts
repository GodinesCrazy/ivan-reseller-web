/**
 * Script de Auditoría: Verificar configuración de eBay
 * 
 * Este script verifica:
 * 1. Si las credenciales de eBay están guardadas en la BD
 * 2. Si el sistema puede recuperarlas correctamente
 * 3. Si el estado reportado por api-availability coincide con las credenciales reales
 * 4. Si hay problemas con el environment (sandbox vs production)
 */

import { prisma } from '../src/config/database';
import { APIAvailabilityService } from '../src/services/api-availability.service';
import { CredentialsManager } from '../src/services/credentials-manager.service';

async function auditEbayConfig() {
  console.log('🔍 AUDITORÍA DE CONFIGURACIÓN DE EBAY\n');
  console.log('=' .repeat(60));

  // Obtener todos los usuarios
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
    },
  });

  if (users.length === 0) {
    console.log('❌ No se encontraron usuarios en la base de datos');
    return;
  }

  const apiAvailability = new APIAvailabilityService();

  for (const user of users) {
    console.log(`\n👤 Usuario: ${user.username} (ID: ${user.id}, Email: ${user.email})`);
    console.log('-'.repeat(60));

    // Verificar credenciales directamente en la BD
    const credentialsInDB = await prisma.apiCredential.findMany({
      where: {
        userId: user.id,
        apiName: 'ebay',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    console.log(`\n📦 Credenciales en BD (${credentialsInDB.length} registros):`);
    if (credentialsInDB.length === 0) {
      console.log('  ❌ No hay credenciales de eBay en la base de datos');
    } else {
      for (const cred of credentialsInDB) {
        console.log(`  ✅ Registro ID: ${cred.id}`);
        console.log(`     Environment: ${cred.environment || 'N/A'}`);
        console.log(`     Scope: ${cred.scope || 'N/A'}`);
        console.log(`     Updated: ${cred.updatedAt}`);
        console.log(`     Active: ${cred.isActive ? 'Sí' : 'No'}`);
        
        // Intentar desencriptar y mostrar campos (sin valores completos por seguridad)
        try {
          const decrypted = await CredentialsManager.getCredentials(
            user.id,
            'ebay',
            (cred.environment as 'sandbox' | 'production') || 'production'
          );
          
          if (decrypted) {
            console.log(`     Campos disponibles: ${Object.keys(decrypted).join(', ')}`);
            const anyDecrypted = decrypted as any;
            console.log(`     appId presente: ${!!anyDecrypted.appId || !!anyDecrypted.EBAY_APP_ID}`);
            console.log(`     devId presente: ${!!anyDecrypted.devId || !!anyDecrypted.EBAY_DEV_ID}`);
            console.log(`     certId presente: ${!!anyDecrypted.certId || !!anyDecrypted.EBAY_CERT_ID}`);
            
            // Mostrar preview de valores (solo primeros caracteres)
            const appId = anyDecrypted.appId || anyDecrypted.EBAY_APP_ID || '';
            const devId = anyDecrypted.devId || anyDecrypted.EBAY_DEV_ID || '';
            const certId = anyDecrypted.certId || anyDecrypted.EBAY_CERT_ID || '';
            
            console.log(`     appId preview: ${appId ? appId.substring(0, 20) + '...' : 'N/A'}`);
            console.log(`     devId preview: ${devId ? devId.substring(0, 20) + '...' : 'N/A'}`);
            console.log(`     certId preview: ${certId ? '***' + certId.slice(-4) : 'N/A'}`);
          } else {
            console.log(`     ⚠️  No se pudieron desencriptar las credenciales`);
          }
        } catch (error: any) {
          console.log(`     ❌ Error desencriptando: ${error.message}`);
        }
      }
    }

    // Verificar estado reportado por api-availability para ambos ambientes
    console.log(`\n📊 Estado reportado por APIAvailabilityService:`);
    
    for (const env of ['sandbox', 'production'] as const) {
      try {
        const status = await apiAvailability.checkEbayAPI(user.id, env);
        console.log(`\n  ${env.toUpperCase()}:`);
        console.log(`     isConfigured: ${status.isConfigured}`);
        console.log(`     isAvailable: ${status.isAvailable}`);
        console.log(`     status: ${status.status || 'N/A'}`);
        console.log(`     message: ${status.message || 'N/A'}`);
        console.log(`     error: ${status.error || 'N/A'}`);
        console.log(`     missingFields: ${status.missingFields?.join(', ') || 'Ninguno'}`);
        console.log(`     lastChecked: ${status.lastChecked}`);
      } catch (error: any) {
        console.log(`  ❌ Error verificando ${env}: ${error.message}`);
      }
    }

    // Comparar resultados
    console.log(`\n🔍 ANÁLISIS:`);
    const hasCredentialsInDB = credentialsInDB.length > 0;
    const sandboxStatus = await apiAvailability.checkEbayAPI(user.id, 'sandbox');
    const productionStatus = await apiAvailability.checkEbayAPI(user.id, 'production');
    
    if (hasCredentialsInDB && !sandboxStatus.isConfigured && !productionStatus.isConfigured) {
      console.log(`  ⚠️  PROBLEMA DETECTADO: Hay credenciales en BD pero el sistema reporta "no configurado"`);
      console.log(`     Posibles causas:`);
      console.log(`     1. Las credenciales están en un environment diferente al verificado`);
      console.log(`     2. Los nombres de campos no coinciden (appId vs EBAY_APP_ID)`);
      console.log(`     3. Las credenciales no se pueden desencriptar`);
      console.log(`     4. Las credenciales están marcadas como isActive=false`);
    } else if (!hasCredentialsInDB && (sandboxStatus.isConfigured || productionStatus.isConfigured)) {
      console.log(`  ⚠️  INCONSISTENCIA: No hay credenciales en BD pero el sistema reporta "configurado"`);
      console.log(`     Posible causa: Cache desactualizado`);
    } else if (hasCredentialsInDB && (sandboxStatus.isConfigured || productionStatus.isConfigured)) {
      console.log(`  ✅ Estado consistente: Credenciales en BD y sistema reporta configurado`);
    } else {
      console.log(`  ℹ️  No hay credenciales configuradas para este usuario`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Auditoría completada\n');
}

// Ejecutar auditoría
auditEbayConfig()
  .catch((error) => {
    console.error('❌ Error ejecutando auditoría:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

