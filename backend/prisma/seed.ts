import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Crear usuario admin por defecto
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@ivanreseller.com',
      password: adminPassword,
      role: 'ADMIN',
      commissionRate: 0.10, // 10% comisión por defecto
      balance: 0,
      totalEarnings: 0,
      isActive: true,
    },
  });

  console.log('✅ Usuario admin creado:', admin.username);

  // Crear usuario demo
  const demoPassword = await bcrypt.hash('demo123', 10);
  
  const demo = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@ivanreseller.com',
      password: demoPassword,
      role: 'USER',
      commissionRate: 0.08, // 8% comisión para usuarios
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
        currency: 'USD',
        imageUrl: 'https://via.placeholder.com/300x300?text=Audifonos',
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
        currency: 'USD',
        imageUrl: 'https://via.placeholder.com/300x300?text=Smartwatch',
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
        currency: 'USD',
        imageUrl: 'https://via.placeholder.com/300x300?text=Lampara',
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
        marketplace: 'EBAY',
        salePrice: 45.99,
        costPrice: 25.99,
        grossProfit: 20.00,
        userCommission: 1.60, // 8% de 20
        adminCommission: 0.40, // 2% de 20
        platformFees: 4.60,
        netProfit: 13.40,
        currency: 'USD',
        buyerEmail: 'buyer1@example.com',
        shippingAddress: '123 Main St, New York, NY 10001',
        status: 'COMPLETED',
      },
    }),
    prisma.sale.create({
      data: {
        orderId: 'ORD-2025-002',
        productId: products[1].id,
        userId: demo.id,
        marketplace: 'MERCADOLIBRE',
        salePrice: 69.99,
        costPrice: 35.50,
        grossProfit: 34.49,
        userCommission: 2.76, // 8% de 34.49
        adminCommission: 0.69, // 2% de 34.49
        platformFees: 7.00,
        netProfit: 24.04,
        currency: 'USD',
        buyerEmail: 'buyer2@example.com',
        shippingAddress: 'Av. Libertador 456, Buenos Aires',
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
        currency: 'USD',
        status: 'PAID',
        paidAt: new Date(),
      },
    }),
    prisma.commission.create({
      data: {
        saleId: sales[1].id,
        userId: demo.id,
        amount: 2.76,
        currency: 'USD',
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
