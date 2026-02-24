/**
 * Banner no bloqueante cuando AliExpress requiere sesión manual.
 * Permite al usuario continuar usando el dashboard y configurar después.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, X, Settings } from 'lucide-react';
import { useAuthStatusStore } from '@stores/authStatusStore';

const DISMISS_KEY = 'aliexpress-action-banner-dismissed';

export default function AliexpressActionBanner() {
  const statuses = useAuthStatusStore((state) => state.statuses);
  const [dismissed, setDismissed] = useState(false);

  const aliStatus = statuses?.aliexpress;
  const shouldShow =
    !dismissed &&
    aliStatus?.status === 'manual_required' &&
    (aliStatus?.manualSession?.token || aliStatus?.requiresManual);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DISMISS_KEY);
      if (stored === 'true') setDismissed(true);
    } catch {
      // ignore
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
  };

  if (!shouldShow) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800"
      role="alert"
    >
      <div className="flex items-center gap-3 min-w-0">
        <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-800 dark:text-red-200">
            AliExpress: acción requerida
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            Sesión manual requerida para completar el login. Puedes configurarlo más tarde.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/api-settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar AliExpress
        </Link>
        <button
          onClick={handleDismiss}
          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
          aria-label="Continuar de todos modos"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
