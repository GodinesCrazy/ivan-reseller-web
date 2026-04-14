import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-ebay/overview', label: 'Overview' },
  { to: '/cj-ebay/products', label: 'Products' },
  { to: '/cj-ebay/listings', label: 'Listings' },
  { to: '/cj-ebay/orders', label: 'Orders' },
  { to: '/cj-ebay/alerts', label: 'Alerts' },
  { to: '/cj-ebay/profit', label: 'Profit' },
  { to: '/cj-ebay/logs', label: 'Logs' },
] as const;

export default function CjEbayLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CJ → eBay USA</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Vertical aislada: CJ + calificación/pricing (3C) + listing draft/publish vía fachada eBay (3D). Validar en sandbox/producción antes de operar.
        </p>
        <aside className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed">
          <strong className="text-slate-800 dark:text-slate-200">Operador — dónde seguir</strong>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            <li>
              <strong>Draft / publish CJ→eBay:</strong> Opportunities o Product Research → pestaña{' '}
              <strong>Listings</strong> aquí. Si{' '}
              <code className="text-[11px] bg-slate-200/80 dark:bg-slate-800 px-1 rounded">BLOCK_NEW_PUBLICATIONS</code> está
              activo en el servidor, publicar puede responder 423; el borrador puede existir igual.
            </li>
            <li>
              <strong>Postventa CJ (recomendado):</strong> pestaña <strong>Orders</strong> de este módulo → importar orden
              eBay por ID → place / confirm / pay / tracking (rutas{' '}
              <code className="text-[11px] px-1 rounded bg-slate-200/80 dark:bg-slate-800">/api/cj-ebay/orders/*</code>).
            </li>
            <li>
              <strong>Order legacy (dashboard Orders):</strong> el sync eBay puede crear/actualizar{' '}
              <code className="text-[11px] px-1 rounded">orders</code> con{' '}
              <code className="text-[11px] px-1 rounded">supplierMetadata</code> por SKU; usá ese flujo si operás postventa
              global ahí.
            </li>
          </ul>
        </aside>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
