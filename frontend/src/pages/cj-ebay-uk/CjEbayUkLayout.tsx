import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/cj-ebay-uk/discover', label: '✦ Discover UK' },
  { to: '/cj-ebay-uk/overview', label: 'Overview' },
  { to: '/cj-ebay-uk/products', label: 'Products' },
  { to: '/cj-ebay-uk/listings', label: 'Listings' },
  { to: '/cj-ebay-uk/orders', label: 'Orders' },
  { to: '/cj-ebay-uk/alerts', label: 'Alerts' },
  { to: '/cj-ebay-uk/profit', label: 'Profit' },
  { to: '/cj-ebay-uk/logs', label: 'Logs' },
] as const;

export default function CjEbayUkLayout() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">CJ → eBay UK</h1>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
            🇬🇧 GBP
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            Authorization Pending
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          CJ catalog → eBay UK (ebay.co.uk) · GBP pricing · UK VAT 20% marketplace-facilitated · GB warehouse probing
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
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
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
