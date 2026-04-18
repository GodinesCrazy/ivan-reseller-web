/**
 * CJ → ML Chile — adaptador CJ (reutiliza el cliente CJ del módulo cj-ebay).
 * La única diferencia relevante es el startCountryCode=CL para probar warehouse Chile.
 */

import { createCjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter';
import type { ICjSupplierAdapter } from '../../cj-ebay/adapters/cj-supplier.adapter.interface';

export { createCjSupplierAdapter as createCjMlChileSupplierAdapter };
export type { ICjSupplierAdapter as ICjMlChileSupplierAdapter };

/** País destino CJ para probar warehouse Chile. */
export const CJ_CHILE_DEST_COUNTRY = 'CL';
export const CJ_CHILE_PROBE_POSTAL = '7500000'; // Santiago centro
