import { useEffect } from 'react';
import { LogOut, RefreshCcw, ShieldCheck, ShieldAlert, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@stores/authStore';
import { useAuthStatusStore } from '@stores/authStatusStore';

const statusStyles: Record<string, { className: string; label: string; icon: JSX.Element }> = {
  healthy: {
    className: 'bg-green-100 text-green-700 border-green-200',
    label: 'Sesión activa',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  refreshing: {
    className: 'bg-amber-100 text-amber-700 border-amber-200',
    label: 'Renovando sesión…',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  manual_required: {
    className: 'bg-red-100 text-red-700 border-red-200',
    label: 'Acción requerida',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  error: {
    className: 'bg-orange-100 text-orange-700 border-orange-200',
    label: 'Error al renovar',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  unknown: {
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    label: 'Estado desconocido',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
};

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const statuses = useAuthStatusStore((state) => state.statuses);
  const loadingStatus = useAuthStatusStore((state) => state.loading);
  const fetchStatuses = useAuthStatusStore((state) => state.fetchStatuses);
  const pendingManualSession = useAuthStatusStore((state) => state.pendingManualSession);
  const markManualHandled = useAuthStatusStore((state) => state.markManualHandled);
  const requestRefresh = useAuthStatusStore((state) => state.requestRefresh);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  useEffect(() => {
    if (pendingManualSession) {
      const { token, loginUrl } = pendingManualSession;
      const url = loginUrl?.startsWith('http')
        ? loginUrl
        : `${window.location.origin}${loginUrl || `/manual-login/${token}`}`;
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.info('Abrimos la ventana para confirmar tu sesión en AliExpress. Sigue las instrucciones y vuelve cuando termines.');
      } catch (error) {
        console.error('No se pudo abrir la ventana de autenticación manual', error);
      } finally {
        markManualHandled(token);
      }
    }
  }, [pendingManualSession, markManualHandled]);

  const aliStatus = statuses.aliexpress;
  const statusKey = aliStatus?.status || 'unknown';
  const styleInfo = statusStyles[statusKey] || statusStyles.unknown;

  const handleForceRefresh = async () => {
    try {
      await requestRefresh('aliexpress');
    } catch (error: any) {
      console.error('Error forcing refresh:', error?.message || error);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-8 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-600">Ivan Reseller</h1>
            <span className="text-sm text-gray-500">Dropshipping Platform</span>
          </div>

          <div className="hidden md:flex flex-col">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Estado de AliExpress
            </span>
            <div
              className={`mt-1 inline-flex items-center gap-2 px-3 py-1 border rounded-full text-xs font-semibold ${styleInfo.className}`}
            >
              {styleInfo.icon}
              <span>{styleInfo.label}</span>
            </div>
            {aliStatus?.message ? (
              <span className="text-xs text-gray-500 mt-1 max-w-xs line-clamp-1">
                {aliStatus.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleForceRefresh}
            disabled={loadingStatus || statusKey === 'refreshing'}
            className="hidden md:inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="w-4 h-4" />
            {statusKey === 'refreshing' ? 'Renovando...' : 'Forzar reintento'}
          </button>

          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium">{user?.username}</span>
            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
              {user?.role}
            </span>
          </div>

          <button
            onClick={logout}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
