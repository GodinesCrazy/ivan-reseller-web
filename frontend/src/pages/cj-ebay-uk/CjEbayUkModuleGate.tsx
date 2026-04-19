import { Navigate, Outlet } from 'react-router-dom';

function isCjEbayUkModuleEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_CJ_EBAY_UK_MODULE || '').toLowerCase() === 'true';
}

export default function CjEbayUkModuleGate() {
  if (!isCjEbayUkModuleEnabled()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
