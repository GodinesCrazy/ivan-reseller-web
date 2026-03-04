import { Link, Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import AliexpressOverlayGate from '@/components/AliexpressOverlayGate';
import { useSetupCheck } from '@/hooks/useSetupCheck';
import { Settings, X } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { setupStatus } = useSetupCheck();
  const [setupBannerDismissed, setSetupBannerDismissed] = useState(false);

  const showSetupBanner =
    setupStatus?.setupRequired &&
    !setupBannerDismissed;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <AliexpressOverlayGate />
      <Navbar />
      {showSetupBanner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Configura al menos un marketplace y una API de búsqueda para habilitar todas las funciones.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/api-settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              <Settings className="w-4 h-4" />
              Ir a API Settings
            </Link>
            <button
              type="button"
              onClick={() => setSetupBannerDismissed(true)}
              className="p-1.5 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-300"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
