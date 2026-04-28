import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/topdawg-shopify-usa/overview',    label: 'Overview' },
  { to: '/topdawg-shopify-usa/discover',    label: '🔍 Descubrir' },
  { to: '/topdawg-shopify-usa/listings',    label: 'Store Products' },
  { to: '/topdawg-shopify-usa/orders',      label: 'Orders' },
  { to: '/topdawg-shopify-usa/alerts',      label: 'Alerts' },
  { to: '/topdawg-shopify-usa/profit',      label: 'Profit' },
  { to: '/topdawg-shopify-usa/automation',  label: '⚡ Automatización' },
  { to: '/topdawg-shopify-usa/settings',    label: 'Settings' },
  { to: '/topdawg-shopify-usa/logs',        label: 'Logs' },
] as const;

export default function TopDawgShopifyUsaLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          TopDawg → Shopify USA
          <span className="ml-2 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-0.5 rounded-full">
            🚀 USA Warehouse · 3-7 Day Shipping
          </span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Catálogo TopDawg (bodega USA), evaluación de márgenes y gestión para tu tienda Shopify.
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
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200'
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
