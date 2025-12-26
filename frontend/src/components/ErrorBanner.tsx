/**
 * ✅ GO-LIVE: Error Banner Component
 * 
 * Muestra un banner informativo cuando hay warnings de configuración
 * (no bloquea la UI, solo informa)
 */

import { useEffect, useState } from 'react';
import { AlertCircle, X, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '@/config/runtime';

interface ErrorBannerProps {
  message?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [warningInfo, setWarningInfo] = useState<{ message: string; usingFallback: boolean; fallbackUrl?: string } | null>(null);

  useEffect(() => {
    // Escuchar eventos de warning de configuración
    const handleConfigWarning = (event: CustomEvent) => {
      const detail = event.detail as { message: string; usingFallback?: boolean; fallbackUrl?: string };
      setWarningInfo({
        message: detail.message || 'Configuración de API',
        usingFallback: detail.usingFallback || false,
        fallbackUrl: detail.fallbackUrl
      });
      setIsVisible(true);
    };

    // También escuchar errores críticos (legacy)
    const handleConfigError = (event: CustomEvent) => {
      setWarningInfo({
        message: event.detail?.message || 'Error de configuración',
        usingFallback: false
      });
      setIsVisible(true);
    };

    window.addEventListener('api-config-warning', handleConfigWarning as EventListener);
    window.addEventListener('api-config-error', handleConfigError as EventListener);
    
    // Verificar si estamos usando fallback al montar
    if (API_BASE_URL === '/api' && typeof window !== 'undefined') {
      setWarningInfo({
        message: 'VITE_API_URL no configurada',
        usingFallback: true,
        fallbackUrl: '/api'
      });
      setIsVisible(true);
    }

    return () => {
      window.removeEventListener('api-config-warning', handleConfigWarning as EventListener);
      window.removeEventListener('api-config-error', handleConfigError as EventListener);
    };
  }, []);

  if (!isVisible || !warningInfo) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const isUsingFallback = warningInfo.usingFallback && warningInfo.fallbackUrl === '/api';

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${isUsingFallback ? 'bg-yellow-600' : 'bg-red-600'} text-white shadow-lg`}>
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">
              {isUsingFallback ? '⚠️ Advertencia de Configuración' : '❌ Error de Configuración'}
            </p>
            {isUsingFallback ? (
              <>
                <p className="text-sm text-yellow-100 mt-1">
                  Usando <code className="bg-yellow-700 px-1 rounded">/api</code> como fallback (proxy de Vercel).
                </p>
                <p className="text-xs text-yellow-200 mt-2">
                  Para producción, configura <code className="bg-yellow-700 px-1 rounded">VITE_API_URL</code> en Vercel:
                </p>
                <ol className="text-xs text-yellow-200 mt-1 ml-4 list-decimal space-y-1">
                  <li>Vercel Dashboard → Tu Proyecto → Settings → Environment Variables</li>
                  <li>Agrega: <code className="bg-yellow-700 px-1 rounded">VITE_API_URL=https://tu-backend.railway.app</code></li>
                  <li>Redeploy el proyecto (sin cache si es necesario)</li>
                </ol>
              </>
            ) : (
              <>
                <p className="text-sm text-red-100 mt-1">{message || warningInfo.message}</p>
                <p className="text-xs text-red-200 mt-2">
                  Configura <code className="bg-red-700 px-1 rounded">VITE_API_URL</code> en Vercel: Settings → Environment Variables
                </p>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className={`ml-4 p-1 hover:${isUsingFallback ? 'bg-yellow-700' : 'bg-red-700'} rounded transition-colors flex-shrink-0`}
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

