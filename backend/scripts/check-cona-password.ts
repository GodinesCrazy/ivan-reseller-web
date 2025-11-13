import '../src/config/env';
import { prisma } from '../src/config/database';
import bcrypt from 'bcryptjs';

async function checkConaPassword() {
  try {
    console.log('🔍 Buscando usuario cona...');
    
    const user = await prisma.user.findUnique({
      where: { username: 'cona' },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      console.error('❌ Usuario "cona" no encontrado en la base de datos');
      process.exit(1);
    }

    console.log('✅ Usuario encontrado:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Activo: ${user.isActive ? 'Sí' : 'No'}`);
    console.log(`   Creado: ${user.createdAt}`);
    console.log(`   Actualizado: ${user.updatedAt}`);
    console.log('');

    // Verificar contraseñas comunes
    const commonPasswords = ['cona123', 'Cona123', 'CONA123', 'cona', 'Cona'];
    
    console.log('🔐 Verificando contraseñas comunes...');
    let found = false;
    
    for (const password of commonPasswords) {
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid) {
        console.log(`   ✅ Contraseña encontrada: "${password}"`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log('   ⚠️  Ninguna de las contraseñas comunes coincide');
      console.log('   💡 La contraseña puede haber sido cambiada');
      console.log('   💡 Contraseña inicial configurada: "cona123"');
    }

    console.log('');
    console.log('📋 RESUMEN:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    if (found) {
      const password = commonPasswords.find(p => {
        return bcrypt.compareSync(p, user.password);
      });
      console.log(`   Password: ${password}`);
    } else {
      console.log(`   Password: Desconocida (puede haber sido cambiada)`);
      console.log(`   Password inicial: cona123`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkConaPassword();

