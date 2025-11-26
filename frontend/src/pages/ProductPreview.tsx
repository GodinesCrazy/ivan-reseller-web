import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Edit, Globe, Image as ImageIcon, Tag, DollarSign, TrendingUp, ChevronLeft, ChevronRight, Save } from 'lucide-react';
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

  const [preview, setPreview] = useState<ListingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    price: 0,
  });

  useEffect(() => {
    if (!id) {
      setError('ID de producto no válido');
      setLoading(false);
      return;
    }

    loadPreview();
  }, [id, marketplace, environment]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/api/products/${id}/preview`, {
        params: { marketplace, environment }
      });

      if (response.data?.success && response.data?.data) {
        setPreview(response.data.data);
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

  const handlePublish = async () => {
    if (!id) return;

    try {
      setPublishing(true);
      
      // ✅ OBJETIVO: En lugar de publicar directamente, enviar a Intelligent Publisher
      // Usar endpoint específico que asegura el producto esté en PENDING
      const response = await api.post(`/api/publisher/send_for_approval/${id}`);

      if (response.data?.success) {
        toast.success('✅ Producto enviado a Intelligent Publisher para aprobación');
        // Redirigir a Intelligent Publisher
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
    });
    setShowEditModal(true);
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
              <div className="text-sm text-gray-600 mb-4">
                Moneda: <span className="font-medium">{preview.currency}</span>
              </div>

              {/* Profit Info */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <MetricLabelWithTooltip
                    label="Ganancia Potencial"
                    tooltipBody={metricTooltips.potentialProfit.body}
                    className="text-sm text-gray-600"
                  >
                    <span className="text-sm text-gray-600">Ganancia Potencial</span>
                  </MetricLabelWithTooltip>
                  <span className="font-semibold text-green-600">
                    {formatCurrencySimple(preview.potentialProfit, preview.currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <MetricLabelWithTooltip
                    label="Margen"
                    tooltipBody={metricTooltips.profitMargin.body}
                    className="text-sm text-gray-600"
                  >
                    <span className="text-sm text-gray-600">Margen</span>
                  </MetricLabelWithTooltip>
                  <span className="font-semibold text-green-600">
                    {preview.profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Fees Breakdown */}
            {preview.fees && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Desglose de Costos</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Costo AliExpress</span>
                    <span>{formatCurrencySimple(preview.product.aliexpressPrice, preview.product.aliexpressCurrency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Comisión Marketplace</span>
                    <span>{formatCurrencySimple(preview.fees.breakdown.marketplaceFee, preview.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Comisión Pago</span>
                    <span>{formatCurrencySimple(preview.fees.breakdown.paymentFee, preview.currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-2 border-t">
                    <span>Ganancia Neta</span>
                    <span className="text-green-600">
                      {formatCurrencySimple(preview.fees.netProfit, preview.currency)}
                    </span>
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
              
              <button
                onClick={handleEditClick}
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <Edit className="w-5 h-5" />
                Editar Producto
              </button>

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
                disabled={editing || !editForm.title.trim() || editForm.price <= 0}
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

