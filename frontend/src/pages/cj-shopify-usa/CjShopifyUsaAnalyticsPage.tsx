import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, Save, ShieldCheck } from 'lucide-react';
import { api } from '@/services/api';

type FunnelStage = {
  key: string;
  label: string;
  ratePct: number;
  count: number;
};

type FunnelResponse = {
  ok: boolean;
  snapshot: null | {
    id: number;
    createdAt: string;
    visitors: number;
    addedToCart: number;
    reachedCheckout: number;
    purchases: number;
    source: string;
    notes: string | null;
  };
  stages: FunnelStage[];
  localOrders: number;
  interpretation: {
    checkoutDropRisk: boolean;
    paymentRisk: boolean;
  };
};

type CheckoutReadiness = {
  ok: boolean;
  shop: {
    name: string;
    country: string | null;
    currencyCode: string;
    primaryDomain: string | null;
    supportedDigitalWallets: string[];
  };
  recentOrders: Array<{
    id: string;
    name: string;
    createdAt: string;
    displayFinancialStatus: string | null;
    paymentGatewayNames: string[];
  }>;
  recentGateways: string[];
  checkoutProbe: {
    ok?: boolean;
    addToCartStatus?: number;
    checkoutStatus?: number;
    checkoutLocation?: string | null;
    reason?: string;
  };
  paypalApiVisibility: {
    canConfirmConfiguredGatewayByApi: boolean;
    reason: string;
  };
  recommendations: string[];
};

function axiosMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function pct(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}

export default function CjShopifyUsaAnalyticsPage() {
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [readiness, setReadiness] = useState<CheckoutReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    visitors: 600,
    addToCartRatePct: 5.65,
    checkoutRatePct: 1.3,
    purchaseRatePct: 0,
    notes: 'Baseline recibido: 600+ visitantes, 5.65% add-to-cart, 1.30% checkout, 0% compra.',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [funnelRes, readinessRes] = await Promise.all([
        api.get<FunnelResponse>('/api/cj-shopify-usa/analytics/funnel'),
        api.get<CheckoutReadiness>('/api/cj-shopify-usa/analytics/checkout-readiness'),
      ]);
      setFunnel(funnelRes.data);
      setReadiness(readinessRes.data);
      if (funnelRes.data.snapshot) {
        setForm((current) => ({
          ...current,
          visitors: funnelRes.data.snapshot!.visitors,
          addToCartRatePct: funnelRes.data.stages.find((stage) => stage.key === 'add_to_cart')?.ratePct ?? current.addToCartRatePct,
          checkoutRatePct: funnelRes.data.stages.find((stage) => stage.key === 'checkout')?.ratePct ?? current.checkoutRatePct,
          purchaseRatePct: funnelRes.data.stages.find((stage) => stage.key === 'purchase')?.ratePct ?? current.purchaseRatePct,
          notes: funnelRes.data.snapshot!.notes || current.notes,
        }));
      }
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo cargar la analítica de Shopify.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/cj-shopify-usa/analytics/funnel', { ...form, source: 'manual_shopify_admin' });
      await load();
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo guardar el snapshot.'));
    } finally {
      setSaving(false);
    }
  };

  const diagnosis = useMemo(() => {
    if (!funnel) return [];
    const items = [];
    if (funnel.interpretation.paymentRisk) {
      items.push({
        tone: 'danger',
        title: 'Riesgo en pago o confianza de checkout',
        text: 'Hay usuarios llegando al checkout, pero compras en 0%. Requiere prueba real de PayPal y revisión de métodos alternativos.',
      });
    }
    if (funnel.interpretation.checkoutDropRisk) {
      items.push({
        tone: 'warning',
        title: 'Caída fuerte entre carrito y checkout',
        text: 'La fricción puede estar en carrito, shipping visible, precio total o confianza antes del checkout.',
      });
    }
    if (items.length === 0) {
      items.push({
        tone: 'success',
        title: 'Sin alerta crítica en el embudo registrado',
        text: 'Mantén seguimiento por campaña, producto y fuente de tráfico.',
      });
    }
    return items;
  }, [funnel]);

  if (loading) return <p className="text-sm text-slate-400">Cargando analítica de conversión...</p>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-300" />
          <h2 className="text-lg font-semibold text-slate-100">Analítica de conversión Shopify</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(funnel?.stages || []).map((stage) => (
            <div key={stage.key} className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-xs font-medium uppercase text-slate-400">{stage.label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{pct(stage.ratePct)}</p>
              <p className="mt-1 text-sm text-slate-400">{stage.count} eventos estimados</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-slate-100">Actualizar snapshot</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ['visitors', 'Visitantes'],
              ['addToCartRatePct', 'Add to cart %'],
              ['checkoutRatePct', 'Checkout %'],
              ['purchaseRatePct', 'Compra %'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-slate-400">
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  step={key === 'visitors' ? '1' : '0.01'}
                  value={form[key as keyof typeof form] as number}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: Number(event.target.value) }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
            ))}
          </div>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            className="mt-3 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar snapshot'}
          </button>
        </div>

        <div className="space-y-3">
          {diagnosis.map((item) => (
            <div
              key={item.title}
              className={`rounded-lg border p-4 ${
                item.tone === 'danger'
                  ? 'border-rose-500/40 bg-rose-950/30'
                  : item.tone === 'warning'
                    ? 'border-amber-500/40 bg-amber-950/25'
                    : 'border-emerald-500/40 bg-emerald-950/25'
              }`}
            >
              <div className="flex items-center gap-2">
                {item.tone === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                <p className="text-sm font-semibold text-slate-100">{item.title}</p>
              </div>
              <p className="mt-2 text-sm text-slate-300">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-sky-300" />
          <h3 className="text-sm font-semibold text-slate-100">Checkout / PayPal readiness</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs text-slate-400">Tienda</p>
            <p className="text-sm font-medium text-slate-100">{readiness?.shop.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">País cuenta</p>
            <p className="text-sm font-medium text-slate-100">{readiness?.shop.country || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Checkout técnico</p>
            <p className={readiness?.checkoutProbe.ok ? 'text-sm font-medium text-emerald-300' : 'text-sm font-medium text-rose-300'}>
              {readiness?.checkoutProbe.ok ? 'Redirige correctamente' : 'Revisar'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Gateways usados en órdenes</p>
            <p className="text-sm font-medium text-slate-100">{readiness?.recentGateways.length ? readiness.recentGateways.join(', ') : 'Sin órdenes aún'}</p>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-950/20 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-sky-300" />
            <p className="text-sm text-slate-300">{readiness?.paypalApiVisibility.reason}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
