import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';
import { API_BASE_URL } from '@/config/runtime';
import { Check, ChevronLeft, ChevronRight, ExternalLink, Wallet, TrendingUp, Wrench, Trash2, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatCurrencySimple } from '@/utils/currency';
import { useEnvironment } from '@/contexts/EnvironmentContext';
import { fetchOperationsTruthForProductIds } from '@/services/operationsTruth.api';
import type { OperationsTruthItem, OperationsTruthResponse } from '@/types/operations';
import {
  isPendingTruthLoading,
  isPendingRowPublishBlocked,
  isMlCanaryCandidateRow,
} from '@/pages/intelligentPublisher/publishRowGuards';
import { lifecycleToneClasses, resolveOperationalLifecycleStage } from '@/utils/operational-lifecycle';

// Usar proxy de imágenes para evitar bloqueo de hotlink de AliExpress
function toProxyUrl(url: string): string {
  if (!url || !url.startsWith('http')) return url;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const path = base.endsWith('/api') ? '/publisher/proxy-image' : '/api/publisher/proxy-image';
  return `${base}${path}?url=${encodeURIComponent(url)}`;
}

function sanitizeProductTitle(title: string): string {
  if (!title || typeof title !== 'string') return title;
  // Corregir %A (posible corrupción de "para") y otros artefactos de encoding
  return title
    .replace(/%A\s+/gi, 'para ')
    .replace(/\s+%A\s+/g, ' para ');
}

function formatDateEs(date: Date | string): string {
  return new Date(date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function getLiveStateBadge(state: string | null | undefined) {
  const normalized = String(state || '').trim().toLowerCase();
  const toneClass =
    normalized === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
    normalized === 'under_review' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
    normalized === 'paused' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
    (normalized === 'failed_publish' || normalized === 'not_found') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
    'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200';
  const label = normalized || 'desconocido';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>{label}</span>;
}

type PendingApproveRequest = {
  marketplaces: string[];
  publishMode: 'local' | 'international';
  publishIntent: 'dry_run' | 'pilot' | 'production';
  pilotManualAck: boolean;
};

export default function IntelligentPublisher() {
  const location = useLocation();
  const { environment } = useEnvironment();
  const navigate = useNavigate();
  const [pending, setPending] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMk, setBulkMk] = useState<{ ebay: boolean; mercadolibre: boolean; amazon: boolean }>({
    ebay: false,
    mercadolibre: false,
    amazon: false,
  });
  const [bulkStatus, setBulkStatus] = useState<{ total: number; queued: number; done: number; errors: number; running: boolean }>({ total: 0, queued: 0, done: 0, errors: 0, running: false });
  const [loading, setLoading] = useState(true);
  const [listingsPage, setListingsPage] = useState(1);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [listingsMarketplaceFilter, setListingsMarketplaceFilter] = useState<'all' | 'ebay' | 'mercadolibre' | 'amazon'>('all');
  const [repairingMl, setRepairingMl] = useState(false);
  const [pendingRowBusy, setPendingRowBusy] = useState<Record<string, 'reject' | 'remove'>>({});
  const [bulkPendingBusy, setBulkPendingBusy] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [capitalData, setCapitalData] = useState<{
    availableCash: number;
    canPublish: boolean;
    remainingExposure: number;
  } | null>(null);
  const [operationsTruth, setOperationsTruth] = useState<OperationsTruthResponse | null>(null);
  const [operationsTruthLoading, setOperationsTruthLoading] = useState(false);
  const [pendingViewFilter, setPendingViewFilter] = useState<'all' | 'ml_canary_ready' | 'blocked_only'>('all');
  const [pendingSort, setPendingSort] = useState<'smart' | 'ml_margin_desc' | 'estimate_desc'>('smart');
  const LISTINGS_PER_PAGE = 50;
  const PENDING_PER_PAGE = 20;
  const listingsTotalPages = Math.max(1, Math.ceil(listingsTotal / LISTINGS_PER_PAGE));

  const loadListings = useCallback(async (page: number, marketplace?: 'all' | 'ebay' | 'mercadolibre' | 'amazon') => {
    try {
      const mp = marketplace ?? listingsMarketplaceFilter;
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LISTINGS_PER_PAGE));
      if (mp && mp !== 'all') params.set('marketplace', mp);
      const res = await api.get(`/api/publisher/listings?${params.toString()}`);
      setListings(res.data?.items || []);
      setListingsTotal(res.data?.pagination?.total ?? res.data?.total ?? 0);
    } catch (error: any) {
      console.error('Error loading listings:', error);
    }
  }, [listingsMarketplaceFilter]);

  const loadCapitalData = useCallback(async () => {
    try {
      const [wcRes, allocRes] = await Promise.all([
        api.get<{ detail?: { availableCash?: number } }>('/api/finance/working-capital-detail', {
          params: { environment },
        }).catch(() => ({ data: {} as { detail?: { availableCash?: number } } })),
        api.get<{ capitalAllocation?: { canPublish?: boolean; remainingExposure?: number } }>('/api/finance/leverage-and-risk', {
          params: { environment },
        }).catch(() => ({ data: {} as { capitalAllocation?: { canPublish?: boolean; remainingExposure?: number } } })),
      ]);
      const detail = wcRes.data?.detail;
      const alloc = allocRes.data?.capitalAllocation;
      setCapitalData({
        availableCash: detail?.availableCash ?? 0,
        canPublish: alloc?.canPublish ?? false,
        remainingExposure: alloc?.remainingExposure ?? 0,
      });
    } catch {
      setCapitalData(null);
    }
  }, [environment]);

  const loadPublisherData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true);
      const [pendingRes] = await Promise.all([
        api.get('/api/publisher/pending'),
        loadListings(1),
        loadCapitalData(),
      ]);
      setPending(pendingRes.data?.items || []);
      setListingsPage(1);
      setPendingPage(1);
    } catch (error: any) {
      console.error('Error loading publisher data:', error);
      const status = error?.response?.status;
      if (status !== 429 && status !== 403 && (status == null || status < 500)) {
        toast.error('Error al cargar productos pendientes');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadListings, loadCapitalData]);

  useEffect(() => {
    void loadPublisherData();
  }, [loadPublisherData, location.pathname]);

  useLiveData({
    fetchFn: () => void loadPublisherData({ silent: true }),
    intervalMs: 45000,
    enabled: true,
    pauseWhenHidden: true,
    skipInitialRun: true,
  });
  useNotificationRefetch({
    handlers: { PRODUCT_PUBLISHED: () => void loadPublisherData({ silent: true }) },
    enabled: true,
  });

  useEffect(() => {
    let cancelled = false;
    const productIds = Array.from(new Set([
      ...pending.map((item: any) => Number(item.id)).filter((value) => Number.isFinite(value) && value > 0),
      ...listings.map((item: any) => Number(item.productId)).filter((value) => Number.isFinite(value) && value > 0),
    ]));

    if (productIds.length === 0) {
      setOperationsTruth(null);
      setOperationsTruthLoading(false);
      return;
    }

    setOperationsTruthLoading(true);
    fetchOperationsTruthForProductIds({ ids: productIds, environment })
      .then((data) => {
        if (!cancelled) setOperationsTruth(data);
      })
      .catch(() => {
        if (!cancelled) setOperationsTruth(null);
      })
      .finally(() => {
        if (!cancelled) setOperationsTruthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pending, listings, environment]);

  const operationsTruthByProduct = useMemo(() => {
    const entries = operationsTruth?.items ?? [];
    return new Map(entries.map((item) => [Number(item.productId), item]));
  }, [operationsTruth]);

  const rowTruthLoading = isPendingTruthLoading(pending.length, operationsTruthLoading);

  const pendingFilteredSorted = useMemo(() => {
    let rows = [...pending];
    const getTruth = (p: any) => operationsTruthByProduct.get(Number(p.id)) ?? null;

    if (pendingViewFilter === 'ml_canary_ready') {
      rows = rows.filter((p) => isMlCanaryCandidateRow(p, getTruth(p), rowTruthLoading));
    } else if (pendingViewFilter === 'blocked_only') {
      rows = rows.filter((p) => isPendingRowPublishBlocked(getTruth(p), rowTruthLoading));
    }

    const mlMargin = (p: any) => Number(p?.estimatedProfitByMarketplace?.mercadolibre ?? NaN);

    rows.sort((a, b) => {
      const ta = getTruth(a);
      const tb = getTruth(b);
      const ba = isPendingRowPublishBlocked(ta, rowTruthLoading) ? 1 : 0;
      const bb = isPendingRowPublishBlocked(tb, rowTruthLoading) ? 1 : 0;
      if (pendingSort === 'smart' && ba !== bb) return ba - bb;
      if (pendingSort === 'ml_margin_desc') {
        const da = mlMargin(a);
        const db = mlMargin(b);
        if (Number.isFinite(db) && Number.isFinite(da) && db !== da) return db - da;
        if (ba !== bb) return ba - bb;
        return String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (pendingSort === 'estimate_desc') {
        const da = Number(a.estimatedProfit ?? 0);
        const db = Number(b.estimatedProfit ?? 0);
        if (db !== da) return db - da;
        if (ba !== bb) return ba - bb;
        return String(a.title || '').localeCompare(String(b.title || ''));
      }
      if (ba !== bb) return ba - bb;
      const da = mlMargin(a);
      const db = mlMargin(b);
      if (Number.isFinite(db) && Number.isFinite(da) && db !== da) return db - da;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return rows;
  }, [pending, operationsTruthByProduct, pendingViewFilter, pendingSort, rowTruthLoading]);

  const pendingTotalPages = Math.max(1, Math.ceil(pendingFilteredSorted.length / PENDING_PER_PAGE));

  useEffect(() => {
    setPendingPage(1);
  }, [pendingViewFilter, pendingSort]);

  const displayedPending = useMemo(() => {
    const start = (pendingPage - 1) * PENDING_PER_PAGE;
    return pendingFilteredSorted.slice(start, start + PENDING_PER_PAGE);
  }, [pendingFilteredSorted, pendingPage]);

  const filterPublishableProductIds = useCallback(
    (ids: string[]) =>
      ids.filter((pid) => {
        const t = operationsTruthByProduct.get(Number(pid));
        return !isPendingRowPublishBlocked(t, rowTruthLoading);
      }),
    [operationsTruthByProduct, rowTruthLoading]
  );

  const selectBlockedPendingOnly = useCallback(() => {
    const next: Record<string, boolean> = {};
    pending.forEach((p: any) => {
      const t = operationsTruthByProduct.get(Number(p.id));
      if (isPendingRowPublishBlocked(t, rowTruthLoading)) next[String(p.id)] = true;
    });
    setSelected(next);
    const c = Object.keys(next).length;
    if (c === 0) toast.error('No hay pendientes bloqueados en la lista actual.');
    else toast.success(`${c} producto(s) bloqueado(s) seleccionado(s). Podés rechazar o eliminar en bloque.`);
  }, [pending, operationsTruthByProduct, rowTruthLoading]);

  const operationsTruthByListing = useMemo(() => {
    const entries = operationsTruth?.items ?? [];
    return new Map(
      entries
        .filter((item) => item.marketplace && item.listingId)
        .map((item) => [`${item.marketplace}:${item.listingId}`, item] as const)
    );
  }, [operationsTruth]);

  const resolveListingTruth = useCallback((listing: any): OperationsTruthItem | null => {
    const productId = Number(listing?.productId);
    if (Number.isFinite(productId) && operationsTruthByProduct.has(productId)) {
      return operationsTruthByProduct.get(productId) ?? null;
    }
    const marketplace = String(listing?.marketplace || '').trim().toLowerCase();
    const listingId = String(listing?.listingId || '').trim();
    if (marketplace && listingId) {
      return operationsTruthByListing.get(`${marketplace}:${listingId}`) ?? null;
    }
    return null;
  }, [operationsTruthByListing, operationsTruthByProduct]);

  const approve = useCallback(async (productId: string, request: PendingApproveRequest) => {
    const { marketplaces, publishMode, publishIntent, pilotManualAck } = request;
    const truth = operationsTruthByProduct.get(Number(productId));
    const loading = isPendingTruthLoading(pending.length, operationsTruthLoading);
    const allowDryRunBlocked = publishIntent === 'dry_run' && marketplaces.includes('mercadolibre');
    if (isPendingRowPublishBlocked(truth, loading) && !allowDryRunBlocked) {
      toast.error(
        'Este producto tiene bloqueos operativos (ver bloque inferior). Resuélvelos antes de aprobar; no se publicará desde aquí hasta entonces.'
      );
      return;
    }
    if (!Array.isArray(marketplaces) || marketplaces.length === 0) {
      toast.error('Selecciona al menos un marketplace; no hay ninguno preseleccionado por seguridad.');
      return;
    }
    if (publishMode === 'international' && !marketplaces.includes('mercadolibre')) {
      toast.error('El modo international aplica al flujo Mercado Libre. Selecciona ML o usa local.');
      return;
    }
    if (publishIntent !== 'production' && !marketplaces.includes('mercadolibre')) {
      toast.error('Intento pilot/dry_run solo aplica cuando Mercado Libre está seleccionado.');
      return;
    }
    try {
      const response = await api.post(`/api/publisher/approve/${productId}`, {
        marketplaces,
        publishMode,
        publishIntent,
        pilotManualAck,
        customData: {
          publishMode,
          publishIntent,
          pilotManualAck,
        },
      });
      const data = response.data;
      setPending((prev) => prev.filter((p) => String(p.id) !== String(productId)));

      if (data?.dryRun === true) {
        toast.success('Dry-run completado. No se publicó; revisa el preflight retornado por backend.', {
          duration: 6000,
        });
        return;
      }

      if (data?.jobQueued === true) {
        toast.success(
          'Producto aprobado. La publicación se está procesando; recibirás una notificación cuando termine.',
          { duration: 6000 }
        );
        return;
      }

      if (data?.publishResults && Array.isArray(data.publishResults)) {
        const successCount = data.publishResults.filter((r: any) => r.success).length;
        const totalCount = data.publishResults.length;

        if (successCount === totalCount && totalCount > 0) {
          toast.success(`Producto aprobado y publicado en ${successCount} marketplace(s)`);
        } else if (successCount > 0) {
          toast.success(`Producto aprobado. Publicado en ${successCount}/${totalCount} marketplace(s)`);
        } else if (totalCount > 0) {
          const failed = data.publishResults.filter((r: any) => !r.success);
          const errorDetails = failed
            .map((r: any) => `${r.marketplace || 'Marketplace'}: ${r.error || 'Error desconocido'}`)
            .join('. ');
          toast.error(
            (t: { id: string }) => (
              <div className="flex flex-col gap-2">
                <span>Producto aprobado, pero la publicación falló.</span>
                <span className="text-sm">{errorDetails}</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    navigate('/settings?tab=api-credentials');
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 underline"
                >
                  Ir a Configuración →
                </button>
              </div>
            ),
            { duration: 10000 }
          );
        } else {
          toast.success('Producto aprobado');
        }
      } else {
        toast.success('Producto aprobado');
      }
    } catch (e: any) {
      const res = e?.response?.data;
      const errorMessage = res?.message || res?.error || e?.message || 'Error al aprobar producto';
      const settingsUrl = res?.settingsUrl || '/settings?tab=api-credentials';
      if (res?.action === 'update_credentials' || res?.invalidCredentials?.length || /credential|ebay|expired/i.test(errorMessage)) {
        toast.error(
          (t) => (
            <div className="flex flex-col gap-2">
              <span>{errorMessage}</span>
              <button
                onClick={() => { toast.dismiss(t.id); navigate(settingsUrl); }}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 underline"
              >
                Ir a Configuración →
              </button>
            </div>
          ),
          { duration: 8000 }
        );
      } else {
        toast.error(errorMessage);
      }
    }
  }, [navigate, operationsTruthByProduct, operationsTruthLoading, pending.length]);

  const rejectPendingOne = useCallback(
    async (productId: string) => {
      const row = pending.find((p: any) => String(p.id) === productId);
      const titleShort = row ? sanitizeProductTitle(String(row.title || '')).slice(0, 80) : productId;
      if (
        !window.confirm(
          `¿Rechazar este producto?\n\n"${titleShort}"\n\nPasará a estado RECHAZADO y saldrá de la cola del publicador. El registro del producto se conserva en el sistema.`
        )
      ) {
        return;
      }
      setPendingRowBusy((s) => ({ ...s, [productId]: 'reject' }));
      try {
        await api.post(`/api/publisher/pending/reject/${encodeURIComponent(productId)}`);
        setPending((prev) => prev.filter((p: any) => String(p.id) !== productId));
        setSelected((s) => {
          const n = { ...s };
          delete n[productId];
          return n;
        });
        toast.success('Producto rechazado');
        void loadPublisherData({ silent: true });
      } catch (e: any) {
        toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Error al rechazar');
      } finally {
        setPendingRowBusy((s) => {
          const n = { ...s };
          delete n[productId];
          return n;
        });
      }
    },
    [pending, loadPublisherData]
  );

  const removePendingOne = useCallback(
    async (productId: string) => {
      const row = pending.find((p: any) => String(p.id) === productId);
      const titleShort = row ? sanitizeProductTitle(String(row.title || '')).slice(0, 80) : productId;
      if (
        !window.confirm(
          `¿ELIMINAR permanentemente este producto?\n\n"${titleShort}"\n\nEsta acción borra el producto de la base de datos. No se puede eliminar si tiene ventas asociadas.`
        )
      ) {
        return;
      }
      setPendingRowBusy((s) => ({ ...s, [productId]: 'remove' }));
      try {
        await api.post(`/api/publisher/pending/remove/${encodeURIComponent(productId)}`);
        setPending((prev) => prev.filter((p: any) => String(p.id) !== productId));
        setSelected((s) => {
          const n = { ...s };
          delete n[productId];
          return n;
        });
        toast.success('Producto eliminado');
        void loadPublisherData({ silent: true });
      } catch (e: any) {
        toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Error al eliminar');
      } finally {
        setPendingRowBusy((s) => {
          const n = { ...s };
          delete n[productId];
          return n;
        });
      }
    },
    [pending, loadPublisherData]
  );

  const runBulkPendingReject = useCallback(async () => {
    const productIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (productIds.length === 0) {
      toast.error('Selecciona al menos un producto pendiente');
      return;
    }
    if (
      !window.confirm(
        `¿Rechazar ${productIds.length} producto(s) seleccionado(s)? Pasarán a RECHAZADO y saldrán de pendientes (no se eliminan).`
      )
    ) {
      return;
    }
    setBulkPendingBusy(true);
    try {
      const { data } = await api.post('/api/publisher/pending/bulk-reject', {
        productIds: productIds.map((id) => Number(id)),
      });
      const rejected: number[] = data?.rejected ?? [];
      const skipped: { id: number; error: string }[] = data?.skipped ?? [];
      setPending((prev) => prev.filter((p: any) => !rejected.includes(Number(p.id))));
      setSelected((prev) => {
        const n = { ...prev };
        rejected.forEach((id) => {
          delete n[String(id)];
        });
        return n;
      });
      if (skipped.length > 0) {
        toast.error(
          `${rejected.length} rechazado(s). ${skipped.length} omitido(s) (sin permiso o estado no pendiente).`
        );
      } else {
        toast.success(`${rejected.length} producto(s) rechazado(s)`);
      }
      void loadPublisherData({ silent: true });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error en rechazo masivo');
    } finally {
      setBulkPendingBusy(false);
    }
  }, [selected, loadPublisherData]);

  const runBulkPendingRemove = useCallback(async () => {
    const productIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (productIds.length === 0) {
      toast.error('Selecciona al menos un producto pendiente');
      return;
    }
    if (
      !window.confirm(
        `¿ELIMINAR ${productIds.length} producto(s) de forma permanente? Esta acción no se puede deshacer. Los que tengan ventas no se eliminarán.`
      )
    ) {
      return;
    }
    setBulkPendingBusy(true);
    try {
      const { data } = await api.post('/api/publisher/pending/bulk-remove', {
        productIds: productIds.map((id) => Number(id)),
      });
      const removed: number[] = data?.removed ?? [];
      const skipped: { id: number; error: string }[] = data?.skipped ?? [];
      setPending((prev) => prev.filter((p: any) => !removed.includes(Number(p.id))));
      setSelected((prev) => {
        const n = { ...prev };
        removed.forEach((id) => {
          delete n[String(id)];
        });
        return n;
      });
      if (skipped.length > 0) {
        toast.error(
          `${removed.length} eliminado(s). ${skipped.length} omitido(s) (p. ej. con ventas o sin permiso).`
        );
      } else {
        toast.success(`${removed.length} producto(s) eliminado(s)`);
      }
      void loadPublisherData({ silent: true });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error en eliminación masiva');
    } finally {
      setBulkPendingBusy(false);
    }
  }, [selected, loadPublisherData]);

  const goToListingsPage = useCallback((page: number) => {
    setListingsPage(page);
    loadListings(page, listingsMarketplaceFilter);
  }, [loadListings, listingsMarketplaceFilter]);

  const handleRepairAllMlListings = useCallback(async () => {
    setRepairingMl(true);
    const t = toast.loading('Reparando listados de Mercado Libre…');
    try {
      const { data } = await api.post('/api/publisher/listings/repair-ml', { limit: 5000 });
      toast.dismiss(t);
      const repaired = data?.repaired ?? 0;
      const failed = data?.failed ?? 0;
      if (repaired > 0 || failed > 0) {
        toast.success(`ML: ${repaired} reparados${failed > 0 ? `, ${failed} fallidos` : ''}.`);
        loadListings(listingsPage, listingsMarketplaceFilter);
      } else {
        toast.success('No hay listados ML para reparar.');
      }
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err?.response?.data?.error || 'Error al reparar listados ML');
    } finally {
      setRepairingMl(false);
    }
  }, [listingsPage, listingsMarketplaceFilter]);

  const handleListingsMarketplaceFilter = useCallback((mp: 'all' | 'ebay' | 'mercadolibre' | 'amazon') => {
    setListingsMarketplaceFilter(mp);
    setListingsPage(1);
    loadListings(1, mp);
  }, [loadListings]);

  const bulkProgress = useMemo(() => {
    return bulkStatus.total ? (bulkStatus.queued / bulkStatus.total) * 100 : 0;
  }, [bulkStatus.total, bulkStatus.queued]);

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner text="Cargando publicador..." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Publicador inteligente</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Prepara, aprueba y publica anuncios con verdad canónica de listing, blocker y next action. Las estimaciones comerciales son secundarias y no equivalen a proof comercial.
        </p>
      </div>

      {/* Blocker summary — compact signal for this publish queue */}
      {operationsTruth && (() => {
        const totalBlockers = (operationsTruth.summary.blockerCounts ?? []).reduce((s, b) => s + Number(b.count || 0), 0);
        const active = operationsTruth.summary.liveStateCounts?.active ?? 0;
        if (totalBlockers === 0 && active === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-2">
            {active > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {active} listing{active !== 1 ? 's' : ''} activo{active !== 1 ? 's' : ''}
              </span>
            )}
            {totalBlockers > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {totalBlockers} blocker{totalBlockers !== 1 ? 's' : ''} activo{totalBlockers !== 1 ? 's' : ''}
              </span>
            )}
            <a href="/control-center" className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline transition-colors">
              Ver detalle en Control Center →
            </a>
          </div>
        );
      })()}

      {/* Bulk publish toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-3 flex flex-col gap-2">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Publicación masiva seleccionada (encolar trabajos)</div>
        <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1.5">
          Por seguridad de canario ML: <strong>ningún marketplace viene preseleccionado</strong>. Solo se encolan productos{' '}
          <strong>sin bloqueo canónico</strong> (p. ej. missingSku queda fuera). Elegí Mercado Libre explícitamente antes de encolar.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Marketplaces para cola:</span>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.ebay} onChange={(e)=>setBulkMk(v=>({...v, ebay: e.target.checked}))}/> eBay</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.mercadolibre} onChange={(e)=>setBulkMk(v=>({...v, mercadolibre: e.target.checked}))}/> ML</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={bulkMk.amazon} onChange={(e)=>setBulkMk(v=>({...v, amazon: e.target.checked}))}/> Amazon</label>
          <button
            type="button"
            disabled={bulkPendingBusy || bulkStatus.running}
            onClick={() => setBulkMk({ ebay: false, mercadolibre: true, amazon: false })}
            className="px-2 py-0.5 text-[11px] border rounded-md border-primary-300 text-primary-800 dark:text-primary-200 hover:bg-primary-50 dark:hover:bg-primary-950/20"
          >
            Preset: solo ML
          </button>
          <button
            type="button"
            disabled={bulkPendingBusy || bulkStatus.running}
            onClick={() => setBulkMk({ ebay: false, mercadolibre: false, amazon: false })}
            className="px-2 py-0.5 text-[11px] border rounded-md border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Limpiar marketplaces
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button disabled={bulkPendingBusy || bulkStatus.running} onClick={async()=>{
            const productIds = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (productIds.length===0 || marketplaces.length===0) { toast.error('Selecciona al menos un producto y al menos un marketplace'); return; }
            const allowed = filterPublishableProductIds(productIds);
            if (allowed.length < productIds.length) {
              toast.error(`Omitidos ${productIds.length - allowed.length} producto(s) con bloqueos; no se encolan.`);
            }
            if (allowed.length === 0) { toast.error('Ningún seleccionado está publicable sin bloqueos.'); return; }
            setBulkStatus({ total: allowed.length, queued: 0, done: 0, errors: 0, running: true });
            for (const pid of allowed) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            toast.success('Trabajos de publicación encolados (solo filas sin bloqueo).');
          }} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors">Encolar trabajos</button>
          <button type="button" disabled={bulkPendingBusy || bulkStatus.running} onClick={()=>{ const all: Record<string, boolean> = {}; pending.forEach((p:any)=> all[String(p.id)]=true); setSelected(all); }} className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-xs disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800">Seleccionar todo</button>
          <button type="button" disabled={bulkPendingBusy || bulkStatus.running} onClick={selectBlockedPendingOnly} className="px-2.5 py-1.5 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 rounded-md text-xs disabled:opacity-50 hover:bg-red-50 dark:hover:bg-red-950/20" title="Selecciona filas con bloqueo canónico para rechazar o eliminar en bloque">
            Solo bloqueados
          </button>
          <button type="button" disabled={bulkPendingBusy || bulkStatus.running} onClick={()=> setSelected({}) } className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-xs disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800">Limpiar</button>
          <button type="button" disabled={bulkPendingBusy || bulkStatus.running} onClick={runBulkPendingReject} className="px-2.5 py-1.5 border border-amber-600 text-amber-800 dark:text-amber-200 rounded-md text-xs hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50">Rechazar sel.</button>
          <button type="button" disabled={bulkPendingBusy || bulkStatus.running} onClick={runBulkPendingRemove} className="px-2.5 py-1.5 border border-red-600 text-red-700 dark:text-red-300 rounded-md text-xs hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar sel.</button>
          <button disabled={bulkPendingBusy || bulkStatus.running} onClick={async()=>{
            const allIds = pending.map((p:any)=> String(p.id));
            const marketplaces = (['ebay','mercadolibre','amazon'] as const).filter(m=>bulkMk[m]);
            if (allIds.length===0 || marketplaces.length===0) { toast.error('No hay productos pendientes o no elegiste marketplaces'); return; }
            const allowed = filterPublishableProductIds(allIds);
            if (allowed.length < allIds.length) {
              toast.error(`Omitidos ${allIds.length - allowed.length} pendiente(s) bloqueado(s). Solo se encolan ${allowed.length} sin bloqueo.`);
            }
            if (allowed.length === 0) { toast.error('Ningún pendiente está publicable sin bloqueos.'); return; }
            setBulkStatus({ total: allowed.length, queued: 0, done: 0, errors: 0, running: true });
            for (const pid of allowed) {
              try {
                await api.post('/api/jobs/publishing', { productId: Number(pid), marketplaces });
                setBulkStatus(s=>({ ...s, queued: s.queued + 1 }));
              } catch {
                setBulkStatus(s=>({ ...s, queued: s.queued + 1, errors: s.errors + 1 }));
              }
              await new Promise(r=>setTimeout(r, 300));
            }
            setBulkStatus(s=>({ ...s, running: false }));
            toast.success('Encolados solo pendientes sin bloqueo canónico');
          }} className="px-2.5 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium disabled:opacity-50 hover:bg-green-700 transition-colors">Publicar todo (sin bloqueados)</button>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${bulkProgress}%` }} />
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">En cola: {bulkStatus.queued}/{bulkStatus.total} · Errores: {bulkStatus.errors}</div>
      </div>

      {/* Add product for approval */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-3">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Añadir producto para aprobación (URL de AliExpress)</div>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm placeholder:text-slate-400" placeholder="https://www.aliexpress.com/item/..." value={url} onChange={(e)=>setUrl(e.target.value)} />
          <button onClick={async()=>{
            try {
              await api.post('/api/publisher/add_for_approval', { aliexpressUrl: url, scrape: true });
              const { data } = await api.get('/api/publisher/pending');
              setPending(data?.items || []);
              setUrl('');
              toast.success('Producto añadido para aprobación');
            } catch (e:any) {
              toast.error('Error al añadir producto');
            }
          }} className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">Añadir</button>
        </div>
      </div>

      {/* Capital strip */}
      {capitalData != null && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Capital disponible:</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatCurrencySimple(capitalData.availableCash, 'USD')}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Puede publicar:</span>
            {capitalData.canPublish ? (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Sí
                {capitalData.remainingExposure > 0 && (
                  <span className="text-slate-500 font-normal ml-1">(+{formatCurrencySimple(capitalData.remainingExposure, 'USD')})</span>
                )}
              </span>
            ) : (
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Límite alcanzado</span>
            )}
          </div>
        </div>
      )}

      {/* Pending approvals header + filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            Aprobaciones pendientes: <span className="font-semibold text-slate-900 dark:text-slate-100">{pending.length}</span>
            {pending.length > 0 && (
              <span className="ml-2 text-[11px] text-slate-500">
                ({pending.filter((p: any) => p.source === 'autopilot').length} del Autopilot)
              </span>
            )}
            {pendingFilteredSorted.length !== pending.length && (
              <span className="ml-2 text-[11px] font-medium text-primary-700 dark:text-primary-300">
                Vista: {pendingFilteredSorted.length} fila(s)
              </span>
            )}
          </div>
          <button 
            type="button"
            onClick={async () => {
              try {
                await loadPublisherData({ silent: true });
                toast.success('Lista actualizada');
              } catch {
                toast.error('Error al actualizar');
              }
            }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
            disabled={bulkPendingBusy || Object.keys(pendingRowBusy).length > 0}
          >
            Actualizar
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs border-t border-slate-200 dark:border-slate-800 pt-2.5">
          <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Vista canario ML
          </span>
          {(['all', 'ml_canary_ready', 'blocked_only'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPendingViewFilter(key)}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                pendingViewFilter === key
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {key === 'all' && 'Todos'}
              {key === 'ml_canary_ready' && 'Solo ML publicables'}
              {key === 'blocked_only' && 'Solo bloqueados'}
            </button>
          ))}
          <label className="inline-flex items-center gap-1 ml-2 text-slate-600 dark:text-slate-400">
            <span className="text-[11px]">Orden:</span>
            <select
              value={pendingSort}
              onChange={(e) => setPendingSort(e.target.value as typeof pendingSort)}
              className="border border-slate-300 dark:border-slate-600 rounded-md px-1.5 py-0.5 text-[11px] bg-white dark:bg-slate-800"
            >
              <option value="smart">Publicables primero + margen ML</option>
              <option value="ml_margin_desc">Margen ML (estim.)</option>
              <option value="estimate_desc">Margen fila (estim.)</option>
            </select>
          </label>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          «Solo ML publicables»: sin bloqueo canónico y con margen ML estimado &gt; 0. Los bloqueados (p. ej. missingSku) no muestran aprobar como acción principal.
        </p>
      </div>

      {/* Pending products list */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
        {displayedPending.map((p: any) => {
          const truth = operationsTruthByProduct.get(Number(p.id)) ?? null;
          return (
            <PendingProductCard
              key={`pending-${String(p.id)}`}
              product={p}
              productId={String(p.id)}
              operationsTruth={truth}
              truthLoading={rowTruthLoading}
              selected={!!selected[String(p.id)]}
              onSelectChange={(checked) => setSelected((s) => ({ ...s, [String(p.id)]: checked }))}
              onApprove={(request) => approve(String(p.id), request)}
              onReject={() => rejectPendingOne(String(p.id))}
              onRemove={() => removePendingOne(String(p.id))}
              rowBusy={pendingRowBusy[String(p.id)]}
            />
          );
        })}
        {pendingFilteredSorted.length === 0 && pending.length > 0 && (
          <div className="p-4 text-xs text-slate-500">Ningún pendiente coincide con el filtro actual.</div>
        )}
        {pending.length === 0 && <div className="p-4 text-xs text-slate-500">No hay productos pendientes.</div>}
        {pendingFilteredSorted.length > 0 && pendingTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2.5 px-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs">
            <button
              disabled={pendingPage <= 1}
              onClick={() => setPendingPage((prev) => Math.max(1, prev - 1))}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 font-medium transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 inline" /> Anterior
            </button>
            <span className="text-slate-600 dark:text-slate-400 font-medium">
              Página {pendingPage} de {pendingTotalPages} ({pendingFilteredSorted.length} en vista)
            </span>
            <button
              disabled={pendingPage >= pendingTotalPages}
              onClick={() => setPendingPage((prev) => Math.min(pendingTotalPages, prev + 1))}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 font-medium transition-colors"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5 inline" />
            </button>
          </div>
        )}
      </div>

      {/* Published listings section */}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anuncios publicados ({listingsTotal})</div>
          {listingsTotal > 0 && (
            <span className="text-[11px] text-slate-500">
              Mostrando {((listingsPage - 1) * LISTINGS_PER_PAGE) + 1}–{Math.min(listingsPage * LISTINGS_PER_PAGE, listingsTotal)} de {listingsTotal} listados
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 items-center">
          {(['all', 'ebay', 'mercadolibre', 'amazon'] as const).map((mp) => (
            <button
              key={mp}
              onClick={() => handleListingsMarketplaceFilter(mp)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                listingsMarketplaceFilter === mp
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {mp === 'all' ? 'Todos' : mp === 'mercadolibre' ? 'Mercado Libre' : mp === 'ebay' ? 'eBay' : 'Amazon'}
            </button>
          ))}
          <button
            type="button"
            onClick={handleRepairAllMlListings}
            disabled={repairingMl}
            className="ml-auto px-3 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800/50 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
            title="Corregir título, descripción y atributos de todos los listados ML (error VIP67)"
          >
            <Wrench className="w-3.5 h-3.5" />
            {repairingMl ? 'Reparando…' : 'Reparar todos los listados ML'}
          </button>
        </div>

        {/* Listings table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-10" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Producto / Listing</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Enlace</span>
          </div>
          {listings.map((l:any)=>(
            <div key={l.id} className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 flex items-center gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              {l.productImage && (
                <img src={toProxyUrl(l.productImage)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" referrerPolicy="no-referrer" />
              )}
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{l.productTitle || l.listingId}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{l.marketplace.toUpperCase()} – {l.listingId} – {l.publishedAt ? formatDateEs(l.publishedAt) : ''}</div>
                {(() => {
                  const truth = resolveListingTruth(l);
                  if (!truth) {
                    return <div className="text-[11px] text-slate-400 mt-1">Sin verdad canónica de listing asociada</div>;
                  }
                  const lifecycle = resolveOperationalLifecycleStage({ operationsTruth: truth });
                  return (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${lifecycleToneClasses(lifecycle.tone)}`}>
                          {lifecycle.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={lifecycle.detail}>
                          {lifecycle.detail}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {getLiveStateBadge(truth.externalMarketplaceState)}
                        {truth.externalMarketplaceSubStatus.length > 0 && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={truth.externalMarketplaceSubStatus.join(', ')}>
                            {truth.externalMarketplaceSubStatus.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        Orden: {truth.orderIngested ? 'ingestada' : 'pendiente'} · Compra: {truth.supplierPurchaseProved ? 'probada' : 'pendiente'} · Tracking: {truth.trackingAttached ? 'adjunto' : 'faltante'}
                      </div>
                      {truth.blockerCode ? (
                        <div className="text-[11px] text-red-600 dark:text-red-400" title={truth.blockerMessage || truth.blockerCode}>
                          Blocker: {truth.blockerCode}
                        </div>
                      ) : (
                        <div className="text-[11px] text-green-600 dark:text-green-400">Sin blocker actual</div>
                      )}
                      {truth.nextAction && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300" title={truth.nextAction}>
                          Siguiente: {truth.nextAction}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {l.listingUrl && (
                <a href={l.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 text-xs font-medium hover:underline flex-shrink-0 inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Abrir
                </a>
              )}
            </div>
          ))}
          {listings.length===0 && <div className="p-4 text-xs text-slate-500">Aún no hay anuncios publicados.</div>}
        </div>
        {listingsTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-3 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs">
            <button
              disabled={listingsPage <= 1}
              onClick={() => goToListingsPage(Math.max(1, listingsPage - 1))}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 font-medium transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 inline" /> Anterior
            </button>
            <span className="text-slate-600 dark:text-slate-400 font-medium">Página {listingsPage} de {listingsTotalPages} ({listingsTotal} total)</span>
            <button
              disabled={listingsPage >= listingsTotalPages}
              onClick={() => goToListingsPage(Math.min(listingsTotalPages, listingsPage + 1))}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 font-medium transition-colors"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5 inline" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingProductCard({
  product: p,
  productId,
  operationsTruth,
  truthLoading,
  selected,
  onSelectChange,
  onApprove,
  onReject,
  onRemove,
  rowBusy,
}: {
  product: any;
  productId: string;
  operationsTruth: OperationsTruthItem | null;
  truthLoading: boolean;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  onApprove: (request: PendingApproveRequest) => void;
  onReject: () => void;
  onRemove: () => void;
  rowBusy?: 'reject' | 'remove';
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [marketplaces, setMarketplaces] = useState<Record<string, boolean>>({
    ebay: false,
    mercadolibre: false,
    amazon: false,
  });
  const [publishMode, setPublishMode] = useState<'local' | 'international'>('local');
  const [publishIntent, setPublishIntent] = useState<'dry_run' | 'pilot' | 'production'>('production');
  const [pilotManualAck, setPilotManualAck] = useState(false);
  const rowBlockedVisual = isPendingRowPublishBlocked(operationsTruth, truthLoading);

  useEffect(() => {
    if (rowBlockedVisual) {
      setMarketplaces({ ebay: false, mercadolibre: false, amazon: false });
    }
  }, [rowBlockedVisual, productId]);

  const imgSources = Array.isArray(p.images) ? p.images : (p.imageUrl ? [p.imageUrl] : []);

  const handleApprove = () => {
    const mks = (['ebay', 'mercadolibre', 'amazon'] as const).filter((m) => marketplaces[m]);
    if (mks.length === 0) {
      toast.error('Elegí al menos un marketplace; ninguno viene marcado por defecto.');
      return;
    }
    onApprove({
      marketplaces: mks,
      publishMode,
      publishIntent,
      pilotManualAck,
    });
  };

  const applySoloMl = () => {
    setMarketplaces({ ebay: false, mercadolibre: true, amazon: false });
  };
  const strictBlock = rowBlockedVisual && publishIntent !== 'dry_run';
  const allowDryRunWhileBlocked = rowBlockedVisual && publishIntent === 'dry_run' && marketplaces.mercadolibre;
  const publishActionBlocked = rowBlockedVisual && !allowDryRunWhileBlocked;

  const desc = p.description || '';
  const showDesc = desc.length > 0;
  const descShort = desc.length > 150 ? desc.slice(0, 150) + '...' : desc;

  return (
    <div
      className={`px-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
        rowBlockedVisual && !truthLoading ? 'bg-red-50/40 dark:bg-red-950/20 border-l-4 border-l-red-500 pl-2.5' : ''
      } ${truthLoading ? 'opacity-90' : ''}`}
    >
      <div className="flex items-start gap-3 flex-1 w-full">
        <input type="checkbox" className="mt-1 flex-shrink-0 accent-primary-600" checked={selected} disabled={!!rowBusy} onChange={(e) => onSelectChange(e.target.checked)} />
        <ImageCarousel images={imgSources} title={sanitizeProductTitle(p.title)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{sanitizeProductTitle(p.title)}</div>
          {showDesc && (
            <div className="text-[11px] text-slate-500 mt-1">
              {expanded ? desc : descShort}
              {desc.length > 150 && (
                <button type="button" onClick={() => setExpanded(!expanded)} className="ml-1 text-primary-600 hover:underline">
                  {expanded ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-1.5 space-y-2">
            {truthLoading && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800 p-2 text-[11px] text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Comprobando bloqueos canónicos… la acción de publicar permanece deshabilitada hasta tener verdad operativa.
              </div>
            )}
            {operationsTruth && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2.5 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Verdad operativa (listing / blocker)</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {getLiveStateBadge(operationsTruth.externalMarketplaceState)}
                  {operationsTruth.externalMarketplaceSubStatus.length > 0 && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {operationsTruth.externalMarketplaceSubStatus.join(', ')}
                    </span>
                  )}
                </div>
                {operationsTruth.blockerCode ? (
                  <p className="text-[11px] text-red-600 dark:text-red-400" title={operationsTruth.blockerMessage || operationsTruth.blockerCode}>
                    Blocker: {operationsTruth.blockerCode}
                    {operationsTruth.blockerMessage ? ` — ${operationsTruth.blockerMessage}` : ''}
                  </p>
                ) : (
                  <p className="text-[11px] text-green-600 dark:text-green-400">Sin blocker canónico actual</p>
                )}
                {operationsTruth.nextAction && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">Siguiente acción: {operationsTruth.nextAction}</p>
                )}
              </div>
            )}
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <p className="font-medium text-slate-600 dark:text-slate-300">Costos y margen — solo estimación pre-publicación</p>
              <div>
                Coste: {formatCurrencySimple(p.estimatedCost ?? p.aliexpressPrice ?? 0, p.currency || 'USD')}
                {p.shippingCost != null && p.shippingCost > 0 && (
                  <span> (+ {formatCurrencySimple(p.shippingCost, p.currency || 'USD')} envío)</span>
                )}
                {p.totalCost != null && p.totalCost !== (p.estimatedCost ?? p.aliexpressPrice ?? 0) && (
                  <span> = Total: {formatCurrencySimple(p.totalCost, p.currency || 'USD')}</span>
                )}
                {' → '}Sugerido: {formatCurrencySimple(p.suggestedPrice ?? 0, p.currency || 'USD')}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Margen bruto estimado: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrencySimple(p.estimatedProfit ?? 0, p.currency || 'USD')}</span></span>
                <span>ROI estimado: <span className="font-semibold text-slate-700 dark:text-slate-200">{Number(p.estimatedROI ?? 0).toFixed(1)}%</span></span>
              </div>
              {p.estimatedProfitByMarketplace && (
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(p.estimatedProfitByMarketplace).map(([mk, val]) => (
                    <span key={mk}>
                      {mk === 'mercadolibre' ? 'ML' : mk} (estim.):{' '}
                      <span className="text-slate-700 dark:text-slate-200">
                        +{formatCurrencySimple(Number(val), p.currency || 'USD')}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                No es ganancia realizada ni prueba de listing activo; prioriza el bloque de verdad operativa arriba.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${p.source === 'autopilot' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {p.source === 'autopilot' ? '🤖 Autopilot' : '👤 Manual'}
              </span>
              {p.category && <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">{p.category}</span>}
              {p.deliveryDays != null && p.deliveryDays > 0 && <span className="text-slate-500">{p.deliveryDays} días envío</span>}
              {p.queuedAt && <span className="text-slate-400">En cola: {formatDateEs(p.queuedAt)}</span>}
              {p.aliexpressUrl && (
                <a href={p.aliexpressUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Ver en AliExpress
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-stretch sm:items-end gap-2 flex-shrink-0 min-w-[200px]">
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <span className="text-[10px] text-slate-500 w-full text-right sm:w-auto">Marketplaces (sin preselección)</span>
        </div>
        <div className={`flex flex-wrap items-center gap-3 justify-end ${strictBlock ? 'opacity-60' : ''}`}>
          <label className="text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={marketplaces.ebay}
              onChange={(e) => setMarketplaces((m) => ({ ...m, ebay: e.target.checked }))}
              className="mr-1 accent-primary-600"
              disabled={!!rowBusy || strictBlock}
            />{' '}
            eBay
          </label>
          <label className="text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={marketplaces.mercadolibre}
              onChange={(e) => setMarketplaces((m) => ({ ...m, mercadolibre: e.target.checked }))}
              className="mr-1 accent-primary-600"
              disabled={!!rowBusy || strictBlock}
            />{' '}
            ML
          </label>
          <label className="text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={marketplaces.amazon}
              onChange={(e) => setMarketplaces((m) => ({ ...m, amazon: e.target.checked }))}
              className="mr-1 accent-primary-600"
              disabled={!!rowBusy || strictBlock}
            />{' '}
            Amazon
          </label>
          <button
            type="button"
            disabled={!!rowBusy || strictBlock}
            onClick={applySoloMl}
            className="px-2 py-0.5 text-[11px] border rounded-md border-primary-400 text-primary-800 dark:text-primary-200 hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors"
          >
            Solo ML
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[320px]">
          <label className="text-[11px] text-slate-600 dark:text-slate-300">
            Modo
            <select
              value={publishMode}
              onChange={(e) => setPublishMode(e.target.value as 'local' | 'international')}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px]"
              disabled={!!rowBusy}
            >
              <option value="local">local</option>
              <option value="international">international</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-600 dark:text-slate-300">
            Intento
            <select
              value={publishIntent}
              onChange={(e) =>
                setPublishIntent(e.target.value as 'dry_run' | 'pilot' | 'production')
              }
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[11px]"
              disabled={!!rowBusy}
            >
              <option value="production">production</option>
              <option value="pilot">pilot</option>
              <option value="dry_run">dry_run</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-600 dark:text-slate-300 flex items-end gap-1 pb-1">
            <input
              type="checkbox"
              checked={pilotManualAck}
              onChange={(e) => setPilotManualAck(e.target.checked)}
              disabled={!!rowBusy}
              className="accent-primary-600"
            />
            pilotManualAck
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
          {publishActionBlocked ? (
            <button
              type="button"
              disabled
              className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-md text-xs flex items-center gap-1 whitespace-nowrap cursor-not-allowed"
              title={
                truthLoading
                  ? 'Esperando verdad operativa'
                  : operationsTruth?.blockerMessage || operationsTruth?.blockerCode || 'Bloqueado'
              }
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {truthLoading ? 'Verificando…' : 'No publicable (bloqueado)'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!!rowBusy}
              onClick={handleApprove}
              className="px-2.5 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {publishIntent === 'dry_run' ? 'Ejecutar dry-run' : 'Aprobar y publicar'}
            </button>
          )}
          <button
            type="button"
            disabled={!!rowBusy}
            onClick={() => navigate(`/products/${encodeURIComponent(productId)}/preview`)}
            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-md text-xs whitespace-nowrap disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Vista previa
          </button>
          <button type="button" disabled={!!rowBusy} onClick={onReject} className="px-2.5 py-1.5 border border-amber-600 text-amber-800 dark:text-amber-200 rounded-md text-xs whitespace-nowrap disabled:opacity-50 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
            {rowBusy === 'reject' ? 'Rechazando…' : 'Rechazar'}
          </button>
          <button type="button" disabled={!!rowBusy} onClick={onRemove} className="px-2.5 py-1.5 border border-red-600 text-red-700 dark:text-red-300 rounded-md text-xs inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
            <Trash2 className="w-3 h-3" />
            {rowBusy === 'remove' ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
        {publishActionBlocked &&
          !truthLoading &&
          (String(operationsTruth?.blockerCode ?? '').trim() ||
            String(operationsTruth?.publicationReadinessState ?? '').toUpperCase() === 'BLOCKED') && (
          <p className="text-[10px] text-red-700 dark:text-red-300 text-right max-w-xs ml-auto">
            Bloqueo:{' '}
            <span className="font-mono">
              {String(operationsTruth?.blockerCode ?? '').trim() || operationsTruth?.publicationReadinessState || 'BLOCKED'}
            </span>
            {operationsTruth?.blockerMessage ? ` — ${operationsTruth.blockerMessage}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const rawImages = images || [];
  const isAliCdn = (u: string) => /alicdn\.com|aliexpress\.com/i.test(u);
  const displayImages = rawImages.map(u => (isAliCdn(u) ? toProxyUrl(u) : u));

  if (!rawImages.length) {
    return (
      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-700">
        <span className="text-slate-400 text-[10px]">Sin imagen</span>
      </div>
    );
  }

  const len = rawImages.length;
  const nextImage = () => setCurrentIndex((prev) => (prev + 1) % len);
  const prevImage = () => setCurrentIndex((prev) => (prev - 1 + len) % len);

  return (
    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 group ring-1 ring-slate-200 dark:ring-slate-700">
      <img 
        src={displayImages[currentIndex]} 
        alt={`${title} - Imagen ${currentIndex + 1}`}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
        onError={(e) => {
          if (len > 1) {
            const nextIndex = (currentIndex + 1) % len;
            if (nextIndex !== currentIndex) {
              setCurrentIndex(nextIndex);
            } else {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=No+Image';
            }
          } else {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80?text=No+Image';
          }
        }}
      />
      
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-black/50 text-white p-0.5 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/50 text-white p-0.5 rounded-l opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Siguiente imagen"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {currentIndex + 1} / {len}
          </div>
        </>
      )}
    </div>
  );
}
