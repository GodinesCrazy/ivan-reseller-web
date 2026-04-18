import { useEffect, useRef } from 'react';
import type {
  CandidateItem,
  DataSourceType,
  RecommendationConfidence,
  StarterSuitability,
} from './CjEbayOpportunityPage';

// ====================================
// HELPERS
// ====================================

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

const SOURCE_LABELS: Record<DataSourceType, string> = {
  REAL: 'Real',
  HYBRID: 'Hybrid',
  ESTIMATED: 'Estimado',
  MOCK: 'Mock',
};

const SOURCE_COLORS: Record<DataSourceType, string> = {
  REAL:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  HYBRID:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ESTIMATED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  MOCK:      'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

const CONF_COLORS: Record<RecommendationConfidence, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  LOW:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STARTER_META: Record<StarterSuitability, { label: string; cls: string }> = {
  GOOD_FOR_STARTER:            { label: '✓ Apto para cuenta nueva',              cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
  CAUTION_FOR_STARTER:         { label: '⚠ Precaución para cuenta nueva',        cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' },
  NOT_RECOMMENDED_FOR_STARTER: { label: '✗ No recomendado para cuenta nueva',    cls: 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

function SourceBadge({ src, label }: { src: DataSourceType | undefined; label: string }) {
  const s = src ?? 'MOCK';
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${SOURCE_COLORS[s]}`}>
        {SOURCE_LABELS[s]}
      </span>
    </div>
  );
}

function ConfidenceBar({ score }: { score: number | undefined }) {
  const s = score ?? 0;
  const color = s >= 65 ? 'bg-emerald-500' : s >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>Calidad de datos</span>
        <span className="font-semibold">{s}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(s, 100)}%` }} />
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 70
      ? 'bg-emerald-500'
      : score >= 50
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className={`font-semibold ${scoreColor(score)}`}>{score.toFixed(0)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-900 dark:text-slate-100 font-medium text-right max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

// ====================================
// DRAWER
// ====================================

type Props = {
  candidate: CandidateItem;
  onClose: () => void;
  onDecision: (id: string, action: 'approve' | 'reject' | 'defer') => void;
};

export default function CjEbayOpportunityCandidateDrawer({ candidate: c, onClose, onDecision }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const p = c.pricing;
  const s = c.score;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
              {c.cjProductTitle}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Seed: {c.seedKeyword} · Fuente: {c.seedSource}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Product image + score */}
          <div className="flex gap-4">
            {c.images[0] ? (
              <img
                src={c.images[0]}
                alt={c.cjProductTitle}
                className="w-24 h-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                Sin imagen
              </div>
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${scoreColor(s.totalScore)}`}>
                  {s.totalScore.toFixed(0)}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">/ 100</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 italic leading-snug">
                {c.recommendationReason}
              </p>
              {s.starterPenaltyApplied && (
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  Penalización starter aplicada
                </p>
              )}
            </div>
          </div>

          {/* Score breakdown */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Desglose de score
            </h3>
            <div className="space-y-2">
              <ScoreBar label="Demanda / tendencia" score={s.demandScore} />
              <ScoreBar label="Margen neto" score={s.marginScore} />
              <ScoreBar label="Competitividad de precio" score={s.competitivenessScore} />
              <ScoreBar label="Confianza de envío" score={s.shippingConfidenceScore} />
              <ScoreBar label="Simplicidad operativa" score={s.simplicityScore} />
              <ScoreBar label="Riesgo cuenta nueva" score={s.accountRiskScore} />
              <ScoreBar label="Fiabilidad proveedor" score={s.supplierReliabilityScore} />
            </div>
            {s.starterFlags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {s.starterFlags.map((f) => (
                  <span
                    key={f}
                    className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* 3G.1 — Data quality & market reality */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Calidad de datos & realidad de mercado
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-2 space-y-1.5">
              <ConfidenceBar score={c.dataConfidenceScore} />
              <SourceBadge src={c.trendSourceType} label="Señal de tendencia" />
              <SourceBadge src={c.marketPriceSourceType} label="Precio de mercado" />
              <SourceBadge
                src={c.shippingConfidence === 'KNOWN' ? 'REAL' : c.shippingConfidence === 'ESTIMATED' ? 'ESTIMATED' : 'MOCK'}
                label="Costo de envío"
              />
              {c.recommendationConfidence && (
                <div className="flex items-center justify-between text-sm py-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Confianza recomendación</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${CONF_COLORS[c.recommendationConfidence]}`}>
                    {c.recommendationConfidence}
                  </span>
                </div>
              )}
            </div>

            {/* Starter suitability badge */}
            {c.starterSuitability && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium ${STARTER_META[c.starterSuitability].cls}`}>
                {STARTER_META[c.starterSuitability].label}
              </div>
            )}

            {/* Evidence summary */}
            {c.evidenceSummary && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {c.evidenceSummary}
              </p>
            )}

            {/* Market price detail */}
            {c.marketPriceDetail && c.marketPriceDetail.marketSource === 'REAL' && (
              <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs space-y-1">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Precios reales eBay ({c.marketPriceDetail.listingCount.toLocaleString('en-US')} listings)
                </p>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div>
                    <p className="text-slate-500">Mínimo</p>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {c.marketPriceDetail.observedMinPrice != null ? `$${c.marketPriceDetail.observedMinPrice.toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Típico</p>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {c.marketPriceDetail.observedTypicalPrice != null ? `$${c.marketPriceDetail.observedTypicalPrice.toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Máximo</p>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {c.marketPriceDetail.observedMaxPrice != null ? `$${c.marketPriceDetail.observedMaxPrice.toFixed(2)}` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Pricing breakdown */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Desglose de pricing
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-2">
              <Row label="Costo proveedor CJ" value={`$${p.supplierCostUsd.toFixed(2)}`} />
              <Row label="Envío CJ → USA" value={`$${p.shippingUsd.toFixed(2)} (${c.shippingConfidence})`} />
              <Row label="Fee eBay" value={`$${p.ebayFeeUsd.toFixed(2)}`} />
              <Row label="Fee pasarela" value={`$${p.paymentFeeUsd.toFixed(2)}`} />
              <Row label="Buffer incidentes" value={`$${p.incidentBufferUsd.toFixed(2)}`} />
              <Row
                label="Costo total"
                value={<span className="text-slate-700 dark:text-slate-300">${p.totalCostUsd.toFixed(2)}</span>}
              />
              <Row label="Precio piso" value={`$${p.floorPriceUsd.toFixed(2)}`} />
              <Row
                label="Precio sugerido"
                value={
                  <span className="font-bold text-primary-700 dark:text-primary-400 text-base">
                    ${p.suggestedPriceUsd.toFixed(2)}
                  </span>
                }
              />
              <Row
                label="Ganancia neta"
                value={
                  <span className={p.netProfitUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                    ${p.netProfitUsd.toFixed(2)}
                  </span>
                }
              />
              <Row
                label="Margen neto"
                value={
                  <span className={scoreColor(s.marginScore)}>
                    {p.netMarginPct != null ? `${p.netMarginPct.toFixed(1)}%` : '—'}
                  </span>
                }
              />
              {p.marketObservedPriceUsd != null && (
                <Row
                  label="Precio mercado ref."
                  value={
                    <span className="flex items-center gap-1">
                      ${p.marketObservedPriceUsd.toFixed(2)}
                      {c.marketPriceSourceType === 'REAL' ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-normal">(real eBay)</span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-normal">(estimado)</span>
                      )}
                    </span>
                  }
                />
              )}
              {p.competitivenessDeltaPct != null && (
                <Row
                  label="Delta competitividad"
                  value={
                    <span className={p.competitivenessDeltaPct <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                      {p.competitivenessDeltaPct > 0 ? '+' : ''}
                      {p.competitivenessDeltaPct.toFixed(1)}%
                    </span>
                  }
                />
              )}
            </div>
          </section>

          {/* Product data */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Datos del producto CJ
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-2">
              <Row label="CJ Product ID" value={<code className="text-xs">{c.cjProductId}</code>} />
              <Row label="Variante SKU" value={<code className="text-xs">{c.cjVariantSku}</code>} />
              <Row
                label="Stock reportado"
                value={c.stockCount != null ? c.stockCount.toString() : 'Desconocido'}
              />
              <Row
                label="Envío (días est.)"
                value={
                  c.shippingConfidence !== 'UNKNOWN' && c.shippingDaysMin != null
                    ? `${c.shippingDaysMin}–${c.shippingDaysMax} días`
                    : 'No disponible'
                }
              />
            </div>
          </section>

          {/* Reasons from score engine */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Explicación del score
            </h3>
            <ul className="space-y-1.5">
              {s.reasons.map((r, i) => (
                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex gap-1.5">
                  <span className="flex-shrink-0 text-slate-400">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </section>

          {/* Image gallery */}
          {c.images.length > 1 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Imágenes del producto
              </h3>
              <div className="flex gap-2 flex-wrap">
                {c.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Review notes */}
          {c.reviewNotes && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                Notas de revisión
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                {c.reviewNotes}
              </p>
            </section>
          )}
        </div>

        {/* Footer actions */}
        {c.status === 'SHORTLISTED' && (
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
            <button
              onClick={() => { onDecision(c.id, 'approve'); onClose(); }}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
            >
              Aprobar
            </button>
            <button
              onClick={() => { onDecision(c.id, 'defer'); onClose(); }}
              className="flex-1 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium text-sm transition-colors"
            >
              Posponer
            </button>
            <button
              onClick={() => { onDecision(c.id, 'reject'); onClose(); }}
              className="flex-1 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 font-medium text-sm transition-colors"
            >
              Rechazar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
