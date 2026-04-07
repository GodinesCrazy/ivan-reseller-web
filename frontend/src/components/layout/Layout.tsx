import { Link, Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import AliexpressOverlayGate from '@/components/AliexpressOverlayGate';
import { useSetupCheck } from '@/hooks/useSetupCheck';
import { Settings, X } from 'lucide-react';
import { useState } from 'react';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { EnvironmentProvider } from '@/contexts/EnvironmentContext';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import CommandPalette from '@/components/CommandPalette';

export default function Layout() {
  const { setupStatus } = useSetupCheck();
  const [setupBannerDismissed, setSetupBannerDismissed] = useState(false);

  const showSetupBanner =
    setupStatus?.setupRequired &&
    !setupBannerDismissed;

  return (
    <EnvironmentProvider>
    <SidebarProvider>
    <div className="min-h-screen transition-colors" style={{ backgroundColor: 'rgb(var(--ir-surface))' }}>
      <AliexpressOverlayGate />
      <CommandPalette />
      <Navbar />
      {showSetupBanner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between gap-4">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Configura al menos un marketplace y una API de búsqueda para habilitar todas las funciones.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/api-settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Configurar APIs
            </Link>
            <button
              type="button"
              onClick={() => setSetupBannerDismissed(true)}
              className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-300 transition-colors"
              aria-label="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 transition-colors" style={{ backgroundColor: 'rgb(var(--ir-surface))' }}>
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
            <PageBreadcrumb />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </SidebarProvider>
    </EnvironmentProvider>
  );
}
