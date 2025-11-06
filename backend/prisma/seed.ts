import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Crear usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      password: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      username: 'admin',
      email: 'admin@ivanreseller.com',
      password: adminPassword,
      role: 'ADMIN',
      commissionRate: 0.15, // ✅ 15% comisión por defecto
      fixedMonthlyCost: 17.0, // ✅ $17 costo fijo mensual
      balance: 0,
      totalEarnings: 0,
      isActive: true,
    },
  });

  console.log('✅ Usuario admin creado:', admin.username);

  // Crear usuario demo
  const demoPassword = bcrypt.hashSync('demo123', 10);
  
  const demo = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {
      password: demoPassword,
      role: 'USER',
      isActive: true,
    },
    create: {
      username: 'demo',
      email: 'demo@ivanreseller.com',
      password: demoPassword,
      role: 'USER',
      commissionRate: 0.15, // ✅ 15% comisión por defecto
      fixedMonthlyCost: 17.0, // ✅ $17 costo fijo mensual
      balance: 0,
      totalEarnings: 0,
      isActive: true,
    },
  });

  console.log('✅ Usuario demo creado:', demo.username);

  // Crear productos de ejemplo
  const products = await Promise.all([
    prisma.product.create({
      data: {
        title: 'Audífonos Bluetooth Premium',
        description: 'Audífonos inalámbricos con cancelación de ruido y hasta 30 horas de batería',
        aliexpressUrl: 'https://aliexpress.com/item/example1',
        aliexpressPrice: 25.99,
        suggestedPrice: 45.99,
        category: 'Electronics',
        images: JSON.stringify(['https://via.placeholder.com/300x300?text=Audifonos']),
        status: 'APPROVED',
        userId: demo.id,
      },
    }),
    prisma.product.create({
      data: {
        title: 'Smartwatch Deportivo',
        description: 'Reloj inteligente resistente al agua con monitor de ritmo cardíaco',
        aliexpressUrl: 'https://aliexpress.com/item/example2',
        aliexpressPrice: 35.50,
        suggestedPrice: 69.99,
        category: 'Electronics',
        images: JSON.stringify(['https://via.placeholder.com/300x300?text=Smartwatch']),
        status: 'APPROVED',
        userId: demo.id,
      },
    }),
    prisma.product.create({
      data: {
        title: 'Lámpara LED Inteligente',
        description: 'Bombilla WiFi RGB controlable desde smartphone con 16 millones de colores',
        aliexpressUrl: 'https://aliexpress.com/item/example3',
        aliexpressPrice: 12.99,
        suggestedPrice: 24.99,
        category: 'Home & Garden',
        images: JSON.stringify(['https://via.placeholder.com/300x300?text=Lampara']),
        status: 'PENDING',
        userId: demo.id,
      },
    }),
  ]);

  console.log(`✅ ${products.length} productos de ejemplo creados`);

  // Crear ventas de ejemplo
  const sales = await Promise.all([
    prisma.sale.create({
      data: {
        orderId: 'ORD-2025-001',
        productId: products[0].id,
        userId: demo.id,
        marketplace: 'ebay',
        salePrice: 45.99,
        aliexpressCost: 25.99,
        marketplaceFee: 4.60,
        grossProfit: 20.00,
        commissionAmount: 1.60, // 8% de 20
        netProfit: 13.40,
        status: 'DELIVERED',
      },
    }),
    prisma.sale.create({
      data: {
        orderId: 'ORD-2025-002',
        productId: products[1].id,
        userId: demo.id,
        marketplace: 'mercadolibre',
        salePrice: 69.99,
        aliexpressCost: 35.50,
        marketplaceFee: 7.00,
        grossProfit: 34.49,
        commissionAmount: 2.76, // 8% de 34.49
        netProfit: 24.04,
        status: 'PROCESSING',
      },
    }),
  ]);

  console.log(`✅ ${sales.length} ventas de ejemplo creadas`);

  // Crear comisiones pendientes
  const commissions = await Promise.all([
    prisma.commission.create({
      data: {
        saleId: sales[0].id,
        userId: demo.id,
        amount: 1.60,
        status: 'PAID',
        paidAt: new Date(),
      },
    }),
    prisma.commission.create({
      data: {
        saleId: sales[1].id,
        userId: demo.id,
        amount: 2.76,
        status: 'PENDING',
      },
    }),
  ]);

  console.log(`✅ ${commissions.length} comisiones creadas`);

  console.log('\n🎉 Seed completado exitosamente!');
  console.log('\n📝 Credenciales de acceso:');
  console.log('   Admin: admin / admin123');
  console.log('   Demo:  demo / demo123');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
