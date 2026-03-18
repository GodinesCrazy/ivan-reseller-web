import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCcw, ShieldCheck, ShieldAlert, Loader2, User, Menu, Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@stores/authStore';
import { useAuthStatusStore } from '@stores/authStatusStore';
import { useSidebar } from '@/contexts/SidebarContext';
import { useTheme } from '@/hooks/useTheme';

type ThemeOption = 'light' | 'dark' | 'auto';
const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'auto', label: 'Sistema', icon: Monitor },
];

const statusStyles: Record<string, { className: string; label: string; icon: JSX.Element }> = {
  healthy: {
    className: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
    label: 'Sesión activa',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  refreshing: {
    className: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
    label: 'Renovando sesión…',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  manual_required: {
    className: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700',
    label: 'Acción requerida',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  error: {
    className: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
    label: 'Error al renovar',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  configured: {
    className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
    label: 'Configurado',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  unknown: {
    className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600',
    label: 'Estado desconocido',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
};

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { toggle } = useSidebar();
  const { theme, updateTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const statuses = useAuthStatusStore((state) => state.statuses);
  const loadingStatus = useAuthStatusStore((state) => state.loading);
  const fetchStatuses = useAuthStatusStore((state) => state.fetchStatuses);
  const pendingManualSession = useAuthStatusStore((state) => state.pendingManualSession);
  const requestRefresh = useAuthStatusStore((state) => state.requestRefresh);

  useEffect(() => {
    if (!themeOpen) return;
    const close = (e: MouseEvent) => {
      if (themeMenuRef.current?.contains(e.target as Node) || themeButtonRef.current?.contains(e.target as Node)) return;
      setThemeOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [themeOpen]);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const lastToastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingManualSession && pendingManualSession.token !== lastToastTokenRef.current) {
      lastToastTokenRef.current = pendingManualSession.token;
      // ✅ FASE A: Usar toast() de sonner con JSX compatible
      toast(
        <div className="flex flex-col gap-2">
          <span>AliExpress necesita que confirmes la sesión manual.</span>
          <button
            onClick={() => navigate('/api-settings')}
            className="inline-flex w-fit items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Abrir configuración
          </button>
        </div>,
        { duration: 8000, icon: 'ℹ️' }
      );
    }
  }, [pendingManualSession, navigate]);

  const aliStatus = statuses.aliexpress;
  // ✅ Si el estado es 'manual_required' pero no hay sesión manual pendiente real, 
  // probablemente es solo porque faltan cookies (no es realmente requerido)
  // En ese caso, mostrar estado como 'unknown' en lugar de 'Acción requerida'
  let statusKey = aliStatus?.status || 'unknown';
  if (statusKey === 'manual_required' && !aliStatus?.manualSession?.token && !aliStatus?.requiresManual) {
    // No hay sesión manual real pendiente, solo faltan cookies (opcional)
    statusKey = 'unknown';
  }
  const styleInfo = statusStyles[statusKey] || statusStyles.unknown;

  const handleForceRefresh = async () => {
    try {
      await requestRefresh('aliexpress');
    } catch (error: any) {
      console.error('Error forcing refresh:', error?.message || error);
    }
  };

  return (
    <nav
      className="bg-white dark:bg-slate-900 shadow-md border-b border-gray-200 dark:border-slate-700 transition-colors sticky top-0 z-30"
      style={{ minHeight: 'var(--navbar-height)' }}
    >
      <div className="px-4 md:px-8 py-4 flex justify-between items-center h-[var(--navbar-height)]">
        <div className="flex items-center space-x-4 md:space-x-6">
          <button
            type="button"
            onClick={toggle}
            className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 rounded-2xl overflow-hidden border border-blue-100 dark:border-blue-900 shadow-md bg-white dark:bg-gray-700 transition-colors">
              <img
                src="/brand-logo.png"
                alt="Logotipo Ivan Reseller"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400 leading-tight">Ivan Reseller</h1>
              <span className="text-sm text-gray-600 dark:text-slate-300">Inteligencia para oportunidades</span>
            </div>
          </div>

          <div className="hidden md:flex flex-col">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Estado de AliExpress
            </span>
            {statusKey === 'manual_required' ? (
              <button
                onClick={() => {
                  const token = aliStatus?.manualSession?.token;
                  navigate(token ? `/manual-login/${token}` : '/manual-login/new');
                }}
                className={`mt-1 inline-flex items-center gap-2 px-3 py-1 border rounded-full text-xs font-semibold ${styleInfo.className} hover:opacity-90 transition cursor-pointer`}
                title="Haz clic para completar el login manual"
              >
                {styleInfo.icon}
                <span>{styleInfo.label}</span>
              </button>
            ) : (
              <div
                className={`mt-1 inline-flex items-center gap-2 px-3 py-1 border rounded-full text-xs font-semibold ${styleInfo.className}`}
              >
                {styleInfo.icon}
                <span>{styleInfo.label}</span>
              </div>
            )}
            {aliStatus?.message ? (
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs line-clamp-1">
                {aliStatus.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <button
              ref={themeButtonRef}
              type="button"
              onClick={() => setThemeOpen((o) => !o)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Tema"
              title="Tema"
            >
              {theme === 'dark' ? (
                <Moon className="w-5 h-5" />
              ) : theme === 'auto' ? (
                <Monitor className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
            {themeOpen && (
              <div
                ref={themeMenuRef}
                className="absolute right-0 top-full mt-1 py-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      updateTheme(value);
                      setThemeOpen(false);
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                      theme === value
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleForceRefresh}
            disabled={loadingStatus || statusKey === 'refreshing'}
            className="hidden md:inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="w-4 h-4" />
            {statusKey === 'refreshing' ? 'Renovando...' : 'Forzar reintento'}
          </button>

          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.username}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
              {user?.role}
            </span>
          </div>

          <button
            onClick={logout}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
