import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Panel',
  opportunities: 'Oportunidades',
  'opportunities/history': 'Historial',
  autopilot: 'Autopilot',
  products: 'Productos',
  preview: 'Vista previa',
  sales: 'Ventas',
  orders: 'Órdenes',
  order: 'Detalle',
  checkout: 'Checkout',
  'pending-purchases': 'Compras pendientes',
  commissions: 'Comisiones',
  finance: 'Finanzas',
  flexible: 'Dropshipping flexible',
  publisher: 'Publicador inteligente',
  jobs: 'Trabajos',
  reports: 'Reportes',
  users: 'Usuarios',
  regional: 'Configuración regional',
  logs: 'Registros del sistema',
  'system-status': 'Estado del sistema',
  settings: 'Configuración',
  'api-settings': 'API Settings',
  'workflow-config': 'Config. workflows',
  help: 'Centro de ayuda',
  'meeting-room': 'Sala de reuniones',
  onboarding: 'Asistente de configuración',
};

const TAB_LABELS: Record<string, string> = {
  search: 'Búsqueda Universal',
  trends: 'Tendencias',
  summary: 'Resumen',
};

export default function PageBreadcrumb() {
  const location = useLocation();
  const { pathname, search } = location;

  if (pathname === '/' || pathname === '/dashboard') {
    const params = new URLSearchParams(search);
    const tab = params.get('tab');
    if (tab && TAB_LABELS[tab]) {
      return (
        <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
          <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-400">
            Panel
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 dark:text-gray-100">{TAB_LABELS[tab]}</span>
        </nav>
      );
    }
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return (
      <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <span className="text-gray-900 dark:text-gray-100">Panel</span>
      </nav>
    );
  }

  const crumbs: { path: string; label: string }[] = [];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    if (seg.match(/^\d+$/) || seg === 'new') {
      crumbs.push({ path: acc, label: seg === 'new' ? 'Nuevo' : 'Detalle' });
    } else if (seg === 'preview') {
      crumbs.push({ path: acc, label: ROUTE_LABELS.preview || 'Vista previa' });
    } else {
      const label = ROUTE_LABELS[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
      crumbs.push({ path: acc, label });
    }
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
      <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-400">
        Inicio
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
          {i === crumbs.length - 1 ? (
            <span className="text-gray-900 dark:text-gray-100">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="hover:text-primary-600 dark:hover:text-primary-400"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
