import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { Toaster } from 'react-hot-toast';
import { log } from '@/utils/logger';
import { useTheme } from '@/hooks/useTheme';
const Login = lazy(() => import('@pages/Login'));
const Dashboard = lazy(() => import('@pages/Dashboard'));
const Opportunities = lazy(() => import('@pages/Opportunities'));
const OpportunitiesHistory = lazy(() => import('@pages/OpportunitiesHistory'));
const OpportunityDetail = lazy(() => import('@pages/OpportunityDetail'));
const Autopilot = lazy(() => import('@pages/Autopilot'));
const Products = lazy(() => import('@pages/Products'));
const ProductPreview = lazy(() => import('@pages/ProductPreview'));
const Sales = lazy(() => import('@pages/Sales'));
const Commissions = lazy(() => import('@pages/Commissions'));
const FinanceDashboard = lazy(() => import('@pages/FinanceDashboard'));
const FlexibleDropshipping = lazy(() => import('@pages/FlexibleDropshipping'));
const IntelligentPublisher = lazy(() => import('@pages/IntelligentPublisher'));
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
const SetupRequired = lazy(() => import('@pages/SetupRequired'));
const OnboardingWizard = lazy(() => import('@components/OnboardingWizard'));
import Layout from '@components/layout/Layout';
import { ErrorBanner } from '@/components/ErrorBanner';

/** /help exacto: render sin auth ni stores - NUNCA pantalla en blanco */
function HelpOnlyPage() {
  return (
    <>
      <HelpCenterSafe />
      <Toaster />
    </>
  );
}

function AppContent() {
  const location = useLocation();
  const { isAuthenticated, isCheckingAuth, checkAuth, setCheckingAuth, token } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  
  // ✅ CORRECCIÓN TEMA: Inicializar tema al cargar la app
  useTheme();

  // Validar token al iniciar la app (solo si hay token)
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    const validateToken = async () => {
      // Verificar token en store O en localStorage (fallback)
      const tokenInStore = token;
      const tokenInStorage = localStorage.getItem('auth_token');
      const hasToken = tokenInStore || tokenInStorage;
      
      // Si no hay token, mostrar login inmediatamente
      if (!hasToken) {
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
        log.warn('Error o timeout validando token, continuando:', error);
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
  
  // Si estamos en login, help o no hay token, inicializar inmediatamente (no bloquear)
  useEffect(() => {
    if (isLoginPage || isHelpPage || !hasToken) {
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [isLoginPage, isHelpPage, hasToken, isInitialized]);
  
  // No bloquear /help: siempre renderizar para que el centro de ayuda sea accesible
  if (!isLoginPage && !isHelpPage && hasToken && !isInitialized && isCheckingAuth) {
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
        
        {/* Opportunities System */}
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/history" element={<OpportunitiesHistory />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        
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
      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <ErrorBanner />
      <Toaster />
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
