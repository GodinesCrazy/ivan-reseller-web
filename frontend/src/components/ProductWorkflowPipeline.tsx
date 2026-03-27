import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from './ui/LoadingSpinner';
import { fetchOperationsTruth } from '@/services/operationsTruth.api';
import type { OperationsTruthItem } from '@/types/operations';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface ProductWorkflowPipelineProps {
  productId: number;
  className?: string;
  showTimeline?: boolean;
  compact?: boolean;
}

const PROOF_STEPS = [
  { key: 'orderIngested', label: 'Order ingested' },
  { key: 'supplierPurchaseProved', label: 'Supplier purchase proved' },
  { key: 'trackingAttached', label: 'Tracking attached' },
  { key: 'deliveredTruthObtained', label: 'Delivered truth' },
  { key: 'releasedFundsObtained', label: 'Released funds' },
  { key: 'realizedProfitObtained', label: 'Realized profit' },
] as const;

function formatStateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'unknown';
  return raw.replace(/_/g, ' ');
}

function getLiveStateBadge(state: string | null | undefined) {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'active') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">active</Badge>;
  if (normalized === 'under_review') return <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-300">under_review</Badge>;
  if (normalized === 'paused') return <Badge variant="outline" className="text-orange-700 border-orange-300 dark:text-orange-300">paused</Badge>;
  if (normalized === 'failed_publish' || normalized === 'not_found') return <Badge variant="destructive">{normalized}</Badge>;
  return <Badge variant="outline" className="text-gray-500">unknown</Badge>;
}

function getBooleanBadge(value: boolean) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      proved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      <CircleDashed className="h-3.5 w-3.5" />
      missing
    </span>
  );
}

export default function ProductWorkflowPipeline({
  productId,
  className = '',
  showTimeline = true,
  compact = false,
}: ProductWorkflowPipelineProps) {
  const { environment } = useEnvironment();
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchOperationalTruth();
  }, [productId, environment]);

  const fetchOperationalTruth = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchOperationsTruth({ ids: [productId], environment });
      const item = response.items.find((candidate) => candidate.productId === productId) ?? null;

      if (!item) {
        setError('No se encontró verdad operativa canónica para este producto');
        setOperationsTruth(null);
        return;
      }

      setOperationsTruth(item);
    } catch (err: any) {
      console.error('Error fetching operations truth:', err);
      setError(err?.response?.data?.error || 'Error al cargar verdad operativa');
      setOperationsTruth(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="p-6">
            <LoadingSpinner text="Cargando estado del workflow..." />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !operationsTruth) {
    return (
      <div className={`${className}`}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>{error || 'Verdad operativa no disponible'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const truth = operationsTruth;
  const proofGridClass = compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3';

  return (
    <div className={`${className}`}>
      <Card className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 shadow-lg dark:from-gray-900 dark:to-gray-800 dark:border-gray-700">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200 dark:from-gray-900 dark:to-gray-800 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold text-gray-800 dark:text-gray-100">Operational Lifecycle Truth</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Reemplaza el pipeline legacy y muestra el estado canónico de listing, blockers, proof, and agent decisions.
              </p>
            </div>
            {truth.listingUrl && (
              <a
                href={truth.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Listing
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Listing and publication truth</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">Local:</span>
                <Badge variant="outline" className="text-gray-700 dark:text-gray-300">
                  {formatStateLabel(truth.localListingState)}
                </Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400">Marketplace:</span>
                {getLiveStateBadge(truth.externalMarketplaceState)}
              </div>
              {truth.externalMarketplaceSubStatus.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sub-status: {truth.externalMarketplaceSubStatus.join(', ')}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Image remediation</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatStateLabel(truth.imageRemediationState)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Publication readiness</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatStateLabel(truth.publicationReadinessState)}</p>
                </div>
              </div>
              {truth.lastMarketplaceSyncAt && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Last marketplace sync: {new Date(truth.lastMarketplaceSyncAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blocker and next action</h3>
              {truth.blockerCode ? (
                <>
                  <div className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {truth.blockerCode}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {truth.blockerMessage || 'Canonical blocker recorded without expanded message.'}
                  </p>
                </>
              ) : (
                <div className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  No canonical blocker
                </div>
              )}
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Next action: {truth.nextAction || 'No explicit next action recorded'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sources: listing={truth.sourceLabels.listing} · blocker={truth.sourceLabels.blocker}
              </p>
            </div>
          </div>

          <div className={`border-t border-gray-200 dark:border-gray-700 pt-6 ${proofGridClass}`}>
            {PROOF_STEPS.map((step) => (
              <div key={step.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.label}</span>
                  {getBooleanBadge(truth[step.key])}
                </div>
              </div>
            ))}
          </div>

          {showTimeline && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Agent trace</h3>
              {truth.agentTrace ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {truth.agentTrace.agentName} · {truth.agentTrace.stage}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {truth.agentTrace.decidedAt ? new Date(truth.agentTrace.decidedAt).toLocaleString() : 'Decision time unknown'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                      truth.agentTrace.blocking
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {truth.agentTrace.blocking ? <ShieldAlert className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      {truth.agentTrace.blocking ? 'blocking' : 'advisory'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-800 dark:text-gray-200">
                    Decision: <span className="font-medium">{truth.agentTrace.decision}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Reason: {truth.agentTrace.reasonCode}
                  </p>
                  {truth.agentTrace.evidenceSummary.length > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                      Evidence: {truth.agentTrace.evidenceSummary.join(' · ')}
                    </p>
                  )}
                  {truth.agentTrace.nextAction && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                      Next action: {truth.agentTrace.nextAction}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                  No canonical agent trace is available for this product yet.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

