/**
 * ✅ FASE 5: Unified API Status DTO
 * DTO único para estado de APIs (backend → frontend)
 * Elimina inconsistencias y lógica duplicada
 */

export interface UnifiedAPIStatusDTO {
  // Identificación
  apiName: string; // Nombre canónico del backend
  displayName: string; // Nombre para mostrar en UI
  
  // Estado de configuración
  isConfigured: boolean; // Tiene credenciales guardadas
  hasValidCredentials: boolean; // Credenciales válidas (no expiradas, formato correcto)
  
  // Estado de disponibilidad
  isAvailable: boolean; // API está disponible (health check exitoso)
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; // Estado de salud
  
  // Información adicional
  environment?: 'sandbox' | 'production';
  message?: string; // Mensaje descriptivo del estado
  error?: string; // Error si hay problema
  lastChecked?: Date | string; // Última vez que se verificó
  
  // Metadatos opcionales
  latency?: number; // Latencia en ms (si aplica)
  optional?: boolean; // Si la API es opcional
  
  // Campos legacy para compatibilidad (se pueden deprecar después)
  available?: boolean; // Alias de isAvailable
  name?: string; // Alias de displayName
}

/**
 * ✅ FASE 5: Helper para crear DTO unificado desde APIStatus interno
 */
export function createUnifiedAPIStatusDTO(
  apiStatus: any,
  displayName?: string
): UnifiedAPIStatusDTO {
  // ✅ FIX: Validate apiStatus before accessing properties
  if (!apiStatus) {
    return {
      apiName: 'unknown',
      displayName: displayName || 'Unknown API',
      isConfigured: false,
      hasValidCredentials: false,
      isAvailable: false,
      status: 'unknown',
      available: false,
      name: displayName || 'Unknown API',
    };
  }
  
  const apiName = (apiStatus.apiName && typeof apiStatus.apiName === 'string') ? apiStatus.apiName : 'unknown';
  
  return {
    apiName,
    displayName: displayName || apiStatus.name || apiName || 'Unknown API',
    isConfigured: apiStatus.isConfigured ?? false,
    hasValidCredentials: apiStatus.isConfigured && !apiStatus.error,
    isAvailable: apiStatus.isAvailable ?? apiStatus.available ?? false,
    status: apiStatus.status || (apiStatus.isAvailable ? 'healthy' : 'unhealthy') || 'unknown',
    environment: apiStatus.environment,
    message: apiStatus.message,
    error: apiStatus.error,
    lastChecked: apiStatus.lastChecked,
    latency: apiStatus.latency,
    optional: apiStatus.isOptional ?? apiStatus.optional,
    // Legacy compatibility
    available: apiStatus.isAvailable ?? apiStatus.available ?? false,
    name: displayName || apiStatus.name || apiStatus.apiName || '',
  };
}

