import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { log } from '@/utils/logger';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api';
const Login = lazy(() => import('@pages/Login'));
const Dashboard = lazy(() => import('@pages/Dashboard'));
const Opportunities = lazy(() => import('@pages/Opportunities'));
const OpportunitiesHistory = lazy(() => import('@pages/OpportunitiesHistory'));
const OpportunityDetail = lazy(() => import('@pages/OpportunityDetail'));
const ProductResearch = lazy(() => import('@pages/ProductResearch'));
const Autopilot = lazy(() => import('@pages/Autopilot'));
const Products = lazy(() => import('@pages/Products'));
const ProductPreview = lazy(() => import('@pages/ProductPreview'));
const Sales = lazy(() => import('@pages/Sales'));
const Commissions = lazy(() => import('@pages/Commissions'));
const FinanceDashboard = lazy(() => import('@pages/FinanceDashboard'));
const FlexibleDropshipping = lazy(() => import('@pages/FlexibleDropshipping'));
const IntelligentPublisher = lazy(() => import('@pages/IntelligentPublisher'));
const ManualList = lazy(() => import('@pages/ManualList'));
const Jobs = lazy(() => import('@pages/Jobs'));
const Reports = lazy(() => import('@pages/Reports'));
const Users = lazy(() => import('@pages/Users'));
const RegionalConfig = lazy(() => import('@pages/RegionalConfig'));
const SystemLogs = lazy(() => import('@pages/SystemLogs'));
const SystemStatus = lazy(() => import('@pages/SystemStatus'));
const Settings = lazy(() => import('@pages/Settings'));
const APIConfiguration = lazy(() => import('@pages/APIConfiguration'));
const APISettings = lazy(() => import('@pages/APISettings'));
const APIKeys = lazy(() => import('@pages/APIKeys'));
const OtherCredentials = lazy(() => import('@pages/OtherCredentials'));
const AdminPanel = lazy(() => import('@pages/AdminPanel'));
import { HelpCenterSafe } from '@/components/help/HelpCenterSafe';
const APIDocViewer = lazy(() => import('@pages/APIDocViewer'));
const APIDocsList = lazy(() => import('@pages/APIDocsList'));
const DocsList = lazy(() => import('@pages/DocsList'));
const DocViewer = lazy(() => import('@pages/DocViewer'));
const InvestorDocsList = lazy(() => import('@pages/InvestorDocsList'));
const InvestorDocViewer = lazy(() => import('@pages/InvestorDocViewer'));
const WorkflowConfig = lazy(() => import('@pages/WorkflowConfig'));
const ManualLogin = lazy(() => import('@pages/ManualLogin'));
const ResolveCaptcha = lazy(() => import('@pages/ResolveCaptcha'));
const RequestAccess = lazy(() => import('@pages/RequestAccess'));
const MeetingRoom = lazy(() => import('@pages/MeetingRoom'));
const PendingPurchases = lazy(() => import('@pages/PendingPurchases'));
const Orders = lazy(() => import('@pages/Orders'));
const OrderDetail = lazy(() => import('@pages/OrderDetail'));
const Checkout = lazy(() => import('@pages/Checkout'));
const Diagnostics = lazy(() => import('@pages/Diagnostics'));
const CjEbayModuleGate = lazy(() => import('@pages/cj-ebay/CjEbayModuleGate'));
const CjEbayLayout = lazy(() => import('@pages/cj-ebay/CjEbayLayout'));
const CjEbayOverviewPage = lazy(() => import('@pages/cj-ebay/CjEbayOverviewPage'));
const CjEbayProductsPage = lazy(() => import('@pages/cj-ebay/CjEbayProductsPage'));
const CjEbayListingsPage = lazy(() => import('@pages/cj-ebay/CjEbayListingsPage'));
const CjEbayOrdersPage = lazy(() => import('@pages/cj-ebay/CjEbayOrdersPage'));
const CjEbayOrderDetailPage = lazy(() => import('@pages/cj-ebay/CjEbayOrderDetailPage'));
const CjEbayAlertsPage = lazy(() => import('@pages/cj-ebay/CjEbayAlertsPage'));
const CjEbayProfitPage = lazy(() => import('@pages/cj-ebay/CjEbayProfitPage'));
const CjEbayLogsPage = lazy(() => import('@pages/cj-ebay/CjEbayLogsPage'));
const CjEbayOpportunityPage = lazy(() => import('@pages/cj-ebay/CjEbayOpportunityPage'));
// CJ → eBay UK
const CjEbayUkModuleGate = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkModuleGate'));
const CjEbayUkLayout = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkLayout'));
const CjEbayUkOverviewPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkOverviewPage'));
const CjEbayUkProductsPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkProductsPage'));
const CjEbayUkListingsPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkListingsPage'));
const CjEbayUkOrdersPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkOrdersPage'));
const CjEbayUkOrderDetailPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkOrderDetailPage'));
const CjEbayUkAlertsPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkAlertsPage'));
const CjEbayUkProfitPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkProfitPage'));
const CjEbayUkLogsPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkLogsPage'));
const CjEbayUkOpportunityPage = lazy(() => import('@pages/cj-ebay-uk/CjEbayUkOpportunityPage'));
// CJ → ML Chile
const CjMlChileModuleGate = lazy(() => import('@pages/cj-ml-chile/CjMlChileModuleGate'));
const CjMlChileLayout = lazy(() => import('@pages/cj-ml-chile/CjMlChileLayout'));
const CjMlChileOverviewPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileOverviewPage'));
const CjMlChileProductsPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileProductsPage'));
const CjMlChileListingsPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileListingsPage'));
const CjMlChileOrdersPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileOrdersPage'));
const CjMlChileOrderDetailPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileOrderDetailPage'));
const CjMlChileAlertsPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileAlertsPage'));
const CjMlChileProfitPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileProfitPage'));
const CjMlChileLogsPage = lazy(() => import('@pages/cj-ml-chile/CjMlChileLogsPage'));
// CJ → Shopify USA
const CjShopifyUsaModuleGate = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaModuleGate'));
const CjShopifyUsaLayout = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaLayout'));
const CjShopifyUsaOverviewPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaOverviewPage'));
const CjShopifyUsaProductsPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaProductsPage'));
const CjShopifyUsaListingsPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaListingsPage'));
const CjShopifyUsaOrdersPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaOrdersPage'));
const CjShopifyUsaOrderDetailPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaOrderDetailPage'));
const CjShopifyUsaAlertsPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaAlertsPage'));
const CjShopifyUsaProfitPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaProfitPage'));
const CjShopifyUsaLogsPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaLogsPage'));
const CjShopifyUsaDiscoverPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaDiscoverPage'));
const CjShopifyUsaSettingsPage = lazy(() => import('@pages/cj-shopify-usa/CjShopifyUsaSettingsPage'));
const Listings = lazy(() => import('@pages/Listings'));
const ControlCenter = lazy(() => import('@pages/ControlCenter'));
const SetupRequired = lazy(() => import('@pages/SetupRequired'));
const OnboardingWizard = lazy(() => import('@components/OnboardingWizard'));
const NotFound = lazy(() => import('@pages/NotFound'));
import Layout from '@components/layout/Layout';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useInactivitySessionTimeout } from '@/hooks/useInactivitySessionTimeout';

/** /help exacto: render sin auth ni stores - NUNCA pantalla en blanco */
function HelpOnlyPage() {
  return <HelpCenterSafe />;
}

function AppContent() {
  const location = useLocation();
  const { isAuthenticated, isCheckingAuth, checkAuth, setCheckingAuth, token, user } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [aliExpressWarning, setAliExpressWarning] = useState<string | null>(null);

  // ✅ CORRECCIÓN TEMA: Inicializar tema al cargar la app
  useTheme();
  useInactivitySessionTimeout();

  // Silent OAuth proactive refresh when user is authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    api.post('/api/auth/refresh-all').then((res) => {
      const results: Array<{ platform: string; reason: string; expiresAt?: string; error?: string }> =
        res.data?.data?.results ?? [];
      const ali = results.find((r) => r.platform === 'AliExpress Dropshipping');
      if (ali?.reason === 'token_expired') {
        setAliExpressWarning('Tu sesión de AliExpress ha expirado. Ve a Configuración → APIs para reconectar.');
      } else if (ali?.reason === 'expiring_soon') {
        const days = ali.expiresAt
          ? Math.ceil((new Date(ali.expiresAt).getTime() - Date.now()) / 86400000)
          : null;
        setAliExpressWarning(
          `Tu sesión de AliExpress expira en ${days != null ? `${days} día${days !== 1 ? 's' : ''}` : 'poco tiempo'}. Ve a Configuración → APIs para renovarla.`
        );
      } else if (ali?.reason === 'no_token_in_store') {
        setAliExpressWarning('AliExpress no está conectado. Ve a Configuración → APIs para autenticarte.');
      }
    }).catch(() => { /* non-critical, ignore */ });
  }, [isAuthenticated]);

  // Validar token al iniciar la app (solo si hay token)
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    const validateToken = async () => {
      // Verificar token en store O en localStorage (fallback)
      const tokenInStore = token;
      const tokenInStorage = localStorage.getItem('auth_token');
      const hasToken = tokenInStore || tokenInStorage;
      // ✅ FIX OAUTH LOGOUT: También verificar cuando hay user persistido (cookie-only) O cuando
      // volvemos de OAuth (/api-settings?oauth=success). Persist solo guarda user; token no persiste.
      // Si hay user o estamos en return OAuth, intentar checkAuth para validar la cookie.
      const hasUserPersisted = user != null;
      const isOAuthReturn = typeof window !== 'undefined' &&
        window.location.pathname === '/api-settings' &&
        window.location.search.includes('oauth=success');
      
      if (!hasToken && !hasUserPersisted && !isOAuthReturn) {
        if (isMounted) {
          setIsInitialized(true);
        }
        return;
      }

      // Timeout de 1.5 segundos - si tarda más, continuar de todas formas (evitar pantalla opaca bloqueada)
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 1500);
      });

      try {
        await Promise.race([
          checkAuth(),
          timeoutPromise
        ]);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // Avoid noisy console traces from malformed/stale local tokens.
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        log.warn('Sesion local invalida o timeout de verificacion. Continuando en modo seguro.');
        setCheckingAuth(false);
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };
    
    validateToken();
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // Solo ejecutar una vez al montar

  const Fallback = (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-primary-600 animate-spin" />
        <span>Cargando...</span>
      </div>
    </div>
  );

  // Solo mostrar loading si hay token Y está verificando Y no estamos en rutas públicas
  const isLoginPage = location.pathname === '/login';
  const isHelpPage = location.pathname === '/help' || location.pathname.startsWith('/help/');
  
  // Verificar token en store O en localStorage (fallback)
  const tokenInStore = token;
  const tokenInStorage = localStorage.getItem('auth_token');
  const hasToken = tokenInStore || tokenInStorage;
  const hasUserPersisted = user != null;
  const isOAuthReturnPath = location.pathname === '/api-settings' && location.search.includes('oauth=success');
  const mightHaveSession = hasToken || hasUserPersisted || isOAuthReturnPath;
  
  // Si estamos en login, help o no hay indicio de sesión, inicializar inmediatamente (no bloquear)
  useEffect(() => {
    if (isLoginPage || isHelpPage || !mightHaveSession) {
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [isLoginPage, isHelpPage, mightHaveSession, isInitialized]);
  
  // No bloquear /help: siempre renderizar para que el centro de ayuda sea accesible
  // ✅ FIX OAUTH: Mostrar spinner también cuando mightHaveSession (user persistido o return OAuth)
  if (!isLoginPage && !isHelpPage && mightHaveSession && !isInitialized && isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-4 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-primary-600 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={Fallback}>
      {aliExpressWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between shadow-md">
          <span>⚠ {aliExpressWarning}</span>
          <button
            onClick={() => setAliExpressWarning(null)}
            type="button"
            className="ml-4 font-bold hover:opacity-75"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}
      <Routes>
      {/* /help SIEMPRE accesible (primera ruta, nunca bloqueada por auth) */}
      <Route path="/help" element={<HelpCenterSafe />} />
      {/* Resto de rutas públicas */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
      />
      <Route path="/request-access" element={<RequestAccess />} />
      <Route path="/manual-login" element={<Navigate to="/manual-login/new" replace />} />
      <Route path="/manual-login/:token" element={<ManualLogin />} />
      <Route path="/resolve-captcha/:token" element={<ResolveCaptcha />} />
      <Route path="/setup-required" element={<SetupRequired />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}
      >
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* CJ → eBay USA (feature-flagged; gate redirects if VITE_ENABLE_CJ_EBAY_MODULE is not true) */}
        <Route path="cj-ebay" element={<CjEbayModuleGate />}>
          <Route element={<CjEbayLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CjEbayOverviewPage />} />
            <Route path="products" element={<CjEbayProductsPage />} />
            <Route path="listings" element={<CjEbayListingsPage />} />
            <Route path="orders" element={<CjEbayOrdersPage />} />
            <Route path="orders/:orderId" element={<CjEbayOrderDetailPage />} />
            <Route path="alerts" element={<CjEbayAlertsPage />} />
            <Route path="profit" element={<CjEbayProfitPage />} />
            <Route path="logs" element={<CjEbayLogsPage />} />
            <Route path="discover" element={<CjEbayOpportunityPage />} />
          </Route>
        </Route>

        {/* CJ → eBay UK (feature-flagged; gate redirects to /dashboard if VITE_ENABLE_CJ_EBAY_UK_MODULE is not true) */}
        <Route path="cj-ebay-uk" element={<CjEbayUkModuleGate />}>
          <Route element={<CjEbayUkLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CjEbayUkOverviewPage />} />
            <Route path="products" element={<CjEbayUkProductsPage />} />
            <Route path="listings" element={<CjEbayUkListingsPage />} />
            <Route path="orders" element={<CjEbayUkOrdersPage />} />
            <Route path="orders/:orderId" element={<CjEbayUkOrderDetailPage />} />
            <Route path="alerts" element={<CjEbayUkAlertsPage />} />
            <Route path="profit" element={<CjEbayUkProfitPage />} />
            <Route path="logs" element={<CjEbayUkLogsPage />} />
            <Route path="discover" element={<CjEbayUkOpportunityPage />} />
          </Route>
        </Route>

        {/* CJ → ML Chile (feature-flagged; gate muestra aviso si VITE_ENABLE_CJ_ML_CHILE_MODULE no es true) */}
        <Route path="cj-ml-chile" element={<CjMlChileModuleGate />}>
          <Route element={<CjMlChileLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CjMlChileOverviewPage />} />
            <Route path="products" element={<CjMlChileProductsPage />} />
            <Route path="listings" element={<CjMlChileListingsPage />} />
            <Route path="orders" element={<CjMlChileOrdersPage />} />
            <Route path="orders/:orderId" element={<CjMlChileOrderDetailPage />} />
            <Route path="alerts" element={<CjMlChileAlertsPage />} />
            <Route path="profit" element={<CjMlChileProfitPage />} />
            <Route path="logs" element={<CjMlChileLogsPage />} />
          </Route>
        </Route>

        {/* CJ → Shopify USA */}
        <Route path="cj-shopify-usa" element={<CjShopifyUsaModuleGate />}>
          <Route element={<CjShopifyUsaLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CjShopifyUsaOverviewPage />} />
            <Route path="settings" element={<CjShopifyUsaSettingsPage />} />
            <Route path="products" element={<CjShopifyUsaProductsPage />} />
            <Route path="listings" element={<CjShopifyUsaListingsPage />} />
            <Route path="orders" element={<CjShopifyUsaOrdersPage />} />
            <Route path="orders/:orderId" element={<CjShopifyUsaOrderDetailPage />} />
            <Route path="alerts" element={<CjShopifyUsaAlertsPage />} />
            <Route path="profit" element={<CjShopifyUsaProfitPage />} />
            <Route path="logs" element={<CjShopifyUsaLogsPage />} />
            <Route path="discover" element={<CjShopifyUsaDiscoverPage />} />
          </Route>
        </Route>

        <Route path="control-center" element={<ControlCenter />} />
        
        {/* Opportunities System */}
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/history" element={<OpportunitiesHistory />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="product-research" element={<ProductResearch />} />
        
        {/* Automation */}
        <Route path="autopilot" element={<Autopilot />} />
        
        {/* Core Business */}
        <Route path="products" element={<Products />} />
        <Route path="products/:id/preview" element={<ProductPreview />} />
        <Route path="sales" element={<Sales />} />
        <Route path="pending-purchases" element={<PendingPurchases />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="commissions" element={<Commissions />} />
        
        {/* Finance & Dropshipping */}
        <Route path="finance" element={<FinanceDashboard />} />
        <Route path="flexible" element={<FlexibleDropshipping />} />
        
        {/* Publishing */}
        <Route path="publisher" element={<IntelligentPublisher />} />
        <Route path="manual-list" element={<ManualList />} />
        <Route path="listings" element={<Listings />} />
        
        {/* Jobs & Reports */}
        <Route path="jobs" element={<Jobs />} />
        <Route path="reports" element={<Reports />} />
        
        {/* Management */}
        <Route path="users" element={<Users />} />
        <Route path="regional" element={<RegionalConfig />} />
        <Route path="logs" element={<SystemLogs />} />
        <Route path="system-status" element={<SystemStatus />} />
        
        {/* Settings & Configuration */}
        <Route path="settings" element={<Settings />} />
        <Route path="workflow-config" element={<WorkflowConfig />} />
        <Route path="api-config" element={<APIConfiguration />} />
        <Route path="api-settings" element={<APISettings />} />
        <Route path="api-keys" element={<APIKeys />} />
        <Route path="other-credentials" element={<OtherCredentials />} />
        
        {/* Admin */}
        <Route path="admin" element={<AdminPanel />} />
        
        {/* Help (main /help is public above; sub-routes require auth) */}
        <Route path="help/apis" element={<APIDocsList />} />
        <Route path="help/apis/:slug" element={<APIDocViewer />} />
        <Route path="help/docs" element={<DocsList />} />
        <Route path="help/docs/:slug" element={<DocViewer />} />
        <Route path="help/investors" element={<InvestorDocsList />} />
        <Route path="help/investors/:slug" element={<InvestorDocViewer />} />
        
        {/* Meeting Room */}
        <Route path="meeting-room" element={<MeetingRoom />} />
        <Route path="onboarding" element={<OnboardingWizard onComplete={() => window.location.href = '/dashboard'} />} />
        
        {/* Diagnostics (public, no requiere auth) */}
        <Route path="diagnostics" element={<Diagnostics />} />
      </Route>
      
      {/* Public diagnostics route (accessible without auth) */}
      <Route path="/diagnostics" element={<Diagnostics />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
      </Routes>
      <ErrorBanner />
    </Suspense>
  );
}

function App() {
  const location = useLocation();
  const isHelpExact = location.pathname === '/help' || location.pathname === '/help/';
  if (isHelpExact) {
    return <HelpOnlyPage />;
  }
  return <AppContent />;
}

export default App;
