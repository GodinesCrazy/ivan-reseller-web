/**
 * Overlay desmontable cuando AliExpress requiere sesión manual.
 * Permite continuar usando el dashboard sin bloquear indefinidamente.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Settings } from 'lucide-react';
import { useAuthStatusStore } from '@stores/authStatusStore';

const DISMISS_KEY = 'aliexpress-overlay-dismissed';

export default function AliexpressOverlayGate() {
  const navigate = useNavigate();
  const statuses = useAuthStatusStore((state) => state.statuses);
  const fetchStatuses = useAuthStatusStore((state) => state.fetchStatuses);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

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

  const handleContinue = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const handleConfigure = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
    navigate('/api-settings');
  };

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aliexpress-overlay-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-red-200 dark:border-red-800">
        <div className="bg-red-600 text-white px-6 py-4">
          <h2 id="aliexpress-overlay-title" className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            ESTADO DE ALIEXPRESS
          </h2>
          <p className="text-red-100 text-sm mt-1">Acción requerida</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Sesión manual requerida para completar el login en AliExpress. Puedes configurarlo ahora
            o continuar usando el dashboard y hacerlo más tarde.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleConfigure}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              Configurar AliExpress
            </button>
            <button
              onClick={handleContinue}
              className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors"
            >
              Continuar de todos modos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
