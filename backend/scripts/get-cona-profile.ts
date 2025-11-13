import '../src/config/env';
import { prisma } from '../src/config/database';

async function getConaProfile() {
  try {
    console.log('🔍 Buscando perfil completo del usuario cona...');
    console.log('');
    
    // Buscar usuario (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: 'cona', mode: 'insensitive' } },
          { email: { equals: 'csantamariascheel@gmail.com', mode: 'insensitive' } },
        ],
      },
      include: {
        apiCredentials: {
          select: {
            id: true,
            apiName: true,
            environment: true,
            isActive: true,
            scope: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            apiName: 'asc',
          },
        },
        workflowConfig: {
          select: {
            environment: true,
            workflowMode: true,
            stageScrape: true,
            stageAnalyze: true,
            stagePublish: true,
          },
        },
        _count: {
          select: {
            products: true,
            sales: true,
            opportunities: true,
            activities: true,
          },
        },
      },
    });

    if (!user) {
      console.error('❌ Usuario "cona" no encontrado en la base de datos');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('👤 PERFIL COMPLETO DEL USUARIO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    // Información básica
    console.log('📋 INFORMACIÓN BÁSICA:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Nombre completo: ${user.fullName || 'No especificado'}`);
    console.log(`   Rol: ${user.role}`);
    console.log(`   Plan: ${user.plan || 'FREE'}`);
    console.log(`   Estado: ${user.isActive ? '✅ Activo' : '❌ Inactivo'}`);
    console.log('');

    // Información financiera
    console.log('💰 INFORMACIÓN FINANCIERA:');
    console.log(`   Comisión: ${(user.commissionRate * 100).toFixed(1)}%`);
    console.log(`   Costo fijo mensual: $${user.fixedMonthlyCost.toFixed(2)} USD`);
    console.log(`   Balance actual: $${user.balance.toFixed(2)} USD`);
    console.log(`   Ganancias totales: $${user.totalEarnings.toFixed(2)} USD`);
    console.log(`   Ventas totales: ${user.totalSales}`);
    console.log('');

    // Estadísticas
    console.log('📊 ESTADÍSTICAS:');
    console.log(`   Productos: ${user._count.products}`);
    console.log(`   Ventas: ${user._count.sales}`);
    console.log(`   Oportunidades: ${user._count.opportunities}`);
    console.log(`   Actividades: ${user._count.activities}`);
    console.log('');

    // Fechas
    console.log('📅 FECHAS:');
    console.log(`   Creado: ${user.createdAt.toLocaleString('es-ES')}`);
    console.log(`   Actualizado: ${user.updatedAt.toLocaleString('es-ES')}`);
    console.log(`   Último login: ${user.lastLoginAt ? user.lastLoginAt.toLocaleString('es-ES') : 'Nunca'}`);
    if (user.createdBy) {
      console.log(`   Creado por usuario ID: ${user.createdBy}`);
    }
    console.log('');

    // Configuración de workflow
    if (user.workflowConfig) {
      console.log('⚙️  CONFIGURACIÓN DE WORKFLOW:');
      console.log(`   Ambiente: ${user.workflowConfig.environment}`);
      console.log(`   Modo: ${user.workflowConfig.workflowMode}`);
      console.log(`   Stage Scrape: ${user.workflowConfig.stageScrape}`);
      console.log(`   Stage Analyze: ${user.workflowConfig.stageAnalyze}`);
      console.log(`   Stage Publish: ${user.workflowConfig.stagePublish}`);
      console.log('');
    } else {
      console.log('⚙️  CONFIGURACIÓN DE WORKFLOW:');
      console.log('   ⚠️  Sin configuración personalizada (usando valores por defecto)');
      console.log('');
    }

    // Credenciales de API
    console.log('🔐 CREDENCIALES DE API:');
    if (user.apiCredentials.length > 0) {
      const grouped = user.apiCredentials.reduce((acc: any, cred: any) => {
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
          console.log(`      - ID: ${cred.id}, Scope: ${cred.scope}, Estado: ${cred.isActive ? '✅' : '❌'}, Actualizado: ${cred.updatedAt.toLocaleDateString('es-ES')}`);
        });
      }
    } else {
      console.log('   ⚠️  No hay credenciales de API configuradas');
    }
    console.log('');

    // Resumen del plan
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📦 RESUMEN DEL PLAN:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    const plan = user.plan || 'FREE';
    const planLimits: Record<string, any> = {
      FREE: { requests: 100, features: ['Básico'] },
      BASIC: { requests: 500, features: ['Básico', 'Avanzado'] },
      PRO: { requests: 2000, features: ['Básico', 'Avanzado', 'Premium'] },
      ENTERPRISE: { requests: 10000, features: ['Básico', 'Avanzado', 'Premium', 'Enterprise'] },
      ADMIN: { requests: -1, features: ['Ilimitado', 'Todas las funciones'] },
    };

    const limits = planLimits[plan] || planLimits.FREE;
    console.log(`   Plan actual: ${plan}`);
    console.log(`   Límite de requests: ${limits.requests === -1 ? 'Ilimitado' : `${limits.requests} por 15 minutos`}`);
    console.log(`   Funciones: ${limits.features.join(', ')}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Información completa mostrada');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

getConaProfile();

