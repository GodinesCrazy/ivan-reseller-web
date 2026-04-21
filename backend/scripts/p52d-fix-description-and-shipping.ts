/**
 * p52d — Actualizar descripción con info de envío internacional + intentar me2 con dimensiones
 *
 * ML no permite cambiar shipping.mode en un listing activo via PUT simple.
 * Estrategia:
 *   1. Actualizar descripción para incluir info de envío real (internacional, ~25 días)
 *   2. Intentar me2 con dimensiones del producto (me2 puede requerir peso/dimensiones para activarse)
 */
import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC3838173870';
const USER_ID = 1;
const HANDLING_DAYS = 25;

// Descripción honesta con información de envío internacional
const DESCRIPTION_WITH_SHIPPING = `Soporte de escritorio decorativo con diseño de gatito minimalista. Elegante y funcional para mantener tu teléfono siempre a la vista.

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
  const c = await svc.getCredentials(USER_ID, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  console.log('\n[P52D] === Actualizar descripción + intentar me2 con dimensiones ===\n');

  // 1. Actualizar descripción
  console.log('[P52D] Actualizando descripción con info de envío...');
  try {
    await axios.put(
      `https://api.mercadolibre.com/items/${LISTING_ID}/description`,
      { plain_text: DESCRIPTION_WITH_SHIPPING },
      { headers: h }
    );
    console.log('  ✅ Descripción actualizada con info de envío internacional');
  } catch(e: any) {
    console.log('  ❌ Description update failed:', e?.response?.data?.message || e?.message);
  }

  // 2. Intentar me2 con dimensiones (me2 a veces requiere weight para activarse)
  console.log('\n[P52D] Intentando me2 con peso/dimensiones...');
  const shippingWithDimensions = {
    shipping: {
      mode: 'me2',
      free_shipping: false,
      handling_time: HANDLING_DAYS,
      local_pick_up: false,
      dimensions: '10x10x8,300', // 10x10x8 cm, 300g (estimado para soporte de celular)
    }
  };
  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, shippingWithDimensions, { headers: h });
    console.log('  ✅ me2 con dimensiones aplicado');
  } catch(e: any) {
    const causes = e?.response?.data?.cause?.map((c: any) => c.code + ': ' + c.message).join('; ');
    console.log('  ❌ me2+dimensions failed:', causes || e?.response?.data?.message || e?.message);
  }

  // 3. Verificar estado final
  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('\n[P52D] Estado final:');
  console.log(JSON.stringify({
    status: final.status,
    sub_status: final.sub_status,
    shipping_mode: final.shipping?.mode,
    shipping_handling: final.shipping?.handling_time,
    logistic_type: final.shipping?.logistic_type,
  }, null, 2));

  // 4. Verificar descripción
  try {
    const desc = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/description`, { headers: h })).data;
    console.log('\n[P52D] Descripción guardada (primeras 120 chars):');
    console.log(' ', desc?.plain_text?.substring(0, 120));
  } catch(e: any) {}

  if (final.status === 'active') {
    console.log('\n[P52D] ✅ Listing activo');
    console.log(`  Shipping: ${final.shipping?.mode} | logistic_type: ${final.shipping?.logistic_type}`);
    if (final.shipping?.mode === 'me2') {
      console.log('  🚚 me2 aplicado — ML mostrará tiempo de entrega estimado');
    } else {
      console.log('  📋 Descripción actualizada con info de envío 20-30 días hábiles');
    }
  }
}

go().catch(e => console.error('[P52D] FATAL:', e?.response?.data || e?.message));
