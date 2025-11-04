import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Check, X } from 'lucide-react';

export default function IntelligentPublisher() {
  const [pending, setPending] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMk, setBulkMk] = useState<{ ebay: boolean; mercadolibre: boolean; amazon: boolean }>({ ebay: true, mercadolibre: false, amazon: false });
  const [bulkStatus, setBulkStatus] = useState<{ total: number; queued: number; done: number; errors: number; running: boolean }>({ total: 0, queued: 0, done: 0, errors: 0, running: false });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/products', { params: { status: 'PENDING' } });
        setPending(data?.products || []);
        const l = await api.get('/api/publisher/listings');
        setListings(l.data?.items || []);
      } catch {}
    })();
  }, []);

  async function approve(productId: string, marketplaces: string[]) {
    try {
      await api.post(`/api/publisher/approve/${productId}`, { marketplaces });
      setPending((prev) => prev.filter(p => p.id !== productId));
      alert('Approved and published');
    } catch (e: any) {
      alert(`Error approving: ${e?.message || e}`);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Intelligent Publisher</h1>
      <p className="text-gray-600 mb-4">Prepare, approve and publish listings to marketplaces.</p>
      {/* Bulk publish toolbar */}
      <div className="bg-white p-4 rounded border mb-4 flex flex-col gap-3">
        <div className="text-sm font-medium">Bulk publish selected (queue jobs)</div>
        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.ebay} onChange={(e)=>setBulkMk(v=>({...v, ebay: e.target.checked}))}/> eBay</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.mercadolibre} onChange={(e)=>setBulkMk(v=>({...v, mercadolibre: e.target.checked}))}/> ML</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.amazon} onChange={(e)=>setBulkMk(v=>({...v, amazon: e.target.checked}))}/> Amazon</label>
          <button onClick={async()=>{
            const productIds = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (productIds.length===0 || marketplaces.length===0) { alert('Select at least one product and one marketplace'); return; }
            setBulkStatus({ total: productIds.length, queued: 0, done: 0, errors: 0, running: true });
            // queue jobs sequentially to avoid hammering
            for (const pid of productIds) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            alert('Publishing jobs queued. Track progress in notifications.');
          }} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Queue Publishing Jobs</button>
          <button onClick={()=>{ const all: Record<string, boolean> = {}; pending.forEach((p:any)=> all[p.id]=true); setSelected(all); }} className="px-3 py-2 border rounded text-sm">Select All</button>
          <button onClick={()=> setSelected({}) } className="px-3 py-2 border rounded text-sm">Clear</button>
          <button onClick={async()=>{
            const allIds = pending.map((p:any)=> String(p.id));
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (allIds.length===0 || marketplaces.length===0) { alert('No pending products or marketplaces'); return; }
            setBulkStatus({ total: allIds.length, queued: 0, done: 0, errors: 0, running: true });
            for (const pid of allIds) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            alert('All pending queued for publishing');
          }} className="px-3 py-2 bg-green-600 text-white rounded text-sm">Publish All</button>
        </div>
        <div className="h-2 bg-gray-100 rounded overflow-hidden">
          <div className="h-full bg-primary-500" style={{ width: `${bulkStatus.total? (bulkStatus.queued / bulkStatus.total)*100 : 0}%` }} />
        </div>
        <div className="text-xs text-gray-600">Queued: {bulkStatus.queued}/{bulkStatus.total} • Errors: {bulkStatus.errors}</div>
      </div>
      <div className="bg-white p-4 rounded border mb-4">
        <div className="text-sm font-medium mb-2">Add product for approval (AliExpress URL)</div>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 border rounded" placeholder="https://www.aliexpress.com/item/..." value={url} onChange={(e)=>setUrl(e.target.value)} />
          <button onClick={async()=>{
            try {
              await api.post('/api/publisher/add_for_approval', { aliexpressUrl: url, scrape: true });
              const { data } = await api.get('/api/products', { params: { status: 'PENDING' } });
              setPending(data?.products || []);
              setUrl('');
              alert('Product added for approval');
            } catch (e:any) {
              alert('Error adding product');
            }
          }} className="px-4 py-2 bg-primary-600 text-white rounded">Add</button>
        </div>
      </div>
      <div className="p-4 border rounded bg-white text-gray-700 mb-3">
        Pending approvals: <span className="font-semibold">{pending.length}</span>
      </div>
      <div className="bg-white border rounded">
        {pending.slice(0, 20).map((p: any) => (
          <div key={p.id} className="p-4 border-b flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={!!selected[p.id]} onChange={(e)=>setSelected(s=>({ ...s, [p.id]: e.target.checked }))} />
              <div className="font-medium">{p.title}</div>
              <div className="text-xs text-gray-500">Cost: ${p.aliexpressPrice} → Suggested: ${p.suggestedPrice}</div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm"><input type="checkbox" value="ebay" defaultChecked className="mr-1" /> eBay</label>
              <label className="text-sm"><input type="checkbox" value="mercadolibre" className="mr-1" /> ML</label>
              <label className="text-sm"><input type="checkbox" value="amazon" className="mr-1" /> Amazon</label>
              <button onClick={(e)=>{
                const parent = (e.currentTarget.closest('div')!);
                const mks = Array.from(parent.querySelectorAll('input[type=checkbox]')) as HTMLInputElement[];
                const selected = mks.filter(i=>i.checked).map(i=>i.value);
                approve(p.id, selected);
              }} className="px-3 py-2 bg-blue-600 text-white rounded text-sm flex items-center gap-1"><Check className="w-4 h-4"/>Approve & Publish</button>
            </div>
          </div>
        ))}
        {pending.length===0 && <div className="p-4 text-sm text-gray-600">No pending products.</div>}
      </div>

      <div className="mt-6">
        <div className="text-lg font-semibold mb-2">Published Listings</div>
        <div className="bg-white border rounded">
          {listings.slice(0, 20).map((l:any)=>(
            <div key={l.id} className="p-3 border-b flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">{l.marketplace.toUpperCase()} – {l.listingId}</div>
                <div className="text-gray-600">{new Date(l.publishedAt).toLocaleString()}</div>
              </div>
              <a href={l.listingUrl} target="_blank" className="text-primary-600 text-sm">Open</a>
            </div>
          ))}
          {listings.length===0 && <div className="p-3 text-sm text-gray-600">No listings yet.</div>}
        </div>
      </div>
    </div>
  );
}
