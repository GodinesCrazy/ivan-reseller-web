/**
 * p54i — Agregar descripción faltante a MLC1913623551
 *         (descripción no fue agregada porque me2 sobrevivió en p54)
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913623551';
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

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Verificar estado actual
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('[P54I] Estado actual:', item.status, JSON.stringify(item.sub_status));
  console.log('[P54I] Descripciones actuales:', JSON.stringify(item.descriptions));

  // Agregar descripción
  console.log('[P54I] Agregando descripción...');
  try {
    const res = await axios.post(
      `https://api.mercadolibre.com/items/${LISTING_ID}/description`,
      { plain_text: DESCRIPTION },
      { headers: h }
    );
    console.log('✅ Descripción creada, HTTP:', res.status);
  } catch(e: any) {
    if (e?.response?.status === 409 || e?.response?.data?.message?.includes('exists')) {
      // Ya existe, usar PUT
      console.log('[P54I] Descripción ya existe, actualizando con PUT...');
      try {
        const res = await axios.put(
          `https://api.mercadolibre.com/items/${LISTING_ID}/description`,
          { plain_text: DESCRIPTION },
          { headers: h }
        );
        console.log('✅ Descripción actualizada, HTTP:', res.status);
      } catch(e2: any) {
        console.log('❌ PUT also failed:', e2?.response?.data?.message || e2?.message);
        return;
      }
    } else {
      console.log('❌ Error:', e?.response?.data?.message || e?.message);
      console.log('  Full:', JSON.stringify(e?.response?.data));
      return;
    }
  }

  // Poll para ver si cambia a active
  console.log('[P54I] Esperando que ML revise...');
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const check = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
    console.log(`[Poll ${i+1}] status=${check.status} sub=${JSON.stringify(check.sub_status)}`);
    if (check.status === 'active' && check.sub_status?.length === 0) {
      console.log('\n🎉 LISTING ACTIVO — DONE');
      console.log('URL:', check.permalink);
      return;
    }
    if (!check.sub_status?.includes('waiting_for_patch') && i >= 1) {
      console.log('[P54I] Sub_status cambió, detalles:');
      console.log('  descriptions:', JSON.stringify(check.descriptions));
      console.log('  tags:', JSON.stringify(check.tags));
    }
  }

  // Si sigue en waiting_for_patch, hacer diagnóstico final
  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  if (final.sub_status?.includes('waiting_for_patch')) {
    console.log('\n[P54I] Sigue en waiting_for_patch. Atributos presentes:');
    final.attributes?.forEach((a: any) => console.log(`  ${a.id}: ${a.value_name || a.value_id || JSON.stringify(a.value_struct)}`));
    console.log('  descriptions:', JSON.stringify(final.descriptions));
    console.log('  tags:', JSON.stringify(final.tags));
  }
}

go().catch(e => console.error('[P54I] FATAL:', e?.response?.data || e?.message));
