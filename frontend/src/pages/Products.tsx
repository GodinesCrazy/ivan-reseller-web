import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Upload,
  Archive,
  Filter,
  Search,
  Eye,
  Trash2,
  ExternalLink,
  Calculator,
  Store,
  Link2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import toast from 'react-hot-toast';
import LoadingSpinner, { TableSkeleton } from '@/components/ui/LoadingSpinner';
import { useCurrency } from '../hooks/useCurrency';
import MetricLabelWithTooltip from '@/components/MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';
import { formatCurrencySimple } from '@/utils/currency';
import WorkflowStatusIndicator from '@/components/WorkflowStatusIndicator';
import WorkflowProgressBar from '@/components/WorkflowProgressBar';
import CycleStepsBreadcrumb from '@/components/CycleStepsBreadcrumb';

interface Product {
  id: string;
  title: string;
  sku: string;
  price: number;
  currency?: string;
  stock: number;
  marketplace: string;
  marketplaceUrl?: string | null; // URL del listing en el marketplace (donde está a la venta)
  aliexpressUrl?: string | null; // URL del proveedor (origen AliExpress)
  status: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  imageUrl?: string;
  profit?: number;
  createdAt: string;
}

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [workflowByProduct, setWorkflowByProduct] = useState<Record<string, any>>({});
  const [approvingPending, setApprovingPending] = useState(false);
  const { formatMoney } = useCurrency();

  // Batch fetch workflow status para los productos visibles (evita rate limit)
  useEffect(() => {
    const filtered = products.filter(product => {
      const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || product.status === statusFilter;
      const matchesMarketplace = marketplaceFilter === 'ALL' || product.marketplace === marketplaceFilter;
      return matchesSearch && matchesStatus && matchesMarketplace;
    });
    const paginated = filtered.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
    const ids = paginated.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;
    api.get(`/api/products/workflow-status-batch?ids=${ids.join(',')}`)
      .then((res) => {
        if (res.data?.success && res.data?.data) {
          const byId: Record<string, any> = {};
          Object.entries(res.data.data).forEach(([k, v]) => { byId[k] = v; });
          setWorkflowByProduct(byId);
        }
      })
      .catch(() => {});
  }, [products, currentPage, itemsPerPage, searchTerm, statusFilter, marketplaceFilter]);

  useEffect(() => {
    // ✅ FIX: Pequeño delay para permitir que useSetupCheck verifique primero
    const timer = setTimeout(() => {
      fetchProducts();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Refetch products every 10s so Autopilot-published products appear without manual refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchProducts(true).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchProducts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await api.get('/api/products');
      // ✅ FIX: Si es setup_required, no procesar (se manejará en App.tsx)
      if (response.data?.setupRequired === true || response.data?.error === 'setup_required') {
        return; // El hook useSetupCheck redirigirá
      }
      // El backend devuelve: { success: true, data: { products: [...] }, count: ... }
      const productsData = response.data?.data?.products || response.data?.products || response.data || [];
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (error: any) {
      // ✅ FIX: Si es setup_required, no mostrar error
      if (error.response?.data?.setupRequired === true || error.response?.data?.error === 'setup_required') {
        return; // El hook useSetupCheck redirigirá
      }
      console.error('Error fetching products:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || 'Error al cargar productos';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (productId: string) => {
    try {
      const response = await api.patch(`/api/products/${productId}/status`, { status: 'APPROVED' });
      const message = response.data?.message || 'Producto aprobado';
      toast.success(message);
      fetchProducts();
    } catch (error: any) {
      console.error('Error approving product:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || 'Error al aprobar producto';
      toast.error(errorMessage);
    }
  };

  const handleReject = async (productId: string) => {
    try {
      const response = await api.patch(`/api/products/${productId}/status`, { status: 'REJECTED' });
      const message = response.data?.message || 'Producto rechazado';
      toast.success(message);
      fetchProducts();
    } catch (error: any) {
      console.error('Error rejecting product:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || 'Error al rechazar producto';
      toast.error(errorMessage);
    }
  };

  const handlePublish = async (productId: string) => {
    try {
      const response = await api.patch(`/api/products/${productId}/status`, { status: 'PUBLISHED' });
      const message = response.data?.message || 'Producto publicado';
      toast.success(message);
      fetchProducts();
    } catch (error: any) {
      console.error('Error publishing product:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || 'Error al publicar producto';
      toast.error(errorMessage);
    }
  };

  const handleUnpublish = async (productId: string) => {
    if (!confirm('¿Despublicar este producto? Se retirará de los marketplaces y el estado pasará a APPROVED.')) return;
    try {
      const response = await api.post(`/api/products/${productId}/unpublish`);
      const message = response.data?.message || 'Producto despublicado';
      toast.success(message);
      fetchProducts();
    } catch (error: any) {
      const err = error?.response?.data?.error || error?.response?.data?.message || 'Error al despublicar';
      toast.error(err);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;

    try {
      const response = await api.delete(`/api/products/${productId}`);
      const message = response.data?.message || 'Producto eliminado';
      toast.success(message);
      fetchProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      const errorMessage = error?.response?.data?.error || error?.response?.data?.message || 'Error al eliminar producto';
      toast.error(errorMessage);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PENDING: 'warning',
      APPROVED: 'success',
      PUBLISHED: 'default',
      REJECTED: 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  // Filtrado
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || product.status === statusFilter;
    const matchesMarketplace = marketplaceFilter === 'ALL' || product.marketplace === marketplaceFilter;
    return matchesSearch && matchesStatus && matchesMarketplace;
  });

  // Paginación
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const stats = {
    total: products.length,
    pending: products.filter(p => p.status === 'PENDING').length,
    approved: products.filter(p => p.status === 'APPROVED').length,
    published: products.filter(p => p.status === 'PUBLISHED').length
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
          <div className="flex gap-2">
            {stats.pending > 0 && (
              <Button
                variant="outline"
                className="flex gap-2"
                disabled={approvingPending}
                onClick={async () => {
                  setApprovingPending(true);
                  try {
                    const res = await api.post('/api/products/approve-pending');
                    const msg = res.data?.message || 'Productos procesados';
                    toast.success(msg);
                    fetchProducts();
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error || 'Error al procesar pendientes');
                  } finally {
                    setApprovingPending(false);
                  }
                }}
              >
                {approvingPending ? 'Procesando...' : `Procesar ${stats.pending} pendientes`}
              </Button>
            )}
            <Button className="flex gap-2" onClick={() => navigate('/opportunities')}>
              <Package className="w-4 h-4" />
              Buscar oportunidades
            </Button>
          </div>
        </div>
        <p className="text-gray-600 mt-0.5">Productos aprobados y publicados en marketplaces</p>
        <div className="mt-3">
          <CycleStepsBreadcrumb currentStep={3} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Publicados</p>
                <p className="text-2xl font-bold text-blue-600">{stats.published}</p>
              </div>
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por título o SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PUBLISHED">Published</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">Todos los marketplaces</option>
              <option value="EBAY">eBay</option>
              <option value="AMAZON">Amazon</option>
              <option value="MERCADOLIBRE">MercadoLibre</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products List ({filteredProducts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando productos...</p>
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="text-center py-12 max-w-md mx-auto">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="font-medium text-gray-700 mb-2">Sin productos</p>
              <p className="text-sm text-gray-600 mb-4">No tienes productos publicados. El ciclo comienza en Tendencias → Oportunidades → Publicación. Los productos aparecen aquí tras aprobar y publicar.</p>
              <Button onClick={() => navigate('/dashboard?tab=trends')}>Comenzar ciclo (Tendencias)</Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marketplace</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enlaces</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beneficio</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedProducts.map((product) => (
                      <>
                        <tr key={product.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div
                              className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 -m-2 p-2 rounded"
                              onClick={() => { setSelectedProduct(product); setShowModal(true); }}
                            >
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded object-cover" />
                              ) : (
                                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              <span className="font-medium text-gray-900 max-w-xs truncate">{product.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{product.sku}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{product.marketplace}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {product.marketplaceUrl ? (
                              <a
                                href={product.marketplaceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                              >
                                <ExternalLink className="w-4 h-4" />
                                Ver en {product.marketplace}
                              </a>
                            ) : product.aliexpressUrl ? (
                              <a
                                href={product.aliexpressUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-gray-600 hover:underline text-sm"
                              >
                                <Link2 className="w-4 h-4" />
                                Proveedor
                              </a>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {formatCurrencySimple(product.price, product.currency || 'USD')}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{product.stock}</td>
                          <td className="px-4 py-3">{getStatusBadge(product.status)}</td>
                          <td className="px-4 py-3">
                            <WorkflowStatusIndicator 
                              productId={Number(product.id)} 
                              preloadedCurrentStage={workflowByProduct[product.id]?.currentStage}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {product.profit && (
                              <span className="text-sm font-medium text-green-600">
                                +{formatCurrencySimple(product.profit, product.currency || 'USD')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Botón Preview - Ojo */}
                              <button
                                onClick={() => {
                                  navigate(`/products/${product.id}/preview`);
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Preview de publicación"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {/* Botón Información Financiera - Calculadora */}
                              <button
                                onClick={() => navigate(`/products/${product.id}/preview?showFinancial=true`)}
                                className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                title="Ver información financiera (ganancia, margen, costos)"
                                aria-label="Ver información financiera"
                              >
                                <Calculator className="w-4 h-4 text-purple-600" />
                              </button>
                              {product.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(product.id)}
                                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                                    title="Approve"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleReject(product.id)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                    title="Reject"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {product.status === 'APPROVED' && (
                                <button
                                  onClick={() => handlePublish(product.id)}
                                  className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                                  title="Publish"
                                >
                                  <Upload className="w-4 h-4" />
                                </button>
                              )}
                              {product.status === 'PUBLISHED' && (
                                <button
                                  onClick={() => handleUnpublish(product.id)}
                                  className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                                  title="Despublicar"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(product.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Barra de progreso del workflow */}
                        <tr key={`${product.id}-workflow`} className="bg-gray-50">
                          <td colSpan={10} className="px-4 py-2">
                            <WorkflowProgressBar 
                              productId={Number(product.id)} 
                              preloadedStatus={workflowByProduct[product.id]}
                            />
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Product Detail Modal */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-bold">Product Details</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* ✅ Imagen del producto en el modal de detalles */}
              {selectedProduct.imageUrl ? (
                <div className="flex justify-center">
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title}
                    className="w-full max-w-md h-64 object-cover rounded-lg shadow-md"
                    onError={(e) => {
                      // Si la imagen falla, mostrar placeholder
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const placeholder = target.nextElementSibling as HTMLElement;
                      if (placeholder) placeholder.style.display = 'flex';
                    }}
                  />
                  <div className="w-full max-w-md h-64 bg-gray-200 rounded-lg flex items-center justify-center hidden">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Imagen no disponible</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="w-full max-w-md h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Sin imagen</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Title</p>
                  <p className="font-medium">{selectedProduct.title}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">SKU</p>
                  <p className="font-medium">{selectedProduct.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="font-medium text-lg">
                    {formatCurrencySimple(selectedProduct.price, selectedProduct.currency || 'USD')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Stock</p>
                  <p className="font-medium">{selectedProduct.stock} units</p>
                </div>
                <div>
                  <MetricLabelWithTooltip
                    label="Marketplace"
                    tooltipBody={metricTooltips.marketplace.body}
                    className="text-sm text-gray-600"
                  >
                    <p className="text-sm text-gray-600">Marketplace</p>
                  </MetricLabelWithTooltip>
                  <Badge variant="outline">{selectedProduct.marketplace}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedProduct.status)}
                    <MetricLabelWithTooltip
                      label={selectedProduct.status}
                      tooltipBody={
                        selectedProduct.status === 'PENDING' ? metricTooltips.statusPending.body :
                        selectedProduct.status === 'APPROVED' ? metricTooltips.statusApproved.body :
                        selectedProduct.status === 'PUBLISHED' ? metricTooltips.statusPublished.body :
                        selectedProduct.status === 'REJECTED' ? metricTooltips.statusRejected.body :
                        'Estado del producto en el sistema'
                      }
                      className="inline-block"
                    >
                      <span className="cursor-help">ℹ️</span>
                    </MetricLabelWithTooltip>
                  </div>
                </div>
                {selectedProduct.profit && (
                  <div>
                    <MetricLabelWithTooltip
                      label="Expected Profit"
                      tooltipBody={metricTooltips.potentialProfit.body}
                      className="text-sm text-gray-600"
                    >
                      <p className="text-sm text-gray-600">Expected Profit</p>
                    </MetricLabelWithTooltip>
                    <p className="font-medium text-green-600 text-lg">
                      +{formatCurrencySimple(selectedProduct.profit, selectedProduct.currency || 'USD')}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="font-medium">{new Date(selectedProduct.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {/* Enlaces: Marketplace (a la venta) y Proveedor (origen) */}
              {(selectedProduct.marketplaceUrl || selectedProduct.aliexpressUrl) && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-2">Enlaces</p>
                  <div className="flex flex-wrap gap-3">
                    {selectedProduct.marketplaceUrl && (
                      <a
                        href={selectedProduct.marketplaceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Store className="w-4 h-4" />
                        Ver en {selectedProduct.marketplace}
                      </a>
                    )}
                    {selectedProduct.aliexpressUrl && (
                      <a
                        href={selectedProduct.aliexpressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Link2 className="w-4 h-4" />
                        Proveedor (AliExpress)
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Close
              </Button>
              {selectedProduct.status === 'PUBLISHED' && selectedProduct.marketplaceUrl && (
                <Button
                  className="flex items-center gap-2"
                  onClick={() => window.open(selectedProduct.marketplaceUrl!, '_blank', 'noopener,noreferrer')}
                  title={`Abrir en ${selectedProduct.marketplace}`}
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Marketplace
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
