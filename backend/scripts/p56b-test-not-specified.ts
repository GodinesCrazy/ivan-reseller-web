/**
 * p56b — Test: publicar con mode:not_specified en MLC439917
 *         ¿Genera forbidden inmediato o sobrevive?
 *         Si sobrevive → muestra "Entrega a acordar" en vez de "llega el miércoles"
 *         Si forbidden → necesitamos otra estrategia
 */
import '../src/config/env';
import axios from 'axios';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';

const PRODUCT_ID = 32722;
const USER_ID = 1;
const CAT = 'MLC439917';
const GALLERY_DIR = path.resolve(__dirname, '../../artifacts/ml-image-packs/product-32722/gallery');
const prisma = new PrismaClient();

const IMAGES = [
  path.join(GALLERY_DIR, 'img_2_processed.jpg'),
  path.join(GALLERY_DIR, 'img_3_processed.jpg'),
];

const DESCRIPTION = `Soporte de escritorio decorativo con diseño de gatito minimalista.

INFORMACIÓN DE ENVÍO INTERNACIONAL:
Producto despachado desde China directamente a Chile.
Tiempo estimado de entrega: 20 a 30 días hábiles desde la confirmación del pago.
Enviado con número de seguimiento internacional.

Ante cualquier consulta, respuesta en menos de 24 horas.`;

async function main() {
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(USER_ID, 'mercadolibre', 'production');
  const token = (creds?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Upload images
  const fs = await import('fs');
  const FormData = (await import('form-data')).default;
  const pictureIds: string[] = [];
  for (const imgPath of IMAGES) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imgPath));
    const r = await axios.post('https://api.mercadolibre.com/pictures?site_id=MLC', form, { headers: { ...h, ...form.getHeaders() } });
    pictureIds.push(r.data.id);
  }

  // POST with not_specified
  console.log('[P56B] Publicando con mode: not_specified...');
  const payload = {
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
      mode: 'not_specified',
      free_shipping: false,
      local_pick_up: false,
    },
    attributes: [
      { id: 'BRAND', value_name: 'Genérico' },
      { id: 'MODEL', value_name: 'Soporte Gatito' },
      { id: 'EMPTY_GTIN_REASON', value_id: '17055160' },
      { id: 'MPN', value_name: 'N/A' },
      { id: 'SELLER_SKU', value_name: 'GATITO-STAND-001' },
    ],
  };

  let newId: string;
  try {
    const r = await axios.post('https://api.mercadolibre.com/items', payload, { headers: h });
    newId = r.data.id;
    console.log(`✅ Creado: ${newId}`);
    console.log('   status:', r.data.status, r.data.sub_status);
    console.log('   shipping.mode:', r.data.shipping?.mode);
    console.log('   handling_time:', r.data.shipping?.handling_time ?? 'none');
  } catch(e: any) {
    const d = e?.response?.data;
    console.log('❌ POST falló:', d?.message);
    console.log('  Causes:', d?.cause?.map((c: any) => `${c.code}:${c.message}`).join(', '));
    return;
  }

  // Poll por 30 segundos para ver si va a forbidden
  console.log('\n[P56B] Monitoreando por 30s...');
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const check = (await axios.get(`https://api.mercadolibre.com/items/${newId}`, { headers: h })).data;
    console.log(`[Poll ${i+1}] status=${check.status} sub=${JSON.stringify(check.sub_status)} mode=${check.shipping?.mode}`);
    if (check.status === 'active' && check.sub_status?.length === 0) {
      console.log('\n✅ not_specified SOBREVIVE en MLC439917 → muestra "Entrega a acordar"');
      // Agregar descripción y cerrar el de prueba
      await axios.post(`https://api.mercadolibre.com/items/${newId}/description`, { plain_text: DESCRIPTION }, { headers: h });
      // Guardar en DB
      await prisma.marketplaceListing.create({
        data: { productId: PRODUCT_ID, userId: USER_ID, marketplace: 'mercadolibre', listingId: newId, listingUrl: check.permalink || '', status: 'active', supplierUrl: 'https://www.aliexpress.com/item/3256810079300907.html' },
      });
      console.log(`URL: ${check.permalink}`);
      // Cerrar el me2 anterior (MLC1913646221)
      try {
        await axios.put('https://api.mercadolibre.com/items/MLC1913646221', { status: 'closed' }, { headers: h });
        await prisma.marketplaceListing.updateMany({ where: { listingId: 'MLC1913646221' }, data: { status: 'superseded' } });
        console.log('✅ MLC1913646221 cerrado y superseded');
      } catch(e2: any) {
        console.log('⚠️ No se pudo cerrar MLC1913646221:', e2?.response?.data?.message);
      }
      return;
    }
    if (check.sub_status?.includes('forbidden') || check.status === 'under_review' && check.sub_status?.includes('forbidden')) {
      console.log('\n❌ FORBIDDEN — not_specified genera forbidden por mandatory_settings.mode=me2');
      // Cerrar este test listing
      await axios.put(`https://api.mercadolibre.com/items/${newId}`, { status: 'closed' }, { headers: h });
      console.log('  Test listing cerrado. Mantenemos MLC1913646221 (me2).');
      console.log('  Estrategia final: usar me2 + descripción prominente de ETA internacional.');
      return;
    }
  }

  const final = (await axios.get(`https://api.mercadolibre.com/items/${newId}`, { headers: h })).data;
  console.log('\nEstado final después de 30s:', final.status, JSON.stringify(final.sub_status));
}

main()
  .catch(e => console.error('FATAL:', e?.response?.data || e?.message))
  .finally(() => prisma.$disconnect());
