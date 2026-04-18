import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { isCjEbayModuleEnabled, isCjMlChileModuleEnabled } from '@/config/feature-flags';

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
}

const cjEbayNavGroup: NavGroup = {
  title: 'CJ → eBay USA',
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

const navGroups: NavGroup[] = [
  {
    title: 'Flujo principal',
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
    items: [
      { path: '/finance', label: 'Finanzas', icon: Wallet },
      { path: '/commissions', label: 'Comisiones', icon: Receipt },
      { path: '/reports', label: 'Reportes', icon: FileBarChart2 },
    ],
  },
  {
    title: 'Administración',
    items: [
      { path: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
      { path: '/admin', label: 'Panel Admin', icon: Server, roles: ['ADMIN'] },
      { path: '/logs', label: 'Registros del sistema', icon: Terminal, roles: ['ADMIN'] },
    ],
    roles: ['ADMIN'],
  },
  {
    title: 'Configuración',
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

export default function Sidebar() {
  const { user } = useAuthStore();
  const { isOpen, close } = useSidebar();
  const userRole = user?.role?.toUpperCase() || 'USER';
  const { pendingPurchasesCount, productsPending } = useInventoryBadges();

  const allNavGroups: NavGroup[] = [
    ...(isCjEbayModuleEnabled() ? [cjEbayNavGroup] : []),
    ...(isCjMlChileModuleEnabled() ? [cjMlChileNavGroup] : []),
    ...navGroups,
  ];

  const visibleGroups = allNavGroups.filter((group) => {
    if (group.roles && !group.roles.includes(userRole)) return false;
    const visibleItems = group.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    });
    return visibleItems.length > 0;
  });

  const navContent = (
    <nav className="py-3 px-2.5 space-y-5 scrollbar-thin">
      {visibleGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.08em]">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items
              .filter((item) => !item.roles || item.roles.includes(userRole))
              .map((item) => {
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
                    `flex items-center gap-2.5 px-3 py-[7px] rounded-lg transition-colors text-[13px] ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto min-w-[1.125rem] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
              })}
          </div>
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
          bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800
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
