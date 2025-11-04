import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[]; // Support multiple roles: ['ADMIN', 'USER']
}

/**
 * Protected Route Component for Role-Based Access Control (RBAC)
 * 
 * Wraps routes to restrict access based on user roles.
 * Redirects unauthorized users to dashboard with access denied message.
 * 
 * @example
 * // Admin-only route
 * <Route path="users" element={
 *   <ProtectedRoute allowedRoles={['ADMIN']}>
 *     <Users />
 *   </ProtectedRoute>
 * } />
 * 
 * @example
 * // Multi-role route
 * <Route path="reports" element={
 *   <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
 *     <Reports />
 *   </ProtectedRoute>
 * } />
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuthStore();

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user's role is in the allowed roles list
  const hasPermission = user?.role && allowedRoles.includes(user.role);

  // Authenticated but insufficient role
  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-8 bg-white rounded-lg shadow-lg">
          <div className="text-6xl mb-4">⛔</div>
          <h1 className="text-3xl font-bold text-red-600 mb-2">Acceso Denegado</h1>
          <p className="text-gray-600 mb-4">
            No tienes permisos para acceder a esta página.
          </p>
          <div className="bg-gray-100 p-4 rounded mb-4">
            <p className="text-sm text-gray-700">
              <strong>Roles permitidos:</strong> {allowedRoles.join(', ')}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Tu rol actual:</strong> {user?.role || 'Desconocido'}
            </p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  // All checks passed - user has permission
  return <>{children}</>;
}
