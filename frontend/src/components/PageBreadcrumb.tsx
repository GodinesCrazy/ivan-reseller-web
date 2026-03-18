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
  orders: 'ùrdenes',
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
  regional: 'Configuraciùn regional',
  logs: 'Registros del sistema',
  'system-status': 'Estado del sistema',
  settings: 'Configuraciùn',
  'api-settings': 'API Settings',
  'workflow-config': 'Config. workflows',
  help: 'Centro de ayuda',
  'meeting-room': 'Sala de reuniones',
  onboarding: 'Asistente de configuraciùn',
};

const TAB_LABELS: Record<string, string> = {
  search: 'Bùsqueda Universal',
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
        <nav className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 mb-2" aria-label="Migas de pan">
          <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-300 font-medium">
            Panel
          </Link>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
          <span className="text-gray-900 dark:text-slate-50 font-semibold">{TAB_LABELS[tab]}</span>
        </nav>
      );
    }
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return (
      <nav className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 mb-2" aria-label="Migas de pan">
        <span className="text-gray-900 dark:text-slate-50 font-semibold">Panel</span>
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
    <nav className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 mb-2 flex-wrap" aria-label="Migas de pan">
      <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-300 font-medium">
        Inicio
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />
          {i === crumbs.length - 1 ? (
            <span className="text-gray-900 dark:text-slate-50 font-semibold">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="hover:text-primary-600 dark:hover:text-primary-300 font-medium"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
