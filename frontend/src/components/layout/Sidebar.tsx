import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { useSidebar } from '@/contexts/SidebarContext';
import { useInventoryBadges } from '@/hooks/useInventoryBadges';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  Receipt, 
  CreditCard,
  Users, 
  Settings,
  Search,
  Bot,
  Wallet,
  TrendingUp,
  Send,
  Briefcase,
  FileText,
  Globe,
  Terminal,
  HelpCircle,
  Video,
  ShoppingCart,
  Activity
} from 'lucide-react';

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

const navGroups: NavGroup[] = [
  {
    title: 'Flujo principal',
    items: [
      { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },
      { path: '/control-center', label: 'Control Center', icon: Activity },
      { path: '/dashboard?tab=trends', label: 'Ciclo (Tendencias)', icon: TrendingUp },
      { path: '/opportunities', label: 'Oportunidades', icon: Search },
      { path: '/autopilot', label: 'Autopilot', icon: Bot },
    ],
  },
  {
    title: 'Catálogo y ventas',
    items: [
      { path: '/products', label: 'Productos', icon: Package },
      { path: '/sales', label: 'Ventas', icon: DollarSign },
      { path: '/orders', label: 'Órdenes', icon: Receipt },
      { path: '/checkout', label: 'Checkout', icon: CreditCard },
      { path: '/pending-purchases', label: 'Compras pendientes', icon: ShoppingCart },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { path: '/commissions', label: 'Comisiones', icon: Receipt },
      { path: '/finance', label: 'Finanzas', icon: Wallet },
    ],
  },
  {
    title: 'Herramientas',
    items: [
      { path: '/flexible', label: 'Dropshipping flexible', icon: TrendingUp },
      { path: '/publisher', label: 'Publicador inteligente', icon: Send },
      { path: '/jobs', label: 'Trabajos', icon: Briefcase },
      { path: '/reports', label: 'Reportes', icon: FileText },
    ],
  },
  {
    title: 'Administración',
    items: [
      { path: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
      { path: '/logs', label: 'Registros del sistema', icon: Terminal, roles: ['ADMIN'] },
    ],
    roles: ['ADMIN'],
  },
  {
    title: 'Configuración',
    items: [
      { path: '/regional', label: 'Configuración regional', icon: Globe },
      { path: '/system-status', label: 'Estado del sistema', icon: Activity },
      { path: '/workflow-config', label: 'Config. workflows', icon: Settings },
      { path: '/settings', label: 'Configuración', icon: Settings },
      { path: '/api-settings', label: 'API Settings', icon: Settings },
      { path: '/meeting-room', label: 'Sala de reuniones', icon: Video },
      { path: '/help', label: 'Centro de ayuda', icon: HelpCircle },
      { path: '/onboarding', label: 'Asistente de configuración', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const { isOpen, close } = useSidebar();
  const userRole = user?.role?.toUpperCase() || 'USER';
  const { pendingPurchasesCount, productsPending } = useInventoryBadges();

  const visibleGroups = navGroups.filter((group) => {
    if (group.roles && !group.roles.includes(userRole)) return false;
    const visibleItems = group.items.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    });
    return visibleItems.length > 0;
  });

  const navContent = (
    <nav className="p-4 space-y-6">
      {visibleGroups.map((group) => (
        <div key={group.title}>
          <h3 className="px-4 mb-2 text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">
            {group.title}
          </h3>
          <div className="space-y-1">
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
                    `flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-300 font-semibold border border-primary-200/80 dark:border-primary-700/50'
                        : 'text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800/80 border border-transparent'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-medium">
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
      {/* Overlay en mobile cuando sidebar abierto */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          fixed lg:static left-0 z-50
          top-[var(--navbar-height)] h-[calc(100vh-var(--navbar-height))] lg:top-0 lg:min-h-[calc(100vh-var(--navbar-height))] lg:h-auto
          w-64
          bg-white dark:bg-slate-900 shadow-md border-r border-gray-200 dark:border-slate-700
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
