import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Package,
  PackageCheck,
  ScrollText,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

type NavGroup = {
  title: string;
  items: { to: string; label: string; icon: React.ElementType }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Pipeline',
    items: [
      { to: '/cj-ebay/overview', label: 'Overview', icon: LayoutDashboard },
      { to: '/cj-ebay/discover', label: 'Descubrir', icon: Search },
      { to: '/cj-ebay/products', label: 'Productos CJ', icon: Package },
      { to: '/cj-ebay/listings', label: 'Listings eBay', icon: ShoppingBag },
    ],
  },
  {
    title: 'Ventas',
    items: [
      { to: '/cj-ebay/orders', label: 'Ordenes', icon: ClipboardList },
      { to: '/cj-ebay/post-sale', label: 'Post Venta', icon: PackageCheck },
      { to: '/cj-ebay/alerts', label: 'Alertas', icon: AlertTriangle },
    ],
  },
  {
    title: 'Inteligencia',
    items: [
      { to: '/cj-ebay/profit', label: 'Profit', icon: DollarSign },
      { to: '/cj-ebay/analytics', label: 'Analitica', icon: BarChart3 },
      { to: '/cj-ebay/sales-agent', label: 'Agente eBay', icon: Bot },
      { to: '/cj-ebay/store-optimizer', label: 'Store Optimizer', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/cj-ebay/automation', label: 'Automatizacion', icon: Zap },
      { to: '/cj-ebay/settings', label: 'Config', icon: Settings },
      { to: '/cj-ebay/logs', label: 'Logs', icon: ScrollText },
    ],
  },
];

export default function CjEbayLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarWidth = collapsed ? 'w-[3.5rem]' : 'w-56';

  return (
    <div className="flex min-h-0 gap-0">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

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
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100 dark:border-slate-800/80">
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                CJ → eBay USA
              </h2>
              <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                Quotas · Profit · Seller Hub
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-1">
              {!collapsed && (
                <p className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {group.title}
                </p>
              )}
              {collapsed && <div className="mx-2 my-1.5 h-px bg-slate-100 dark:bg-slate-800" />}
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
                          ? `${base} bg-gradient-to-r from-primary-50 to-primary-100/60 text-primary-700 shadow-sm shadow-primary-200/30 dark:from-primary-950/60 dark:to-primary-900/30 dark:text-primary-300 dark:shadow-primary-900/30`
                          : `${base} text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-200`;
                      }}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800/80">
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Modulo</p>
              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                CJ Dropshipping · eBay US
              </p>
            </div>
          </div>
        )}
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-xl shadow-primary-300/30 transition-colors hover:bg-primary-700 dark:shadow-primary-900/50 lg:hidden"
        aria-label="Abrir navegacion"
      >
        <ShoppingBag className="h-5 w-5" />
      </button>

      <main className={`min-w-0 flex-1 transition-all duration-300 ${collapsed ? 'lg:ml-[3.5rem]' : 'lg:ml-56'}`}>
        <div className="px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
