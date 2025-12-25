/**
 * ✅ GO-LIVE: Error Banner Component
 * 
 * Muestra un banner persistente cuando hay errores críticos de configuración
 */

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Escuchar eventos de error de configuración
    const handleConfigError = (event: CustomEvent) => {
      setIsVisible(true);
    };

    window.addEventListener('api-config-error', handleConfigError as EventListener);
    return () => {
      window.removeEventListener('api-config-error', handleConfigError as EventListener);
    };
  }, []);

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Error de Configuración</p>
            <p className="text-sm text-red-100">{message}</p>
            <p className="text-xs text-red-200 mt-1">
              Por favor, configura VITE_API_URL en las variables de entorno de Vercel.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-4 p-1 hover:bg-red-700 rounded transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

