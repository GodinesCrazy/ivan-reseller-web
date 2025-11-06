import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
const Login = lazy(() => import('@pages/Login'));
const Dashboard = lazy(() => import('@pages/Dashboard'));
const Opportunities = lazy(() => import('@pages/Opportunities'));
const OpportunitiesHistory = lazy(() => import('@pages/OpportunitiesHistory'));
const OpportunityDetail = lazy(() => import('@pages/OpportunityDetail'));
const Autopilot = lazy(() => import('@pages/Autopilot'));
const Products = lazy(() => import('@pages/Products'));
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
const Settings = lazy(() => import('@pages/Settings'));
const APIConfiguration = lazy(() => import('@pages/APIConfiguration'));
const APISettings = lazy(() => import('@pages/APISettings'));
const APIKeys = lazy(() => import('@pages/APIKeys'));
const AdminPanel = lazy(() => import('@pages/AdminPanel'));
const HelpCenter = lazy(() => import('@pages/HelpCenter'));
const WorkflowConfig = lazy(() => import('@pages/WorkflowConfig'));
import Layout from '@components/layout/Layout';

function AppContent() {
  const { isAuthenticated } = useAuthStore();

  const Fallback = (
    <div className="flex items-center justify-center min-h-[30vh] text-gray-600">
      <div className="h-5 w-5 mr-2 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
      Cargando...
    </div>
  );

  return (
    <Suspense fallback={Fallback}>
      <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
      />

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
        <Route path="sales" element={<Sales />} />
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
        
        {/* Settings & Configuration */}
        <Route path="settings" element={<Settings />} />
        <Route path="workflow-config" element={<WorkflowConfig />} />
        <Route path="api-config" element={<APIConfiguration />} />
        <Route path="api-settings" element={<APISettings />} />
        <Route path="api-keys" element={<APIKeys />} />
        
        {/* Admin */}
        <Route path="admin" element={<AdminPanel />} />
        
        {/* Help */}
        <Route path="help" element={<HelpCenter />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const { isAuthenticated, isCheckingAuth, checkAuth, token } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const location = useLocation();

  // Validar token al iniciar la app (solo si hay token)
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    
    const validateToken = async () => {
      // Si estamos en login, inicializar inmediatamente
      if (location.pathname === '/login') {
        useAuthStore.setState({ isCheckingAuth: false });
        if (isMounted) {
          setIsInitialized(true);
        }
        return;
      }

      // Si no hay token, no hacer nada - permitir que la app cargue inmediatamente
      const currentToken = useAuthStore.getState().token;
      if (!currentToken) {
        // Asegurarse de que isCheckingAuth esté en false
        useAuthStore.setState({ isCheckingAuth: false });
        if (isMounted) {
          setIsInitialized(true);
        }
        return;
      }

      try {
        // Timeout de 2 segundos - si tarda más, continuar de todas formas
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 2000);
        });

        await Promise.race([
          checkAuth(),
          timeoutPromise
        ]);
        
        clearTimeout(timeoutId);
        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.warn('Error o timeout validando token, continuando:', error);
        // Asegurarse de que isCheckingAuth esté en false
        useAuthStore.setState({ isCheckingAuth: false });
        // Continuar aunque falle o haya timeout - permitir que la app cargue
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };
    
    // Pequeño delay para asegurar que el store esté hidratado
    const timer = setTimeout(() => {
      validateToken();
    }, 50);
    
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [location.pathname]); // Re-ejecutar si cambia la ruta

  const Fallback = (
    <div className="flex items-center justify-center min-h-[30vh] text-gray-600">
      <div className="h-5 w-5 mr-2 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
      Cargando...
    </div>
  );

  // Si estamos en login, mostrar inmediatamente sin verificar token
  const isLoginPage = location.pathname === '/login';
  
  // Solo mostrar loading si hay token Y está verificando Y NO estamos en login
  // Si no hay token o estamos en login, mostrar la app inmediatamente
  const shouldShowLoading = !isLoginPage && token && (!isInitialized || isCheckingAuth);
  
  if (shouldShowLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-4 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
          <p className="text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return <AppContent />;
}

export default App;
