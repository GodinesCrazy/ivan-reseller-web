import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  Receipt, 
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
  HelpCircle
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[]; // Roles permitidos (undefined = todos los roles)
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/opportunities', label: 'Opportunities', icon: Search },
  { path: '/autopilot', label: 'Autopilot', icon: Bot },
  { path: '/products', label: 'Products', icon: Package },
  { path: '/sales', label: 'Sales', icon: DollarSign },
  { path: '/commissions', label: 'Commissions', icon: Receipt },
  { path: '/finance', label: 'Finance', icon: Wallet },
  { path: '/flexible', label: 'Flexible Dropshipping', icon: TrendingUp },
  { path: '/publisher', label: 'Intelligent Publisher', icon: Send },
  { path: '/jobs', label: 'Jobs', icon: Briefcase },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] }, // Solo ADMIN
  { path: '/regional', label: 'Regional Config', icon: Globe },
  { path: '/logs', label: 'System Logs', icon: Terminal, roles: ['ADMIN'] }, // Solo ADMIN
  { path: '/workflow-config', label: 'Workflow Config', icon: Settings },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/help', label: 'Help Center', icon: HelpCircle },
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
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 min-h-[calc(100vh-73px)] overflow-y-auto">
      <nav className="p-4 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
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
