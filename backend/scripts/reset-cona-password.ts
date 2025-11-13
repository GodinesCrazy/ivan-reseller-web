import '../src/config/env';
import { prisma } from '../src/config/database';
import bcrypt from 'bcryptjs';

async function resetConaPassword() {
  try {
    console.log('🔍 Buscando usuario cona...');
    
    // Buscar usuario (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: 'cona', mode: 'insensitive' } },
          { email: { equals: 'csantamariascheel@gmail.com', mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      console.error('❌ Usuario "cona" no encontrado en la base de datos');
      console.log('');
      console.log('💡 Intentando crear el usuario...');
      
      // Intentar crear el usuario
      const hashedPassword = await bcrypt.hash('cona123', 10);
      const newUser = await prisma.user.create({
        data: {
          username: 'cona',
          email: 'csantamariascheel@gmail.com',
          password: hashedPassword,
          fullName: 'Cona',
          role: 'USER',
          commissionRate: 0.20,
          fixedMonthlyCost: 0.0,
          isActive: true,
        },
      });
      
      console.log('✅ Usuario creado exitosamente!');
      console.log('');
      console.log('📋 CREDENCIALES:');
      console.log(`   Username: ${newUser.username}`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Password: cona123`);
      console.log(`   Role: ${newUser.role}`);
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Activo: ${user.isActive ? 'Sí' : 'No'}`);
    console.log('');

    // Resetear contraseña a cona123
    console.log('🔐 Reseteando contraseña a "cona123"...');
    const hashedPassword = await bcrypt.hash('cona123', 10);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isActive: true, // Asegurar que esté activo
      },
    });

    console.log('✅ Contraseña reseteada exitosamente!');
    console.log('');
    console.log('📋 CREDENCIALES ACTUALIZADAS:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: cona123`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Estado: Activo`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetConaPassword();

