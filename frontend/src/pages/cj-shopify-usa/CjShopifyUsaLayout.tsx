import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Search,
  Package,
  ShoppingBag,
  ClipboardList,
  PackageCheck,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Bot,
  Zap,
  Settings,
  ScrollText,
  Share2,
} from 'lucide-react';

type NavGroup = {
  title: string;
  items: { to: string; label: string; icon: React.ElementType }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Pipeline',
    items: [
      { to: '/cj-shopify-usa/overview', label: 'Overview', icon: LayoutDashboard },
      { to: '/cj-shopify-usa/discover', label: 'Descubrir', icon: Search },
      { to: '/cj-shopify-usa/products', label: 'Productos CJ', icon: Package },
      { to: '/cj-shopify-usa/listings', label: 'Store Products', icon: ShoppingBag },
    ],
  },
  {
    title: 'Ventas',
    items: [
      { to: '/cj-shopify-usa/orders', label: 'Órdenes', icon: ClipboardList },
      { to: '/cj-shopify-usa/post-sale', label: 'Post Venta', icon: PackageCheck },
      { to: '/cj-shopify-usa/alerts', label: 'Alertas', icon: AlertTriangle },
    ],
  },
  {
    title: 'Inteligencia',
    items: [
      { to: '/cj-shopify-usa/profit', label: 'Profit', icon: DollarSign },
      { to: '/cj-shopify-usa/analytics', label: 'Analítica', icon: BarChart3 },
      { to: '/cj-shopify-usa/sales-agent', label: 'Agente Vendedor', icon: Bot },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/cj-shopify-usa/social', label: 'Social Autopilot', icon: Share2 },
      { to: '/cj-shopify-usa/automation', label: 'Automatización', icon: Zap },
      { to: '/cj-shopify-usa/settings', label: 'Config', icon: Settings },
      { to: '/cj-shopify-usa/logs', label: 'Logs', icon: ScrollText },
    ],
  },
];

export default function CjShopifyUsaLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? 'w-[3.5rem]' : 'w-56';

  return (
    <div className="flex min-h-0 gap-0">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-[var(--navbar-height)] z-40 h-[calc(100vh-var(--navbar-height))]
          flex flex-col border-r border-slate-200 dark:border-slate-800
          bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg
          transition-all duration-300 ease-in-out
          ${sidebarWidth}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 dark:border-slate-800/80">
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                CJ → Shopify USA
              </h2>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                PawVault Pipeline
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex-shrink-0"
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-1">
              {!collapsed && (
                <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {group.title}
                </p>
              )}
              {collapsed && <div className="my-1.5 mx-2 h-px bg-slate-100 dark:bg-slate-800" />}
              <ul className="space-y-0.5 px-2">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => {
                        const base = `group flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                          collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-2'
                        }`;
                        return isActive
                          ? `${base} bg-gradient-to-r from-primary-50 to-primary-100/60 dark:from-primary-950/60 dark:to-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm shadow-primary-200/30 dark:shadow-primary-900/30`
                          : `${base} text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/70 hover:text-slate-900 dark:hover:text-slate-200`;
                      }}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800/80">
            <div className="rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/80 dark:to-slate-800/50 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Módulo</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-0.5">
                🐾 Pet Store · CJ Dropshipping
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-20 flex items-center justify-center w-12 h-12 rounded-full bg-primary-600 text-white shadow-xl shadow-primary-300/30 dark:shadow-primary-900/50 hover:bg-primary-700 transition-colors lg:hidden"
        aria-label="Abrir navegación"
      >
        <ShoppingBag className="w-5 h-5" />
      </button>

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 transition-all duration-300 ${
          collapsed ? 'lg:ml-[3.5rem]' : 'lg:ml-56'
        }`}
      >
        <div className="px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
