import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users as UsersIcon, 
  UserPlus, 
  Search, 
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Eye,
  BarChart3,
  Key,
  Mail,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  DollarSign,
  TrendingUp,
  X,
  Save
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useAuthStore } from '@stores/authStore';

interface User {
  id: number;
  name: string; // Mapeado desde username o fullName
  email: string;
  phone?: string;
  role: 'ADMIN' | 'USER'; // Estandarizado a mayúsculas para coincidir con backend
  status: 'active' | 'inactive'; // Mapeado desde isActive
  createdAt: string;
  lastLogin?: string; // Mapeado desde lastLoginAt
  avatar?: string;
}

interface UserStats {
  totalProducts: number;
  totalSales: number;
  totalRevenue: number;
  commissions: number;
  conversionRate: number;
}

export default function Users() {
  const navigate = useNavigate();
  const { user: currentUser, checkAuth } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'sales'>('created');

  // Modals
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // New/Edit User Form
  const [formData, setFormData] = useState({
    username: '', // Backend espera username, no name
    email: '',
    fullName: '', // Backend espera fullName opcional
    password: '',
    role: 'USER' as 'ADMIN' | 'USER', // Estandarizado a mayúsculas
    commissionRate: 0.15, // Backend requiere commissionRate
    fixedMonthlyCost: 17.0, // Backend requiere fixedMonthlyCost
    isActive: true // Backend espera isActive, no status
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Usar useRef para evitar múltiples ejecuciones
  const hasInitialized = useRef(false);
  const isVerifying = useRef(false);

  useEffect(() => {
    // Prevenir múltiples ejecuciones
    if (hasInitialized.current || isVerifying.current) {
      return;
    }

    isVerifying.current = true;
    hasInitialized.current = true;
    
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    const verifyAndLoad = async () => {
      try {
        // Primero verificar si ya tenemos usuario en el store
        const currentUserFromStore = useAuthStore.getState().user;
        const isAuthFromStore = useAuthStore.getState().isAuthenticated;
        
        // Si ya tenemos usuario y está autenticado, verificar rol directamente
        if (currentUserFromStore && isAuthFromStore) {
          const userRole = currentUserFromStore.role?.toUpperCase();
          
          if (userRole === 'ADMIN') {
            // Usuario es admin, cargar usuarios directamente
            if (isMounted) {
              await loadUsers();
            }
            return;
          } else {
            // No es admin, redirigir
            if (isMounted) {
              toast.error('Access denied. Admin only.');
              setTimeout(() => navigate('/dashboard'), 1000);
            }
            return;
          }
        }

        // Si no hay usuario en el store, validar token con timeout
        console.log('Verificando autenticación y rol de usuario...');
        
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout'));
          }, 5000);
        });

        const authResult = await Promise.race([
          checkAuth(),
          timeoutPromise
        ]) as boolean;
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        if (!isMounted) return;
        
        if (!authResult) {
          toast.error('Please log in to access this page');
          navigate('/login');
          return;
        }

        // Obtener usuario actualizado del store después de checkAuth
        const updatedUser = useAuthStore.getState().user;
        
        if (!isMounted) return;
        
        if (!updatedUser) {
          console.error('User information not available after checkAuth');
          toast.error('User information not available');
          navigate('/dashboard');
          return;
        }

        // Verificar que el usuario actual es admin
        const userRole = updatedUser.role?.toUpperCase();
        
        if (!userRole || userRole !== 'ADMIN') {
          console.warn('Access denied - User role:', userRole, 'Expected: ADMIN');
          toast.error('Access denied. Admin only.');
          setTimeout(() => {
            if (isMounted) {
              navigate('/dashboard');
            }
          }, 2000);
          return;
        }

        // Usuario es admin, cargar usuarios
        if (isMounted) {
          await loadUsers();
        }
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.warn('Error o timeout verificando autenticación:', error);
        
        // Si hay error, verificar si hay usuario en el store de todas formas
        const fallbackUser = useAuthStore.getState().user;
        const fallbackAuth = useAuthStore.getState().isAuthenticated;
        
        if (isMounted) {
          if (fallbackUser && fallbackAuth) {
            const userRole = fallbackUser.role?.toUpperCase();
            if (userRole === 'ADMIN') {
              // Intentar cargar usuarios de todas formas
              await loadUsers();
            } else {
              toast.error('Access denied. Admin only.');
              navigate('/dashboard');
            }
          } else {
            toast.error('Error verificando autenticación');
            navigate('/login');
          }
        }
      } finally {
        if (isMounted) {
          isVerifying.current = false;
        }
      }
    };

    verifyAndLoad();
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // Solo ejecutar una vez al montar el componente

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/users');
      // El backend devuelve { success: true, data: users }
      const usersList = data?.data || data?.users || [];
      // Mapear datos del backend al formato esperado por el frontend
      const mappedUsers = usersList.map((user: any) => ({
        id: user.id,
        name: user.fullName || user.username, // Usar fullName si existe, sino username
        email: user.email,
        phone: '', // No existe en backend
        role: user.role || 'USER', // Asegurar que sea ADMIN o USER
        status: user.isActive ? 'active' : 'inactive', // Mapear isActive a status
        createdAt: user.createdAt,
        lastLogin: user.lastLoginAt || undefined, // Mapear lastLoginAt a lastLogin
        avatar: undefined
      }));
      setUsers(mappedUsers);
    } catch (error: any) {
      toast.error('Error loading users: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetails = async (userId: number) => {
    try {
      const [detailsRes, statsRes] = await Promise.all([
        api.get(`/api/users/${userId}`),
        api.get(`/api/users/${userId}/stats`)
      ]);
      
      // Mapear datos del backend al formato esperado por el frontend
      // El backend devuelve { success: true, data: user }
      const backendUser = detailsRes.data?.data || detailsRes.data?.user;
      const mappedUser: User = {
        id: backendUser.id,
        name: backendUser.fullName || backendUser.username,
        email: backendUser.email,
        phone: '', // No existe en backend
        role: backendUser.role || 'USER',
        status: backendUser.isActive ? 'active' : 'inactive',
        createdAt: backendUser.createdAt,
        lastLogin: backendUser.lastLoginAt || undefined,
        avatar: undefined
      };
      
      setSelectedUser(mappedUser);
      setUserStats(statsRes.data?.stats);
      setShowDetailsModal(true);
    } catch (error: any) {
      toast.error('Error loading user details');
    }
  };

  const openEditModal = async (user: User) => {
    setSelectedUser(user);
    setShowEditModal(true);
    
    // Obtener datos completos del backend
    try {
      const detailsRes = await api.get(`/api/users/${user.id}`);
      // El backend devuelve { success: true, data: user }
      const backendUser = detailsRes.data?.data || detailsRes.data?.user;
      
      // Actualizar formData con datos del backend
      setFormData({
        username: backendUser.username || user.name,
        email: backendUser.email || user.email,
        fullName: backendUser.fullName || '',
        password: '',
        role: (backendUser.role || user.role) as 'ADMIN' | 'USER',
        commissionRate: backendUser.commissionRate || 0.15,
        fixedMonthlyCost: backendUser.fixedMonthlyCost || 17.0,
        isActive: backendUser.isActive !== undefined ? backendUser.isActive : (user.status === 'active')
      });
    } catch (error: any) {
      // Si falla, usar datos del frontend como fallback
      setFormData({
        username: user.name,
        email: user.email,
        fullName: user.name,
        password: '',
        role: user.role as 'ADMIN' | 'USER',
        commissionRate: 0.15,
        fixedMonthlyCost: 17.0,
        isActive: user.status === 'active'
      });
    }
  };

  const openNewUserModal = () => {
    setSelectedUser(null);
    setFormData({
      username: '',
      email: '',
      fullName: '',
      password: '',
      role: 'USER' as 'ADMIN' | 'USER',
      commissionRate: 0.15,
      fixedMonthlyCost: 17.0,
      isActive: true
    });
    setShowNewUserModal(true);
  };

  const createUser = async () => {
    // Validar campos requeridos
    if (!formData.username || !formData.email || !formData.password) {
      toast.error('Username, email and password are required');
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Validar longitud de password
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    // Validar username
    if (formData.username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    try {
      // Mapear datos del frontend al formato esperado por el backend
      const backendData = {
        username: formData.username.trim(),
        email: formData.email.trim().toLowerCase(),
        fullName: formData.fullName?.trim() || undefined,
        password: formData.password,
        role: formData.role,
        commissionRate: formData.commissionRate || 0.15,
        fixedMonthlyCost: formData.fixedMonthlyCost || 17.0,
        isActive: formData.isActive !== undefined ? formData.isActive : true
      };

      console.log('Creating user with data:', { ...backendData, password: '***' });

      const response = await api.post('/api/users', backendData);
      
      console.log('User created successfully:', response.data);
      
      toast.success('User created successfully');
      setShowNewUserModal(false);
      
      // Limpiar formulario
      setFormData({
        username: '',
        email: '',
        fullName: '',
        password: '',
        role: 'USER' as 'ADMIN' | 'USER',
        commissionRate: 0.15,
        fixedMonthlyCost: 17.0,
        isActive: true
      });
      
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      console.error('Error response:', error.response?.data);
      
      // Mostrar error detallado
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Error creating user';
      
      // Si hay detalles adicionales, mostrarlos
      if (error.response?.data?.details) {
        toast.error(`${errorMessage}: ${JSON.stringify(error.response.data.details)}`);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const updateUser = async () => {
    if (!selectedUser) return;

    try {
      // Mapear datos del frontend al formato esperado por el backend
      const backendData: any = {
        username: formData.username,
        email: formData.email,
        fullName: formData.fullName || undefined,
        role: formData.role,
        commissionRate: formData.commissionRate,
        fixedMonthlyCost: formData.fixedMonthlyCost,
        isActive: formData.isActive
      };
      // Solo incluir password si se proporcionó
      if (formData.password) {
        backendData.password = formData.password;
      }
      await api.put(`/api/users/${selectedUser.id}`, backendData);
      toast.success('User updated successfully');
      setShowEditModal(false);
      loadUsers();
    } catch (error: any) {
      toast.error('Error updating user: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleUserStatus = async (userId: number, currentStatus: 'active' | 'inactive') => {
    try {
      const newIsActive = currentStatus === 'inactive'; // Invertir estado
      await api.put(`/api/users/${userId}`, { isActive: newIsActive });
      toast.success(`User ${newIsActive ? 'activated' : 'deactivated'}`);
      loadUsers();
    } catch (error: any) {
      toast.error('Error updating user status');
    }
  };

  const resetPassword = async (userId: number) => {
    const newPassword = prompt('Enter new password for this user (min 6 characters):');
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      // Nota: El endpoint de reset-password puede no existir aún en el backend
      // Por ahora, usamos el endpoint de actualización de usuario
      await api.put(`/api/users/${userId}`, { password: newPassword });
      toast.success('Password reset successfully');
      loadUsers();
    } catch (error: any) {
      toast.error('Error resetting password: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to deactivate this user? This action can be reversed.')) return;

    try {
      await api.delete(`/api/users/${userId}`);
      toast.success('User deactivated');
      loadUsers();
    } catch (error: any) {
      toast.error('Error deactivating user');
    }
  };

  // Filtrado y ordenamiento
  const filteredUsers = users
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchQuery.toLowerCase());
      // Normalizar roles a mayúsculas para comparación
      const userRoleUpper = user.role.toUpperCase();
      const filterRoleUpper = filterRole.toUpperCase();
      const matchesRole = filterRole === 'all' || userRoleUpper === filterRoleUpper;
      const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0; // sales: requiere stats del backend
    });

  // Paginación
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getRoleBadgeColor = (role: string) => {
    const roleUpper = role.toUpperCase(); // Normalizar a mayúsculas
    switch (roleUpper) {
      case 'ADMIN': return 'bg-purple-100 text-purple-700';
      case 'USER': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    return status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users Management</h1>
          <p className="text-gray-600">Manage system users, roles and permissions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Admin Panel
          </button>
          <button
            onClick={openNewUserModal}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            New User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filter by Role */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="USER">User</option>
          </select>

          {/* Filter by Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Sort by */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="created">Sort by: Created</option>
            <option value="name">Sort by: Name</option>
            <option value="sales">Sort by: Sales</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            )}
            {paginatedUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-700 font-medium text-sm">
                          {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">ID: {user.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{user.email}</div>
                  {user.phone && <div className="text-sm text-gray-500">{user.phone}</div>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                    {user.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(user.status)}`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => loadUserDetails(user.id)}
                      className="text-primary-600 hover:text-primary-900"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleUserStatus(user.id, user.status)}
                      className="text-gray-600 hover:text-gray-900"
                      title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                    >
                      {user.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => resetPassword(user.id)}
                      className="text-yellow-600 hover:text-yellow-900"
                      title="Reset Password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => navigate(`/reports?userId=${user.id}`)}
                      className="text-green-600 hover:text-green-900"
                      title="View Stats"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Deactivate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
          <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Modal: User Details */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">User Details</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Personal Info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Personal Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Name</div>
                    <div className="font-medium">{selectedUser.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Email</div>
                    <div className="font-medium">{selectedUser.email}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Phone</div>
                    <div className="font-medium">{selectedUser.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Role</div>
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(selectedUser.role)}`}>
                      {selectedUser.role.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              {userStats && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Statistics</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        <div className="text-sm text-blue-600">Total Products</div>
                      </div>
                      <div className="text-2xl font-bold text-blue-900">{userStats.totalProducts}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        <div className="text-sm text-green-600">Total Sales</div>
                      </div>
                      <div className="text-2xl font-bold text-green-900">{userStats.totalSales}</div>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                        <div className="text-sm text-purple-600">Revenue</div>
                      </div>
                      <div className="text-2xl font-bold text-purple-900">${userStats.totalRevenue.toFixed(2)}</div>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-yellow-600" />
                        <div className="text-sm text-yellow-600">Commissions</div>
                      </div>
                      <div className="text-2xl font-bold text-yellow-900">${userStats.commissions.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Account Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Status</div>
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(selectedUser.status)}`}>
                      {selectedUser.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Created</div>
                    <div className="font-medium">{new Date(selectedUser.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Last Login</div>
                    <div className="font-medium">{selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : 'Never'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => navigate(`/reports?userId=${selectedUser.id}`)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                View Full Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit User</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="johndoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password (leave empty to keep current)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="New password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'ADMIN' | 'USER' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formData.commissionRate}
                  onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fixed Monthly Cost</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fixedMonthlyCost}
                  onChange={(e) => setFormData({ ...formData, fixedMonthlyCost: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={updateUser}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New User */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">Create New User</h3>
              <button onClick={() => setShowNewUserModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="johndoe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'ADMIN' | 'USER' })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formData.commissionRate}
                  onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fixed Monthly Cost</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fixedMonthlyCost}
                  onChange={(e) => setFormData({ ...formData, fixedMonthlyCost: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowNewUserModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createUser}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
