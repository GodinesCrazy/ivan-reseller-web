/**
 * p57 — Verificar y corregir publicación activa
 *        - Confirmar cuál listing está activo en ML
 *        - Actualizar descripción para reflejar plazo de 30 días prominentemente
 *        - Limpiar DB de listings duplicados/incoherentes
 */
import '../src/config/env';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import MarketplaceService from '../src/services/marketplace.service';

const prisma = new PrismaClient();

// Descripción definitiva con plazo prominente
const DESCRIPTION_30_DAYS = `⚠️ ENVÍO INTERNACIONAL — ENTREGA EN 20 A 30 DÍAS HÁBILES ⚠️
Este producto se despacha desde China directamente a tu domicilio en Chile.
Tiempo real de entrega: 20 a 30 días hábiles desde la confirmación del pago.

Soporte de escritorio decorativo con diseño de gatito minimalista. Elegante y funcional para mantener tu teléfono siempre a la vista.

Características:
- Material resistente de alta calidad
- Diseño de gatito minimalista
- Compatible con la mayoría de smartphones
- Estable y antideslizante
- Ideal para escritorio, velador o cocina

INFORMACIÓN DE ENVÍO:
- Despacho desde China con seguimiento internacional
- Tiempo estimado: 20 a 30 días hábiles
- El número de seguimiento se envía por mensaje dentro de las 48 horas

Ante cualquier consulta sobre el estado de tu pedido, responderemos en menos de 24 horas.`;

async function main() {
  const ms = new MarketplaceService();
  const creds = await ms.getCredentials(1, 'mercadolibre', 'production');
  const token = (creds?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // 1. Ver todos los listings en DB
  const dbListings = await prisma.marketplaceListing.findMany({
    where: { productId: 32722, marketplace: 'mercadolibre' },
    orderBy: { id: 'desc' },
  });

  console.log('=== LISTINGS EN DB ===');
  dbListings.forEach(l => console.log(` ${l.listingId} | db_status=${l.status}`));

  // 2. Verificar estado real en ML para cada uno no-superseded
  console.log('\n=== ESTADO REAL EN ML ===');
  const toCheck = dbListings.filter(l => l.status !== 'superseded');
  const mlStatuses: Record<string, any> = {};

  for (const l of toCheck) {
    try {
      const r = (await axios.get(`https://api.mercadolibre.com/items/${l.listingId}`, { headers: h })).data;
      mlStatuses[l.listingId] = r;
      console.log(` ${l.listingId}: ML=${r.status} sub=${JSON.stringify(r.sub_status)} mode=${r.shipping?.mode} ht=${r.shipping?.handling_time || 'none'}`);
    } catch(e: any) {
      console.log(` ${l.listingId}: ERROR ${e?.response?.status}`);
    }
  }

  // 3. Identificar el listing verdaderamente activo
  const activeListingId = Object.entries(mlStatuses).find(([, v]) => v.status === 'active' && v.sub_status?.length === 0)?.[0];
  console.log('\n=== LISTING ACTIVO ===', activeListingId || 'NINGUNO');

  if (!activeListingId) {
    console.log('❌ No hay listing activo en ML. Hay que republish.');
    return;
  }

  // 4. Sincronizar DB — marcar como superseded los que ML dice que no están activos
  for (const l of dbListings) {
    const mlData = mlStatuses[l.listingId];
    if (!mlData) continue; // ya superseded en DB
    const shouldBeActive = l.listingId === activeListingId;
    const dbCorrect = shouldBeActive ? l.status === 'active' : l.status === 'superseded' || l.status === 'closed';
    if (!dbCorrect) {
      const newStatus = shouldBeActive ? 'active' : 'superseded';
      await prisma.marketplaceListing.updateMany({
        where: { listingId: l.listingId },
        data: { status: newStatus },
      });
      console.log(` DB updated: ${l.listingId} → ${newStatus}`);
    }
  }

  // 5. Actualizar descripción del listing activo
  const activeItem = mlStatuses[activeListingId];
  console.log(`\n=== ACTUALIZANDO DESCRIPCIÓN DE ${activeListingId} ===`);

  // Ver descripción actual
  try {
    const descR = await axios.get(`https://api.mercadolibre.com/items/${activeListingId}/description`, { headers: h });
    const currentDesc = descR.data?.plain_text || '';
    console.log('Descripción actual (primeros 120 chars):', currentDesc.slice(0, 120));
    const hasEta = currentDesc.includes('días hábiles') || currentDesc.includes('30 días');
    if (hasEta) {
      console.log('✅ Descripción ya menciona el plazo. Actualizando a versión más prominente...');
    }
  } catch(e: any) {
    console.log('No hay descripción aún o error leyéndola:', e?.response?.status);
  }

  try {
    await axios.put(
      `https://api.mercadolibre.com/items/${activeListingId}/description`,
      { plain_text: DESCRIPTION_30_DAYS },
      { headers: h }
    );
    console.log('✅ Descripción actualizada con plazo de 30 días prominente');
  } catch(e: any) {
    console.log('❌ Error actualizando descripción:', e?.response?.data?.message || e?.message);
  }

  // 6. Estado final
  await new Promise(r => setTimeout(r, 2000));
  const final = (await axios.get(`https://api.mercadolibre.com/items/${activeListingId}`, { headers: h })).data;
  console.log('\n=== ESTADO FINAL ===');
  console.log(JSON.stringify({
    id: activeListingId,
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    handling_time: final.shipping?.handling_time || 'none (ML ignora para me2+CL)',
    logistic_type: final.shipping?.logistic_type,
    permalink: final.permalink,
  }, null, 2));

  if (final.status === 'active' && final.sub_status?.length === 0) {
    console.log('\n✅ Publicación activa y correcta.');
    console.log('⚠️  PENDIENTE: Para que ML muestre "llega en 30 días" en vez de "llega el miércoles",');
    console.log('   ve al Seller Center → Configuración → Envíos → Plazo de despacho → 30 días.');
    console.log('   La descripción del producto ya informa el plazo real al comprador.');
  }
}

main()
  .catch(e => console.error('FATAL:', e?.response?.data || e?.message))
  .finally(() => prisma.$disconnect());
