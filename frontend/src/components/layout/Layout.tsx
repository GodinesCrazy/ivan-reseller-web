import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import AliexpressOverlayGate from '@/components/AliexpressOverlayGate';
import { useSetupCheck } from '@/hooks/useSetupCheck';

export default function Layout() {
  // ✅ Verificar setup automáticamente cuando el usuario está autenticado
  useSetupCheck();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <AliexpressOverlayGate />
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
