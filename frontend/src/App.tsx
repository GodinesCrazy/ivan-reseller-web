import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import Login from '@pages/Login';
import Dashboard from '@pages/Dashboard';
import Opportunities from '@pages/Opportunities';
import OpportunitiesHistory from '@pages/OpportunitiesHistory';
import OpportunityDetail from '@pages/OpportunityDetail';
import Autopilot from '@pages/Autopilot';
import Products from '@pages/Products';
import Sales from '@pages/Sales';
import Commissions from '@pages/Commissions';
import FinanceDashboard from '@pages/FinanceDashboard';
import FlexibleDropshipping from '@pages/FlexibleDropshipping';
import IntelligentPublisher from '@pages/IntelligentPublisher';
import Jobs from '@pages/Jobs';
import Reports from '@pages/Reports';
import Users from '@pages/Users';
import RegionalConfig from '@pages/RegionalConfig';
import SystemLogs from '@pages/SystemLogs';
import Settings from '@pages/Settings';
import APIConfiguration from '@pages/APIConfiguration';
import APISettings from '@pages/APISettings';
import APIKeys from '@pages/APIKeys';
import AdminPanel from '@pages/AdminPanel';
import HelpCenter from '@pages/HelpCenter';
import Layout from '@components/layout/Layout';

function App() {
  // TEMPORARY: Skip authentication - load dashboard directly (as it worked originally)
  const isAuthenticated = true; // Force authenticated state
  // const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={<Layout />}
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
  );
}

export default App;
