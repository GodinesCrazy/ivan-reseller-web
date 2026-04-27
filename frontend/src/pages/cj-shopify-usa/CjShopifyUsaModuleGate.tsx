import { Navigate, Outlet } from 'react-router-dom';
import { isCjShopifyUsaModuleEnabled } from '@/config/feature-flags';

export default function CjShopifyUsaModuleGate() {
  if (!isCjShopifyUsaModuleEnabled()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
