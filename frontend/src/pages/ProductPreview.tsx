import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, Edit, Globe, Image as ImageIcon, Tag, DollarSign, TrendingUp, ChevronLeft, ChevronRight, Save, Clock, Info, Calculator, Trash2, Plus, MoveUp, MoveDown, Award, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { formatCurrencySimple } from '@/utils/currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProductWorkflowPipeline from '@/components/ProductWorkflowPipeline';
import type {
  MlPilotApproval,
  MlPilotControlState,
  MlPilotLedgerRow,
  MlPilotPostPublishStatus,
  MlProgramVerificationPayload,
  MlPublishIntent,
  MlPublishMode,
  MlPublishPreflightPayload,
} from '@/types/mercadolibre-preflight';
import {
  fetchMercadoLibrePilotAllowlist,
  fetchMercadoLibrePilotApprovals,
  fetchMercadoLibrePilotControlState,
  fetchMercadoLibrePilotLedger,
  fetchMercadoLibrePilotPostPublishStatus,
  fetchMercadoLibreProgramVerification,
  setMercadoLibrePilotControlState,
} from '@/services/mercadolibre-pilot.api';

/**
 * Image Gallery Component with Navigation
 * Displays all product images in a carousel with thumbnails.
 * When onSelectCover is provided (ML), allows selecting which image is the cover.
 */
function ImageGallery({ images, primaryImageIndex = 0, onSelectCover }: { images: string[]; primaryImageIndex?: number; onSelectCover?: (index: number) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Main Image Display */}
      <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group">
        <img
          src={images[currentIndex]}
          alt={`Imagen del producto ${currentIndex + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=No+Image';
          }}
        />
        
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Imagen siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2.5 py-1 rounded-lg">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Navigation */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative">
              <button
                onClick={() => goToImage(idx)}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all w-full ${
                  idx === currentIndex
                    ? 'border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <img
                  src={img}
                  alt={`Miniatura ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/100?text=No+Image';
                  }}
                />
              </button>
              {onSelectCover && (
                <button
                  type="button"
                  onClick={() => onSelectCover(idx)}
                  className={`mt-1 w-full text-xs py-1 rounded-lg transition-colors ${
                    idx === primaryImageIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {idx === primaryImageIndex ? 'Portada' : 'Usar como portada'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ListingPreview {
  product: {
    id: number;
    title: string;
    category?: string;
    aliexpressPrice: number;
    aliexpressCurrency: string;
    winnerDetectedAt?: string;
  };
  marketplace: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  language: string;
  images: string[];
  category?: string;
  tags?: string[];
  profitMargin: number;
  potentialProfit: number;
  fees: {
    breakdown: {
      marketplaceFee: number;
      paymentFee: number;
      shippingCost: number;
      taxes: number;
      otherCosts: number;
      totalCost: number;
    };
    netProfit: number;
    margin: number;
  };
  seoKeywords?: string[];
}

export default function ProductPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const marketplace = searchParams.get('marketplace') || 'ebay';
  const environment = searchParams.get('environment') || undefined;
  const showFinancialParam = searchParams.get('showFinancial') === 'true';

  const [preview, setPreview] = useState<ListingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    price: 0,
    images: [] as string[],
  });
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [lifetimeDecision, setLifetimeDecision] = useState<any>(null);
  const [loadingLifetime, setLoadingLifetime] = useState(false);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [mlRequestedMode, setMlRequestedMode] = useState<MlPublishMode>('local');
  const [mlPublishIntent, setMlPublishIntent] = useState<MlPublishIntent>('production');
  const [mlPilotManualAck, setMlPilotManualAck] = useState(false);
  const [preflight, setPreflight] = useState<MlPublishPreflightPayload | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [mlCockpitLoading, setMlCockpitLoading] = useState(false);
  const [programVerification, setProgramVerification] = useState<MlProgramVerificationPayload | null>(null);
  const [pilotApprovals, setPilotApprovals] = useState<MlPilotApproval[]>([]);
  const [pilotLedger, setPilotLedger] = useState<MlPilotLedgerRow[]>([]);
  const [pilotControl, setPilotControl] = useState<MlPilotControlState | null>(null);
  const [pilotPostPublish, setPilotPostPublish] = useState<MlPilotPostPublishStatus | null>(null);
  const [categoryAllowlisted, setCategoryAllowlisted] = useState<boolean | null>(null);
  const [mlCockpitError, setMlCockpitError] = useState<string | null>(null);

  const loadMercadoLibrePreflight = async (productId: string): Promise<MlPublishPreflightPayload | null> => {
    setPreflightLoading(true);
    try {
      const res = await api.get(`/api/products/${productId}/publish-preflight`, {
        params: {
          marketplace: 'mercadolibre',
          requestedMode: mlRequestedMode,
          publishIntent: mlPublishIntent,
          pilotManualAck: mlPilotManualAck,
          ...(environment ? { environment } : {}),
        },
      });
      const data = (res.data?.success && res.data?.data ? (res.data.data as MlPublishPreflightPayload) : null);
      setPreflight(data);
      return data;
    } catch {
      setPreflight(null);
      return null;
    } finally {
      setPreflightLoading(false);
    }
  };

  const loadMercadoLibreCockpit = async (
    productId: number,
    preflightSnapshot: MlPublishPreflightPayload | null
  ): Promise<void> => {
    setMlCockpitLoading(true);
    setMlCockpitError(null);
    try {
      const [verification, approvals, ledger, controlState, postPublish] = await Promise.all([
        fetchMercadoLibreProgramVerification({
          environment: environment as 'sandbox' | 'production' | undefined,
          requestedMode: mlRequestedMode,
        }),
        fetchMercadoLibrePilotApprovals({ productId, limit: 8 }),
        fetchMercadoLibrePilotLedger({ productId, limit: 12 }),
        fetchMercadoLibrePilotControlState(productId),
        fetchMercadoLibrePilotPostPublishStatus(productId),
      ]);

      let allowlisted: boolean | null = null;
      const categoryKey = preflightSnapshot?.pilotReadiness?.evidence?.categoryKeyResolved;
      if (categoryKey) {
        const allowlistEntries = await fetchMercadoLibrePilotAllowlist({
          siteId: 'MLC',
          enabled: true,
          limit: 200,
        });
        const normalized = String(categoryKey).trim().toLowerCase();
        allowlisted = allowlistEntries.some(
          (entry) => String(entry.categoryKey || '').trim().toLowerCase() === normalized
        );
      }

      setProgramVerification(verification || null);
      setPilotApprovals(Array.isArray(approvals) ? approvals : []);
      setPilotLedger(Array.isArray(ledger) ? ledger : []);
      setPilotControl(controlState || null);
      setPilotPostPublish(postPublish || null);
      setCategoryAllowlisted(allowlisted);
    } catch (err: any) {
      setMlCockpitError(err?.response?.data?.error || err?.message || 'No se pudo cargar cockpit operativo ML');
    } finally {
      setMlCockpitLoading(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setError('ID de producto no válido');
      setLoading(false);
      return;
    }

    loadPreview();
  }, [id, marketplace, environment, showFinancialParam]);

  useEffect(() => {
    if (!id || marketplace !== 'mercadolibre') {
      setPreflight(null);
      setProgramVerification(null);
      setPilotApprovals([]);
      setPilotLedger([]);
      setPilotControl(null);
      setPilotPostPublish(null);
      setCategoryAllowlisted(null);
      setMlCockpitError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const preflightData = await loadMercadoLibrePreflight(id);
      if (cancelled) return;
      const productId = Number(id);
      if (!Number.isFinite(productId) || productId <= 0) return;
      await loadMercadoLibreCockpit(productId, preflightData);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, marketplace, environment, mlRequestedMode, mlPublishIntent, mlPilotManualAck]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/api/products/${id}/preview`, {
        params: { marketplace, environment }
      });

      if (response.data?.success && response.data?.data) {
        const data = response.data.data;
        setPreview(data);
        setPrimaryImageIndex(0);
        
        if (showFinancialParam) {
          setShowFinancialModal(true);
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.delete('showFinancial');
          window.history.replaceState({}, '', `${window.location.pathname}?${newSearchParams.toString()}`);
        }
        
        await loadLifetimeDecision();
      } else {
        throw new Error(response.data?.error || 'No se pudo generar la vista previa');
      }
    } catch (err: any) {
      console.error('Error loading preview:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Error al cargar la vista previa';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadLifetimeDecision = async () => {
    if (!id) return;
    
    try {
      setLoadingLifetime(true);
      const response = await api.get(`/api/listing-lifetime/product/${id}`);
      
      if (response.data?.success && response.data?.data?.decisions?.length > 0) {
        const marketplaceDecision = response.data.data.decisions.find(
          (d: any) => d.marketplace === marketplace
        ) || response.data.data.decisions[0];
        
        setLifetimeDecision(marketplaceDecision);
      }
    } catch (err: any) {
      console.debug('Lifetime decision not available:', err?.message);
    } finally {
      setLoadingLifetime(false);
    }
  };

  const handlePilotControlChange = async (
    state: 'ready' | 'aborted' | 'rollback_requested' | 'rollback_completed'
  ) => {
    if (!id) return;
    const reason =
      state === 'ready'
        ? 'operator_set_ready'
        : window.prompt(
            'Razón operativa para cambiar control state (auditable en ledger):',
            state === 'aborted' ? 'manual_abort_requested' : 'manual_rollback_requested'
          ) || undefined;
    try {
      await setMercadoLibrePilotControlState({ productId: Number(id), state, reason });
      toast.success(`Control state actualizado: ${state}`);
      const preflightData = await loadMercadoLibrePreflight(id);
      await loadMercadoLibreCockpit(Number(id), preflightData);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'No se pudo actualizar control state');
    }
  };

  const handlePublish = async () => {
    if (!id) return;

    try {
      setPublishing(true);
      
      const body = preview?.marketplace === 'mercadolibre' ? { primaryImageIndex } : {};
      const response = await api.post(`/api/publisher/send_for_approval/${id}`, body);

      if (response.data?.success) {
        toast.success('Producto enviado a Intelligent Publisher para aprobación');
        navigate(`/publisher?highlight=${id}`);
      } else {
        throw new Error(response.data?.error || 'Error al enviar producto');
      }
    } catch (err: any) {
      console.error('Error sending to publisher:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Error al enviar producto a Intelligent Publisher';
      toast.error(errorMsg);
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = () => {
    navigate('/products');
  };

  const handleEditClick = () => {
    if (!preview) return;
    setEditForm({
      title: preview.title,
      description: preview.description,
      price: preview.price,
      images: preview.images || [],
    });
    setNewImageUrl('');
    setShowEditModal(true);
  };

  const handleRemoveImage = (index: number) => {
    setEditForm({
      ...editForm,
      images: editForm.images.filter((_, i) => i !== index),
    });
  };

  const handleAddImage = () => {
    if (!newImageUrl.trim()) {
      toast.error('Por favor ingresa una URL válida');
      return;
    }

    try {
      new URL(newImageUrl.trim());
      setEditForm({
        ...editForm,
        images: [...editForm.images, newImageUrl.trim()],
      });
      setNewImageUrl('');
      toast.success('Imagen agregada');
    } catch {
      toast.error('URL no válida. Por favor ingresa una URL completa (ej: https://...)');
    }
  };

  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const createThumbnail = (imageUrl: string, maxWidth: number = 300, maxHeight: number = 300): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('No se pudo obtener contexto del canvas'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(thumbnailUrl);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Error al cargar la imagen'));
      img.src = imageUrl;
    });
  };

  const processImageFile = async (file: File): Promise<{ normal: string; thumbnail: string }> => {
    const normalUrl = await fileToDataURL(file);
    const thumbnailUrl = await createThumbnail(normalUrl, 200, 200);
    
    return {
      normal: normalUrl,
      thumbnail: thumbnailUrl
    };
  };

  const isValidImageFile = (file: File): boolean => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    return validTypes.includes(file.type);
  };

  const handleImageFiles = async (files: FileList | File[]) => {
    setIsProcessingImage(true);
    
    try {
      const fileArray = Array.from(files);
      const imageFiles = fileArray.filter(isValidImageFile);

      if (imageFiles.length === 0) {
        toast.error('Por favor arrastra solo archivos de imagen válidos (JPG, PNG, WEBP, GIF)');
        setIsProcessingImage(false);
        return;
      }

      if (imageFiles.length !== fileArray.length) {
        toast(`${fileArray.length - imageFiles.length} archivo(s) no son imágenes válidas y fueron ignorados`, {
          icon: '⚠️',
          duration: 4000
        });
      }

      const processedImages: string[] = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        try {
          const { normal } = await processImageFile(file);
          processedImages.push(normal);
        } catch (error) {
          console.error(`Error procesando imagen ${i + 1}:`, error);
          try {
            const normalUrl = await fileToDataURL(file);
            processedImages.push(normalUrl);
          } catch (fallbackError) {
            console.error(`Error en fallback para imagen ${i + 1}:`, fallbackError);
            toast.error(`Error al procesar imagen ${i + 1}. Por favor intenta con otra imagen.`);
          }
        }
      }

      if (processedImages.length === 0) {
        toast.error('No se pudo procesar ninguna imagen. Por favor intenta con otras imágenes.');
        setIsProcessingImage(false);
        return;
      }

      setEditForm({
        ...editForm,
        images: [...editForm.images, ...processedImages],
      });

      toast.success(`${processedImages.length} imagen(es) procesada(s) y configurada(s) correctamente para el preview`);
    } catch (error) {
      console.error('Error procesando imágenes:', error);
      toast.error('Error al procesar las imágenes. Por favor intenta de nuevo.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleImageFiles(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleImageFiles(files);
      e.target.value = '';
    }
  };

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === editForm.images.length - 1) return;

    const newImages = [...editForm.images];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
    
    setEditForm({
      ...editForm,
      images: newImages,
    });
  };

  const handleSaveEdit = async () => {
    if (!id || !preview) return;

    try {
      setEditing(true);
      
      const productResponse = await api.get(`/api/products/${id}`);
      const currentProduct = productResponse.data?.data || productResponse.data;
      
      const updateData: any = {
        title: editForm.title,
        description: editForm.description,
      };

      if (editForm.price !== preview.price) {
        updateData.suggestedPrice = editForm.price;
        updateData.finalPrice = editForm.price;
      }

      if (editForm.images.length > 0) {
        updateData.imageUrl = editForm.images[0];
        updateData.imageUrls = editForm.images;
      } else {
        toast.error('El producto debe tener al menos una imagen');
        setEditing(false);
        return;
      }

      await api.put(`/api/products/${id}`, updateData);
      
      toast.success('Producto actualizado exitosamente');
      setShowEditModal(false);
      
      await loadPreview();
    } catch (err: any) {
      console.error('Error updating product:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Error al actualizar el producto';
      toast.error(errorMsg);
    } finally {
      setEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-6xl mx-auto">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/products')}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Productos
          </button>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-8 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100">Error al cargar vista previa</h2>
            <p className="text-slate-600 dark:text-slate-400">{error || 'No se pudo generar la vista previa del producto'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleCancel}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Revisión y decisión de publicación
            </h1>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {preview.marketplace === 'mercadolibre' ? 'Mercado Libre' : preview.marketplace === 'ebay' ? 'eBay' : preview.marketplace}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Paso 2: revisa el producto, verifica el preflight y decide GO/NO-GO antes de enviarlo al Publisher. La verdad operativa está en{' '}
            <Link to="/control-center" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Control Center
            </Link>
            — los datos financieros aquí son estimaciones pre-publicación.
          </p>
        </div>

        {/* Canonical lifecycle truth — P56 */}
        {id && (
          <div className="mb-6">
            <ProductWorkflowPipeline productId={Number(id)} showTimeline={true} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Preview - Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Images Gallery */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Imágenes ({preview.images?.length || 0})
              </h2>
              {preview.marketplace === 'mercadolibre' && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                  <strong>Mercado Libre:</strong> La portada no puede tener logos ni texto. Selecciona como portada una imagen sin marcas de agua.
                </div>
              )}
              {preview.images && preview.images.length > 0 ? (
                <ImageGallery
                  images={preview.images}
                  primaryImageIndex={primaryImageIndex}
                  onSelectCover={preview.marketplace === 'mercadolibre' ? setPrimaryImageIndex : undefined}
                />
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  No hay imágenes disponibles
                </div>
              )}
            </div>

            {/* Title & Description */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{preview.title}</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Globe className="w-4 h-4" />
                  <span>Idioma: {preview.language.toUpperCase()}</span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>Marketplace: {preview.marketplace}</span>
                </div>
              </div>

              <div className="prose max-w-none">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Descripción</h3>
                <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                  {preview.description || 'No hay descripción disponible'}
                </div>
              </div>

              {preview.seoKeywords && preview.seoKeywords.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    Palabras Clave
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preview.seoKeywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Right Column (1/3) */}
          <div className="space-y-6">
            {/* Marketplace switcher */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Marketplace destino
              </h2>
              <div className="flex flex-wrap gap-2">
                {(['mercadolibre', 'ebay', 'amazon'] as const).map((mp) => (
                  <button
                    key={mp}
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set('marketplace', mp);
                      navigate(`/products/${id}/preview?${params.toString()}`, { replace: true });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      marketplace === mp
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    }`}
                  >
                    {mp === 'mercadolibre' ? 'Mercado Libre' : mp === 'ebay' ? 'eBay' : 'Amazon'}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Precio
              </h2>
              <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-3">
                {formatCurrencySimple(preview.price, preview.currency)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Moneda: <span className="font-medium text-slate-700 dark:text-slate-300">{preview.currency}</span>
              </div>
            </div>

            {/* Score heurístico "ganador" */}
            {preview.product?.winnerDetectedAt && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 shadow-card p-6 border-l-4 border-l-amber-400">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600" />
                  Score heurístico &quot;ganador&quot;
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Detectado el{' '}
                  <span className="font-medium">{new Date(preview.product.winnerDetectedAt).toLocaleDateString()}</span>.
                  Cumple regla de ventas por umbral en últimos N días — es referencia analítica, no ganancia realizada probada.
                </p>
              </div>
            )}

            {/* Optimización IA de Tiempo de Publicación */}
            {lifetimeDecision && !loadingLifetime && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/80 shadow-card p-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Optimización IA de Publicación
                </h2>
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border ${
                    lifetimeDecision.decision.mode === 'KEEP' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                    lifetimeDecision.decision.mode === 'IMPROVE' ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800' :
                    lifetimeDecision.decision.mode === 'PAUSE' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' :
                    'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          lifetimeDecision.decision.mode === 'KEEP' ? 'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200' :
                          lifetimeDecision.decision.mode === 'IMPROVE' ? 'bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                          lifetimeDecision.decision.mode === 'PAUSE' ? 'bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-200' :
                          'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {lifetimeDecision.decision.mode === 'KEEP' ? 'MANTENER' :
                           lifetimeDecision.decision.mode === 'IMPROVE' ? 'MEJORAR' :
                           lifetimeDecision.decision.mode === 'PAUSE' ? 'PAUSAR' :
                           'DESPUBLICAR'}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          Confianza: {Math.round(lifetimeDecision.decision.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                      {lifetimeDecision.decision.reason}
                    </p>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      <div>Revisar en: {lifetimeDecision.decision.recommendedDaysToReview} días</div>
                      <div>Tiempo máximo sugerido: {lifetimeDecision.decision.recommendedMaxLifetime} días</div>
                      {lifetimeDecision.metrics && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                          <div>Días publicados: {lifetimeDecision.metrics.listingAgeDays}</div>
                          <div>Ventas: {lifetimeDecision.metrics.totalSalesUnits}</div>
                          <div>Ganancia neta: {formatCurrencySimple(lifetimeDecision.metrics.totalNetProfit, preview.currency)}</div>
                          <div>Ganancia diaria promedio: {formatCurrencySimple(lifetimeDecision.metrics.avgDailyProfit, preview.currency)}</div>
                          <div>ROI: {lifetimeDecision.metrics.roiPercent.toFixed(1)}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Recomendación heurística basada en ventas y rendimiento del listing. Las cifras de ganancia/ROI son estimadas — la ganancia realizada requiere proof en órdenes y finance.</span>
                  </div>
                </div>
              </div>
            )}

            {/* ML Cockpit */}
            {preview.marketplace === 'mercadolibre' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-500" />
                  Cockpit Operativo Mercado Libre
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Vista canónica de readiness, pilot y post-publicación mínima para operación controlada.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                  <label className="text-xs text-slate-600 dark:text-slate-400">
                    Modo solicitado
                    <select
                      value={mlRequestedMode}
                      onChange={(e) => setMlRequestedMode(e.target.value as MlPublishMode)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="local">local</option>
                      <option value="international">international</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600 dark:text-slate-400">
                    Intento de publicación
                    <select
                      value={mlPublishIntent}
                      onChange={(e) => setMlPublishIntent(e.target.value as MlPublishIntent)}
                      className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="production">production</option>
                      <option value="pilot">pilot</option>
                      <option value="dry_run">dry_run</option>
                    </select>
                  </label>
                  <label className="flex items-end gap-2 text-xs text-slate-600 dark:text-slate-400 pb-1">
                    <input
                      type="checkbox"
                      checked={mlPilotManualAck}
                      onChange={(e) => setMlPilotManualAck(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    Pilot manual ack
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!id) return;
                      const preflightData = await loadMercadoLibrePreflight(id);
                      await loadMercadoLibreCockpit(Number(id), preflightData);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refrescar
                  </button>
                </div>
                {preflightLoading ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">Cargando preflight…</p>
                ) : preflight ? (
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          preflight.publishAllowed
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {preflight.publishAllowed ? 'publishAllowed=true' : 'publishAllowed=false'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        state: {preflight.overallState}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        modeResolved: {preflight.modeResolved}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        capability: {preflight.channelCapability}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        intent: {preflight.publishIntent}
                      </span>
                    </div>
                    {preflight.canary && (
                      <div className="text-xs rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 space-y-1">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          Canary E2E (heurística):{' '}
                          <span className="uppercase tracking-wide">{preflight.canary.tier}</span>
                          {typeof preflight.canary.score === 'number' ? ` · score ${preflight.canary.score}/100` : ''}
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                          Prioriza SKUs para prueba controlada; no reemplaza blockers canónicos.
                        </p>
                      </div>
                    )}
                    {typeof preflight.listingSalePriceUsd === 'number' && (
                      <div className="text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Precio listado (USD) usado en validación: </span>
                        {preflight.listingSalePriceUsd.toFixed(2)}
                      </div>
                    )}
                    {preflight.canonicalPricing?.ok === false && preflight.canonicalPricing.failureReasons?.length ? (
                      <div className="text-red-700 dark:text-red-400 text-xs">
                        {preflight.canonicalPricing.failureReasons.join(' · ')}
                      </div>
                    ) : null}
                    {preflight.images && (
                      <div className="text-xs text-slate-700 dark:text-slate-300">
                        Imágenes publishSafe:{' '}
                        <span className={preflight.images.publishSafe ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                          {preflight.images.publishSafe ? 'sí' : 'no'}
                        </span>
                        {preflight.images.blockingReason ? ` — ${preflight.images.blockingReason}` : ''}
                      </div>
                    )}
                    {preflight.postsale && (
                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <div>
                          Webhook ML configurado:{' '}
                          {preflight.postsale.mercadolibreWebhookConfigured ? 'sí' : 'no'}
                        </div>
                        <div>
                          Flujo de eventos verificado:{' '}
                          {preflight.postsale.mercadolibreEventFlowReady ? 'sí' : 'no'}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cumplimiento</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{preflight.complianceReadiness?.status || 'n/a'}</p>
                        {preflight.complianceReadiness?.reasons?.length ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {preflight.complianceReadiness.reasons.join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Devoluciones</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{preflight.returnsReadiness?.status || 'n/a'}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {preflight.returnsReadiness?.ready ? 'listo' : 'no listo'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comunicación</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                          {preflight.communicationReadiness?.communicationReady ? 'listo' : 'no listo'}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          contacto post-venta / SLA / alertas
                        </p>
                      </div>
                    </div>
                    {preflight.blockers && preflight.blockers.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-red-700 dark:text-red-400 space-y-1">
                        {preflight.blockers.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                    {preflight.warnings && preflight.warnings.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                        {preflight.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    {preflight.nextAction && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <span className="font-medium">Siguiente paso: </span>
                        {preflight.nextAction}
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Verificación de programa</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                          {programVerification?.programResolved || preflight.programVerification?.programResolved || 'desconocido'}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          verified: {String(programVerification?.verified ?? preflight.programVerification?.verified ?? false)}
                          {' · '}site: {programVerification?.siteIdResolved || preflight.programVerification?.siteIdResolved || 'n/a'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disponibilidad piloto</p>
                        <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                          {preflight.pilotReadiness?.pilotAllowed ? 'pilotAllowed=true' : 'pilotAllowed=false'}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          approvalId: {preflight.pilotReadiness?.evidence?.approvalId || 'none'}
                          {' · '}allowlist:{' '}
                          {categoryAllowlisted == null ? 'desconocido' : categoryAllowlisted ? 'sí' : 'no'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-400">No se pudo cargar el preflight.</p>
                )}
                {mlCockpitError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-3">{mlCockpitError}</p>
                )}
                {mlCockpitLoading ? (
                  <p className="text-xs text-slate-500 mt-3">Cargando verificación/aprobación/ledger/control…</p>
                ) : (
                  <div className="space-y-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePilotControlChange('ready')}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Control: listo
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePilotControlChange('aborted')}
                        className="rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        Abortar piloto
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePilotControlChange('rollback_requested')}
                        className="rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                      >
                        Solicitar rollback
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Estado de control actual: <strong>{pilotControl?.state || 'ready'}</strong>
                      {pilotControl?.reason ? ` · ${pilotControl.reason}` : ''}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Aprobaciones piloto</p>
                        {pilotApprovals.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">Sin aprobaciones persistentes para este producto.</p>
                        ) : (
                          <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                            {pilotApprovals.slice(0, 3).map((approval) => (
                              <li key={approval.id}>
                                {approval.decision} · {approval.approvedBy}
                                {approval.expiresAt ? ` · expira ${new Date(approval.expiresAt).toLocaleString()}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Post-publicación mínima</p>
                        {pilotPostPublish ? (
                          <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                            <li>listingObserved: {pilotPostPublish.listingObserved ? 'sí' : 'no'}</li>
                            <li>firstSyncCompleted: {pilotPostPublish.firstSyncCompleted ? 'sí' : 'no'}</li>
                            <li>monitoringRequired: {pilotPostPublish.postPublishMonitoringRequired ? 'sí' : 'no'}</li>
                            <li>abortRecommended: {pilotPostPublish.abortRecommended ? 'sí' : 'no'}</li>
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">Sin snapshot post-publicación.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Registro de decisiones piloto</p>
                      {pilotLedger.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Sin registros de assessment/intento todavía.</p>
                      ) : (
                        <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                          {pilotLedger.slice(0, 5).map((row) => (
                            <li key={row.id}>
                              {new Date(row.createdAt).toLocaleString()} · {row.publishIntent} · {row.result}
                              {row.reason ? ` · ${row.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Publication Decision Panel */}
            {(() => {
              const isMl = preview.marketplace === 'mercadolibre';
              const isBlocked = isMl && preflight != null && preflight.publishAllowed === false;
              const isReady = !isBlocked && !(isMl && preflightLoading);
              const steps = [
                { label: 'Revisión', done: true },
                { label: 'Preflight', done: isMl ? (!preflightLoading && preflight != null) : true },
                { label: 'GO/NO-GO', done: isMl ? (!preflightLoading && isReady) : true, current: isMl && !preflightLoading },
                { label: 'Publisher', done: false },
                { label: 'Publicado', done: false },
              ];
              return (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  isBlocked
                    ? 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-950/30'
                    : preflightLoading
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                    : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
                }`}>
                  {/* Step indicator */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {steps.map((step, i) => (
                      <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                          step.done && !step.current
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : step.current && isBlocked
                            ? 'bg-red-200 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                            : step.current
                            ? 'bg-blue-200 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                        }`}>
                          {step.done && !step.current ? <CheckCircle className="w-3 h-3" /> : null}
                          {step.label}
                        </div>
                        {i < steps.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  {/* GO / NO-GO */}
                  {preflightLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      Verificando readiness para publicación…
                    </div>
                  ) : isBlocked ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" />
                        NO-GO — Este producto no puede publicarse aún
                      </p>
                      {preflight?.blockers && preflight.blockers.length > 0 && (
                        <ul className="list-disc pl-4 text-xs text-red-700 dark:text-red-300 space-y-0.5">
                          {preflight.blockers.map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                      )}
                      <p className="text-xs text-red-600 dark:text-red-400">Resuelve los blockers en el Cockpit ML antes de enviar al Publisher.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" />
                        GO — Listo para enviar al Publisher
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {isMl
                          ? 'Preflight OK. Confirma modo e intento de publicación en el Cockpit ML, luego envía.'
                          : 'El producto está listo. Envíalo al Publisher para continuar.'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Actions Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 space-y-3">
              <button
                onClick={handlePublish}
                disabled={
                  publishing ||
                  (preview.marketplace === 'mercadolibre' &&
                    preflight != null &&
                    preflight.publishAllowed === false)
                }
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {publishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando al Publisher…
                  </>
                ) : preview.marketplace === 'mercadolibre' && preflight != null && preflight.publishAllowed === false ? (
                  <>
                    <XCircle className="w-5 h-5" />
                    No publicable (bloqueado)
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-5 h-5" />
                    Enviar al Publisher
                  </>
                )}
              </button>
              {preview.marketplace === 'mercadolibre' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  El modo e intento (production/pilot/dry_run) se confirman en la aprobación del Publisher.
                </p>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFinancialModal(true)}
                  className="flex-1 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 py-3 px-4 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors flex items-center justify-center gap-2 font-medium"
                  title="Ver información financiera"
                >
                  <Calculator className="w-5 h-5" />
                  Financiero
                </button>
                <button
                  onClick={handleEditClick}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 py-3 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <Edit className="w-5 h-5" />
                  Editar
                </button>
              </div>

              <button
                onClick={handleCancel}
                className="w-full text-slate-600 dark:text-slate-400 py-2 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver a Productos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Information Modal */}
      {showFinancialModal && preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Calculator className="w-5 h-5 text-purple-600" />
                Información Financiera
              </h2>
              <button
                onClick={() => setShowFinancialModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">{preview.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Marketplace: <span className="font-medium text-slate-700 dark:text-slate-300">{preview.marketplace}</span>
                </p>
              </div>

              {/* Rentabilidad estimada */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-dashed border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Rentabilidad estimada (pre-publicación)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Referencia de unit economics — no sustituye proof de compra en proveedor, fondos liberados ni ganancia realizada. Ver Órdenes y Finance para truth.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Ganancia potencial (estim.)</span>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {formatCurrencySimple(preview.potentialProfit, preview.currency)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Estimación por unidad; varía según costos, comisiones y tipo de cambio.
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">Margen estimado</span>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {preview.profitMargin.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      % estimado de utilidad bruta sobre precio de venta.
                    </p>
                  </div>
                </div>
              </div>

              {/* Desglose de Costos */}
              {preview.fees && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Desglose de Costos
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Precio de Venta</span>
                      <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                        {formatCurrencySimple(preview.price, preview.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400">Costo AliExpress</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {formatCurrencySimple(preview.product.aliexpressPrice, preview.product.aliexpressCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400">Comisión Marketplace</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">
                        {formatCurrencySimple(preview.fees.breakdown.marketplaceFee, preview.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400">Comisión de Pago</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">
                        {formatCurrencySimple(preview.fees.breakdown.paymentFee, preview.currency)}
                      </span>
                    </div>
                    {(preview.fees.breakdown.shippingCost && preview.fees.breakdown.shippingCost > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Gastos de Envío</span>
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          {formatCurrencySimple(preview.fees.breakdown.shippingCost, preview.currency)}
                        </span>
                      </div>
                    )}
                    {(preview.fees.breakdown.taxes && preview.fees.breakdown.taxes > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Impuestos Locales</span>
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          {formatCurrencySimple(preview.fees.breakdown.taxes, preview.currency)}
                        </span>
                      </div>
                    )}
                    {(preview.fees.breakdown.otherCosts && preview.fees.breakdown.otherCosts > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Otros Costos</span>
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          {formatCurrencySimple(preview.fees.breakdown.otherCosts, preview.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-3 pt-4 border-t-2 border-slate-300 dark:border-slate-600 mt-2">
                      <span className="text-base font-semibold text-slate-700 dark:text-slate-300">Ganancia neta proyectada (estimada)</span>
                      <span className="text-xl font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrencySimple(preview.fees.netProfit, preview.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">No es ganancia realizada — requiere proof en órdenes y payout.</p>
                  </div>
                </div>
              )}

              {/* Analytics vs proof disclaimer */}
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">
                    <p className="font-medium mb-1">Analítica vs. proof</p>
                    <p>
                      Estos valores son <strong>estimaciones</strong> basadas en costos y comisiones estándar. La ganancia <strong>realizada</strong> solo se confirma con proof en Órdenes (compra en proveedor, tracking) y Finance (payout). Usa Control Center para verdad operativa canónica.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setShowFinancialModal(false)}
                className="px-4 py-2 bg-slate-700 dark:bg-slate-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Editar Producto</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                disabled={editing}
              >
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Título
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descripción
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Precio ({preview.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>

              {/* Gestión de Imágenes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Imágenes del Producto
                </label>
                
                {editForm.images.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {editForm.images.map((imgUrl, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img
                            src={imgUrl}
                            alt={`Imagen ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80?text=Error';
                            }}
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={imgUrl}>
                            {imgUrl.length > 60 ? `${imgUrl.substring(0, 60)}...` : imgUrl}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {index === 0 ? 'Imagen principal' : `Imagen ${index + 1}`}
                          </p>
                        </div>

                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, 'up')}
                            disabled={editing || index === 0}
                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover arriba"
                          >
                            <MoveUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, 'down')}
                            disabled={editing || index === editForm.images.length - 1}
                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover abajo"
                          >
                            <MoveDown className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          disabled={editing || editForm.images.length === 1}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                          title={editForm.images.length === 1 ? 'Debe haber al menos una imagen' : 'Eliminar imagen'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Zona de Drag and Drop */}
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative border-2 border-dashed rounded-xl p-6 text-center transition-colors
                    ${isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }
                    ${editing || isProcessingImage ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                  `}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={editing || isProcessingImage}
                  />
                  
                  {isProcessingImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">Procesando imágenes...</p>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'}`} />
                      <p className={`text-sm font-medium mb-1 ${isDragging ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>
                        {isDragging ? 'Suelta las imágenes aquí' : 'Arrastra imágenes aquí o haz clic para seleccionar'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        JPG, PNG, WEBP, GIF (múltiples imágenes permitidas)
                      </p>
                    </>
                  )}
                </div>

                {/* Separador */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-slate-900 text-slate-500">O</span>
                  </div>
                </div>

                {/* Input para agregar nueva imagen por URL */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddImage();
                      }
                    }}
                    placeholder="https://ejemplo.com/imagen.jpg"
                    className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={editing}
                  />
                  <button
                    type="button"
                    onClick={handleAddImage}
                    disabled={editing || !newImageUrl.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar
                  </button>
                </div>

                {editForm.images.length === 0 && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    El producto debe tener al menos una imagen
                  </p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                disabled={editing}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editing || !editForm.title.trim() || editForm.price <= 0 || editForm.images.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {editing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
