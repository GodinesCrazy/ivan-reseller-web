import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, Megaphone, Save, ShieldCheck, TrendingUp } from 'lucide-react';
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

type ProfitGuard = {
  ok: boolean;
  dryRun: boolean;
  scanned: number;
  okCount: number;
  priceIncreases: number;
  pausedUnsafe: number;
  reviewRequired: number;
  settings: {
    minMarginPct: number;
    minProfitUsd: number;
    maxShippingUsd: number;
    maxSellPriceUsd: number;
  };
  issues: Array<{
    listingId: number;
    title: string;
    action: string;
    reason: string;
    currentPriceUsd: number | null;
    recommendedPriceUsd: number | null;
    projectedNetProfitUsd: number | null;
    projectedNetMarginPct: number | null;
    applied: boolean;
  }>;
};

type SocialAutopilot = {
  ok: boolean;
  status: string;
  platforms: Record<string, { required: string[]; canAutoPublishNow: boolean }>;
  candidates: Array<{ listingId: number; title: string; priceUsd: number; url: string | null; caption: string }>;
};

type ShippingEnrichment = {
  ok: boolean;
  dryRun: boolean;
  scanned: number;
  enriched: number;
  skipped: number;
  failed: number;
  rateLimited: boolean;
  errors: Array<{ listingId: number; title: string; reason: string }>;
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
  const [profitGuard, setProfitGuard] = useState<ProfitGuard | null>(null);
  const [social, setSocial] = useState<SocialAutopilot | null>(null);
  const [shippingEnrichment, setShippingEnrichment] = useState<ShippingEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardRunning, setGuardRunning] = useState(false);
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
      const [funnelRes, readinessRes, profitRes, socialRes] = await Promise.all([
        api.get<FunnelResponse>('/api/cj-shopify-usa/analytics/funnel'),
        api.get<CheckoutReadiness>('/api/cj-shopify-usa/analytics/checkout-readiness'),
        api.get<ProfitGuard>('/api/cj-shopify-usa/analytics/profit-guard'),
        api.get<SocialAutopilot>('/api/cj-shopify-usa/analytics/social-autopilot'),
      ]);
      setFunnel(funnelRes.data);
      setReadiness(readinessRes.data);
      setProfitGuard(profitRes.data);
      setSocial(socialRes.data);
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

  const runProfitGuard = async (apply: boolean) => {
    setGuardRunning(true);
    setError(null);
    try {
      const res = await api.post<ProfitGuard>('/api/cj-shopify-usa/analytics/profit-guard/run', {
        dryRun: !apply,
        pauseUnsafe: apply,
        limit: 500,
        minIncreaseUsd: 0.5,
      });
      setProfitGuard(res.data);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo ejecutar Profit Guard.'));
    } finally {
      setGuardRunning(false);
    }
  };

  const enrichShipping = async (apply: boolean) => {
    setGuardRunning(true);
    setError(null);
    try {
      const res = await api.post<ShippingEnrichment>('/api/cj-shopify-usa/analytics/profit-guard/enrich-shipping', {
        dryRun: !apply,
        limit: 25,
      });
      setShippingEnrichment(res.data);
      const refreshed = await api.get<ProfitGuard>('/api/cj-shopify-usa/analytics/profit-guard');
      setProfitGuard(refreshed.data);
    } catch (e) {
      setError(axiosMsg(e, 'No se pudo enriquecer el shipping CJ.'));
    } finally {
      setGuardRunning(false);
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

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-emerald-500/25 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-300" />
              <h3 className="text-sm font-semibold text-slate-100">Profit Guard automático</h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void enrichShipping(false)}
                disabled={guardRunning}
                className="rounded-md border border-sky-600 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-sky-400 disabled:opacity-60"
              >
                Probar shipping
              </button>
              <button
                type="button"
                onClick={() => void enrichShipping(true)}
                disabled={guardRunning}
                className="rounded-md border border-amber-500 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-300 disabled:opacity-60"
              >
                Enriquecer 25
              </button>
              <button
                type="button"
                onClick={() => void runProfitGuard(false)}
                disabled={guardRunning}
                className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 disabled:opacity-60"
              >
                Simular
              </button>
              <button
                type="button"
                onClick={() => void runProfitGuard(true)}
                disabled={guardRunning}
                className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                Aplicar seguro
              </button>
            </div>
          </div>
          {shippingEnrichment && (
            <div className="mb-3 rounded-md border border-sky-500/20 bg-sky-950/20 p-3 text-xs text-slate-300">
              Shipping CJ: {shippingEnrichment.enriched}/{shippingEnrichment.scanned} enriquecidos
              {shippingEnrichment.failed > 0 ? `, ${shippingEnrichment.failed} fallidos` : ''}
              {shippingEnrichment.rateLimited ? '. CJ pidió esperar por rate limit.' : ''}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">Escaneados</p>
              <p className="text-2xl font-semibold text-white">{profitGuard?.scanned ?? 0}</p>
            </div>
            <div className="rounded-md bg-emerald-950/30 p-3">
              <p className="text-xs text-slate-400">OK</p>
              <p className="text-2xl font-semibold text-emerald-300">{profitGuard?.okCount ?? 0}</p>
            </div>
            <div className="rounded-md bg-sky-950/30 p-3">
              <p className="text-xs text-slate-400">Subir precio</p>
              <p className="text-2xl font-semibold text-sky-300">{profitGuard?.priceIncreases ?? 0}</p>
            </div>
            <div className="rounded-md bg-amber-950/30 p-3">
              <p className="text-xs text-slate-400">Revisar/Pausar</p>
              <p className="text-2xl font-semibold text-amber-300">{(profitGuard?.reviewRequired ?? 0) + (profitGuard?.pausedUnsafe ?? 0)}</p>
            </div>
          </div>
          <div className="mt-3 max-h-64 overflow-auto rounded-md border border-slate-800">
            {(profitGuard?.issues || []).slice(0, 12).map((issue) => (
              <div key={issue.listingId} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-300 last:border-b-0 md:grid-cols-[1fr_120px_120px_120px]">
                <span className="font-medium text-slate-100">{issue.title}</span>
                <span>{issue.action}</span>
                <span>{issue.currentPriceUsd != null ? `$${issue.currentPriceUsd.toFixed(2)}` : '-'}</span>
                <span>{issue.recommendedPriceUsd != null ? `$${issue.recommendedPriceUsd.toFixed(2)}` : '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-sky-500/25 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-sky-300" />
            <h3 className="text-sm font-semibold text-slate-100">Promoción IA PawVault</h3>
          </div>
          <p className="text-sm text-slate-300">
            El sistema ya puede seleccionar productos activos y preparar captions. Para publicar solo falta conectar OAuth oficial de Instagram/TikTok.
          </p>
          <div className="mt-3 space-y-2">
            {Object.entries(social?.platforms || {}).map(([platform, state]) => (
              <div key={platform} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs font-semibold uppercase text-slate-300">{platform}</p>
                <p className={state.canAutoPublishNow ? 'text-xs text-emerald-300' : 'text-xs text-amber-300'}>
                  {state.canAutoPublishNow ? 'Listo para autopublicar' : 'Pendiente de credenciales/OAuth'}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">{social?.candidates.length ?? 0} candidatos de producto listos para campañas.</p>
        </div>
      </section>
    </div>
  );
}
