import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import Login from '@pages/Login';
import Dashboard from '@pages/Dashboard';
import Products from '@pages/Products';
import Sales from '@pages/Sales';
import Commissions from '@pages/Commissions';
import Users from '@pages/Users';
import Settings from '@pages/Settings';
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
        <Route path="products" element={<Products />} />
        <Route path="sales" element={<Sales />} />
        <Route path="commissions" element={<Commissions />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
