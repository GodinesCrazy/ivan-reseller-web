/**
 * p56 — Cerrar MLC1913623551 y recrear con handling_time=25 correctamente en el POST
 *
 * Por qué: handling_time es immutable post-creación, y el listing actual lo tiene undefined.
 * Con handling_time=25, ML mostraría "llega en ~28-30 días" en vez de "llega el miércoles".
 */
import '../src/config/env';
import axios from 'axios';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';

const OLD_LISTING_ID = 'MLC1913623551';
const PRODUCT_ID = 32722;
const USER_ID = 1;
const CAT = 'MLC439917';
const GALLERY_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const prisma = new PrismaClient();

const IMAGES = [
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

const ATTRIBUTES = [
  { id: 'BRAND', value_name: 'Genérico' },
  { id: 'MODEL', value_name: 'Soporte Gatito' },
  { id: 'COLOR', value_name: 'Blanco' },
  { id: 'MATERIAL', value_name: 'Plástico' },
  { id: 'LINE', value_name: 'Universal' },
  { id: 'COMPATIBLE_DEVICES', value_name: 'Universal' },
  { id: 'MPN', value_name: 'N/A' },
  { id: 'SELLER_SKU', value_name: 'GATITO-STAND-001' },
  { id: 'EMPTY_GTIN_REASON', value_id: '17055160' },
];

async function main() {
  console.log('[P56] === Recrear listing con handling_time=25 ===\n');

  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  const token = (creds?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Paso 1: Verificar estado actual
  const cur = (await axios.get(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`, { headers: h })).data;
  console.log('[P56] Listing actual:', OLD_LISTING_ID, '| status:', cur.status, '| handling_time:', cur.shipping?.handling_time ?? 'NONE');

  // Paso 2: Cerrar listing anterior
  console.log('[P56] Cerrando listing anterior...');
  try {
    await axios.put(`https://api.mercadolibre.com/items/${OLD_LISTING_ID}`,
      { status: 'closed' },
      { headers: h }
    );
    console.log('✅ Listing cerrado');
    await prisma.marketplaceListing.updateMany({
      where: { listingId: OLD_LISTING_ID },
      data: { status: 'superseded' },
    });
    console.log('✅ DB actualizada: superseded');
  } catch(e: any) {
    console.log('❌ Error cerrando:', e?.response?.data?.message || e?.message);
    return;
  }

  // Paso 3: Upload images
  console.log('\n[P56] Subiendo imágenes...');
  const fs = await import('fs');
  const FormData = (await import('form-data')).default;
  const pictureIds: string[] = [];

  for (const imgPath of IMAGES) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imgPath));
    try {
      const r = await axios.post('https://api.mercadolibre.com/pictures?site_id=MLC',
        form,
        { headers: { ...h, ...form.getHeaders() } }
      );
      pictureIds.push(r.data.id);
      console.log('  ✅ Imagen subida:', r.data.id, '(', path.basename(imgPath), ')');
    } catch(e: any) {
      console.log('  ❌ Error subiendo imagen:', e?.response?.data?.message || e?.message);
    }
  }

  if (pictureIds.length === 0) {
    console.log('[P56] Sin imágenes — abortando');
    return;
  }

  // Paso 4: Crear nuevo listing con handling_time=25 en el POST
  console.log('\n[P56] Creando nuevo listing con handling_time=25...');
  const listingPayload = {
    title: 'Soporte Escritorio Teléfono Gatito Decorativo Minimalista',
    category_id: CAT,
    price: 11305,
    currency_id: 'CLP',
    available_quantity: 10,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    pictures: pictureIds.map(id => ({ id })),
    shipping: {
      mode: 'me2',
      free_shipping: false,
      handling_time: 25,         // ← CLAVE: incluido en POST
      local_pick_up: false,
    },
    attributes: ATTRIBUTES,
  };

  console.log('[P56] POST payload shipping:', JSON.stringify(listingPayload.shipping));

  let newItemId: string;
  try {
    const r = await axios.post('https://api.mercadolibre.com/items', listingPayload, { headers: h });
    newItemId = r.data.id;
    console.log(`\n[P56] ✅ Nuevo listing creado: ${newItemId}`);
    console.log('[P56] Status:', r.data.status, r.data.sub_status);
    console.log('[P56] handling_time en respuesta:', r.data.shipping?.handling_time ?? 'NONE');
  } catch(e: any) {
    const d = e?.response?.data;
    console.log('[P56] ❌ POST /items falló:', d?.message || e?.message);
    console.log('  Causes:', JSON.stringify(d?.cause?.map((c: any) => `${c.code}: ${c.message}`)));
    return;
  }

  // Verificar handling_time antes de cualquier otro patch
  await new Promise(r => setTimeout(r, 2000));
  const freshCheck = (await axios.get(`https://api.mercadolibre.com/items/${newItemId}`, { headers: h })).data;
  console.log('\n[P56] Verificación inmediata:');
  console.log('  handling_time:', freshCheck.shipping?.handling_time ?? 'NONE ← ML lo ignoró');
  console.log('  status:', freshCheck.status, freshCheck.sub_status);
  console.log('  mode:', freshCheck.shipping?.mode);

  if (!freshCheck.shipping?.handling_time) {
    console.log('\n⚠️  ML no guarda handling_time para me2+MLC. Ver estrategia alternativa abajo.');
  }

  // Paso 5: Agregar descripción
  console.log('\n[P56] Agregando descripción...');
  try {
    await axios.post(`https://api.mercadolibre.com/items/${newItemId}/description`,
      { plain_text: DESCRIPTION },
      { headers: h }
    );
    console.log('✅ Descripción agregada');
  } catch(e: any) {
    console.log('❌ Descripción:', e?.response?.data?.message || e?.message);
  }

  // Paso 6: Guardar en DB
  await prisma.marketplaceListing.create({
    data: {
      productId: PRODUCT_ID,
      userId: USER_ID,
      marketplace: 'mercadolibre',
      listingId: newItemId,
      listingUrl: freshCheck.permalink || `https://articulo.mercadolibre.cl/MLC-${newItemId.replace('MLC', '')}`,
      status: freshCheck.status || 'under_review',
      supplierUrl: 'https://www.aliexpress.com/item/3256810079300907.html',
    },
  });
  console.log('[P56] Listing guardado en DB');

  // Paso 7: Patch de atributos si está en waiting_for_patch
  if (freshCheck.sub_status?.includes('waiting_for_patch')) {
    console.log('\n[P56] Applying attribute patch + waiting for review...');
    await new Promise(r => setTimeout(r, 3000));
    const patchAttrs = [
      ...ATTRIBUTES,
      { id: 'GTIN', value_name: '' },
    ];
    try {
      await axios.put(`https://api.mercadolibre.com/items/${newItemId}`,
        { attributes: patchAttrs },
        { headers: h }
      );
      console.log('✅ Attributes patch applied');
    } catch(e: any) {
      console.log('❌ Attribute patch:', e?.response?.data?.message);
    }
  }

  // Estado final
  await new Promise(r => setTimeout(r, 3000));
  const final = (await axios.get(`https://api.mercadolibre.com/items/${newItemId}`, { headers: h })).data;
  console.log('\n[P56] Estado final:');
  console.log(JSON.stringify({
    id: newItemId,
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    handling_time: final.shipping?.handling_time ?? 'NONE',
    logistic_type: final.shipping?.logistic_type,
    permalink: final.permalink,
  }, null, 2));

  if (final.status === 'active' && final.sub_status?.length === 0) {
    console.log('\n🎉 LISTING ACTIVO');
    if (!final.shipping?.handling_time) {
      console.log('⚠️  PERO handling_time sigue siendo NONE — ML ignora este campo para me2 en Chile.');
      console.log('   La descripción informa el ETA real (20-30 días hábiles).');
      console.log('   Para mostrar ETA correcto, necesitamos modo de envío distinto a me2.');
    }
  }
}

main()
  .catch(e => console.error('[P56] FATAL:', e?.response?.data || e?.message))
  .finally(() => prisma.$disconnect());
