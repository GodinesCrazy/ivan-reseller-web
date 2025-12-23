/**
 * Registry de documentación enterprise
 * Mapea el slug de cada documento a su título y contenido Markdown
 */

export interface DocEntry {
  slug: string;
  title: string;
  category: 'getting-started' | 'deployment' | 'security' | 'guides' | 'troubleshooting' | 'architecture';
  description: string;
}

export const DOCS_REGISTRY: DocEntry[] = [
  // Getting Started
  {
    slug: 'setup-local',
    title: 'Setup Local',
    category: 'getting-started',
    description: 'Guía para configurar el entorno de desarrollo local',
  },
  {
    slug: 'user-guide',
    title: 'User Guide',
    category: 'getting-started',
    description: 'Guía completa para usuarios finales',
  },
  // Deployment
  {
    slug: 'deployment-railway',
    title: 'Deployment en Railway',
    category: 'deployment',
    description: 'Guía completa para desplegar en Railway',
  },
  // Security
  {
    slug: 'security',
    title: 'Security Guide',
    category: 'security',
    description: 'Guía de seguridad y mejores prácticas',
  },
  // Guides
  {
    slug: 'admin-guide',
    title: 'Admin Guide',
    category: 'guides',
    description: 'Guía completa para administradores',
  },
  // Troubleshooting
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    category: 'troubleshooting',
    description: 'Guía de solución de problemas comunes',
  },
  // Architecture
  {
    slug: 'architecture',
    title: 'Architecture',
    category: 'architecture',
    description: 'Arquitectura del sistema y diseño técnico',
  },
];

/**
 * Función helper para cargar el contenido Markdown de un documento
 * Usa import dinámico con ?raw para cargar el archivo como string
 */
export async function loadDoc(slug: string): Promise<string> {
  try {
    // Mapeo de slugs a rutas reales de archivos (dentro de frontend/src/content/docs/)
    const docMap: Record<string, () => Promise<{ default: string }>> = {
      'setup-local': () => import('../../content/docs/SETUP_LOCAL.md?raw'),
      'deployment-railway': () => import('../../content/docs/DEPLOYMENT_RAILWAY.md?raw'),
      'security': () => import('../../content/docs/SECURITY.md?raw'),
      'troubleshooting': () => import('../../content/docs/TROUBLESHOOTING.md?raw'),
      'architecture': () => import('../../content/docs/ARCHITECTURE.md?raw'),
      'user-guide': () => import('../../content/docs/USER_GUIDE.md?raw'),
      'admin-guide': () => import('../../content/docs/ADMIN_GUIDE.md?raw'),
    };

    const loader = docMap[slug];
    if (!loader) {
      throw new Error(`No loader found for slug: ${slug}`);
    }

    const module = await loader();
    return module.default || '';
  } catch (error) {
    console.error(`Error loading doc for ${slug}:`, error);
    return `# Documentación no disponible\n\nLa documentación para "${slug}" no está disponible en este momento.\n\nError: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Obtener todos los documentos de una categoría
 */
export function getDocsByCategory(category: DocEntry['category']): DocEntry[] {
  return DOCS_REGISTRY.filter((doc) => doc.category === category);
}

/**
 * Obtener un documento por slug
 */
export function getDocBySlug(slug: string): DocEntry | undefined {
  return DOCS_REGISTRY.find((doc) => doc.slug === slug);
}

