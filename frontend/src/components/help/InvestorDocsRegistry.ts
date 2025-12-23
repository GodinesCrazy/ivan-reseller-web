/**
 * Registry de documentación para inversionistas (gated)
 * Solo accesible con feature flag + admin role
 */

export interface InvestorDocEntry {
  slug: string;
  title: string;
  description: string;
}

export const INVESTOR_DOCS_REGISTRY: InvestorDocEntry[] = [
  {
    slug: 'one-pager',
    title: 'Ivan Reseller - One Pager',
    description: 'One pager ejecutivo para inversionistas',
  },
  {
    slug: 'investor-brief',
    title: 'Ivan Reseller - Investor Brief',
    description: 'Brief completo para inversionistas',
  },
];

/**
 * Verificar si los investor docs están habilitados
 */
export function isInvestorDocsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_INVESTOR_DOCS === 'true';
}

/**
 * Cargar documento de inversionista desde backend (protegido)
 */
export async function loadInvestorDoc(slug: string, token: string): Promise<string> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/help/investors/${slug}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('No tienes permisos para acceder a este documento');
      }
      throw new Error(`Error al cargar documento: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content || '';
  } catch (error) {
    console.error(`Error loading investor doc for ${slug}:`, error);
    throw error;
  }
}

/**
 * Obtener lista de documentos de inversionistas desde backend (protegido)
 */
export async function getInvestorDocsList(token: string): Promise<InvestorDocEntry[]> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/help/investors`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('No tienes permisos para acceder a estos documentos');
      }
      throw new Error(`Error al cargar lista: ${response.statusText}`);
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error loading investor docs list:', error);
    throw error;
  }
}

