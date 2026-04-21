import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';
async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const r = await axios.get('https://api.mercadolibre.com/items/MLC3838127822', { headers: { Authorization: 'Bearer ' + token } });
  const d = r.data;
  console.log(JSON.stringify({ status: d.status, sub_status: d.sub_status, health: d.health, price: d.price, currency: d.currency_id, pics: d.pictures?.length, title: d.title?.substring(0,60), permalink: d.permalink }, null, 2));
}
go().catch(e => console.error(e.response?.data || e.message));
