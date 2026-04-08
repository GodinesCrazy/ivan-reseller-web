export type PublishingDecision =
  | 'PUBLICABLE'
  | 'NO_PUBLICABLE'
  | 'NEEDS_MARKET_DATA'
  | 'NEEDS_ENRICHMENT'
  | 'REJECTED_LOW_MARGIN'
  | 'REJECTED_LOW_SUPPLIER_QUALITY'
  | 'REJECTED_NO_COMPETITOR_EVIDENCE';

export interface PublishingDecisionResult {
  decision: PublishingDecision;
  reasons: string[];
  canPublish: boolean;
  checkedAt: string;
  comparablesCount: number;
  dataSource?: string;
  realMarginPct: number;
  minimumViablePriceUsd: number;
  suggestedPriceUsd: number;
}

const PUBLISHING_DECISION_LABELS: Record<PublishingDecision, string> = {
  PUBLICABLE: 'Publicable',
  NO_PUBLICABLE: 'No publicable',
  NEEDS_MARKET_DATA: 'Sin datos de mercado',
  NEEDS_ENRICHMENT: 'Datos incompletos',
  REJECTED_LOW_MARGIN: 'Margen insuficiente',
  REJECTED_LOW_SUPPLIER_QUALITY: 'Calidad proveedor baja',
  REJECTED_NO_COMPETITOR_EVIDENCE: 'Sin comparables reales',
};

const PUBLISHING_DECISION_COLORS: Record<PublishingDecision, string> = {
  PUBLICABLE: 'bg-green-100 text-green-800 border-green-300',
  NO_PUBLICABLE: 'bg-red-100 text-red-800 border-red-300',
  NEEDS_MARKET_DATA: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  NEEDS_ENRICHMENT: 'bg-orange-100 text-orange-800 border-orange-300',
  REJECTED_LOW_MARGIN: 'bg-red-100 text-red-800 border-red-300',
  REJECTED_LOW_SUPPLIER_QUALITY: 'bg-red-100 text-red-800 border-red-300',
  REJECTED_NO_COMPETITOR_EVIDENCE: 'bg-gray-100 text-gray-700 border-gray-300',
};

export default function PublishingDecisionBadge({ result }: { result: PublishingDecisionResult }) {
  const label = PUBLISHING_DECISION_LABELS[result.decision] ?? result.decision;
  const colors = PUBLISHING_DECISION_COLORS[result.decision] ?? 'bg-gray-100 text-gray-700 border-gray-300';
  // Guard: reasons may be absent when backend returns a partial publishingDecision
  const reasonsText = Array.isArray(result.reasons) ? result.reasons.join('\n') : '';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${colors}`}
      title={reasonsText}
    >
      {result.canPublish ? '✓' : '○'} {label}
    </span>
  );
}
