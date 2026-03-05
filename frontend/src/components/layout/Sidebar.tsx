import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { useSidebar } from '@/contexts/SidebarContext';
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
          <h3 className="px-4 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {group.title}
          </h3>
          <div className="space-y-1">
            {group.items
              .filter((item) => !item.roles || item.roles.includes(userRole))
              .map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={close}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
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
          fixed lg:static top-[73px] lg:top-0 left-0 z-50
          w-64 h-[calc(100vh-73px)] lg:min-h-[calc(100vh-73px)] lg:h-auto
          bg-white dark:bg-gray-800 shadow-sm border-r border-gray-200 dark:border-gray-700
          overflow-y-auto transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {navContent}
      </aside>
    </>
  );
}
