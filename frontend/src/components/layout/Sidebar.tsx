import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
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
  roles?: string[]; // Roles permitidos (undefined = todos los roles)
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { path: '/opportunities', label: 'Oportunidades', icon: Search },
  { path: '/autopilot', label: 'Autopilot', icon: Bot },
  { path: '/products', label: 'Productos', icon: Package },
  { path: '/sales', label: 'Ventas', icon: DollarSign },
  { path: '/orders', label: 'Órdenes', icon: Receipt },
  { path: '/checkout', label: 'Checkout', icon: CreditCard },
  { path: '/pending-purchases', label: 'Compras pendientes', icon: ShoppingCart },
  { path: '/commissions', label: 'Comisiones', icon: Receipt },
  { path: '/finance', label: 'Finanzas', icon: Wallet },
  { path: '/flexible', label: 'Dropshipping flexible', icon: TrendingUp },
  { path: '/publisher', label: 'Publicador inteligente', icon: Send },
  { path: '/jobs', label: 'Trabajos', icon: Briefcase },
  { path: '/reports', label: 'Reportes', icon: FileText },
  { path: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN'] },
  { path: '/regional', label: 'Configuración regional', icon: Globe },
  { path: '/logs', label: 'Registros del sistema', icon: Terminal, roles: ['ADMIN'] },
  { path: '/workflow-config', label: 'Config. workflows', icon: Settings },
  { path: '/settings', label: 'Configuración', icon: Settings },
  { path: '/meeting-room', label: 'Sala de reuniones', icon: Video },
  { path: '/help', label: 'Centro de ayuda', icon: HelpCircle },
  { path: '/onboarding', label: 'Asistente de configuración', icon: Settings },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const userRole = user?.role?.toUpperCase() || 'USER';

  // Filtrar items según el rol del usuario
  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true; // Sin restricción de roles
    return item.roles.includes(userRole);
  });

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 shadow-sm border-r border-gray-200 dark:border-gray-700 min-h-[calc(100vh-73px)] overflow-y-auto transition-colors">
      <nav className="p-4 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
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
      </nav>
    </aside>
  );
}
