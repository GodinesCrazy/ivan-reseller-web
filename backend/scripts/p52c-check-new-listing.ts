import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';
async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const r = await axios.get('https://api.mercadolibre.com/items/MLC3838173870', { headers: { Authorization: 'Bearer ' + token } });
  const d = r.data;
  console.log(JSON.stringify({
    status: d.status, sub_status: d.sub_status,
    shipping: d.shipping, pics: d.pictures?.length, permalink: d.permalink
  }, null, 2));
}
go().catch(e => console.error(e.response?.data || e.message));
