import { Navigate, Outlet } from 'react-router-dom';
import { isCjEbayModuleEnabled } from '@/config/feature-flags';

/** When the CJ→eBay module flag is off, deep links redirect to the main dashboard. */
export default function CjEbayModuleGate() {
  if (!isCjEbayModuleEnabled()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
