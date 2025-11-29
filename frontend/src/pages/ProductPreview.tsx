import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Edit, Globe, Image as ImageIcon, Tag, DollarSign, TrendingUp, ChevronLeft, ChevronRight, Save, Clock, Info, Calculator, Trash2, Plus, MoveUp, MoveDown } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { formatCurrencySimple } from '@/utils/currency';
import MetricLabelWithTooltip from '@/components/MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/**
 * Image Gallery Component with Navigation
 * Displays all product images in a carousel with thumbnails
 */
function ImageGallery({ images }: { images: string[] }) {
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
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
        <img
          src={images[currentIndex]}
          alt={`Product image ${currentIndex + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=No+Image';
          }}
        />
        
        {/* Navigation Arrows (only show if more than 1 image) */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Navigation */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => goToImage(idx)}
              className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                idx === currentIndex
                  ? 'border-blue-600 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <img
                src={img}
                alt={`Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/100?text=No+Image';
                }}
              />
            </button>
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
  const [lifetimeDecision, setLifetimeDecision] = useState<any>(null);
  const [loadingLifetime, setLoadingLifetime] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('ID de producto no válido');
      setLoading(false);
      return;
    }

    loadPreview();
  }, [id, marketplace, environment, showFinancialParam]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/api/products/${id}/preview`, {
        params: { marketplace, environment }
      });

      if (response.data?.success && response.data?.data) {
        setPreview(response.data.data);
        
        // ✅ Si viene con parámetro showFinancial, abrir modal automáticamente
        if (showFinancialParam) {
          setShowFinancialModal(true);
          // Limpiar el parámetro de la URL después de abrir el modal
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.delete('showFinancial');
          window.history.replaceState({}, '', `${window.location.pathname}?${newSearchParams.toString()}`);
        }
        
        // ✅ Cargar decisión de lifetime si el producto está publicado
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
        // Mostrar la decisión del marketplace actual o la primera disponible
        const marketplaceDecision = response.data.data.decisions.find(
          (d: any) => d.marketplace === marketplace
        ) || response.data.data.decisions[0];
        
        setLifetimeDecision(marketplaceDecision);
      }
    } catch (err: any) {
      // No mostrar error si el producto no está publicado aún
      console.debug('Lifetime decision not available:', err?.message);
    } finally {
      setLoadingLifetime(false);
    }
  };

  const handlePublish = async () => {
    if (!id) return;

    try {
      setPublishing(true);
      
      // ✅ OBJETIVO: En lugar de publicar directamente, enviar a Intelligent Publisher
      // Usar endpoint específico que asegura el producto esté en PENDING
      const response = await api.post(`/api/publisher/send_for_approval/${id}`);

      if (response.data?.success) {
        toast.success('✅ Producto enviado a Intelligent Publisher para aprobación');
        // ✅ CORREGIDO: Navegar a publisher - la página se recargará automáticamente porque usa location.pathname en useEffect
        navigate('/publisher');
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
      images: preview.images || [], // ✅ Incluir imágenes actuales
    });
    setNewImageUrl(''); // Limpiar campo de nueva imagen
    setShowEditModal(true);
  };

  // ✅ Funciones para gestionar imágenes
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

    // Validar que sea una URL válida
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
      
      // Obtener el producto actual para actualizar con los datos correctos
      const productResponse = await api.get(`/api/products/${id}`);
      const currentProduct = productResponse.data?.data || productResponse.data;
      
      // Preparar datos de actualización
      const updateData: any = {
        title: editForm.title,
        description: editForm.description,
      };

      // Si el precio cambió, actualizar suggestedPrice y finalPrice
      if (editForm.price !== preview.price) {
        updateData.suggestedPrice = editForm.price;
        updateData.finalPrice = editForm.price;
      }

      // ✅ Si las imágenes cambiaron, actualizarlas
      if (editForm.images.length > 0) {
        updateData.imageUrl = editForm.images[0]; // Primera imagen como principal
        updateData.imageUrls = editForm.images; // Todas las imágenes
      } else {
        // Si no hay imágenes, mantener las existentes o limpiar
        toast.error('El producto debe tener al menos una imagen');
        setEditing(false);
        return;
      }

      // Actualizar producto
      await api.put(`/api/products/${id}`, updateData);
      
      toast.success('Producto actualizado exitosamente');
      setShowEditModal(false);
      
      // Recargar la preview para reflejar los cambios
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
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate('/products')}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Productos
          </button>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error al cargar vista previa</h2>
            <p className="text-gray-600">{error || 'No se pudo generar la vista previa del producto'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={handleCancel}
              className="mb-2 flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Vista Previa del Listing</h1>
            <p className="text-gray-600 mt-1">
              Revisa cómo se verá tu producto en {preview.marketplace}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Preview - Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Images Gallery with Navigation */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Imágenes ({preview.images?.length || 0})
              </h2>
              {preview.images && preview.images.length > 0 ? (
                <ImageGallery images={preview.images} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No hay imágenes disponibles
                </div>
              )}
            </div>

            {/* Title & Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{preview.title}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Globe className="w-4 h-4" />
                  <span>Idioma: {preview.language.toUpperCase()}</span>
                  <span>•</span>
                  <span>Marketplace: {preview.marketplace}</span>
                </div>
              </div>

              <div className="prose max-w-none">
                <h3 className="text-lg font-semibold mb-2">Descripción</h3>
                <div className="text-gray-700 whitespace-pre-wrap">
                  {preview.description || 'No hay descripción disponible'}
                </div>
              </div>

              {/* SEO Keywords */}
              {preview.seoKeywords && preview.seoKeywords.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Palabras Clave
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preview.seoKeywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
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
            {/* Price Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Precio
              </h2>
              <div className="text-4xl font-bold text-green-600 mb-4">
                {formatCurrencySimple(preview.price, preview.currency)}
              </div>
              <div className="text-sm text-gray-600">
                Moneda: <span className="font-medium">{preview.currency}</span>
              </div>
            </div>

            {/* ✅ Optimización de Tiempo de Publicación */}
            {lifetimeDecision && !loadingLifetime && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Optimización IA de Tiempo de Publicación
                </h2>
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg border-2 ${
                    lifetimeDecision.decision.mode === 'KEEP' ? 'bg-green-50 border-green-200' :
                    lifetimeDecision.decision.mode === 'IMPROVE' ? 'bg-yellow-50 border-yellow-200' :
                    lifetimeDecision.decision.mode === 'PAUSE' ? 'bg-orange-50 border-orange-200' :
                    'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          lifetimeDecision.decision.mode === 'KEEP' ? 'bg-green-200 text-green-800' :
                          lifetimeDecision.decision.mode === 'IMPROVE' ? 'bg-yellow-200 text-yellow-800' :
                          lifetimeDecision.decision.mode === 'PAUSE' ? 'bg-orange-200 text-orange-800' :
                          'bg-red-200 text-red-800'
                        }`}>
                          {lifetimeDecision.decision.mode === 'KEEP' ? 'MANTENER' :
                           lifetimeDecision.decision.mode === 'IMPROVE' ? 'MEJORAR' :
                           lifetimeDecision.decision.mode === 'PAUSE' ? 'PAUSAR' :
                           'DESPUBLICAR'}
                        </span>
                        <span className="text-xs text-gray-600">
                          Confianza: {Math.round(lifetimeDecision.decision.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">
                      {lifetimeDecision.decision.reason}
                    </p>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Revisar en: {lifetimeDecision.decision.recommendedDaysToReview} días</div>
                      <div>Tiempo máximo sugerido: {lifetimeDecision.decision.recommendedMaxLifetime} días</div>
                      {lifetimeDecision.metrics && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div>Días publicados: {lifetimeDecision.metrics.listingAgeDays}</div>
                          <div>Ventas: {lifetimeDecision.metrics.totalSalesUnits}</div>
                          <div>Ganancia neta: {formatCurrencySimple(lifetimeDecision.metrics.totalNetProfit, preview.currency)}</div>
                          <div>Ganancia diaria promedio: {formatCurrencySimple(lifetimeDecision.metrics.avgDailyProfit, preview.currency)}</div>
                          <div>ROI: {lifetimeDecision.metrics.roiPercent.toFixed(1)}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Esta recomendación se basa en datos reales de ventas y rendimiento del listing.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white rounded-lg shadow p-6 space-y-3">
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {publishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Publicar
                  </>
                )}
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFinancialModal(true)}
                  className="flex-1 bg-purple-100 text-purple-700 py-3 px-4 rounded-lg hover:bg-purple-200 transition-colors flex items-center justify-center gap-2"
                  title="Ver información financiera"
                >
                  <Calculator className="w-5 h-5" />
                  Financiero
                </button>
                <button
                  onClick={handleEditClick}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-5 h-5" />
                  Editar
                </button>
              </div>

              <button
                onClick={handleCancel}
                className="w-full text-gray-600 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Information Modal */}
      {showFinancialModal && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Calculator className="w-6 h-6 text-purple-600" />
                Información Financiera
              </h2>
              <button
                onClick={() => setShowFinancialModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Product Title */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{preview.title}</h3>
                <p className="text-sm text-gray-600">
                  Marketplace: <span className="font-medium">{preview.marketplace}</span>
                </p>
              </div>

              {/* Ganancia Potencial y Margen */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border border-green-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Rentabilidad
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <MetricLabelWithTooltip
                      label="Ganancia Potencial"
                      tooltipBody={metricTooltips.potentialProfit.body}
                      className="text-sm text-gray-600"
                    >
                      <span className="text-sm text-gray-600">Ganancia Potencial</span>
                    </MetricLabelWithTooltip>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {formatCurrencySimple(preview.potentialProfit, preview.currency)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Monto estimado de utilidad por unidad vendida, considerando costos, comisiones de marketplace y tipo de cambio actual. Este valor puede variar según las condiciones reales de venta.
                    </p>
                  </div>
                  <div>
                    <MetricLabelWithTooltip
                      label="Margen"
                      tooltipBody={metricTooltips.profitMargin.body}
                      className="text-sm text-gray-600"
                    >
                      <span className="text-sm text-gray-600">Margen</span>
                    </MetricLabelWithTooltip>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {preview.profitMargin.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Porcentaje estimado de utilidad bruta sobre el precio de venta después de costos y comisiones. Un margen alto indica mayor rentabilidad potencial por unidad vendida.
                    </p>
                  </div>
                </div>
              </div>

              {/* Desglose de Costos */}
              {preview.fees && (
                <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-gray-600" />
                    Desglose de Costos
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Precio de Venta</span>
                      <span className="text-lg font-semibold text-blue-600">
                        {formatCurrencySimple(preview.price, preview.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Costo AliExpress</span>
                      <span className="font-medium">
                        {formatCurrencySimple(preview.product.aliexpressPrice, preview.product.aliexpressCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Comisión Marketplace</span>
                      <span className="font-medium text-orange-600">
                        {formatCurrencySimple(preview.fees.breakdown.marketplaceFee, preview.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Comisión Pago</span>
                      <span className="font-medium text-orange-600">
                        {formatCurrencySimple(preview.fees.breakdown.paymentFee, preview.currency)}
                      </span>
                    </div>
                    {(preview.fees.breakdown.shippingCost && preview.fees.breakdown.shippingCost > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-600">Gastos de Envío</span>
                        <span className="font-medium text-orange-600">
                          {formatCurrencySimple(preview.fees.breakdown.shippingCost, preview.currency)}
                        </span>
                      </div>
                    )}
                    {(preview.fees.breakdown.taxes && preview.fees.breakdown.taxes > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-600">Impuestos Locales</span>
                        <span className="font-medium text-orange-600">
                          {formatCurrencySimple(preview.fees.breakdown.taxes, preview.currency)}
                        </span>
                      </div>
                    )}
                    {(preview.fees.breakdown.otherCosts && preview.fees.breakdown.otherCosts > 0) && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="text-gray-600">Otros Costos</span>
                        <span className="font-medium text-orange-600">
                          {formatCurrencySimple(preview.fees.breakdown.otherCosts, preview.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-3 pt-4 border-t-2 border-gray-300 mt-2">
                      <span className="text-lg font-semibold text-gray-900">Ganancia Neta</span>
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrencySimple(preview.fees.netProfit, preview.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Información Adicional */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Nota:</p>
                    <p>
                      Los valores mostrados son estimaciones basadas en los costos actuales y las comisiones estándar del marketplace. 
                      Los valores reales pueden variar según las condiciones de venta, tipo de cambio, y políticas del marketplace al momento de la transacción.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end">
              <button
                onClick={() => setShowFinancialModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold">Editar Producto</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
                disabled={editing}
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio ({preview.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={editing}
                />
              </div>

              {/* ✅ Gestión de Imágenes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imágenes del Producto
                </label>
                
                {/* Lista de imágenes actuales */}
                {editForm.images.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {editForm.images.map((imgUrl, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        {/* Preview de imagen */}
                        <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={imgUrl}
                            alt={`Imagen ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80?text=Error';
                            }}
                          />
                        </div>
                        
                        {/* URL de la imagen (truncada) */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 truncate" title={imgUrl}>
                            {imgUrl.length > 60 ? `${imgUrl.substring(0, 60)}...` : imgUrl}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {index === 0 ? 'Imagen principal' : `Imagen ${index + 1}`}
                          </p>
                        </div>

                        {/* Controles de reordenar */}
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, 'up')}
                            disabled={editing || index === 0}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover arriba"
                          >
                            <MoveUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(index, 'down')}
                            disabled={editing || index === editForm.images.length - 1}
                            className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover abajo"
                          >
                            <MoveDown className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Botón eliminar */}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          disabled={editing || editForm.images.length === 1}
                          className="p-2 text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                          title={editForm.images.length === 1 ? 'Debe haber al menos una imagen' : 'Eliminar imagen'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input para agregar nueva imagen */}
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={editing}
                  />
                  <button
                    type="button"
                    onClick={handleAddImage}
                    disabled={editing || !newImageUrl.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar
                  </button>
                </div>

                {editForm.images.length === 0 && (
                  <p className="mt-2 text-sm text-red-600">
                    ⚠️ El producto debe tener al menos una imagen
                  </p>
                )}
              </div>
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                disabled={editing}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editing || !editForm.title.trim() || editForm.price <= 0 || editForm.images.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

