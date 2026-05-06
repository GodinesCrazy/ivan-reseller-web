import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-shopify-usa/overview',    label: 'Overview' },
  { to: '/cj-shopify-usa/discover',    label: '✦ Descubrir' },
  { to: '/cj-shopify-usa/products',    label: 'Productos CJ' },
  { to: '/cj-shopify-usa/listings',    label: 'Store Products' },
  { to: '/cj-shopify-usa/orders',      label: 'Órdenes' },
  { to: '/cj-shopify-usa/alerts',      label: 'Alertas' },
  { to: '/cj-shopify-usa/profit',      label: 'Profit' },
  { to: '/cj-shopify-usa/analytics',   label: 'Analítica' },
  { to: '/cj-shopify-usa/automation',  label: '⚡ Automatización' },
  { to: '/cj-shopify-usa/settings',    label: '⚙ Config' },
  { to: '/cj-shopify-usa/logs',        label: 'Logs' },
] as const;

export default function CjShopifyUsaLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CJ → Shopify USA</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Catálogo CJ, evaluación operativa y gestión para tu tienda Shopify USA.
        </p>
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
