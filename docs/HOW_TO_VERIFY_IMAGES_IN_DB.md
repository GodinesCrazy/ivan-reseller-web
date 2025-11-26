# Cómo Verificar que el Campo `images` Contiene JSON con Array de URLs

## Opción 1: Usar Prisma Studio (Más Fácil) ⭐ RECOMENDADO

Prisma Studio es una interfaz gráfica para ver y editar datos en la base de datos.

### Pasos:

1. **Abrir terminal en la carpeta del backend:**
```bash
cd backend
```

2. **Ejecutar Prisma Studio:**
```bash
npx prisma studio
```

3. **En el navegador se abrirá** `http://localhost:5555`

4. **Navegar a la tabla `Product`**

5. **Buscar un producto recién importado** (puedes filtrar por fecha de creación)

6. **Ver el campo `images`** - Debería mostrar algo como:
```json
["https://ae01.alicdn.com/kf/...", "https://ae01.alicdn.com/kf/...", "https://ae01.alicdn.com/kf/..."]
```

### Ventajas:
- ✅ Interfaz visual fácil de usar
- ✅ No requiere conocimiento de SQL
- ✅ Puedes editar datos directamente si es necesario

---

## Opción 2: Consulta SQL Directa (PostgreSQL)

Si tienes acceso directo a PostgreSQL (Railway, local, etc.):

### Conectarse a la base de datos:

```bash
# Si es local
psql -U postgres -d railway

# O usando la URL de conexión
psql "postgresql://postgres:password@host:5432/railway"
```

### Consulta SQL:

```sql
-- Ver todos los productos con sus imágenes
SELECT 
  id,
  title,
  images,
  created_at
FROM products
ORDER BY created_at DESC
LIMIT 10;

-- Ver solo productos con múltiples imágenes (más de 1 URL)
SELECT 
  id,
  title,
  images,
  json_array_length(images::json) as image_count,
  created_at
FROM products
WHERE images IS NOT NULL
  AND images != '[]'
  AND json_array_length(images::json) > 1
ORDER BY created_at DESC;

-- Ver un producto específico por ID
SELECT 
  id,
  title,
  images,
  json_array_length(images::json) as image_count
FROM products
WHERE id = 123; -- Reemplazar con ID real

-- Ver las URLs individuales de un producto
SELECT 
  id,
  title,
  json_array_elements_text(images::json) as image_url
FROM products
WHERE id = 123; -- Reemplazar con ID real
```

### Verificar formato JSON:

```sql
-- Verificar que es JSON válido y contar elementos
SELECT 
  id,
  title,
  images,
  json_typeof(images::json) as json_type,
  json_array_length(images::json) as image_count
FROM products
WHERE id = 123;
```

---

## Opción 3: Usar el Endpoint de la API

### GET /api/products/:id

```bash
# Usar curl o Postman
curl -X GET "https://www.ivanreseller.com/api/products/123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "Producto ejemplo",
    "images": "[\"https://...\", \"https://...\", \"https://...\"]",
    "imageUrl": "https://...",
    ...
  }
}
```

### GET /api/products/:id/preview

Este endpoint parsea el JSON y retorna el array directamente:

```bash
curl -X GET "https://www.ivanreseller.com/api/products/123/preview?marketplace=ebay" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "images": [
      "https://ae01.alicdn.com/kf/...",
      "https://ae01.alicdn.com/kf/...",
      "https://ae01.alicdn.com/kf/..."
    ],
    ...
  }
}
```

---

## Opción 4: Crear Script Temporal de Verificación

Crear un script Node.js para verificar:

### `backend/scripts/verify-images.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyImages() {
  try {
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

    console.log('\n=== VERIFICACIÓN DE IMÁGENES ===\n');

    products.forEach(product => {
      let imageCount = 0;
      let imageArray = [];

      try {
        if (product.images) {
          imageArray = JSON.parse(product.images);
          imageCount = Array.isArray(imageArray) ? imageArray.length : 0;
        }
      } catch (e) {
        console.error(`❌ Error parseando JSON para producto ${product.id}:`, e.message);
      }

      console.log(`Producto ID: ${product.id}`);
      console.log(`Título: ${product.title?.substring(0, 50)}...`);
      console.log(`Imágenes encontradas: ${imageCount}`);
      
      if (imageCount > 0) {
        console.log(`✅ Primeras 3 URLs:`);
        imageArray.slice(0, 3).forEach((url, idx) => {
          console.log(`   ${idx + 1}. ${url.substring(0, 80)}...`);
        });
      } else {
        console.log(`⚠️  No hay imágenes o formato inválido`);
      }
      
      console.log(`Raw images field: ${product.images?.substring(0, 100)}...`);
      console.log('---\n');
    });

    // Estadísticas
    const totalProducts = await prisma.product.count();
    const productsWithImages = await prisma.product.count({
      where: {
        images: {
          not: null
        }
      }
    });

    console.log(`\n=== ESTADÍSTICAS ===`);
    console.log(`Total productos: ${totalProducts}`);
    console.log(`Productos con imágenes: ${productsWithImages}`);
    console.log(`Productos sin imágenes: ${totalProducts - productsWithImages}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImages();
```

### Ejecutar el script:

```bash
cd backend
node scripts/verify-images.js
```

---

## Opción 5: Verificar en los Logs del Backend

Si el backend tiene logging habilitado, puedes verificar en los logs cuando se crea un producto:

### Buscar en logs:

```bash
# Si usas Railway
railway logs

# O en los logs del servidor
grep "Product created" logs/app.log
```

### Log esperado:

```
Product created: {
  productId: 123,
  title: "Producto ejemplo",
  imagesCount: 5,
  images: ["https://...", "https://...", ...]
}
```

---

## Verificación Rápida: Checklist

Después de importar un producto nuevo:

- [ ] El campo `images` NO es `null`
- [ ] El campo `images` NO es `"[]"` (array vacío)
- [ ] El campo `images` es un JSON válido (empieza con `[` y termina con `]`)
- [ ] El JSON contiene múltiples URLs (más de 1 elemento)
- [ ] Las URLs son válidas (empiezan con `https://` o `http://`)
- [ ] El endpoint `/api/products/:id/preview` retorna `images` como array

---

## Ejemplo de Verificación Exitosa

### En Prisma Studio o SQL:

```json
images: "[\"https://ae01.alicdn.com/kf/abc123.jpg\", \"https://ae01.alicdn.com/kf/def456.jpg\", \"https://ae01.alicdn.com/kf/ghi789.jpg\"]"
```

### En la API:

```json
{
  "images": [
    "https://ae01.alicdn.com/kf/abc123.jpg",
    "https://ae01.alicdn.com/kf/def456.jpg",
    "https://ae01.alicdn.com/kf/ghi789.jpg"
  ]
}
```

### En la Preview:

- ✅ Se muestran 3 imágenes en la galería
- ✅ Hay navegación (flechas o thumbnails)
- ✅ Contador muestra "1 / 3", "2 / 3", etc.

---

## Troubleshooting

### Si `images` es `null`:
- El producto fue creado antes del fix
- O hubo un error en la importación

### Si `images` es `"[]"`:
- El scraper no encontró imágenes
- O el producto fuente no tenía imágenes

### Si `images` es un string simple (no array):
- Formato antiguo, necesita migración
- O error en `buildImagePayload()`

### Si solo hay 1 imagen en el array:
- El producto fuente solo tenía 1 imagen
- O el scraper solo encontró 1 imagen válida

