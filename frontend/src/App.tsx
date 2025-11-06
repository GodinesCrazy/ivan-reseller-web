import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  const { isAuthenticated, isCheckingAuth, checkAuth } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  // Validar token al iniciar la app (solo una vez)
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    
    const validateToken = async () => {
      try {
        // Timeout de 5 segundos - si tarda más, continuar de todas formas
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 5000);
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
        // Continuar aunque falle o haya timeout - permitir que la app cargue
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
    <div className="flex items-center justify-center min-h-[30vh] text-gray-600">
      <div className="h-5 w-5 mr-2 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
      Cargando...
    </div>
  );

  // Mostrar loading mientras se valida el token
  if (!isInitialized || isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-4 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
          <p className="text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

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

export default App;
