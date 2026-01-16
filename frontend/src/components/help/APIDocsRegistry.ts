/**
 * Registry de documentación de APIs
 * Mapea el slug de cada API a su título y contenido Markdown
 */

export interface APIDocEntry {
  slug: string;
  title: string;
  category: 'marketplace' | 'ia' | 'scraping' | 'captcha' | 'pagos' | 'comunicacion' | 'compra';
  description: string;
}

export const API_DOCS_REGISTRY: APIDocEntry[] = [
  // Marketplaces
  {
    slug: 'ebay',
    title: 'eBay Trading API',
    category: 'marketplace',
    description: 'Publicar y gestionar productos en eBay',
  },
  {
    slug: 'amazon',
    title: 'Amazon SP-API',
    category: 'marketplace',
    description: 'Integración con Amazon Seller Partner API',
  },
  {
    slug: 'mercadolibre',
    title: 'MercadoLibre API',
    category: 'marketplace',
    description: 'Publicar productos en MercadoLibre',
  },
  // IA
  {
    slug: 'groq',
    title: 'GROQ AI API',
    category: 'ia',
    description: 'Generación de títulos y descripciones con IA',
  },
  // Scraping
  {
    slug: 'scraperapi',
    title: 'ScraperAPI',
    category: 'scraping',
    description: 'Web scraping de AliExpress y otros sitios',
  },
  {
    slug: 'zenrows',
    title: 'ZenRows API',
    category: 'scraping',
    description: 'Alternativa a ScraperAPI para web scraping',
  },
  {
    slug: 'aliexpress-affiliate',
    title: 'AliExpress Affiliate API',
    category: 'scraping',
    description: 'API oficial de AliExpress para extraer datos de productos',
  },
  // Captcha
  {
    slug: '2captcha',
    title: '2Captcha API',
    category: 'captcha',
    description: 'Resolver captchas automáticamente',
  },
  // Análisis
  {
    slug: 'googletrends',
    title: 'Google Trends API (SerpAPI)',
    category: 'scraping',
    description: 'Validar viabilidad de productos usando Google Trends',
  },
  // Pagos
  {
    slug: 'paypal',
    title: 'PayPal Payouts',
    category: 'pagos',
    description: 'Pagar comisiones automáticamente',
  },
  // Compra
  {
    slug: 'aliexpress',
    title: 'AliExpress Auto-Purchase',
    category: 'compra',
    description: 'Credenciales de AliExpress para compra automática',
  },
  {
    slug: 'aliexpress-dropshipping',
    title: 'AliExpress Dropshipping API',
    category: 'compra',
    description: 'API oficial de AliExpress para crear órdenes automatizadas',
  },
];

/**
 * ✅ FIX: Cargar todos los archivos Markdown usando import.meta.glob (solución Vite-oficial)
 * Esto permite que Vite resuelva todos los imports en build time
 * La ruta debe ser relativa desde el archivo actual
 */
const apiDocsModules = import.meta.glob('../../../docs/help/apis/*.md?raw', { 
  eager: false,
  import: 'default'
}) as Record<string, () => Promise<string>>;

/**
 * Función helper para cargar el contenido Markdown de una API
 * Usa import.meta.glob para cargar archivos de forma estática (Vite-oficial)
 */
export async function loadAPIDoc(slug: string): Promise<string> {
  try {
    // Buscar el archivo correspondiente al slug en el objeto de módulos
    // import.meta.glob devuelve rutas absolutas desde la raíz del proyecto
    const filePath = `../../../docs/help/apis/${slug}.md?raw`;
    
    // Buscar el loader que coincida con el slug
    const loader = Object.entries(apiDocsModules).find(([path]) => {
      // Extraer el nombre del archivo de la ruta
      const fileName = path.split('/').pop()?.replace('.md?raw', '');
      return fileName === slug;
    })?.[1];
    
    if (!loader) {
      throw new Error(`No loader found for slug: ${slug}`);
    }

    const content = await loader();
    return content || '';
  } catch (error) {
    console.error(`Error loading API doc for ${slug}:`, error);
    return `# Documentación no disponible\n\nLa documentación para "${slug}" no está disponible en este momento.`;
  }
}

/**
 * Obtener todas las APIs de una categoría
 */
export function getAPIsByCategory(category: APIDocEntry['category']): APIDocEntry[] {
  return API_DOCS_REGISTRY.filter((doc) => doc.category === category);
}

/**
 * Obtener una API por slug
 */
export function getAPIBySlug(slug: string): APIDocEntry | undefined {
  return API_DOCS_REGISTRY.find((doc) => doc.slug === slug);
}

