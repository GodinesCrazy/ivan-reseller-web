import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';
async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const r = await axios.get('https://api.mercadolibre.com/items/MLC1913623551', { headers: { Authorization: 'Bearer ' + token } });
  const d = r.data;
  console.log(JSON.stringify({ status: d.status, sub_status: d.sub_status, shipping_mode: d.shipping?.mode, handling_time: d.shipping?.handling_time, logistic_type: d.shipping?.logistic_type, category_id: d.category_id, permalink: d.permalink }, null, 2));
}
go().catch(e => console.error(e.response?.data || e.message));
