const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyImages() {
  try {
    console.log('\n🔍 VERIFICANDO IMÁGENES EN BASE DE DATOS...\n');

    // Obtener productos recientes
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        images: true,
        createdAt: true
      }
    });

    if (products.length === 0) {
      console.log('⚠️  No se encontraron productos en la base de datos.\n');
      return;
    }

    console.log(`📦 Productos encontrados: ${products.length}\n`);
    console.log('='.repeat(80));

    products.forEach((product, index) => {
      let imageCount = 0;
      let imageArray = [];
      let isValidJson = false;

      try {
        if (product.images) {
          imageArray = JSON.parse(product.images);
          isValidJson = Array.isArray(imageArray);
          imageCount = isValidJson ? imageArray.length : 0;
        }
      } catch (e) {
        console.error(`❌ Error parseando JSON para producto ${product.id}:`, e.message);
      }

      console.log(`\n📦 Producto #${index + 1}`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Título: ${product.title?.substring(0, 60)}${product.title?.length > 60 ? '...' : ''}`);
      console.log(`   Creado: ${product.createdAt.toISOString().split('T')[0]}`);
      console.log(`   Campo images: ${product.images ? '✅ Presente' : '❌ NULL'}`);
      
      if (product.images) {
        console.log(`   Tipo: ${typeof product.images}`);
        console.log(`   Longitud: ${product.images.length} caracteres`);
        console.log(`   Es JSON válido: ${isValidJson ? '✅' : '❌'}`);
        console.log(`   Cantidad de imágenes: ${imageCount}`);
        
        if (imageCount > 0) {
          console.log(`   ✅ Primeras ${Math.min(3, imageCount)} URLs:`);
          imageArray.slice(0, 3).forEach((url, idx) => {
            const truncated = url.length > 70 ? url.substring(0, 70) + '...' : url;
            console.log(`      ${idx + 1}. ${truncated}`);
          });
          if (imageCount > 3) {
            console.log(`      ... y ${imageCount - 3} más`);
          }
        } else {
          console.log(`   ⚠️  Array vacío o sin URLs válidas`);
        }
        
        // Mostrar preview del JSON (primeros 100 caracteres)
        const preview = product.images.length > 100 
          ? product.images.substring(0, 100) + '...' 
          : product.images;
        console.log(`   Preview JSON: ${preview}`);
      } else {
        console.log(`   ⚠️  Campo images es NULL`);
      }
      
      console.log('-'.repeat(80));
    });

    // Estadísticas generales
    console.log('\n📊 ESTADÍSTICAS GENERALES\n');
    
    const totalProducts = await prisma.product.count();
    const productsWithImages = await prisma.product.count({
      where: {
        images: {
          not: null
        }
      }
    });

    // Contar productos con múltiples imágenes
    const allProducts = await prisma.product.findMany({
      where: {
        images: {
          not: null
        }
      },
      select: {
        images: true
      }
    });

    let productsWithMultipleImages = 0;
    let productsWithSingleImage = 0;
    let productsWithInvalidJson = 0;

    allProducts.forEach(product => {
      try {
        if (product.images) {
          const parsed = JSON.parse(product.images);
          if (Array.isArray(parsed)) {
            if (parsed.length > 1) {
              productsWithMultipleImages++;
            } else if (parsed.length === 1) {
              productsWithSingleImage++;
            }
          } else {
            productsWithInvalidJson++;
          }
        }
      } catch (e) {
        productsWithInvalidJson++;
      }
    });

    console.log(`Total productos: ${totalProducts}`);
    console.log(`Productos con campo images: ${productsWithImages}`);
    console.log(`Productos sin imágenes: ${totalProducts - productsWithImages}`);
    console.log(`\nProductos con múltiples imágenes (>1): ${productsWithMultipleImages} ✅`);
    console.log(`Productos con una sola imagen: ${productsWithSingleImage}`);
    console.log(`Productos con JSON inválido: ${productsWithInvalidJson} ${productsWithInvalidJson > 0 ? '⚠️' : ''}`);

    // Verificar productos recientes (últimas 24 horas)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentProducts = await prisma.product.findMany({
      where: {
        createdAt: {
          gte: yesterday
        }
      },
      select: {
        id: true,
        images: true
      }
    });

    let recentWithMultiple = 0;
    recentProducts.forEach(product => {
      try {
        if (product.images) {
          const parsed = JSON.parse(product.images);
          if (Array.isArray(parsed) && parsed.length > 1) {
            recentWithMultiple++;
          }
        }
      } catch (e) {
        // Ignorar errores de parsing
      }
    });

    console.log(`\n📅 Últimas 24 horas:`);
    console.log(`   Productos creados: ${recentProducts.length}`);
    console.log(`   Con múltiples imágenes: ${recentWithMultiple} ${recentWithMultiple > 0 ? '✅' : '⚠️'}`);

    if (recentProducts.length > 0 && recentWithMultiple === 0) {
      console.log(`\n⚠️  ADVERTENCIA: Los productos recientes no tienen múltiples imágenes.`);
      console.log(`   Esto podría indicar que el fix no se ha aplicado aún o que los productos`);
      console.log(`   fuente solo tenían una imagen disponible.`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Verificación completada\n');

  } catch (error) {
    console.error('\n❌ Error durante la verificación:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImages();

