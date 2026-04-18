import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-ml-chile/overview',  label: 'Overview',  icon: '📊' },
  { to: '/cj-ml-chile/products',  label: 'Products',  icon: '🔍' },
  { to: '/cj-ml-chile/listings',  label: 'Listings',  icon: '📦' },
  { to: '/cj-ml-chile/orders',    label: 'Orders',    icon: '🛒' },
  { to: '/cj-ml-chile/alerts',    label: 'Alerts',    icon: '🔔' },
  { to: '/cj-ml-chile/profit',    label: 'Profit',    icon: '💰' },
  { to: '/cj-ml-chile/logs',      label: 'Logs',      icon: '📋' },
] as const;

export default function CjMlChileLayout() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CJ → ML Chile</h1>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700">
            Warehouse Chile
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Canal CJ Dropshipping → Mercado Libre Chile. Precios en CLP con IVA 19%. Fees ML 12% + MP 5.18%.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-700 pb-3">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            <span className="text-xs">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
