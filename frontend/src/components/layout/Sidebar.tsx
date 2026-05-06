import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { useSidebar } from '@/contexts/SidebarContext';
import { useInventoryBadges } from '@/hooks/useInventoryBadges';
import {
  LayoutDashboard,
  Package,
  DollarSign,
  Receipt,
  Users,
  Search,
  Bot,
  Wallet,
  Send,
  Globe,
  Terminal,
  HelpCircle,
  ShoppingCart,
  Activity,
  Key,
  Repeat2,
  Server,
  List,
  Stethoscope,
  FileBarChart2,
  Briefcase,
  BadgeDollarSign,
  Truck,
  Bell,
  LineChart,
  ScrollText,
  SlidersHorizontal,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { isCjEbayModuleEnabled, isCjMlChileModuleEnabled, isCjShopifyUsaModuleEnabled, isTopDawgShopifyUsaModuleEnabled } from '@/config/feature-flags';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
  roles?: string[];
  theme?: 'cjEbay' | 'cjMl' | 'cjShopify' | 'topdawg' | 'main' | 'catalog' | 'finance' | 'admin' | 'settings';
}

const cjEbayNavGroup: NavGroup = {
  title: 'CJ → eBay USA',
  theme: 'cjEbay',
  items: [
    { path: '/cj-ebay/overview', label: 'Resumen', icon: LayoutDashboard },
    { path: '/cj-ebay/products', label: 'Productos CJ', icon: Package },
    { path: '/cj-ebay/listings', label: 'Listings', icon: List },
    { path: '/cj-ebay/orders', label: 'Órdenes', icon: Truck },
    { path: '/cj-ebay/alerts', label: 'Alertas', icon: Bell },
    { path: '/cj-ebay/profit', label: 'Profit', icon: LineChart },
    { path: '/cj-ebay/logs', label: 'Logs', icon: ScrollText },
  ],
};

const cjMlChileNavGroup: NavGroup = {
  title: 'CJ → ML Chile',
  theme: 'cjMl',
  items: [
    { path: '/cj-ml-chile/overview', label: 'Resumen', icon: LayoutDashboard },
    { path: '/cj-ml-chile/products', label: 'Productos CJ', icon: Package },
    { path: '/cj-ml-chile/listings', label: 'Listings', icon: List },
    { path: '/cj-ml-chile/orders', label: 'Órdenes', icon: Truck },
    { path: '/cj-ml-chile/alerts', label: 'Alertas', icon: Bell },
    { path: '/cj-ml-chile/profit', label: 'Profit', icon: LineChart },
    { path: '/cj-ml-chile/logs', label: 'Logs', icon: ScrollText },
  ],
};

const topDawgShopifyUsaNavGroup: NavGroup = {
  title: 'TopDawg → Shopify USA',
  theme: 'topdawg',
  items: [
    { path: '/topdawg-shopify-usa/overview',   label: 'Resumen',        icon: LayoutDashboard },
    { path: '/topdawg-shopify-usa/discover',   label: 'Descubrir',      icon: Search },
    { path: '/topdawg-shopify-usa/listings',   label: 'Store Products', icon: List },
    { path: '/topdawg-shopify-usa/orders',     label: 'Órdenes',        icon: Truck },
    { path: '/topdawg-shopify-usa/alerts',     label: 'Alertas',        icon: Bell },
    { path: '/topdawg-shopify-usa/profit',     label: 'Profit',         icon: LineChart },
    { path: '/topdawg-shopify-usa/automation', label: 'Automatización', icon: Zap },
    { path: '/topdawg-shopify-usa/settings',   label: 'Configuración',  icon: SlidersHorizontal },
    { path: '/topdawg-shopify-usa/logs',       label: 'Logs',           icon: ScrollText },
  ],
};

const cjShopifyUsaNavGroup: NavGroup = {
  title: 'CJ → Shopify USA',
  theme: 'cjShopify',
  items: [
    { path: '/cj-shopify-usa/overview', label: 'Resumen', icon: LayoutDashboard },
    { path: '/cj-shopify-usa/products', label: 'Productos CJ', icon: Package },
    { path: '/cj-shopify-usa/listings', label: 'Store Products', icon: List },
    { path: '/cj-shopify-usa/orders', label: 'Órdenes', icon: Truck },
    { path: '/cj-shopify-usa/alerts', label: 'Alertas', icon: Bell },
    { path: '/cj-shopify-usa/profit', label: 'Profit', icon: LineChart },
    { path: '/cj-shopify-usa/analytics', label: 'Analítica', icon: Activity },
    { path: '/cj-shopify-usa/automation', label: 'Automatización', icon: Zap },
    { path: '/cj-shopify-usa/settings', label: 'Configuración', icon: SlidersHorizontal },
    { path: '/cj-shopify-usa/logs', label: 'Logs', icon: ScrollText },
  ],
};

const navGroups: NavGroup[] = [
  {
    title: 'Flujo principal',
    theme: 'main',
    items: [
      { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },
      { path: '/control-center', label: 'Control Center', icon: Activity },
      { path: '/opportunities', label: 'Oportunidades', icon: Search },
      { path: '/publisher', label: 'Publicador', icon: Send },
      { path: '/manual-list', label: 'Manual List', icon: BadgeDollarSign },
      { path: '/listings', label: 'Listings', icon: List },
      { path: '/autopilot', label: 'Autopilot', icon: Bot },
    ],
  },
  {
    title: 'Catálogo y ventas',
    theme: 'catalog',
    items: [
      { path: '/products', label: 'Productos', icon: Package },
      { path: '/product-research', label: 'Investigación', icon: Briefcase },
      { path: '/orders', label: 'Órdenes', icon: Receipt },
      { path: '/pending-purchases', label: 'Compras pendientes', icon: ShoppingCart },
      { path: '/sales', label: 'Ventas', icon: DollarSign },
    ],
  },
  {
    title: 'Finanzas',
    theme: 'finance',
    items: [
      { path: '/finance', label: 'Finanzas', icon: Wallet },
      { path: '/commissions', label: 'Comisiones', icon: Receipt },
      { path: '/reports', label: 'Reportes', icon: FileBarChart2 },
    ],
  },
  {
    title: 'Administración',
    theme: 'admin',
    items: [
      { path: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
      { path: '/admin', label: 'Panel Admin', icon: Server, roles: ['ADMIN'] },
      { path: '/logs', label: 'Registros del sistema', icon: Terminal, roles: ['ADMIN'] },
    ],
    roles: ['ADMIN'],
  },
  {
    title: 'Configuración',
    theme: 'settings',
    items: [
      { path: '/api-settings', label: 'API & Credenciales', icon: Key },
      { path: '/workflow-config', label: 'Workflows', icon: Repeat2 },
      { path: '/regional', label: 'Regional', icon: Globe },
      { path: '/system-status', label: 'Estado del sistema', icon: Server },
      { path: '/diagnostics', label: 'Diagnósticos', icon: Stethoscope },
      { path: '/help', label: 'Ayuda', icon: HelpCircle },
    ],
  },
];

const sidebarThemes: Record<NonNullable<NavGroup['theme']>, {
  rail: string;
  groupActive: string;
  groupIdle: string;
  itemActive: string;
  itemIdle: string;
  iconActive: string;
  iconIdle: string;
  badge: string;
}> = {
  cjEbay: {
    rail: 'bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.45)]',
    groupActive: 'bg-sky-500/15 text-sky-100 border-sky-400/40',
    groupIdle: 'text-sky-200/80 hover:bg-sky-500/10 hover:text-sky-100 border-transparent',
    itemActive: 'bg-sky-500/18 text-sky-50 ring-1 ring-sky-400/30',
    itemIdle: 'text-slate-300 hover:bg-sky-500/10 hover:text-sky-100',
    iconActive: 'text-sky-300',
    iconIdle: 'text-sky-400/75',
    badge: 'bg-sky-500 text-white',
  },
  cjMl: {
    rail: 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.42)]',
    groupActive: 'bg-amber-500/16 text-amber-100 border-amber-400/40',
    groupIdle: 'text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-100 border-transparent',
    itemActive: 'bg-amber-500/18 text-amber-50 ring-1 ring-amber-400/30',
    itemIdle: 'text-slate-300 hover:bg-amber-500/10 hover:text-amber-100',
    iconActive: 'text-amber-300',
    iconIdle: 'text-amber-400/75',
    badge: 'bg-amber-500 text-slate-950',
  },
  cjShopify: {
    rail: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.42)]',
    groupActive: 'bg-emerald-500/16 text-emerald-100 border-emerald-400/40',
    groupIdle: 'text-emerald-200/80 hover:bg-emerald-500/10 hover:text-emerald-100 border-transparent',
    itemActive: 'bg-emerald-500/18 text-emerald-50 ring-1 ring-emerald-400/30',
    itemIdle: 'text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-100',
    iconActive: 'text-emerald-300',
    iconIdle: 'text-emerald-400/75',
    badge: 'bg-emerald-500 text-slate-950',
  },
  topdawg: {
    rail: 'bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.42)]',
    groupActive: 'bg-orange-500/16 text-orange-100 border-orange-400/40',
    groupIdle: 'text-orange-200/80 hover:bg-orange-500/10 hover:text-orange-100 border-transparent',
    itemActive: 'bg-orange-500/18 text-orange-50 ring-1 ring-orange-400/30',
    itemIdle: 'text-slate-300 hover:bg-orange-500/10 hover:text-orange-100',
    iconActive: 'text-orange-300',
    iconIdle: 'text-orange-400/75',
    badge: 'bg-orange-500 text-slate-950',
  },
  main: {
    rail: 'bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.42)]',
    groupActive: 'bg-blue-500/15 text-blue-100 border-blue-400/40',
    groupIdle: 'text-blue-200/75 hover:bg-blue-500/10 hover:text-blue-100 border-transparent',
    itemActive: 'bg-blue-500/18 text-blue-50 ring-1 ring-blue-400/30',
    itemIdle: 'text-slate-300 hover:bg-blue-500/10 hover:text-blue-100',
    iconActive: 'text-blue-300',
    iconIdle: 'text-blue-400/75',
    badge: 'bg-blue-500 text-white',
  },
  catalog: {
    rail: 'bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.4)]',
    groupActive: 'bg-cyan-500/15 text-cyan-100 border-cyan-400/40',
    groupIdle: 'text-cyan-200/75 hover:bg-cyan-500/10 hover:text-cyan-100 border-transparent',
    itemActive: 'bg-cyan-500/18 text-cyan-50 ring-1 ring-cyan-400/30',
    itemIdle: 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-100',
    iconActive: 'text-cyan-300',
    iconIdle: 'text-cyan-400/75',
    badge: 'bg-cyan-500 text-slate-950',
  },
  finance: {
    rail: 'bg-lime-400 shadow-[0_0_18px_rgba(163,230,53,0.38)]',
    groupActive: 'bg-lime-500/14 text-lime-100 border-lime-400/40',
    groupIdle: 'text-lime-200/75 hover:bg-lime-500/10 hover:text-lime-100 border-transparent',
    itemActive: 'bg-lime-500/16 text-lime-50 ring-1 ring-lime-400/30',
    itemIdle: 'text-slate-300 hover:bg-lime-500/10 hover:text-lime-100',
    iconActive: 'text-lime-300',
    iconIdle: 'text-lime-400/75',
    badge: 'bg-lime-500 text-slate-950',
  },
  admin: {
    rail: 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.38)]',
    groupActive: 'bg-rose-500/15 text-rose-100 border-rose-400/40',
    groupIdle: 'text-rose-200/75 hover:bg-rose-500/10 hover:text-rose-100 border-transparent',
    itemActive: 'bg-rose-500/18 text-rose-50 ring-1 ring-rose-400/30',
    itemIdle: 'text-slate-300 hover:bg-rose-500/10 hover:text-rose-100',
    iconActive: 'text-rose-300',
    iconIdle: 'text-rose-400/75',
    badge: 'bg-rose-500 text-white',
  },
  settings: {
    rail: 'bg-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.42)]',
    groupActive: 'bg-violet-500/15 text-violet-100 border-violet-400/40',
    groupIdle: 'text-violet-200/75 hover:bg-violet-500/10 hover:text-violet-100 border-transparent',
    itemActive: 'bg-violet-500/18 text-violet-50 ring-1 ring-violet-400/30',
    itemIdle: 'text-slate-300 hover:bg-violet-500/10 hover:text-violet-100',
    iconActive: 'text-violet-300',
    iconIdle: 'text-violet-400/75',
    badge: 'bg-violet-500 text-white',
  },
};

export default function Sidebar() {
  const { user } = useAuthStore();
  const { isOpen, close } = useSidebar();
  const location = useLocation();
  const userRole = user?.role?.toUpperCase() || 'USER';
  const { pendingPurchasesCount, productsPending } = useInventoryBadges();

  const allNavGroups: NavGroup[] = [
    ...(isCjEbayModuleEnabled() ? [cjEbayNavGroup] : []),
    ...(isCjMlChileModuleEnabled() ? [cjMlChileNavGroup] : []),
    ...(isCjShopifyUsaModuleEnabled() ? [cjShopifyUsaNavGroup] : []),
    ...(isTopDawgShopifyUsaModuleEnabled() ? [topDawgShopifyUsaNavGroup] : []),
    ...navGroups,
  ];

  const visibleGroups = useMemo(() => allNavGroups.filter((group) => {
    if (group.roles && !group.roles.includes(userRole)) return false;
    const visibleItems = group.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    });
    return visibleItems.length > 0;
  }), [allNavGroups, userRole]);

  const activeGroupTitle = visibleGroups.find((group) =>
    group.items.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)),
  )?.title;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedGroups((current) => {
      if (!activeGroupTitle || current.has(activeGroupTitle)) {
        return current;
      }
      const next = new Set(current);
      next.add(activeGroupTitle);
      return next;
    });
  }, [activeGroupTitle]);

  const toggleGroup = (title: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const navContent = (
    <nav className="py-3 px-2.5 space-y-3 scrollbar-thin">
      {visibleGroups.map((group) => (
        <div key={group.title}>
          {(() => {
            const visibleItems = group.items.filter((item) => !item.roles || item.roles.includes(userRole));
            const isExpanded = expandedGroups.has(group.title);
            const hasActiveItem = group.title === activeGroupTitle;
            const theme = sidebarThemes[group.theme ?? 'main'];
            return (
              <div className={`relative rounded-xl border transition-colors ${
                hasActiveItem
                  ? 'border-white/10 bg-white/[0.035]'
                  : 'border-transparent hover:border-white/[0.06]'
              }`}>
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-opacity ${theme.rail} ${
                  hasActiveItem ? 'opacity-100' : 'opacity-35'
                }`} />
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className={`w-full flex items-center gap-2 pl-4 pr-3 py-2 rounded-xl text-left border transition-colors ${
                    hasActiveItem ? theme.groupActive : theme.groupIdle
                  }`}
                  aria-expanded={isExpanded}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.rail}`} />
                  <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-normal truncate">
                    {group.title}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 flex-shrink-0 opacity-80 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="mt-1 px-1.5 pb-2 space-y-1">
                    {visibleItems.map((item) => {
                      const badgeCount =
                        item.path === '/pending-purchases'
                          ? pendingPurchasesCount
                          : item.path === '/products'
                            ? productsPending
                            : 0;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={close}
                          className={({ isActive }) =>
                            `group flex items-center gap-2.5 pl-4 pr-2.5 py-[7px] rounded-lg transition-colors text-[13px] ${
                              isActive ? `${theme.itemActive} font-semibold` : theme.itemIdle
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
                                isActive ? theme.iconActive : theme.iconIdle
                              }`} />
                          <span className="truncate">{item.label}</span>
                          {badgeCount > 0 && (
                                <span className={`ml-auto min-w-[1.125rem] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold leading-none ${theme.badge}`}>
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                            </>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          fixed lg:static left-0 z-50
          top-[var(--navbar-height)] h-[calc(100vh-var(--navbar-height))] lg:top-0 lg:min-h-[calc(100vh-var(--navbar-height))] lg:h-auto
          w-[var(--sidebar-width)]
          bg-white dark:bg-[#050816] border-r border-slate-200 dark:border-slate-700/70
          dark:shadow-[inset_-1px_0_0_rgba(148,163,184,0.08)]
          overflow-y-auto overflow-x-hidden transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {navContent}
      </aside>
    </>
  );
}
