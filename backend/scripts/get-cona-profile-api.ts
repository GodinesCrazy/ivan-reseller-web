/**
 * Script para obtener el perfil completo del usuario "cona" usando la API
 * 
 * Uso:
 * 1. Asegúrate de que el backend esté corriendo
 * 2. Ejecuta: npx tsx scripts/get-cona-profile-api.ts
 * 
 * O usa curl:
 * curl -X GET https://tu-api.com/api/users/username/cona \
 *   -H "Authorization: Bearer TU_TOKEN_ADMIN"
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function getConaProfile() {
  try {
    console.log('🔐 Paso 1: Autenticando como admin...');
    
    // 1. Login como admin
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.json();
      throw new Error(`Login failed: ${error.message || loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.data.token;

    console.log('✅ Autenticación exitosa');
    console.log('');

    console.log('👤 Paso 2: Obteniendo perfil completo de cona...');

    // 2. Obtener perfil por username
    const profileResponse = await fetch(`${API_URL}/api/users/username/cona`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!profileResponse.ok) {
      const error = await profileResponse.json();
      throw new Error(`Error obteniendo perfil: ${error.message || profileResponse.statusText}`);
    }

    const profileData = await profileResponse.json();
    const profile = profileData.data;

    // Mostrar información formateada
    console.log('═══════════════════════════════════════════════════════════');
    console.log('👤 PERFIL COMPLETO DEL USUARIO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    // Información básica
    console.log('📋 INFORMACIÓN BÁSICA:');
    console.log(`   ID: ${profile.id}`);
    console.log(`   Username: ${profile.username}`);
    console.log(`   Email: ${profile.email}`);
    console.log(`   Nombre completo: ${profile.fullName || 'No especificado'}`);
    console.log(`   Rol: ${profile.role}`);
    console.log(`   Plan: ${profile.plan || 'FREE'}`);
    console.log(`   Estado: ${profile.isActive ? '✅ Activo' : '❌ Inactivo'}`);
    console.log('');

    // Información del plan
    console.log('📦 INFORMACIÓN DEL PLAN:');
    console.log(`   Plan actual: ${profile.plan}`);
    console.log(`   Límite de requests: ${profile.planLimits.requests === -1 ? 'Ilimitado' : `${profile.planLimits.requests} por 15 minutos`}`);
    console.log(`   Funciones: ${profile.planLimits.features.join(', ')}`);
    console.log('');

    // Información financiera
    console.log('💰 INFORMACIÓN FINANCIERA:');
    console.log(`   Comisión: ${(profile.commissionRate * 100).toFixed(1)}%`);
    console.log(`   Costo fijo mensual: $${profile.fixedMonthlyCost.toFixed(2)} USD`);
    console.log(`   Balance actual: $${profile.balance.toFixed(2)} USD`);
    console.log(`   Ganancias totales: $${profile.totalEarnings.toFixed(2)} USD`);
    console.log(`   Ventas totales: ${profile.totalSales}`);
    console.log('');

    // Estadísticas
    console.log('📊 ESTADÍSTICAS:');
    console.log(`   Productos: ${profile.stats.products}`);
    console.log(`   Ventas: ${profile.stats.sales}`);
    console.log(`   Oportunidades: ${profile.stats.opportunities}`);
    console.log(`   Actividades: ${profile.stats.activities}`);
    console.log(`   Comisiones: ${profile.stats.commissions}`);
    console.log('');

    // Fechas
    console.log('📅 FECHAS:');
    console.log(`   Creado: ${new Date(profile.createdAt).toLocaleString('es-ES')}`);
    console.log(`   Actualizado: ${new Date(profile.updatedAt).toLocaleString('es-ES')}`);
    console.log(`   Último login: ${profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('es-ES') : 'Nunca'}`);
    if (profile.createdBy) {
      console.log(`   Creado por usuario ID: ${profile.createdBy}`);
    }
    console.log('');

    // Configuración de workflow
    if (profile.workflowConfig) {
      console.log('⚙️  CONFIGURACIÓN DE WORKFLOW:');
      console.log(`   Ambiente: ${profile.workflowConfig.environment}`);
      console.log(`   Modo: ${profile.workflowConfig.workflowMode}`);
      console.log(`   Stage Scrape: ${profile.workflowConfig.stageScrape}`);
      console.log(`   Stage Analyze: ${profile.workflowConfig.stageAnalyze}`);
      console.log(`   Stage Publish: ${profile.workflowConfig.stagePublish}`);
      console.log('');
    } else {
      console.log('⚙️  CONFIGURACIÓN DE WORKFLOW:');
      console.log('   ⚠️  Sin configuración personalizada (usando valores por defecto)');
      console.log('');
    }

    // Credenciales de API
    console.log('🔐 CREDENCIALES DE API:');
    if (profile.apiCredentials && profile.apiCredentials.length > 0) {
      const grouped = profile.apiCredentials.reduce((acc: any, cred: any) => {
        const key = `${cred.apiName}-${cred.environment}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(cred);
        return acc;
      }, {});

      for (const [key, creds] of Object.entries(grouped)) {
        const credList = creds as any[];
        const active = credList.filter(c => c.isActive).length;
        const total = credList.length;
        console.log(`   ${key}: ${active}/${total} activas`);
        credList.forEach(cred => {
          console.log(`      - ID: ${cred.id}, Scope: ${cred.scope}, Estado: ${cred.isActive ? '✅' : '❌'}, Actualizado: ${new Date(cred.updatedAt).toLocaleDateString('es-ES')}`);
        });
      }
    } else {
      console.log('   ⚠️  No hay credenciales de API configuradas');
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Información completa obtenida');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getConaProfile();

