import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '@services/api';
import {
  Brain,
  Search,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  Download,
  Star,
  DollarSign,
  ShoppingCart,
  Globe,
  Clock,
  Users,
  Eye
} from 'lucide-react';
import { log } from '@/utils/logger';
import { formatCurrencySimple } from '@/utils/currency';
import MetricLabelWithTooltip from './MetricLabelWithTooltip';
import { metricTooltips } from '@/config/metricTooltips';

interface MarketOpportunity {
  id: string;
  product: string;
  category: string;
  marketplace: string;
  targetMarketplaces: string[];
  aliexpressUrl?: string;
  image?: string;
  images?: string[]; // ✅ MEJORADO: Array de todas las imágenes disponibles
  currentPrice: number;
  suggestedPrice: number;
  profitMargin: number;
  competition: 'low' | 'medium' | 'high' | 'unknown';
  demand: 'low' | 'medium' | 'high' | 'unknown';
  trend: 'rising' | 'stable' | 'declining';
  confidence: number;
  estimatedFields: string[];
  estimationNotes: string[];
  monthlySales: number;
  keywords: string[];
  suppliers: number;
  aiAnalysis: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

interface AIInsight {
  type: 'market_trend' | 'pricing' | 'competition' | 'demand';
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  actionable: boolean;
}

interface SearchProgress {
  stage: 'idle' | 'scraping' | 'analyzing' | 'calculating' | 'complete';
  message: string;
  productsFound: number;
  productsAnalyzed: number;
  opportunitiesFound: number;
  elapsedTime: number;
}

export default function AIOpportunityFinder() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [opportunities, setOpportunities] = useState<MarketOpportunity[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SearchProgress>({
    stage: 'idle',
    message: 'Listo para buscar oportunidades',
    productsFound: 0,
    productsAnalyzed: 0,
    opportunitiesFound: 0,
    elapsedTime: 0
  });
  const [selectedFilters, setSelectedFilters] = useState({
    marketplace: 'all',
    competition: 'all',
    profitMargin: 'all',
    trend: 'all'
  });

  const analyzeOpportunities = async () => {
    if (!searchQuery.trim()) {
      toast.error('Por favor ingresa un término de búsqueda');
      return;
    }

    setIsAnalyzing(true);
    const startTime = Date.now();
    
    // Inicializar progreso
    setProgress({
      stage: 'scraping',
      message: '🔍 Buscando productos en AliExpress...',
      productsFound: 0,
      productsAnalyzed: 0,
      opportunitiesFound: 0,
      elapsedTime: 0
    });

    // Simular progreso mientras se busca (para feedback visual)
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        let newStage = prev.stage;
        let newMessage = prev.message;
        
        // Simular progreso basado en tiempo transcurrido
        if (elapsed < 5) {
          newStage = 'scraping';
          newMessage = '🔍 Escrapeando productos en AliExpress...';
        } else if (elapsed < 15) {
          newStage = 'analyzing';
          newMessage = `📊 Analizando productos encontrados...`;
        } else if (elapsed < 25) {
          newStage = 'calculating';
          newMessage = '💰 Calculando márgenes y oportunidades...';
        } else {
          // Si lleva más de 25 segundos, mantener en calculating pero mostrar mensaje de espera
          newStage = 'calculating';
          newMessage = '⏳ Procesando datos, por favor espera...';
        }
        
        return {
          ...prev,
          stage: newStage,
          message: newMessage,
          elapsedTime: elapsed
        };
      });
    }, 500);
    
    try {
      // ✅ USAR API REAL - Buscar oportunidades reales
      const response = await api.get('/api/opportunities', {
        params: {
          query: searchQuery,
          maxItems: 20,
          page: 1,
          marketplaces: selectedFilters.marketplace === 'all' ? 'ebay,amazon,mercadolibre' : selectedFilters.marketplace,
          region: 'us'
        }
      });
      
      clearInterval(progressInterval);

      const items = response.data?.items || [];
      const debugInfo = response.data?.debug || null;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      // Actualizar progreso con datos reales
      setProgress(prev => ({
        stage: 'complete',
        message: items.length > 0 
          ? `✅ ${items.length} ${items.length === 1 ? 'oportunidad encontrada' : 'oportunidades encontradas'} en ${elapsed}s`
          : `⚠️ No se encontraron oportunidades en ${elapsed}s`,
        productsFound: items.length,
        productsAnalyzed: items.length,
        opportunitiesFound: items.length,
        elapsedTime: elapsed
      }));
      
      // Convertir items de la API al formato del componente
      const formattedOpportunities: MarketOpportunity[] = items.map((item: any, index: number) => ({
        id: String(item.productId || index),
        product: item.title || 'Producto sin título',
        category: 'General',
        marketplace: item.targetMarketplaces?.[0] || 'ebay',
        targetMarketplaces: Array.isArray(item.targetMarketplaces) && item.targetMarketplaces.length > 0
          ? item.targetMarketplaces
          : ['ebay', 'amazon', 'mercadolibre'],
        aliexpressUrl: item.aliexpressUrl || item.productUrl || '',
        image: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : item.image, // ✅ MEJORADO: Usar primera imagen del array si está disponible
        images: Array.isArray(item.images) && item.images.length > 0 ? item.images : (item.image ? [item.image] : []), // ✅ MEJORADO: Mantener array completo de imágenes
        currentPrice: item.costUsd || 0,
        suggestedPrice: item.suggestedPriceUsd || 0,
        profitMargin: (item.profitMargin || 0) * 100,
        competition: item.competitionLevel || 'unknown',
        demand: item.marketDemand || 'unknown',
        trend: 'stable',
        confidence: (item.confidenceScore || 0.5) * 100,
        estimatedFields: item.estimatedFields || [],
        estimationNotes: item.estimationNotes || [],
        monthlySales: 0,
        keywords: [],
        suppliers: 0,
        aiAnalysis: {
          strengths: ['Oportunidad validada por análisis de mercado'],
          weaknesses: [],
          recommendations: ['Revisar detalles antes de publicar']
        }
      }));

      // Aplicar filtros adicionales
      const filteredOpportunities = formattedOpportunities.filter(opp => {
        if (selectedFilters.competition !== 'all' && opp.competition !== selectedFilters.competition) {
          return false;
        }
        return true;
      });
      
      setOpportunities(filteredOpportunities);
      
      // Generar insights basados en resultados reales
      const realInsights: AIInsight[] = [];
      if (filteredOpportunities.length > 0) {
        const avgMargin = filteredOpportunities.reduce((sum, opp) => sum + opp.profitMargin, 0) / filteredOpportunities.length;
        realInsights.push({
          type: 'market_trend',
          title: `${filteredOpportunities.length} oportunidades encontradas`,
          description: `Margen promedio: ${avgMargin.toFixed(1)}%. Analiza cada oportunidad antes de proceder.`,
          impact: avgMargin > 30 ? 'positive' : 'neutral',
          confidence: Math.min(90, filteredOpportunities.length * 10),
          actionable: true
        });
      } else {
        // Mostrar información de debug si está disponible
        let description = 'Intenta con términos de búsqueda diferentes o ajusta los filtros.';
        if (debugInfo) {
          const causes = debugInfo.possibleCauses || [];
          const suggestions = debugInfo.suggestions || [];
          description = `${debugInfo.message || 'No se encontraron productos en AliExpress.'}\n\nPosibles causas:\n${causes.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\nSugerencias:\n${suggestions.map((s: string, i: number) => `• ${s}`).join('\n')}`;
        }
        
        realInsights.push({
          type: 'market_trend',
          title: 'No se encontraron oportunidades',
          description,
          impact: 'neutral',
          confidence: 50,
          actionable: true
        });
        
        // Mostrar toast con información de debug si está disponible
        if (debugInfo) {
          toast.error(
            <div className="space-y-2 text-sm max-w-md">
              <p className="font-semibold text-gray-900">{debugInfo.message || 'No se encontraron productos'}</p>
              <div className="text-gray-700 text-xs space-y-1">
                <p className="font-medium">Posibles causas:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {debugInfo.possibleCauses?.map((cause: string, i: number) => (
                    <li key={i}>{cause}</li>
                  ))}
                </ul>
                <p className="font-medium mt-2">Sugerencias:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {debugInfo.suggestions?.map((suggestion: string, i: number) => (
                    <li key={i}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            </div>,
            { duration: 15000 }
          );
        }
      }
      
      setInsights(realInsights);
    } catch (error: any) {
      log.error('Error searching opportunities:', error);
      if (error?.response?.status === 428) {
        const data = error.response?.data || {};
        const manualPath = data.manualUrl || (data.token ? `/manual-login/${data.token}` : null);
        const targetUrl = manualPath
          ? (manualPath.startsWith('http') ? manualPath : `${window.location.origin}${manualPath}`)
          : data.loginUrl;
        toast.custom((t) => (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-gray-900">Se requiere iniciar sesión en AliExpress</p>
            <p className="text-gray-700 text-xs">Abriremos la página de autenticación. Una vez que guardes la sesión, vuelve a intentar.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                  toast.dismiss(t.id);
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
              >
                Abrir login
              </button>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="px-3 py-1 border border-gray-300 rounded text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        ));
      } else {
        toast.error(error.response?.data?.error || 'Error al buscar oportunidades');
      }
      setOpportunities([]);
      setInsights([]);
      setProgress({
        stage: 'idle',
        message: 'Error en la búsqueda. Intenta nuevamente.',
        productsFound: 0,
        productsAnalyzed: 0,
        opportunitiesFound: 0,
        elapsedTime: 0
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'scraping':
        return <Search className="h-5 w-5 animate-pulse text-blue-600" />;
      case 'analyzing':
        return <Brain className="h-5 w-5 animate-pulse text-purple-600" />;
      case 'calculating':
        return <TrendingUp className="h-5 w-5 animate-pulse text-green-600" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Search className="h-5 w-5 text-gray-400" />;
    }
  };
  
  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'scraping':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'analyzing':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      case 'calculating':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'complete':
        return 'bg-green-50 border-green-200 text-green-700';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getCompetitionColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';  
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDemandColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rising': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'stable': return <Target className="h-4 w-4 text-blue-600" />;
      case 'declining': return <TrendingUp className="h-4 w-4 text-red-600 rotate-180" />;
      default: return <Target className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleViewDetails = (opp: MarketOpportunity) => {
    // ✅ Asegurar que la URL esté presente y sea válida
    let url = opp.aliexpressUrl;
    
    // Si no hay URL directa, intentar construirla desde el ID del producto
    if (!url || !url.startsWith('http')) {
      // Intentar construir URL desde el productId si está disponible
      if (opp.id && opp.id.length > 5) {
        // Si el ID parece ser un ID de producto de AliExpress
        url = `https://www.aliexpress.com/item/${opp.id}.html`;
      } else {
        toast.error('No se encontró el enlace original del producto. Intenta importar el producto directamente.', {
          duration: 5000
        });
        return;
      }
    }
    
    // Validar que la URL sea válida antes de abrir
    try {
      new URL(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error('El enlace del producto no es válido. Intenta importar el producto directamente.', {
        duration: 5000
      });
    }
  };

  const handleImportProduct = async (opp: MarketOpportunity) => {
    // ✅ Validar que tenemos todos los campos requeridos
    if (!opp.aliexpressUrl || !opp.aliexpressUrl.startsWith('http')) {
      toast.error('No se puede importar porque falta el enlace de AliExpress o no es válido.', {
        duration: 5000
      });
      return;
    }

    if (!opp.product || opp.product.length < 5) {
      toast.error('El título del producto es muy corto o no es válido.', {
        duration: 5000
      });
      return;
    }

    if (!opp.currentPrice || opp.currentPrice <= 0) {
      toast.error('El precio actual del producto no es válido.', {
        duration: 5000
      });
      return;
    }

    if (!opp.suggestedPrice || opp.suggestedPrice <= 0) {
      toast.error('El precio sugerido del producto no es válido.', {
        duration: 5000
      });
      return;
    }

    try {
      setImportingId(opp.id);

      // ✅ Preparar payload con toda la información disponible
      const payload: Record<string, any> = {
        title: String(opp.product).trim(),
        aliexpressUrl: String(opp.aliexpressUrl).trim(),
        aliexpressPrice: Number(opp.currentPrice),
        suggestedPrice: Number(opp.suggestedPrice),
        currency: 'USD',
      };

      // ✅ Validar que los números sean válidos
      if (isNaN(payload.aliexpressPrice) || payload.aliexpressPrice <= 0) {
        throw new Error('El precio actual debe ser un número positivo válido');
      }
      if (isNaN(payload.suggestedPrice) || payload.suggestedPrice <= 0) {
        throw new Error('El precio sugerido debe ser un número positivo válido');
      }

      // ✅ MEJORADO: Incluir todas las imágenes disponibles
      const normalizeImageUrl = (img: string): string | null => {
        if (!img || typeof img !== 'string' || img.trim().length === 0) return null;
        const imageUrl = String(img).trim();
        if (/^https?:\/\//i.test(imageUrl)) {
          return imageUrl;
        } else if (imageUrl.startsWith('//')) {
          return `https:${imageUrl}`;
        } else if (imageUrl.startsWith('/')) {
          return `https://www.aliexpress.com${imageUrl}`;
        } else if (imageUrl.length > 10 && !imageUrl.includes(' ')) {
          return `https://${imageUrl}`;
        }
        return null;
      };

      // ✅ MEJORADO: Usar todas las imágenes disponibles si están en el array
      // Priorizar array de imágenes (images) sobre imagen única (image)
      console.log('[AIOpportunityFinder] Verificando imágenes antes de normalizar', {
        productTitle: opp.product?.substring(0, 50),
        hasImagesArray: Array.isArray((opp as any).images),
        imagesArrayLength: Array.isArray((opp as any).images) ? (opp as any).images.length : 0,
        imagesPreview: Array.isArray((opp as any).images) ? (opp as any).images.slice(0, 3).map((img: any) => typeof img === 'string' ? img.substring(0, 60) : String(img).substring(0, 60)) : [],
        hasImage: !!opp.image,
        imageValue: opp.image?.substring(0, 60)
      });

      if (Array.isArray((opp as any).images) && (opp as any).images.length > 0) {
        const normalizedImages = (opp as any).images
          .map((img: any) => {
            if (!img || typeof img !== 'string') return null;
            return normalizeImageUrl(img);
          })
          .filter((img: string | null): img is string => img !== null && img.trim().length > 0);
        
        console.log('[AIOpportunityFinder] Imágenes después de normalizar', {
          productTitle: opp.product?.substring(0, 50),
          originalCount: (opp as any).images.length,
          normalizedCount: normalizedImages.length,
          normalizedPreview: normalizedImages.slice(0, 5).map((img: string) => img?.substring(0, 60))
        });

        if (normalizedImages.length > 0) {
          payload.imageUrl = normalizedImages[0]; // Primera imagen como principal
          payload.imageUrls = normalizedImages; // Todas las imágenes
          
          // ✅ LOGGING: Verificar qué imágenes se están enviando
          console.log('[AIOpportunityFinder] Enviando imágenes al backend', {
            productTitle: opp.product?.substring(0, 50),
            totalImages: normalizedImages.length,
            firstImage: normalizedImages[0]?.substring(0, 80),
            allImagesPreview: normalizedImages.slice(0, 5).map((img: string) => img?.substring(0, 60)),
            payloadImageUrl: payload.imageUrl?.substring(0, 80),
            payloadImageUrlsCount: Array.isArray(payload.imageUrls) ? payload.imageUrls.length : 0
          });
        } else {
          console.error('[AIOpportunityFinder] Todas las imágenes fueron filtradas durante la normalización', {
            productTitle: opp.product?.substring(0, 50),
            originalCount: (opp as any).images.length,
            originalImages: (opp as any).images.slice(0, 3)
          });
        }
      } else if (opp.image && typeof opp.image === 'string' && opp.image.trim().length > 0) {
        // Fallback: usar imagen única si no hay array
        const imageUrl = normalizeImageUrl(opp.image);
        if (imageUrl) {
          payload.imageUrl = imageUrl;
          payload.imageUrls = [imageUrl]; // Crear array con la única imagen
          console.warn('[AIOpportunityFinder] Solo hay 1 imagen disponible (fallback)', {
            productTitle: opp.product?.substring(0, 50),
            hasImagesArray: Array.isArray((opp as any).images),
            imagesArrayLength: Array.isArray((opp as any).images) ? (opp as any).images.length : 0
          });
        }
      } else {
        console.error('[AIOpportunityFinder] No hay imágenes disponibles', {
          productTitle: opp.product?.substring(0, 50),
          hasImagesArray: Array.isArray((opp as any).images),
          imagesArrayLength: Array.isArray((opp as any).images) ? (opp as any).images.length : 0,
          hasImage: !!opp.image,
          oppKeys: Object.keys(opp)
        });
      }

      // ✅ Incluir categoría si está disponible
      if (opp.category && opp.category !== 'General' && opp.category.trim().length > 0) {
        payload.category = String(opp.category).trim();
      }

      // ✅ Incluir descripción con información de análisis si está disponible
      const descriptionParts: string[] = [];
      if (opp.aiAnalysis?.strengths?.length > 0) {
        descriptionParts.push(`Fortalezas: ${opp.aiAnalysis.strengths.join(', ')}`);
      }
      if (opp.aiAnalysis?.recommendations?.length > 0) {
        descriptionParts.push(`Recomendaciones: ${opp.aiAnalysis.recommendations.join(', ')}`);
      }
      if (descriptionParts.length > 0) {
        payload.description = descriptionParts.join('\n\n');
      }

      // ✅ Incluir keywords si están disponibles
      if (opp.keywords && Array.isArray(opp.keywords) && opp.keywords.length > 0) {
        payload.tags = opp.keywords.filter(k => k && String(k).trim().length > 0);
      }

      // ✅ Guardar metadata completa del análisis de oportunidad en productData
      // Esto incluye toda la información del análisis que puede ser útil más adelante
      payload.productData = {
        source: 'ai_opportunity_finder',
        opportunityId: opp.id,
        profitMargin: typeof opp.profitMargin === 'number' ? opp.profitMargin : 0,
        competition: opp.competition || 'unknown',
        demand: opp.demand || 'unknown',
        trend: opp.trend || 'stable',
        confidence: typeof opp.confidence === 'number' ? opp.confidence : 0,
        monthlySales: typeof opp.monthlySales === 'number' ? opp.monthlySales : 0,
        suppliers: typeof opp.suppliers === 'number' ? opp.suppliers : 0,
        targetMarketplaces: Array.isArray(opp.targetMarketplaces) ? opp.targetMarketplaces : [],
        marketplace: opp.marketplace || 'ebay',
        estimatedFields: Array.isArray(opp.estimatedFields) ? opp.estimatedFields : [],
        estimationNotes: Array.isArray(opp.estimationNotes) ? opp.estimationNotes : [],
        aiAnalysis: opp.aiAnalysis || {},
        importedAt: new Date().toISOString(),
      };

      log.debug('Importing product with payload:', {
        title: payload.title?.substring(0, 50),
        aliexpressUrl: payload.aliexpressUrl?.substring(0, 80),
        aliexpressPrice: payload.aliexpressPrice,
        suggestedPrice: payload.suggestedPrice,
        hasImage: !!payload.imageUrl,
        hasCategory: !!payload.category,
        hasDescription: !!payload.description,
        hasTags: !!payload.tags && payload.tags.length > 0,
        hasProductData: !!payload.productData
      });

      // ✅ Crear producto - El backend lo guardará con estado PENDING automáticamente
      // El producto quedará disponible en "Pendientes de publicación" para que
      // el sistema (modo automático) o el usuario (modo manual) lo publique
      // ✅ LOGGING: Verificar exactamente qué se envía en el payload
      console.log('[AIOpportunityFinder] Payload completo antes de enviar', {
        productTitle: payload.title?.substring(0, 50),
        imageUrl: payload.imageUrl?.substring(0, 80),
        imageUrlsType: typeof payload.imageUrls,
        imageUrlsIsArray: Array.isArray(payload.imageUrls),
        imageUrlsCount: Array.isArray(payload.imageUrls) ? payload.imageUrls.length : 0,
        imageUrlsPreview: Array.isArray(payload.imageUrls) ? payload.imageUrls.slice(0, 5).map((img: string) => img?.substring(0, 60)) : []
      });

      log.debug('Sending product creation request to backend', {
        title: payload.title?.substring(0, 50),
        aliexpressUrl: payload.aliexpressUrl?.substring(0, 80),
        aliexpressPrice: payload.aliexpressPrice,
        suggestedPrice: payload.suggestedPrice,
        hasImageUrl: !!payload.imageUrl,
        imageUrlsCount: Array.isArray(payload.imageUrls) ? payload.imageUrls.length : 0,
        hasProductData: !!payload.productData
      });
      
      const productResponse = await api.post('/api/products', payload);
      
      // ✅ El backend devuelve { success: true, data: { id, ...product } }
      const responseData = productResponse.data;
      const product = responseData?.data || responseData;
      
      // ✅ Obtener el ID del producto - el backend ahora asegura que esté en data.id
      let productId = product?.id || responseData?.data?.id || responseData?.id;
      
      // Si el ID viene como número, convertirlo a string si es necesario
      if (typeof productId === 'number') {
        productId = String(productId);
      }
      
      if (!productId) {
        log.error('Product response does not contain ID:', {
          response: productResponse,
          responseData,
          data: responseData?.data,
          status: productResponse.status,
          productKeys: product ? Object.keys(product) : [],
          productType: typeof product
        });
        throw new Error('No se pudo obtener el ID del producto creado. El servidor no devolvió un ID válido.');
      }

      log.info('Product imported successfully:', {
        productId,
        title: product.title?.substring(0, 50),
        status: product.status
      });

      // ✅ FASE 3: Producto importado exitosamente - Redirigir a Products (NO a preview)
      // El usuario debe ir manualmente a Products y hacer clic en el ojo para ver preview
      toast.success('✅ Producto importado correctamente. Ve a Products para revisarlo y publicarlo.', {
        duration: 3000
      });

      // Redirigir a Products después de un breve delay para que el usuario vea el mensaje
      setTimeout(() => {
        navigate('/products');
      }, 1500);
    } catch (error: any) {
      log.error('Error importing product from AI finder:', {
        error,
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        opportunityId: opp.id,
        title: opp.product?.substring(0, 50),
        aliexpressUrl: opp.aliexpressUrl?.substring(0, 80)
      });

      // ✅ Proporcionar mensajes de error más específicos
      let errorMessage = 'Error al importar el producto';
      
      if (error?.response?.status === 400) {
        // Error de validación
        if (error?.response?.data?.error) {
          errorMessage = `Error de validación: ${error.response.data.error}`;
        } else if (error?.response?.data?.message) {
          errorMessage = `Error de validación: ${error.response.data.message}`;
        } else if (error?.response?.data?.errors) {
          // Si hay múltiples errores de validación (Zod)
          const zodErrors = Array.isArray(error.response.data.errors)
            ? error.response.data.errors.map((e: any) => `${e.path?.join('.') || ''}: ${e.message || ''}`).filter(Boolean).join(', ')
            : JSON.stringify(error.response.data.errors);
          errorMessage = `Error de validación: ${zodErrors}`;
        } else {
          errorMessage = 'Error de validación: Los datos enviados no son válidos. Por favor, verifica que todos los campos requeridos estén presentes.';
        }
      } else if (error?.response?.status === 401 || error?.response?.status === 403) {
        errorMessage = 'No tienes permiso para importar productos. Por favor, inicia sesión nuevamente.';
      } else if (error?.response?.status >= 500) {
        errorMessage = 'Error del servidor al importar el producto. Por favor, intenta nuevamente más tarde.';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage, {
        duration: 8000
      });
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Opportunity Finder</h1>
            <p className="text-gray-600">Descubre oportunidades de negocio con inteligencia artificial</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            <Download className="h-4 w-4" />
            <span>Exportar</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <RefreshCw className="h-4 w-4" />
            <span>Actualizar IA</span>
          </button>
        </div>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar oportunidades
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: auriculares, gaming, hogar inteligente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Marketplace</label>
            <select 
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={selectedFilters.marketplace}
              onChange={(e) => setSelectedFilters({...selectedFilters, marketplace: e.target.value})}
            >
              <option value="all">Todos</option>
              <option value="ebay">eBay</option>
              <option value="amazon">Amazon</option>
              <option value="mercadolibre">MercadoLibre</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Competencia</label>
            <select 
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={selectedFilters.competition}
              onChange={(e) => setSelectedFilters({...selectedFilters, competition: e.target.value})}
            >
              <option value="all">Todas</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
        </div>
        
        <button
          onClick={analyzeOpportunities}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analizando con IA...</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              <span>Analizar Oportunidades</span>
            </>
          )}
        </button>
      </div>

      {/* Panel de progreso animado */}
      {isAnalyzing && (
        <div className={`bg-white rounded-xl p-6 shadow-lg border-2 ${getStageColor(progress.stage)} transition-all duration-500`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStageIcon(progress.stage)}
              <div>
                <h3 className="font-semibold text-lg">{progress.message}</h3>
                <p className="text-sm opacity-80">
                  {progress.stage === 'scraping' && 'Buscando productos en AliExpress...'}
                  {progress.stage === 'analyzing' && 'Analizando productos encontrados...'}
                  {progress.stage === 'calculating' && 'Calculando márgenes y oportunidades...'}
                  {progress.stage === 'complete' && 'Búsqueda completada exitosamente'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{progress.elapsedTime}s</div>
              <div className="text-xs opacity-70">Tiempo transcurrido</div>
            </div>
          </div>
          
          {/* Barra de progreso animada */}
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.stage === 'scraping' ? 'bg-blue-500' :
                  progress.stage === 'analyzing' ? 'bg-purple-500' :
                  progress.stage === 'calculating' ? 'bg-green-500' :
                  'bg-green-600'
                }`}
                style={{
                  width: progress.stage === 'complete' ? '100%' :
                         progress.stage === 'calculating' ? '90%' :
                         progress.stage === 'analyzing' ? '60%' : '30%',
                  animation: progress.stage !== 'complete' ? 'pulse 2s ease-in-out infinite' : 'none'
                }}
              />
            </div>
          </div>
          
          {/* Estadísticas en tiempo real */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{progress.productsFound}</div>
              <div className="text-xs opacity-70">Productos encontrados</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{progress.productsAnalyzed}</div>
              <div className="text-xs opacity-70">Productos analizados</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{progress.opportunitiesFound}</div>
              <div className="text-xs opacity-70">Oportunidades</div>
            </div>
          </div>
          
          {/* Indicadores de etapa */}
          <div className="flex items-center justify-center space-x-2 mt-4">
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'scraping' ? 'bg-blue-600 animate-pulse' : progress.stage !== 'idle' ? 'bg-blue-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'analyzing' ? 'bg-purple-600 animate-pulse' : ['calculating', 'complete'].includes(progress.stage) ? 'bg-purple-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'calculating' ? 'bg-green-600 animate-pulse' : progress.stage === 'complete' ? 'bg-green-400' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${progress.stage === 'complete' ? 'bg-green-600' : 'bg-gray-300'}`} />
          </div>
        </div>
      )}
      
      {/* Resultados con animación */}
      {!isAnalyzing && progress.stage === 'complete' && opportunities.length > 0 && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-800">
                ✅ {opportunities.length} {opportunities.length === 1 ? 'oportunidad encontrada' : 'oportunidades encontradas'} en {progress.elapsedTime}s
              </span>
            </div>
            <button
              onClick={() => setProgress({ ...progress, stage: 'idle' })}
              className="text-green-600 hover:text-green-700 text-sm"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      {/* Insights de IA */}
      {insights.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
            Insights de Mercado
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {insights.map((insight, index) => (
              <div key={index} className={`p-4 rounded-lg border-l-4 ${
                insight.impact === 'positive' ? 'bg-green-50 border-green-500' :
                insight.impact === 'negative' ? 'bg-red-50 border-red-500' :
                'bg-blue-50 border-blue-500'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">{insight.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{insight.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Confianza: {insight.confidence}%</span>
                      {insight.actionable && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          Accionable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de oportunidades */}
      {opportunities.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Target className="h-5 w-5 text-green-600 mr-2" />
            Oportunidades Detectadas ({opportunities.length})
          </h2>
          
          {opportunities.map((opp) => (
            <div
              key={opp.id}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-start md:space-x-4 mb-4">
                <div className="w-full md:w-32 md:flex-shrink-0 mb-4 md:mb-0">
                  {opp.image ? (
                    <img
                      src={opp.image}
                      alt={opp.product}
                      className="w-full h-24 object-cover rounded border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/160x120?text=No+Image';
                      }}
                    />
                  ) : (
                    <div className="w-full h-24 bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-500">
                      Sin imagen
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {opp.product}
                    </h3>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full capitalize">
                      {opp.marketplace}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{opp.category}</p>
                  {opp.estimationNotes.length > 0 && (
                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded mb-3">
                      <div className="font-semibold mb-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Nota informativa:
                      </div>
                      <ul className="space-y-1 list-none">
                        {opp.estimationNotes.map((note, idx) => (
                          <li key={idx} className="flex items-start">
                            <span className="text-blue-500 mr-1">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-blue-600 font-medium">
                        💡 Puedes importar el producto independientemente. Los precios exactos se actualizarán cuando configures las credenciales.
                      </div>
                    </div>
                  )}

                  {/* Métricas principales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {opp.profitMargin.toFixed(1)}%
                      </p>
                      <MetricLabelWithTooltip
                        label="Margen"
                        tooltipBody={metricTooltips.profitMargin.body}
                        className="text-xs text-gray-600"
                      >
                        <span className="text-xs text-gray-600 flex items-center justify-center gap-1">
                          Margen
                          {opp.estimatedFields.includes('profitMargin') && (
                            <span className="uppercase text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                              Estimado
                            </span>
                          )}
                        </span>
                      </MetricLabelWithTooltip>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{opp.confidence}%</p>
                      <MetricLabelWithTooltip
                        label="Confianza IA"
                        tooltipTitle={metricTooltips.aiConfidence.title}
                        tooltipBody={metricTooltips.aiConfidence.body}
                        className="text-xs text-gray-600"
                      >
                        <span className="text-xs text-gray-600">Confianza IA</span>
                      </MetricLabelWithTooltip>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">{opp.monthlySales.toLocaleString()}</p>
                      <MetricLabelWithTooltip
                        label="Ventas/mes"
                        tooltipBody={metricTooltips.monthlySales.body}
                        className="text-xs text-gray-600"
                      >
                        <span className="text-xs text-gray-600">Ventas/mes</span>
                      </MetricLabelWithTooltip>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{opp.suppliers}</p>
                      <MetricLabelWithTooltip
                        label="Proveedores"
                        tooltipBody={metricTooltips.suppliers.body}
                        className="text-xs text-gray-600"
                      >
                        <span className="text-xs text-gray-600">Proveedores</span>
                      </MetricLabelWithTooltip>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <MetricLabelWithTooltip
                    label={opp.trend}
                    tooltipBody={metricTooltips.trend.body}
                    className="flex items-center space-x-2 mb-2"
                  >
                    <div className="flex items-center space-x-2">
                      {getTrendIcon(opp.trend)}
                      <span className="text-sm font-medium capitalize">{opp.trend}</span>
                    </div>
                  </MetricLabelWithTooltip>

                  <div className="space-y-2">
                    <MetricLabelWithTooltip
                      label={`Competencia ${opp.competition}`}
                      tooltipBody={metricTooltips.competition.body}
                      className={`px-2 py-1 rounded-full text-xs border ${getCompetitionColor(opp.competition)}`}
                    >
                      <span>Competencia {opp.competition}</span>
                    </MetricLabelWithTooltip>
                    <MetricLabelWithTooltip
                      label={`Demanda ${opp.demand}`}
                      tooltipBody={metricTooltips.demand.body}
                      className={`text-xs font-medium ${getDemandColor(opp.demand)}`}
                    >
                      <span>Demanda {opp.demand}</span>
                    </MetricLabelWithTooltip>
                  </div>
                </div>
              </div>
              
              {/* Precios */}
              <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <MetricLabelWithTooltip
                    label="Precio actual"
                    tooltipBody={metricTooltips.currentPrice.body}
                    className="text-sm text-gray-600"
                  >
                    <p className="text-sm text-gray-600">Precio actual</p>
                  </MetricLabelWithTooltip>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrencySimple(opp.currentPrice, 'USD')}</p>
                </div>
                <div className="text-center">
                  <MetricLabelWithTooltip
                    label="Precio sugerido"
                    tooltipBody={metricTooltips.suggestedPrice.body}
                    className="text-sm text-gray-600"
                  >
                    <p className="text-sm text-gray-600">Precio sugerido</p>
                  </MetricLabelWithTooltip>
                  <p className="text-lg font-semibold text-green-600 flex items-center justify-center gap-2">
                    {formatCurrencySimple(opp.suggestedPrice, 'USD')}
                    {opp.estimatedFields.includes('suggestedPriceUsd') && (
                      <span className="uppercase text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded-full font-semibold">
                        Estimado
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <MetricLabelWithTooltip
                    label="Ganancia potencial"
                    tooltipBody={metricTooltips.potentialProfit.body}
                    className="text-sm text-gray-600"
                  >
                    <p className="text-sm text-gray-600">Ganancia potencial</p>
                  </MetricLabelWithTooltip>
                  <p className="text-lg font-semibold text-blue-600">{formatCurrencySimple(opp.suggestedPrice - opp.currentPrice, 'USD')}</p>
                </div>
              </div>
              
              {/* Análisis de IA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <h4 className="font-medium text-green-700 mb-2 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Fortalezas
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.strengths.map((strength, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-green-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-red-700 mb-2 flex items-center">
                    <XCircle className="h-4 w-4 mr-1" />
                    Debilidades
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.weaknesses.map((weakness, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-red-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-blue-700 mb-2 flex items-center">
                    <Star className="h-4 w-4 mr-1" />
                    Recomendaciones
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {opp.aiAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="w-1 h-1 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              
              {/* Keywords */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Keywords clave:</h4>
                <div className="flex flex-wrap gap-2">
                  {opp.keywords.map((keyword, idx) => (
                    <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Acciones */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Eye className="h-4 w-4 mr-1" />
                    <span>Análisis detallado</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>Hace 2h</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewDetails(opp)}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Ver detalles
                  </button>
                  <button
                    onClick={() => handleImportProduct(opp)}
                    disabled={importingId === opp.id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importingId === opp.id ? 'Importando...' : 'Importar producto'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Estado vacío */}
      {opportunities.length === 0 && !isAnalyzing && progress.stage !== 'complete' && (
        <div className="text-center py-12">
          <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Descubre oportunidades con IA</h3>
          <p className="text-gray-600 mb-6">
            Utiliza nuestro motor de IA para encontrar los productos más rentables del mercado
          </p>
          <button
            onClick={() => {
              setSearchQuery('gaming');
              analyzeOpportunities();
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Empezar análisis
          </button>
        </div>
      )}
    </div>
  );
}