import type { ApiName } from '../types/api-credentials.types';

/**
 * Marketplaces que el motor considera críticos para operar.
 * AliExpress siempre se usa como fuente primaria; eBay funciona como comparador mínimo.
 */
export const REQUIRED_MARKETPLACES: ApiName[] = ['aliexpress', 'ebay'];

/**
 * Marketplaces que aportan señales adicionales pero no bloquean el flujo
 * cuando faltan credenciales. Se tratarán como mejoras de cobertura.
 */
export const OPTIONAL_MARKETPLACES: ApiName[] = ['amazon', 'mercadolibre'];

/**
 * Orden por defecto que utiliza el buscador de oportunidades al pedir señales externas.
 */
export const DEFAULT_COMPARATOR_MARKETPLACES: Array<'ebay' | 'amazon' | 'mercadolibre'> = [
  'ebay',
  'amazon',
  'mercadolibre',
];


