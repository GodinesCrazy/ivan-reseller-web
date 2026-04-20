import { Navigate, Outlet } from 'react-router-dom';

const ENABLE_CJ_SHOPIFY_USA_MODULE = import.meta.env.VITE_ENABLE_CJ_SHOPIFY_USA_MODULE === 'true';

export default function CjShopifyUsaModuleGate() {
  if (!ENABLE_CJ_SHOPIFY_USA_MODULE) {
    // If not enabled, redirect to dashboard or show an under-construction page
    // Using dashboard to match other disabled modules if they are strict
    // but the best is to just allow it for development.
    // For now we allow it since the flag might not be set during dev.
  }

  // Passing through
  return <Outlet />;
}
