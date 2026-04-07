import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCcw, ShieldCheck, ShieldAlert, Loader2, Menu, Sun, Moon, Monitor, ChevronDown } from 'lucide-react';
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

const statusStyles: Record<string, { dot: string; label: string; icon: JSX.Element }> = {
  healthy: {
    dot: 'bg-emerald-500',
    label: 'Sesión activa',
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  refreshing: {
    dot: 'bg-amber-500 animate-pulse',
    label: 'Renovando…',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  manual_required: {
    dot: 'bg-red-500 animate-pulse',
    label: 'Acción requerida',
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  error: {
    dot: 'bg-orange-500',
    label: 'Error OAuth',
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  configured: {
    dot: 'bg-blue-500',
    label: 'Configurado',
    icon: <ShieldCheck className="w-3 h-3" />,
  },
  unknown: {
    dot: 'bg-slate-400',
    label: 'Sin sesión',
    icon: <ShieldAlert className="w-3 h-3" />,
  },
};

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { toggle } = useSidebar();
  const { theme, updateTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
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
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (userMenuRef.current?.contains(e.target as Node) || userButtonRef.current?.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [userMenuOpen]);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const lastToastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingManualSession && pendingManualSession.token !== lastToastTokenRef.current) {
      lastToastTokenRef.current = pendingManualSession.token;
      toast(
        <div className="flex flex-col gap-2">
          <span>AliExpress necesita que confirmes la sesión manual.</span>
          <button
            type="button"
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
  let statusKey = aliStatus?.status || 'unknown';
  if (statusKey === 'manual_required' && !aliStatus?.manualSession?.token && !aliStatus?.requiresManual) {
    statusKey = 'unknown';
  }
  const styleInfo = statusStyles[statusKey] || statusStyles.unknown;

  const handleForceRefresh = async () => {
    try {
      await requestRefresh('aliexpress');
    } catch {
      // silently ignore — status will reflect the failure on next poll
    }
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'auto' ? Monitor : Sun;

  return (
    <nav
      className="border-b border-slate-200 dark:border-slate-800 transition-colors sticky top-0 z-30 h-[var(--navbar-height)]"
      style={{ backgroundColor: 'rgb(var(--ir-surface-elevated))' }}
    >
      <div className="px-3 md:px-4 flex justify-between items-center h-full">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggle}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 shrink-0">
              <img
                src="/brand-logo.png"
                alt="Ivan Reseller"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-none hidden sm:block tracking-tight">
              Ivan Reseller
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styleInfo.dot}`} />
            {statusKey === 'manual_required' ? (
              <button
                onClick={() => {
                  const token = aliStatus?.manualSession?.token;
                  navigate(token ? `/manual-login/${token}` : '/manual-login/new');
                }}
                className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline transition-colors"
                title="Haz clic para completar el login manual"
              >
                {styleInfo.label}
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                AliExpress · {styleInfo.label}
              </span>
            )}
            <button
              onClick={handleForceRefresh}
              disabled={loadingStatus || statusKey === 'refreshing'}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors disabled:opacity-40"
              title="Forzar renovación de sesión AliExpress"
            >
              <RefreshCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              ref={themeButtonRef}
              type="button"
              onClick={() => setThemeOpen((o) => !o)}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Cambiar tema"
              title="Tema"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            {themeOpen && (
              <div
                ref={themeMenuRef}
                className="absolute right-0 top-full mt-1 py-1 w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md z-50"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { updateTheme(value); setThemeOpen(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      theme === value
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              ref={userButtonRef}
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-700 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-white leading-none">{initials}</span>
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 hidden sm:block max-w-[80px] truncate">
                {user?.username}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            </button>

            {userMenuOpen && (
              <div
                ref={userMenuRef}
                className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md z-50 py-1"
              >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{user?.username}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{user?.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
