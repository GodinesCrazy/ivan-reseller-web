import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔍 Verificando usuario admin...');

    // Verificar si ya existe
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@ivanreseller.com' },
    });

    if (existingAdmin) {
      console.log('✅ Usuario admin ya existe');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Username:', existingAdmin.username);
      console.log('🔑 Role:', existingAdmin.role);
      
      // Actualizar contraseña por si acaso
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { password: hashedPassword },
      });
      console.log('🔄 Contraseña actualizada a: admin123');
      return;
    }

    console.log('📝 Creando usuario admin...');

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Crear usuario admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin@ivanreseller.com',
        username: 'admin',
        password: hashedPassword,
        fullName: 'Administrador',
        role: 'ADMIN',
        commissionRate: 0.0,
        balance: 0,
        totalEarnings: 0,
      },
    });

    console.log('✅ Usuario admin creado exitosamente!');
    console.log('');
    console.log('📋 CREDENCIALES:');
    console.log('   Email:    admin@ivanreseller.com');
    console.log('   Password: admin123');
    console.log('   Role:     ADMIN');
    console.log('');
    console.log('⚠️  IMPORTANTE: Cambia la contraseña después del primer login');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
