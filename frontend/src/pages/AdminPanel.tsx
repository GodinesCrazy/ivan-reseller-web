import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '@services/api';

const userCreationSchema = z.object({
  username: z.string().min(3, 'Username debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres'),
  fullName: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']),
  commissionRate: z.number().min(0).max(1).step(0.01),
  fixedMonthlyCost: z.number().min(0).step(0.01),
  isActive: z.boolean().default(true)
});

type UserCreationForm = z.infer<typeof userCreationSchema>;

interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  role: string;
  commissionRate: number;
  fixedMonthlyCost: number;
  balance: number;
  totalEarnings: number;
  totalSales: number;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  _count: {
    sales: number;
    products: number;
    commissions: number;
  };
}

interface DashboardData {
  users: User[];
  totalUsers: number;
  activeUsers: number;
  totalRevenue: number;
  monthlyCommissions: number;
}

interface AdminCommission {
  id: number;
  amount: number;
  status: 'PENDING' | 'PAID' | 'SCHEDULED';
  createdAt: string;
  sale: {
    id: number;
    orderId: string;
    salePrice: number;
    user: {
      id: number;
      username: string;
      email: string;
    };
    product: {
      id: number;
      title: string;
    };
  };
}

interface AdminCommissionStats {
  total: number;
  pending: number;
  paid: number;
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
}

export default function AdminPanel() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [adminCommissions, setAdminCommissions] = useState<AdminCommission[]>([]);
  const [adminCommissionStats, setAdminCommissionStats] = useState<AdminCommissionStats | null>(null);
  const [loadingCommissions, setLoadingCommissions] = useState(false);
  const [showCommissionsTab, setShowCommissionsTab] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<UserCreationForm>({
    resolver: zodResolver(userCreationSchema),
    defaultValues: {
      role: 'USER',
      commissionRate: 0.15, // 15% por defecto
      fixedMonthlyCost: 17, // $17 USD por defecto
      isActive: true
    }
  });

  useEffect(() => {
    loadDashboard();
    loadAdminCommissions();
  }, []);

  const loadAdminCommissions = async () => {
    try {
      setLoadingCommissions(true);
      const [commissionsRes, statsRes] = await Promise.all([
        api.get('/api/admin/commissions'),
        api.get('/api/admin/commissions/stats')
      ]);
      setAdminCommissions(commissionsRes.data?.commissions || []);
      setAdminCommissionStats(statsRes.data?.stats || null);
    } catch (error: any) {
      console.error('Error loading admin commissions:', error);
      toast.error('Error cargando comisiones de admin');
    } finally {
      setLoadingCommissions(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const response = await api.get('/api/admin/dashboard');
      setDashboardData(response.data.data);
    } catch (error) {
      toast.error('Error cargando dashboard');
    }
  };

  const onCreateUser = async (data: UserCreationForm) => {
    setIsLoading(true);
    try {
      const response = await api.post('/api/admin/users', data);
      toast.success('Usuario creado exitosamente. Credenciales enviadas por email.');
      reset();
      setShowCreateUser(false);
      loadDashboard();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error creando usuario');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCommissions = async (userId: number, commissionRate: number, fixedMonthlyCost: number) => {
    try {
      await api.put(`/api/admin/users/${userId}/commissions`, {
        userId,
        commissionRate,
        fixedMonthlyCost,
        paymentDay: 1,
        autoPayment: true
      });
      toast.success('Comisiones actualizadas exitosamente');
      setShowCommissionModal(false);
      loadDashboard();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error actualizando comisiones');
    }
  };

  const processMonthlyCharges = async () => {
    if (!confirm('¿Estás seguro de procesar todos los cobros mensuales?')) return;
    
    try {
      const response = await api.post('/api/admin/charges/monthly');
      toast.success(response.data.message);
      loadDashboard();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error procesando cobros');
    }
  };

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Panel de Administración</h1>
        <p className="text-gray-600">Gestiona usuarios, comisiones y configuraciones del sistema</p>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Total Usuarios</h3>
          <p className="text-3xl font-bold text-blue-600">{dashboardData.totalUsers}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Usuarios Activos</h3>
          <p className="text-3xl font-bold text-green-600">{dashboardData.activeUsers}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Ingresos Totales</h3>
          <p className="text-3xl font-bold text-purple-600">${dashboardData.totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700">Comisiones Mensuales</h3>
          <p className="text-3xl font-bold text-orange-600">${dashboardData.monthlyCommissions.toFixed(2)}</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setShowCreateUser(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium"
        >
          ➕ Crear Usuario
        </button>
        <button
          onClick={processMonthlyCharges}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium"
        >
          💰 Procesar Cobros Mensuales
        </button>
        <button
          onClick={() => setShowCommissionsTab(!showCommissionsTab)}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium"
        >
          {showCommissionsTab ? '👁️ Ocultar' : '💰 Ver'} Comisiones Admin
        </button>
      </div>

      {/* Comisiones Admin */}
      {showCommissionsTab && (
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Comisiones de Administrador</h2>
            <p className="text-sm text-gray-600 mt-1">
              Comisiones ganadas por usuarios creados por ti
            </p>
          </div>

          {loadingCommissions ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          ) : (
            <>
              {/* Estadísticas */}
              {adminCommissionStats && (
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total</p>
                      <p className="text-xl font-bold text-gray-900">{adminCommissionStats.total}</p>
                      <p className="text-sm text-gray-500">${adminCommissionStats.totalAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Pendientes</p>
                      <p className="text-xl font-bold text-orange-600">{adminCommissionStats.pending}</p>
                      <p className="text-sm text-gray-500">${adminCommissionStats.pendingAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Pagadas</p>
                      <p className="text-xl font-bold text-green-600">{adminCommissionStats.paid}</p>
                      <p className="text-sm text-gray-500">${adminCommissionStats.paidAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista de Comisiones */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Usuario
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Producto
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Venta
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {adminCommissions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          No hay comisiones registradas aún
                        </td>
                      </tr>
                    ) : (
                      adminCommissions.map((commission) => (
                        <tr key={commission.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {commission.sale.user.username}
                            </div>
                            <div className="text-sm text-gray-500">{commission.sale.user.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{commission.sale.product.title}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">#{commission.sale.orderId}</div>
                            <div className="text-sm text-gray-500">${commission.sale.salePrice.toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-purple-600">
                              ${commission.amount.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                commission.status === 'PAID'
                                  ? 'bg-green-100 text-green-800'
                                  : commission.status === 'PENDING'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {commission.status === 'PAID'
                                ? 'Pagada'
                                : commission.status === 'PENDING'
                                ? 'Pendiente'
                                : 'Programada'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(commission.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lista de Usuarios */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Usuarios del Sistema</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comisiones</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estadísticas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {dashboardData.users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.username}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        {user.fullName && <div className="text-xs text-gray-400">{user.fullName}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {(user.commissionRate * 100).toFixed(1)}% por venta
                    </div>
                    <div className="text-sm text-gray-500">
                      ${user.fixedMonthlyCost.toFixed(2)} mensual
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">${user.balance.toFixed(2)}</div>
                    <div className="text-sm text-gray-500">Total: ${user.totalEarnings.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user._count.sales} ventas</div>
                    <div className="text-sm text-gray-500">{user._count.products} productos</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowCommissionModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Editar Comisiones
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear Usuario */}
      {showCreateUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
            <form onSubmit={handleSubmit(onCreateUser)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input
                  {...register('username')}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.username && <p className="text-red-500 text-xs">{errors.username.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Contraseña Temporal</label>
                <input
                  type="password"
                  {...register('password')}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre Completo (Opcional)</label>
                <input
                  {...register('fullName')}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Rol</label>
                <select
                  {...register('role')}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="USER">Usuario</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Comisión por Transacción (%) - Ejemplo: 0.15 = 15%
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...register('commissionRate', { valueAsNumber: true })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.commissionRate && <p className="text-red-500 text-xs">{errors.commissionRate.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Costo Fijo Mensual (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('fixedMonthlyCost', { valueAsNumber: true })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
                {errors.fixedMonthlyCost && <p className="text-red-500 text-xs">{errors.fixedMonthlyCost.message}</p>}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('isActive')}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">Usuario Activo</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md disabled:opacity-50"
                >
                  {isLoading ? 'Creando...' : 'Crear Usuario'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateUser(false);
                    reset();
                  }}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-md"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Comisiones */}
      {showCommissionModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Editar Comisiones - {selectedUser.username}</h2>
            <CommissionEditor
              user={selectedUser}
              onSave={updateCommissions}
              onCancel={() => setShowCommissionModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface CommissionEditorProps {
  user: User;
  onSave: (userId: number, commissionRate: number, fixedMonthlyCost: number) => void;
  onCancel: () => void;
}

function CommissionEditor({ user, onSave, onCancel }: CommissionEditorProps) {
  const [commissionRate, setCommissionRate] = useState(user.commissionRate);
  const [fixedMonthlyCost, setFixedMonthlyCost] = useState(user.fixedMonthlyCost);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Comisión por Transacción (%) - Actual: {(user.commissionRate * 100).toFixed(1)}%
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={commissionRate}
          onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
        />
        <p className="text-xs text-gray-500 mt-1">
          Ingresa como decimal: 0.15 = 15%, 0.20 = 20%
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Costo Fijo Mensual (USD) - Actual: ${user.fixedMonthlyCost.toFixed(2)}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={fixedMonthlyCost}
          onChange={(e) => setFixedMonthlyCost(parseFloat(e.target.value) || 0)}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>

      <div className="bg-gray-50 p-3 rounded-md">
        <h4 className="font-medium text-gray-700">Vista Previa del Cobro Mensual:</h4>
        <p className="text-sm text-gray-600">
          • Costo fijo: ${fixedMonthlyCost.toFixed(2)}
        </p>
        <p className="text-sm text-gray-600">
          • Comisión por venta: {(commissionRate * 100).toFixed(1)}% de cada transacción exitosa
        </p>
        <p className="text-sm text-gray-600">
          • Ejemplo: Si el usuario genera $1000 en ganancias, pagará: 
          ${fixedMonthlyCost.toFixed(2)} + ${(1000 * commissionRate).toFixed(2)} = ${(fixedMonthlyCost + (1000 * commissionRate)).toFixed(2)}
        </p>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={() => onSave(user.id, commissionRate, fixedMonthlyCost)}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md"
        >
          Guardar Cambios
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-md"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}