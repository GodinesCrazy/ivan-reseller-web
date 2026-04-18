import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-ml-chile/overview', label: 'Overview' },
  { to: '/cj-ml-chile/products', label: 'Products' },
  { to: '/cj-ml-chile/listings', label: 'Listings' },
  { to: '/cj-ml-chile/orders', label: 'Orders' },
  { to: '/cj-ml-chile/alerts', label: 'Alerts' },
  { to: '/cj-ml-chile/profit', label: 'Profit' },
  { to: '/cj-ml-chile/logs', label: 'Logs' },
] as const;

export default function CjMlChileLayout() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CJ → ML Chile</h1>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
            MVP · Solo warehouse Chile
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Canal CJ Dropshipping → Mercado Libre Chile. Solo productos con warehouse Chile confirmado. Precios en CLP con IVA 19%.
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
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
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
