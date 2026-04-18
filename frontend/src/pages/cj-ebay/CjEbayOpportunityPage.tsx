import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { api } from '@/services/api';
import CjEbayOpportunityCandidateDrawer from './CjEbayOpportunityCandidateDrawer';

// ====================================
// TYPES
// ====================================

type RunSummary = {
  runId: string;
  status: string;
  mode: string;
  seedCount: number;
  candidateCount: number;
  shortlistedCount: number;
  approvedCount: number;
  rejectedCount: number;
  deferredCount: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
};

type PricingBreakdown = {
  supplierCostUsd: number;
  shippingUsd: number;
  ebayFeeUsd: number;
  paymentFeeUsd: number;
  incidentBufferUsd: number;
  totalCostUsd: number;
  suggestedPriceUsd: number;
  floorPriceUsd: number;
  netProfitUsd: number;
  netMarginPct: number | null;
  marketObservedPriceUsd: number | null;
  competitivenessDeltaPct: number | null;
};

type ScoreBreakdown = {
  demandScore: number;
  marginScore: number;
  competitivenessScore: number;
  shippingConfidenceScore: number;
  simplicityScore: number;
  accountRiskScore: number;
  supplierReliabilityScore: number;
  totalScore: number;
  reasons: string[];
  starterFlags: string[];
  starterPenaltyApplied: boolean;
};

export type DataSourceType = 'REAL' | 'ESTIMATED' | 'HYBRID' | 'MOCK';
export type RecommendationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type StarterSuitability = 'GOOD_FOR_STARTER' | 'CAUTION_FOR_STARTER' | 'NOT_RECOMMENDED_FOR_STARTER';

export type MarketPriceDetail = {
  observedMinPrice: number | null;
  observedMedianPrice: number | null;
  observedMaxPrice: number | null;
  observedTypicalPrice: number | null;
  observedPriceConfidence: number;
  marketSource: DataSourceType;
  evidenceSummary: string;
  listingCount: number;
};

export type CandidateItem = {
  id: string;
  runId: string;
  seedKeyword: string;
  seedSource: string;
  cjProductId: string;
  cjProductTitle: string;
  cjVariantSku: string;
  images: string[];
  supplierCostUsd: number;
  shippingUsd: number;
  shippingConfidence: string;
  shippingDaysMin?: number;
  shippingDaysMax?: number;
  stockCount?: number;
  marketObservedPriceUsd?: number;
  marketPriceIsEstimated?: boolean;
  pricing: PricingBreakdown;
  score: ScoreBreakdown;
  recommendationReason: string;
  status: string;
  reviewNotes?: string;
  reviewedAt?: string;
  handedOffAt?: string;
  createdAt: string;
  // 3G.1 data quality
  trendSourceType?: DataSourceType;
  marketPriceSourceType?: DataSourceType;
  dataConfidenceScore?: number;
  recommendationConfidence?: RecommendationConfidence;
  starterSuitability?: StarterSuitability;
  evidenceSummary?: string;
  marketPriceDetail?: MarketPriceDetail;
};

// ====================================
// HELPERS
// ====================================

function apiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const d = e.response.data as { message?: string; error?: string };
    return d.message || d.error || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

// ---- data quality badge helpers ----
function sourceTypeBadge(src: DataSourceType | undefined, label: string): JSX.Element {
  const map: Record<DataSourceType, string> = {
    REAL:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    HYBRID:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    ESTIMATED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    MOCK:      'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  };
  const s = src ?? 'MOCK';
  const labelMap: Record<DataSourceType, string> = {
    REAL: 'Real', HYBRID: 'Hybrid', ESTIMATED: 'Estimado', MOCK: 'Mock',
  };
  return (
    <span key={label} className={`text-xs px-1.5 py-0.5 rounded font-medium ${map[s]}`}>
      {label}: {labelMap[s]}
    </span>
  );
}

function confidenceBadge(conf: RecommendationConfidence | undefined): JSX.Element {
  const map: Record<RecommendationConfidence, string> = {
    HIGH:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    LOW:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  const c = conf ?? 'LOW';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${map[c]}`}>
      Conf: {c}
    </span>
  );
}

function starterBadge(s: StarterSuitability | undefined): JSX.Element | null {
  if (!s || s === 'CAUTION_FOR_STARTER') return null;
  if (s === 'GOOD_FOR_STARTER') {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        ✓ Apto cuenta nueva
      </span>
    );
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
      ✗ No recomendado cuenta nueva
    </span>
  );
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800';
  if (score >= 50) return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
  return 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    SHORTLISTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    DEFERRED: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse',
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? ''}`}>
      {status}
    </span>
  );
}

// ====================================
// CANDIDATE CARD
// ====================================

function CandidateCard({
  c,
  onDecision,
  onDetail,
}: {
  c: CandidateItem;
  onDecision: (id: string, action: 'approve' | 'reject' | 'defer', notes?: string) => Promise<void>;
  onDetail: (c: CandidateItem) => void;
}) {
  const [busy, setBusy] = useState(false);

  const act = async (action: 'approve' | 'reject' | 'defer') => {
    setBusy(true);
    try {
      await onDecision(c.id, action);
    } finally {
      setBusy(false);
    }
  };

  const img = c.images[0];
  const score = c.score.totalScore;

  return (
    <div
      className={`border rounded-xl p-4 flex flex-col gap-3 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow ${scoreBg(score)}`}
    >
      <div className="flex gap-3">
        {img ? (
          <img
            src={img}
            alt={c.cjProductTitle}
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400 text-xs">
            Sin imagen
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
              {c.cjProductTitle}
            </p>
            <span className={`text-lg font-bold flex-shrink-0 ${scoreColor(score)}`}>
              {score.toFixed(0)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Seed: <span className="font-medium">{c.seedKeyword}</span>
          </p>
          <span className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge(c.status)}`}>
            {c.status}
          </span>
        </div>
      </div>

      {/* Pricing strip */}
      <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Costo CJ</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            ${c.supplierCostUsd.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Margen</p>
          <p className={`text-sm font-semibold ${scoreColor(c.score.marginScore)}`}>
            {c.pricing.netMarginPct != null ? `${c.pricing.netMarginPct.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Precio sug.</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            ${c.pricing.suggestedPriceUsd.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Competitiveness */}
      {c.pricing.competitivenessDeltaPct != null && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mercado{c.marketPriceSourceType === 'REAL' ? '' : ' est.'}:{' '}
          <span className="font-medium">
            {c.pricing.competitivenessDeltaPct < 0
              ? `${Math.abs(c.pricing.competitivenessDeltaPct).toFixed(1)}% más barato`
              : `${c.pricing.competitivenessDeltaPct.toFixed(1)}% sobre mercado`}
          </span>
          {c.pricing.marketObservedPriceUsd != null && (
            <span className="ml-1">(ref: ${c.pricing.marketObservedPriceUsd.toFixed(2)})</span>
          )}
        </p>
      )}

      {/* 3G.1 — Data quality badges */}
      <div className="flex flex-wrap gap-1">
        {sourceTypeBadge(c.trendSourceType, 'Trend')}
        {sourceTypeBadge(c.marketPriceSourceType, 'Precio')}
        {confidenceBadge(c.recommendationConfidence)}
      </div>

      {/* Starter suitability badge */}
      {starterBadge(c.starterSuitability)}

      {/* Starter flags */}
      {c.score.starterFlags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.score.starterFlags.map((f) => (
            <span
              key={f}
              className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Reason summary */}
      <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">
        {c.recommendationReason}
      </p>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onDetail(c)}
          className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Ver detalle
        </button>
        {c.status === 'SHORTLISTED' && (
          <>
            <button
              disabled={busy}
              onClick={() => act('approve')}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
            >
              Aprobar
            </button>
            <button
              disabled={busy}
              onClick={() => act('reject')}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 transition-colors"
            >
              Rechazar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ====================================
// MAIN PAGE
// ====================================

export default function CjEbayOpportunityPage() {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'STARTER' | 'STANDARD'>('STARTER');
  const [drawerItem, setDrawerItem] = useState<CandidateItem | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'SHORTLISTED' | 'APPROVED' | 'REJECTED' | 'DEFERRED'>('ALL');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const POLL_TIMEOUT_MS = 5 * 60 * 1000; // stop polling after 5 minutes

  // On mount: load latest run + recommendations.
  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ ok: boolean; run: RunSummary | null; candidates: CandidateItem[] }>(
        '/api/cj-ebay/opportunities/recommendations'
      );
      if (res.data?.ok) {
        setRun(res.data.run ?? null);
        setCandidates(res.data.candidates ?? []);
      }
    } catch (e) {
      setError(apiError(e, 'No se pudieron cargar recomendaciones.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  // Poll run until COMPLETED or FAILED (max 5 minutes).
  const startPolling = useCallback((runId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollStartRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setDiscovering(false);
        setError('El descubrimiento tardó demasiado. Puede haber un problema con la conexión a CJ. Intenta de nuevo.');
        return;
      }
      try {
        const res = await api.get<{ ok: boolean; run: RunSummary }>(
          `/api/cj-ebay/opportunities/runs/${runId}`
        );
        const r = res.data?.run;
        if (!r) return;
        setRun(r);
        if (r.status === 'COMPLETED' || r.status === 'FAILED') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setDiscovering(false);
          const cRes = await api.get<{ ok: boolean; candidates: CandidateItem[] }>(
            `/api/cj-ebay/opportunities/runs/${runId}/candidates`
          );
          if (cRes.data?.ok) setCandidates(cRes.data.candidates ?? []);
        }
      } catch {
        // polling errors are non-critical
      }
    }, 2500);
  }, [POLL_TIMEOUT_MS]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    setCandidates([]);
    try {
      const res = await api.post<{ ok: boolean; runId: string; status: string }>(
        '/api/cj-ebay/opportunities/discover',
        { mode }
      );
      if (res.data?.ok) {
        const newRun: RunSummary = {
          runId: res.data.runId,
          status: res.data.status,
          mode,
          seedCount: 0,
          candidateCount: 0,
          shortlistedCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          deferredCount: 0,
          createdAt: new Date().toISOString(),
        };
        setRun(newRun);
        startPolling(res.data.runId);
      }
    } catch (e) {
      setError(apiError(e, 'Error al iniciar descubrimiento.'));
      setDiscovering(false);
    }
  };

  const handleDecision = async (id: string, action: 'approve' | 'reject' | 'defer', notes?: string) => {
    try {
      const res = await api.post<{ ok: boolean; candidate: CandidateItem }>(
        `/api/cj-ebay/opportunities/candidates/${id}/${action}`,
        { notes }
      );
      if (res.data?.ok) {
        setCandidates((prev) => prev.map((c) => (c.id === id ? res.data.candidate : c)));
        setRun((prev) =>
          prev
            ? {
                ...prev,
                approvedCount: action === 'approve' ? prev.approvedCount + 1 : prev.approvedCount,
                rejectedCount: action === 'reject' ? prev.rejectedCount + 1 : prev.rejectedCount,
                deferredCount: action === 'defer' ? prev.deferredCount + 1 : prev.deferredCount,
              }
            : prev
        );
        if (drawerItem?.id === id) {
          setDrawerItem(res.data.candidate);
        }
      }
    } catch (e) {
      setError(apiError(e, `Error al ${action === 'approve' ? 'aprobar' : action === 'reject' ? 'rechazar' : 'posponer'}.`));
    }
  };

  const filteredCandidates = filter === 'ALL'
    ? candidates
    : candidates.filter((c) => c.status === filter);

  const isRunning = run?.status === 'RUNNING' || run?.status === 'PENDING';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Descubrimiento de oportunidades
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            El sistema analiza tendencias, busca en CJ, calcula pricing real y construye un shortlist inteligente.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Mode selector */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm">
            {(['STARTER', 'STANDARD'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={discovering}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {m === 'STARTER' ? 'Cuenta nueva' : 'Estándar'}
              </button>
            ))}
          </div>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {discovering ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Buscando…
              </>
            ) : (
              'Buscar por IA'
            )}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Run status card ── */}
      {run && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Modo: {run.mode === 'STARTER' ? 'Cuenta nueva' : 'Estándar'}
            </span>
          </div>
          <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-400 flex-wrap">
            <span>Seeds: <b className="text-slate-900 dark:text-slate-100">{run.seedCount}</b></span>
            <span>Matches CJ: <b className="text-slate-900 dark:text-slate-100">{run.candidateCount}</b></span>
            <span>Shortlist: <b className="text-slate-900 dark:text-slate-100">{run.shortlistedCount}</b></span>
            <span className="text-emerald-600 dark:text-emerald-400">
              Aprobados: <b>{run.approvedCount}</b>
            </span>
            <span className="text-red-600 dark:text-red-400">
              Rechazados: <b>{run.rejectedCount}</b>
            </span>
          </div>
          {run.errorMessage && (
            <p className="w-full text-xs text-red-600 dark:text-red-400">{run.errorMessage}</p>
          )}
          {isRunning && (
            <div className="w-full">
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full animate-pulse w-2/3" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Consultando CJ y calculando pricing…
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      {candidates.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'SHORTLISTED', 'APPROVED', 'REJECTED', 'DEFERRED'] as const).map((f) => {
            const count =
              f === 'ALL' ? candidates.length : candidates.filter((c) => c.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {f === 'ALL' ? 'Todos' : f.charAt(0) + f.slice(1).toLowerCase()} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty states ── */}
      {loading && candidates.length === 0 && (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
          Cargando recomendaciones…
        </div>
      )}

      {!loading && !isRunning && candidates.length === 0 && !run && (
        <div className="py-16 text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
            Sin recomendaciones todavía
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Pulsa <strong>Buscar por IA</strong> para iniciar el motor de descubrimiento. El sistema
            consultará tendencias de mercado, buscará productos en CJ, calculará pricing real y
            construirá un shortlist priorizado.
          </p>
          <div className="mt-4 text-xs text-slate-400 dark:text-slate-500 space-y-1">
            <p>Modo <strong>Cuenta nueva</strong>: criterios más estrictos, menor riesgo, ideal para primeros listings.</p>
            <p>Modo <strong>Estándar</strong>: filtros relajados, mayor variedad de candidatos.</p>
          </div>
        </div>
      )}

      {!loading && !isRunning && run?.status === 'COMPLETED' && candidates.length === 0 && !!run && (
        <div className="py-10 text-center space-y-2">
          <p className="text-3xl">⚠️</p>
          <p className="text-base font-medium text-slate-700 dark:text-slate-300">
            Descubrimiento completado sin candidatos
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Ningún producto encontrado en CJ alcanzó el umbral mínimo de score o margen.
            Prueba el modo <strong>Estándar</strong> para criterios más relajados, o inicia un nuevo run.
          </p>
        </div>
      )}

      {!loading && !isRunning && run?.status === 'COMPLETED' && filteredCandidates.length === 0 && candidates.length > 0 && (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No hay candidatos con el filtro seleccionado.
        </div>
      )}

      {/* ── Candidate grid ── */}
      {filteredCandidates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCandidates.map((c) => (
            <CandidateCard
              key={c.id}
              c={c}
              onDecision={handleDecision}
              onDetail={setDrawerItem}
            />
          ))}
        </div>
      )}

      {/* ── Approved queue callout ── */}
      {candidates.some((c) => c.status === 'APPROVED') && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          <strong>{candidates.filter((c) => c.status === 'APPROVED').length} candidato(s) aprobado(s).</strong>{' '}
          Ve a <strong>Products</strong> para evaluar y publicar en eBay usando el pipeline CJ → eBay.
          Los candidatos aprobados contienen el cjProductId y cjVariantSku listos para usar en{' '}
          <code className="bg-emerald-100 dark:bg-emerald-900/40 px-1 rounded">POST /api/cj-ebay/opportunities/ebay-pipeline</code>.
        </div>
      )}

      {/* ── Detail drawer ── */}
      {drawerItem && (
        <CjEbayOpportunityCandidateDrawer
          candidate={drawerItem}
          onClose={() => setDrawerItem(null)}
          onDecision={(id, action) => handleDecision(id, action)}
        />
      )}
    </div>
  );
}
