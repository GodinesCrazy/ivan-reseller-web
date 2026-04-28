import { Navigate, Outlet } from 'react-router-dom';
import { isTopDawgShopifyUsaModuleEnabled } from '@/config/feature-flags';

export default function TopDawgShopifyUsaModuleGate() {
  if (!isTopDawgShopifyUsaModuleEnabled()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
