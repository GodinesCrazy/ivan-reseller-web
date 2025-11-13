/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Crear usuario admin por defecto
  const adminPassword = bcrypt.hashSync('admin123', 10);
  
  // Verificar si existe primero para evitar problemas con columna plan
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  
  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          password: adminPassword,
          role: 'ADMIN',
          isActive: true,
        },
      })
    : await prisma.user.create({
        data: {
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
  
  // Verificar si existe primero para evitar problemas con columna plan
  const existingDemo = await prisma.user.findUnique({
    where: { username: 'demo' },
    select: { id: true },
  });
  
  const demo = existingDemo
    ? await prisma.user.update({
        where: { id: existingDemo.id },
        data: {
          password: demoPassword,
          role: 'USER',
          isActive: true,
        },
      })
    : await prisma.user.create({
        data: {
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

  // Crear productos de ejemplo (con manejo de errores)
  let products: Array<{ id: number }> = [];
  try {
    products = await Promise.all([
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
  } catch (productError: any) {
    console.warn('⚠️  Error creando productos de ejemplo:', productError.message?.substring(0, 200));
    console.log('   Continuando sin productos de ejemplo...');
    products = [];
  }

  // Crear ventas de ejemplo (solo si hay productos)
  let sales: Array<{ id: number }> = [];
  if (products.length > 0) {
    try {
      sales = await Promise.all([
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
    } catch (saleError: any) {
      console.warn('⚠️  Error creando ventas de ejemplo:', saleError.message?.substring(0, 200));
      console.log('   Continuando sin ventas de ejemplo...');
      sales = [];
    }
  }

  // Crear comisiones pendientes (solo si hay ventas)
  let commissions: Array<{ id: number }> = [];
  if (sales.length > 0) {
    try {
      commissions = await Promise.all([
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
    } catch (commissionError: any) {
      console.warn('⚠️  Error creando comisiones de ejemplo:', commissionError.message?.substring(0, 200));
      console.log('   Continuando sin comisiones de ejemplo...');
    }
  }

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
