/**
 * p54 — Republicar en categoría MLC439917 (Apoya Celulares)
 *
 * Por qué nueva categoría:
 *  - MLC3530 tiene `shipping.lost_me2_by_catalog` → ML revierte me2→not_specified → forbidden
 *  - MLC439917 (Apoya Celulares) solo tiene `lost_me1_by_user` (cosmético, sin impacto)
 *  - me2 + handling_time:25 debería sobrevivir en MLC439917
 */
import '../src/config/env';
import axios from 'axios';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';
import { MercadoLibreService } from '../src/services/mercadolibre.service';

const PRODUCT_ID = 32722;
const USER_ID = 1;
const NEW_CATEGORY = 'MLC439917'; // Apoya Celulares — sin lost_me2_by_catalog
const GALLERY_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const prisma = new PrismaClient();

const CLEAN_IMAGES = [
  path.join(GALLERY_DIR, 'img_2_processed.jpg'),
  path.join(GALLERY_DIR, 'img_3_processed.jpg'),
  path.join(GALLERY_DIR, 'img_1_processed.jpg'),
];

const DESCRIPTION = `Soporte de escritorio decorativo con diseño de gatito minimalista. Elegante y funcional para mantener tu teléfono siempre a la vista.

Características:
- Material resistente de alta calidad
- Diseño de gatito minimalista
- Compatible con la mayoría de smartphones
- Estable y antideslizante
- Ideal para escritorio, velador o cocina

INFORMACIÓN DE ENVÍO:
Este producto se despacha desde el exterior (China) directamente a tu domicilio en Chile.
Tiempo estimado de entrega: 20 a 30 días hábiles desde la confirmación del pago.
El producto es enviado de forma segura con número de seguimiento internacional.

Ante cualquier consulta sobre el estado de tu pedido, responderemos en menos de 24 horas.`;

async function main() {
  console.log(`\n[P54] === Republicar en categoría ${NEW_CATEGORY} (Apoya Celulares) ===\n`);

  // Marcar listings anteriores como superseded
  const old = await prisma.marketplaceListing.findMany({
    where: { productId: PRODUCT_ID, marketplace: 'mercadolibre', NOT: { status: 'superseded' } },
  });
  if (old.length > 0) {
    await prisma.marketplaceListing.updateMany({
      where: { id: { in: old.map(r => r.id) } },
      data: { status: 'superseded' },
    });
    console.log(`[P54] ${old.length} listings anteriores marcados como superseded:`);
    old.forEach(r => console.log(`  ${r.listingId} → superseded`));
  }

  // Credenciales
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  if (!creds?.isActive) throw new Error('ML credentials not found');
  const mlSvc = new MercadoLibreService({
    ...creds.credentials, siteId: (creds.credentials as any).siteId || 'MLC',
  } as any);
  try {
    const r = await mlSvc.refreshAccessToken();
    (mlSvc as any).credentials.accessToken = r.accessToken;
    console.log('[P54] Token refreshed');
  } catch(e: any) { console.warn('[P54] Token refresh failed (non-fatal):', e?.message); }
  const token = (mlSvc as any).credentials.accessToken as string;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  console.log(`[P54] Categoría: ${NEW_CATEGORY} (Apoya Celulares)`);
  console.log(`[P54] Shipping: me2 + handling_time:25 + free_shipping:false`);
  console.log(`[P54] Precio: 11305 CLP`);
  console.log(`[P54] Imágenes: ${CLEAN_IMAGES.length} (pipeline V3)`);

  // Crear el listing
  console.log('\n[P54] Creando listing...');
  const result = await mlSvc.createListing({
    title: 'Soporte Escritorio Teléfono Gatito Decorativo Minimalista',
    description: DESCRIPTION,
    categoryId: NEW_CATEGORY,
    price: 11305,
    quantity: 10,
    condition: 'new',
    images: CLEAN_IMAGES,
    shipping: { mode: 'me2', freeShipping: false, handlingTime: 25 },
    attributes: [
      { id: 'BRAND', value: 'Genérico' },
      { id: 'MODEL', value: 'Soporte Gatito' },
    ],
  });

  if (!result.success || !result.itemId) {
    console.error('[P54] ❌ Publicación falló:', result);
    return;
  }

  const itemId = result.itemId;
  console.log(`\n[P54] ✅ Listing creado: ${itemId}`);
  console.log(`[P54] Permalink: ${result.permalink}`);
  console.log(`[P54] Status inicial: ${result.status}`);

  // Guardar en DB
  await prisma.marketplaceListing.create({
    data: {
      productId: PRODUCT_ID,
      userId: USER_ID,
      marketplace: 'mercadolibre',
      listingId: itemId,
      listingUrl: result.permalink || '',
      status: result.status || 'active',
      supplierUrl: 'https://www.aliexpress.com/item/3256810079300907.html',
    },
  });
  console.log('[P54] Listing guardado en DB');

  // Verificar shipping después de creación
  console.log('\n[P54] Verificando shipping mode post-creación...');
  await new Promise(r => setTimeout(r, 3000));
  const check = (await axios.get(`https://api.mercadolibre.com/items/${itemId}`, { headers: h })).data;
  console.log(JSON.stringify({
    status: check.status,
    sub_status: check.sub_status,
    shipping_mode: check.shipping?.mode,
    shipping_handling: check.shipping?.handling_time,
    logistic_type: check.shipping?.logistic_type,
    category_id: check.category_id,
  }, null, 2));

  if (check.shipping?.mode === 'me2') {
    console.log('\n[P54] 🎉 me2 SOBREVIVIÓ — nueva categoría funciona');
  } else {
    console.log(`\n[P54] ⚠️  shipping revertido a ${check.shipping?.mode} — igual que antes`);
    console.log('[P54] Intentando actualizar descripción con info de envío...');
    try {
      await axios.put(
        `https://api.mercadolibre.com/items/${itemId}/description`,
        { plain_text: DESCRIPTION },
        { headers: h }
      );
      console.log('[P54] ✅ Descripción con info de envío aplicada');
    } catch(e: any) {
      console.log('[P54] Descripción update:', e?.response?.data?.message || e?.message);
    }
  }

  console.log(`\n[P54] URL: ${result.permalink}`);
}

main()
  .catch(e => console.error('[P54] FATAL:', e?.response?.data || e?.message))
  .finally(() => prisma.$disconnect());
