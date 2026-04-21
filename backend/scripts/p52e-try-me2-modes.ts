import '../src/config/env';
import axios from 'axios';
import MarketplaceService from '../src/services/marketplace.service';

const LISTING_ID = 'MLC3838173870';

async function go() {
  const svc = new MarketplaceService();
  const c = await svc.getCredentials(1, 'mercadolibre', 'production');
  const token = (c?.credentials as any)?.accessToken;
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const attempts = [
    { label: 'me2 only', payload: { shipping: { mode: 'me2', free_shipping: false, local_pick_up: false } } },
    { label: 'me2 minimal', payload: { shipping: { mode: 'me2' } } },
    { label: 'me2 + dimensions no handling', payload: { shipping: { mode: 'me2', free_shipping: false, local_pick_up: false, dimensions: '10x10x8,300' } } },
  ];

  for (const a of attempts) {
    try {
      await axios.put(`https://api.mercadolibre.com/items/${LISTING_ID}`, a.payload, { headers: h });
      console.log(a.label + ': ✅');
    } catch(e: any) {
      const causes = e?.response?.data?.cause?.map((c: any) => c.code + ': ' + c.message).join('; ');
      console.log(a.label + ': ❌', causes || e?.response?.data?.message || e?.message);
    }
  }

  const final = (await axios.get(`https://api.mercadolibre.com/items/${LISTING_ID}`, { headers: h })).data;
  console.log('Final shipping mode:', final.shipping?.mode, '| logistic_type:', final.shipping?.logistic_type);
}
go().catch(e => console.error(e?.response?.data || e?.message));
