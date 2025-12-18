/**
 * ✅ PRODUCTION READY: Query Optimizer Utilities
 * 
 * Utilidades para optimizar queries de Prisma y prevenir N+1
 */

/**
 * Optimiza un array de objetos eliminando duplicados por una clave
 */
export function deduplicateBy<T>(
  items: T[],
  keyFn: (item: T) => string | number
): T[] {
  const seen = new Map<string | number, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Agrupa items por una clave
 */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string | number
): Map<string | number, T[]> {
  const groups = new Map<string | number, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return groups;
}

/**
 * Previene N+1 queries batching IDs para queries en lote
 */
export async function batchLoad<T, K extends string | number>(
  ids: K[],
  loaderFn: (ids: K[]) => Promise<T[]>,
  keyFn: (item: T) => K
): Promise<Map<K, T>> {
  if (ids.length === 0) {
    return new Map();
  }
  
  // Eliminar duplicados
  const uniqueIds = Array.from(new Set(ids));
  
  // Cargar en lotes si es necesario (límite de 1000 IDs por query)
  const BATCH_SIZE = 1000;
  const batches: K[][] = [];
  
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + BATCH_SIZE));
  }
  
  const results = await Promise.all(
    batches.map(batch => loaderFn(batch))
  );
  
  // Combinar resultados y crear mapa
  const allItems = results.flat();
  const map = new Map<K, T>();
  
  for (const item of allItems) {
    const key = keyFn(item);
    map.set(key, item);
  }
  
  return map;
}

/**
 * Helper para ejecutar queries con timeout
 */
export async function withQueryTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 30000,
  errorMessage: string = 'Query timeout'
): Promise<T> {
  return Promise.race([
    queryFn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

