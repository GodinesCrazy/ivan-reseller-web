import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC1913646427';

const DESC = `AVISO IMPORTANTE: ENVIO INTERNACIONAL - ENTREGA EN 20 A 30 DIAS HABILES
Este producto se despacha desde China directamente a tu domicilio en Chile.
Tiempo real de entrega: 20 a 30 dias habiles desde la confirmacion del pago.

----

Soporte de escritorio decorativo con diseno de gatito minimalista. Elegante y funcional para mantener tu telefono siempre a la vista.

Caracteristicas:
- Material resistente de alta calidad
- Diseno de gatito minimalista
- Compatible con la mayoria de smartphones
- Estable y antideslizante
- Ideal para escritorio, velador o cocina

INFORMACION DE ENVIO:
- Despacho desde China con seguimiento internacional
- Tiempo estimado: 20 a 30 dias habiles desde la confirmacion del pago
- El numero de seguimiento se envia por mensaje dentro de las 48 horas de la venta

Ante cualquier consulta sobre el estado de tu pedido, responderemos en menos de 24 horas.`;

(async () => {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  try {
    await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}/description`, { plain_text: DESC }, { headers: h });
    console.log('✅ Descripcion actualizada');
  } catch(e: any) {
    console.log('❌ Error:', e?.response?.data?.message || e?.message);
    return;
  }

  // Verificar estado final
  await new Promise(r => setTimeout(r, 2000));
  const item = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('Status:', item.status, item.sub_status);
  const desc = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}/description`, { headers: h })).data;
  console.log('Descripcion (primeros 150):', desc.plain_text?.slice(0, 150));
})().catch(e => console.error('FATAL:', e?.response?.data || e?.message));
