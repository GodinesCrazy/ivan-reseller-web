import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Panel',
  'control-center': 'Control Center',
  opportunities: 'Oportunidades',
  'opportunities/history': 'Historial',
  autopilot: 'Autopilot',
  products: 'Productos',
  preview: 'Vista previa',
  sales: 'Ventas',
  orders: 'Ordenes',
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
  regional: 'Config. regional',
  logs: 'Registros del sistema',
  'system-status': 'Estado del sistema',
  settings: 'Configuracion',
  'api-settings': 'API & Credenciales',
  'workflow-config': 'Config. workflows',
  'api-config': 'Config. API',
  'api-keys': 'API Keys',
  'other-credentials': 'Otras credenciales',
  admin: 'Admin',
  diagnostics: 'Diagnosticos',
  help: 'Centro de ayuda',
  'meeting-room': 'Sala de reuniones',
  onboarding: 'Asistente de configuracion',
};

const TAB_LABELS: Record<string, string> = {
  search: 'Busqueda Universal',
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
        <nav className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2" aria-label="Migas de pan">
          <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors">
            Panel
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{TAB_LABELS[tab]}</span>
        </nav>
      );
    }
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return (
      <nav className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2" aria-label="Migas de pan">
        <span className="text-slate-800 dark:text-slate-200 font-semibold">Panel</span>
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
    <nav className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2 flex-wrap" aria-label="Migas de pan">
      <Link to="/dashboard" className="hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors">
        Inicio
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
          {i === crumbs.length - 1 ? (
            <span className="text-slate-800 dark:text-slate-200 font-semibold">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
