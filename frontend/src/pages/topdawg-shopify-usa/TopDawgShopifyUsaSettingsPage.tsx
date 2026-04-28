import { useEffect, useState } from 'react';
import { api } from '@/services/api';

type Config = { minMarginPct: number; minProfitUsd: number; maxShippingUsd: number; minCostUsd: number; defaultShippingUsd: number; hasTopDawgApiKey: boolean };

function parseNum(v: string): number { return parseFloat(v.replace(',', '.')); }

export default function TopDawgShopifyUsaSettingsPage() {
  const [cfg, setCfg]         = useState<Config | null>(null);
  const [apiKey, setApiKey]   = useState('');
  const [margin, setMargin]   = useState('');
  const [profit, setProfit]   = useState('');
  const [shipping, setShipping] = useState('');
  const [cost, setCost]       = useState('');
  const [defShip, setDefShip] = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/topdawg-shopify-usa/config').then(r => {
      const s = r.data.settings as Config;
      setCfg(s);
      setMargin(String(s.minMarginPct ?? 18));
      setProfit(String(s.minProfitUsd ?? 2));
      setShipping(String(s.maxShippingUsd ?? 12));
      setCost(String(s.minCostUsd ?? 5));
      setDefShip(String(s.defaultShippingUsd ?? 6.99));
    });
  }, []);

  async function save() {
    const vals = [parseNum(margin), parseNum(profit), parseNum(shipping), parseNum(cost), parseNum(defShip)];
    if (vals.some(isNaN)) { setError('Todos los campos deben ser números válidos.'); return; }
    setSaving(true); setMsg(null); setError(null);
    try {
      const body: Record<string, unknown> = { minMarginPct: vals[0], minProfitUsd: vals[1], maxShippingUsd: vals[2], minCostUsd: vals[3], defaultShippingUsd: vals[4] };
      if (apiKey.trim()) body['topDawgApiKey'] = apiKey.trim();
      await api.post('/api/topdawg-shopify-usa/config', body);
      setMsg('Configuración guardada.'); setApiKey('');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error saving'); }
    finally { setSaving(false); }
  }

  if (!cfg) return <p className="text-sm text-slate-500">Cargando configuración…</p>;

  return (
    <div className="max-w-lg space-y-6">
      {msg   && <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-800 dark:text-red-200">{error}</div>}

      {/* API Key */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">TopDawg API Key</h2>
        <div className="flex items-center gap-2 text-sm">
          <span>{cfg.hasTopDawgApiKey ? '✓ API key configurada' : '✗ Sin API key'}</span>
        </div>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder={cfg.hasTopDawgApiKey ? 'Ingresa nueva key para reemplazar…' : 'Pega tu TopDawg API key aquí…'}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono"
          type="password" />
        <p className="text-xs text-slate-400">Obtén tu API key en tu cuenta de TopDawg → API Settings.</p>
      </div>

      {/* Pricing rules */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reglas de precio</h2>
        {[
          { label: 'Margen mínimo (%)', value: margin, set: setMargin, hint: 'Recomendado 18% para TopDawg (US supplier)' },
          { label: 'Ganancia mínima (USD)', value: profit, set: setProfit, hint: '' },
          { label: 'Shipping máximo aceptado (USD)', value: shipping, set: setShipping, hint: 'Rechaza productos con shipping > este valor' },
          { label: 'Costo mínimo producto (USD)', value: cost, set: setCost, hint: 'Evita productos muy baratos con bajo margen absoluto' },
          { label: 'Shipping estimado default (USD)', value: defShip, set: setDefShip, hint: 'Estimado para productos sin cotización exacta (ej: $6.99 US domestic)' },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
            <input value={f.value} onChange={e => f.set(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" />
            {f.hint && <p className="text-xs text-slate-400 mt-1">{f.hint}</p>}
          </div>
        ))}
      </div>

      <button onClick={() => void save()} disabled={saving}
        className="w-full rounded-lg py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  );
}
