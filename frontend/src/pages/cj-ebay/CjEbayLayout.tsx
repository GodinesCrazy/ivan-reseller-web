import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-ebay/discover', label: '✦ Descubrir' },
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
          Catálogo CJ, evaluación operativa y draft listing para eBay USA.
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
