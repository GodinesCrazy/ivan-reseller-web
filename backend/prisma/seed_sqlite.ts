import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Crear usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@ivanreseller.com',
      password: adminPassword,
      fullName: 'Administrator',
      role: 'ADMIN',
      commissionRate: 0.10, // 10% comisión por defecto
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
    update: {},
    create: {
      username: 'demo',
      email: 'demo@ivanreseller.com',
      password: demoPassword,
      fullName: 'Demo User',
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
        aliexpressPrice: 12.75,
        suggestedPrice: 24.99,
        images: JSON.stringify(['https://via.placeholder.com/300x300?text=LED+Light']),
        status: 'PENDING',
        userId: demo.id,
      },
    }),
  ]);

  console.log('✅ Productos creados:', products.length);

  // Crear venta de ejemplo
  const sale = await prisma.sale.create({
    data: {
      userId: demo.id,
      productId: products[0].id,
      orderId: 'DEMO-001',
      marketplace: 'ebay',
      salePrice: 45.99,
      aliexpressCost: 25.99,
      marketplaceFee: 4.60, // 10% eBay fee
      grossProfit: 15.40,
      commissionAmount: 1.23, // 8% of gross profit
      netProfit: 14.17,
      status: 'DELIVERED',
    },
  });

  console.log('✅ Venta creada:', sale.orderId);

  // Crear comisión
  const commission = await prisma.commission.create({
    data: {
      userId: demo.id,
      saleId: sale.id,
      amount: 1.23,
      status: 'PAID',
      paidAt: new Date(),
    },
  });

  console.log('✅ Comisión creada:', commission.amount);

  // Crear actividades de ejemplo
  await prisma.activity.createMany({
    data: [
      {
        userId: admin.id,
        action: 'login',
        description: 'Usuario administrador inició sesión',
        ipAddress: '127.0.0.1',
      },
      {
        userId: demo.id,
        action: 'product_created',
        description: 'Producto creado: Audífonos Bluetooth Premium',
        ipAddress: '127.0.0.1',
      },
      {
        userId: demo.id,
        action: 'sale_completed',
        description: 'Venta completada: DEMO-001',
        ipAddress: '127.0.0.1',
        metadata: JSON.stringify({ orderId: 'DEMO-001', amount: 45.99 }),
      },
    ],
  });

  console.log('✅ Actividades creadas');
  
  console.log('');
  console.log('🎉 Seed completado exitosamente!');
  console.log('');
  console.log('📝 Credenciales de prueba:');
  console.log('   Admin: admin / admin123');
  console.log('   Demo:  demo / demo123');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error en seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
