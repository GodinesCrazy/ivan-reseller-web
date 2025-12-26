/**
 * Registry de documentación para inversionistas (gated)
 * Solo accesible con feature flag + admin role
 */

import api from '@/services/api';

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
 * ✅ FIX: Usa cliente api centralizado para forzar proxy /api en producción
 */
export async function loadInvestorDoc(slug: string, token: string): Promise<string> {
  try {
    const response = await api.get(`/api/help/investors/${slug}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.data?.content || '';
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('No tienes permisos para acceder a este documento');
    }
    console.error(`Error loading investor doc for ${slug}:`, error);
    throw error;
  }
}

/**
 * Obtener lista de documentos de inversionistas desde backend (protegido)
 * ✅ FIX: Usa cliente api centralizado para forzar proxy /api en producción
 */
export async function getInvestorDocsList(token: string): Promise<InvestorDocEntry[]> {
  try {
    const response = await api.get('/api/help/investors', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.data?.docs || [];
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('No tienes permisos para acceder a estos documentos');
    }
    console.error('Error loading investor docs list:', error);
    throw error;
  }
}

