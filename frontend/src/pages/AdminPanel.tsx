import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '@services/api';
import { useLiveData } from '@/hooks/useLiveData';
import { useNotificationRefetch } from '@/hooks/useNotificationRefetch';

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
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [loadingAccessRequests, setLoadingAccessRequests] = useState(false);
  const [showAccessRequestsTab, setShowAccessRequestsTab] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [showPlatformConfigTab, setShowPlatformConfigTab] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<{
    platformCommissionPct: number;
    adminPaypalEmail: string;
  } | null>(null);
  const [savingPlatformConfig, setSavingPlatformConfig] = useState(false);
  const [platformConfigForm, setPlatformConfigForm] = useState({ platformCommissionPct: 10, adminPaypalEmail: '' });

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
    loadAccessRequests();
  }, []);

  const loadPlatformConfig = async () => {
    try {
      const { data } = await api.get('/api/admin/platform-config');
      if (data?.success) {
        setPlatformConfig({
          platformCommissionPct: data.platformCommissionPct ?? 10,
          adminPaypalEmail: data.adminPaypalEmail ?? ''
        });
        setPlatformConfigForm({
          platformCommissionPct: data.platformCommissionPct ?? 10,
          adminPaypalEmail: data.adminPaypalEmail ?? ''
        });
      }
    } catch (error) {
      console.error('Error loading platform config:', error);
      toast.error('Error cargando configuración de plataforma');
    }
  };

  const savePlatformConfig = async () => {
    setSavingPlatformConfig(true);
    try {
      const { data } = await api.patch('/api/admin/platform-config', {
        platformCommissionPct: platformConfigForm.platformCommissionPct,
        adminPaypalEmail: platformConfigForm.adminPaypalEmail || undefined
      });
      if (data?.success) {
        setPlatformConfig({
          platformCommissionPct: data.platformCommissionPct ?? 10,
          adminPaypalEmail: data.adminPaypalEmail ?? ''
        });
        setPlatformConfigForm({
          platformCommissionPct: data.platformCommissionPct ?? 10,
          adminPaypalEmail: data.adminPaypalEmail ?? ''
        });
        toast.success('Configuración de plataforma actualizada');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error guardando configuración');
    } finally {
      setSavingPlatformConfig(false);
    }
  };

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

  useLiveData({ fetchFn: loadDashboard, intervalMs: 30000, enabled: true });
  useNotificationRefetch({
    handlers: {
      SALE_CREATED: () => {
        loadDashboard();
        loadAdminCommissions();
      },
      USER_ACTION: () => {
        loadDashboard();
        loadAdminCommissions();
      },
    },
    enabled: true,
  });

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

  const loadAccessRequests = async () => {
    try {
      setLoadingAccessRequests(true);
      const response = await api.get('/api/access-requests');
      setAccessRequests(response.data?.data || []);
    } catch (error: any) {
      console.error('Error loading access requests:', error);
      toast.error('Error cargando solicitudes de acceso');
    } finally {
      setLoadingAccessRequests(false);
    }
  };

  const handleApproveRequest = async () => {
    if (!selectedRequest || !tempPassword || tempPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      setLoadingAccessRequests(true);
      const response = await api.post(`/api/access-requests/${selectedRequest.id}/approve`, {
        password: tempPassword
      });
      toast.success('Solicitud aprobada y usuario creado exitosamente');
      setShowApproveModal(false);
      setSelectedRequest(null);
      setTempPassword('');
      loadAccessRequests();
      loadDashboard();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error aprobando solicitud');
    } finally {
      setLoadingAccessRequests(false);
    }
  };

  const handleRejectRequest = async (reason?: string) => {
    if (!selectedRequest) return;

    try {
      setLoadingAccessRequests(true);
      await api.post(`/api/access-requests/${selectedRequest.id}/reject`, {
        reason: reason || 'Rechazado por administrador'
      });
      toast.success('Solicitud rechazada exitosamente');
      setShowRejectModal(false);
      setSelectedRequest(null);
      loadAccessRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error rechazando solicitud');
    } finally {
      setLoadingAccessRequests(false);
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
      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <strong>Panel técnico y de administración</strong> — gestión de usuarios, comisiones y configuración de plataforma. No sustituye verdad operativa canónica (Órdenes, Ventas, Finanzas,{' '}
          <Link to="/control-center" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Centro de Control
          </Link>
          ).
        </p>
      </div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Panel de Administración</h1>
        <p className="text-xs text-slate-500">Gestiona usuarios, comisiones y configuraciones del sistema</p>
      </div>

      {/* Estadísticas — agregados admin */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 transition-colors">
          <h3 className="text-sm font-medium text-slate-500">Total Usuarios</h3>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-1">{dashboardData.totalUsers}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 transition-colors">
          <h3 className="text-sm font-medium text-slate-500">Usuarios Activos</h3>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 tabular-nums mt-1">{dashboardData.activeUsers}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 transition-colors">
          <h3 className="text-sm font-medium text-slate-500">Ingresos Totales (agregado admin)</h3>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 tabular-nums mt-1">${dashboardData.totalRevenue.toFixed(2)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Desde ledger admin — no es proof operativo</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 transition-colors">
          <h3 className="text-sm font-medium text-slate-500">Comisiones Mensuales (agregado)</h3>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 tabular-nums mt-1">${dashboardData.monthlyCommissions.toFixed(2)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Desde ledger admin</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setShowCreateUser(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ➕ Crear Usuario
        </button>
        <button
          onClick={processMonthlyCharges}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          💰 Procesar Cobros Mensuales
        </button>
        <button
          onClick={() => setShowCommissionsTab(!showCommissionsTab)}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showCommissionsTab ? '👁️ Ocultar' : '💰 Ver'} Comisiones Admin
        </button>
        <button
          onClick={() => {
            setShowPlatformConfigTab(!showPlatformConfigTab);
            if (!showPlatformConfigTab) loadPlatformConfig();
          }}
          className="bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showPlatformConfigTab ? '👁️ Ocultar' : '⚙️ Config'} Plataforma
        </button>
        <button
          onClick={() => {
            setShowAccessRequestsTab(!showAccessRequestsTab);
            if (!showAccessRequestsTab) {
              loadAccessRequests();
            }
          }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors relative"
        >
          {showAccessRequestsTab ? '👁️ Ocultar' : '📋 Ver'} Solicitudes de Acceso
          {accessRequests.filter(r => r.status === 'PENDING').length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {accessRequests.filter(r => r.status === 'PENDING').length}
            </span>
          )}
        </button>
      </div>

      {/* Comisiones Admin */}
      {showCommissionsTab && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card mb-6 transition-colors">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Comisiones de Administrador</h2>
            <p className="text-xs text-slate-500 mt-1">
              Comisiones ganadas por usuarios creados por ti
            </p>
          </div>

          {loadingCommissions ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          ) : (
            <>
              {adminCommissionStats && (
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{adminCommissionStats.total}</p>
                      <p className="text-xs text-slate-400 tabular-nums">${adminCommissionStats.totalAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pendientes</p>
                      <p className="text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">{adminCommissionStats.pending}</p>
                      <p className="text-xs text-slate-400 tabular-nums">${adminCommissionStats.pendingAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pagadas</p>
                      <p className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">{adminCommissionStats.paid}</p>
                      <p className="text-xs text-slate-400 tabular-nums">${adminCommissionStats.paidAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-950/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Usuario
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Producto
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Venta
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Monto
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                    {adminCommissions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                          No hay comisiones registradas aún
                        </td>
                      </tr>
                    ) : (
                      adminCommissions.map((commission) => (
                        <tr key={commission.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {commission.sale.user.username}
                            </div>
                            <div className="text-xs text-slate-500">{commission.sale.user.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-900 dark:text-slate-100">{commission.sale.product.title}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">#{commission.sale.orderId}</div>
                            <div className="text-xs text-slate-500 tabular-nums">${commission.sale.salePrice.toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 tabular-nums">
                              ${commission.amount.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                commission.status === 'PAID'
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                                  : commission.status === 'PENDING'
                                  ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300'
                                  : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                              }`}
                            >
                              {commission.status === 'PAID'
                                ? 'Pagada'
                                : commission.status === 'PENDING'
                                ? 'Pendiente'
                                : 'Programada'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 tabular-nums">
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

      {/* Configuración Plataforma (comisión %, PayPal admin) */}
      {showPlatformConfigTab && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card mb-6 transition-colors">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Configuración de Plataforma</h2>
            <p className="text-xs text-slate-500 mt-1">
              Comisión por venta y email PayPal para recibir las comisiones de la plataforma
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Comisión plataforma (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={platformConfigForm.platformCommissionPct}
                onChange={(e) => setPlatformConfigForm({
                  ...platformConfigForm,
                  platformCommissionPct: parseFloat(e.target.value) || 0
                })}
                className="w-full max-w-xs border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-colors"
              />
              <p className="mt-1 text-xs text-slate-500">
                Porcentaje que se retiene de la ganancia del usuario en cada venta (0-100%)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email PayPal (admin)
              </label>
              <input
                type="email"
                value={platformConfigForm.adminPaypalEmail}
                onChange={(e) => setPlatformConfigForm({
                  ...platformConfigForm,
                  adminPaypalEmail: e.target.value
                })}
                className="w-full max-w-md border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-colors"
                placeholder="admin@paypal.com"
              />
              <p className="mt-1 text-xs text-slate-500">
                Cuenta PayPal donde se reciben las comisiones de la plataforma
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={savePlatformConfig}
                disabled={savingPlatformConfig || platformConfigForm.platformCommissionPct < 0 || platformConfigForm.platformCommissionPct > 100}
                className="bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {savingPlatformConfig ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Solicitudes de Acceso */}
      {showAccessRequestsTab && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card mb-6 transition-colors">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Solicitudes de Acceso</h2>
            <p className="text-xs text-slate-500 mt-1">
              Gestiona las solicitudes de acceso al sistema
            </p>
          </div>

          {loadingAccessRequests ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Usuario</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nombre</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                  {accessRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        No hay solicitudes de acceso
                      </td>
                    </tr>
                  ) : (
                    accessRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900 dark:text-slate-100">{request.username || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900 dark:text-slate-100">{request.fullName || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              request.status === 'APPROVED'
                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                                : request.status === 'REJECTED'
                                ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
                                : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300'
                            }`}
                          >
                            {request.status === 'APPROVED' ? 'Aprobada' : request.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 tabular-nums">
                          {new Date(request.requestedAt || request.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {request.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowApproveModal(true);
                                }}
                                className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowRejectModal(true);
                                }}
                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Lista de Usuarios */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Usuarios del Sistema</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950/50">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Usuario</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Comisiones</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Balance</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estadísticas</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {dashboardData.users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.username}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                        {user.fullName && <div className="text-xs text-slate-400 dark:text-slate-500">{user.fullName}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                      {(user.commissionRate * 100).toFixed(1)}% por venta
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      ${user.fixedMonthlyCost.toFixed(2)} mensual
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">${user.balance.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 tabular-nums">Total: ${user.totalEarnings.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">{user._count.sales} ventas</div>
                    <div className="text-xs text-slate-500 tabular-nums">{user._count.products} productos</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.isActive 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
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
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-3"
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
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 w-full max-w-md transition-colors">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Crear Nuevo Usuario</h2>
            <form onSubmit={handleSubmit(onCreateUser)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre de usuario</label>
                <input
                  {...register('username')}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                {errors.username && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.username.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                {errors.email && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña Temporal</label>
                <input
                  type="password"
                  {...register('password')}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                {errors.password && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre Completo (Opcional)</label>
                <input
                  {...register('fullName')}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rol</label>
                <select
                  {...register('role')}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                >
                  <option value="USER">Usuario</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Comisión por Transacción (%) - Ejemplo: 0.15 = 15%
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...register('commissionRate', { valueAsNumber: true })}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                {errors.commissionRate && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.commissionRate.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Costo Fijo Mensual (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('fixedMonthlyCost', { valueAsNumber: true })}
                  className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                />
                {errors.fixedMonthlyCost && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.fixedMonthlyCost.message}</p>}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('isActive')}
                  className="h-4 w-4 text-blue-600 border-slate-300 dark:border-slate-600 rounded"
                />
                <label className="ml-2 block text-sm text-slate-700 dark:text-slate-300">Usuario Activo</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Creando...' : 'Crear Usuario'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateUser(false);
                    reset();
                  }}
                  className="flex-1 bg-slate-500 hover:bg-slate-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
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
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 w-full max-w-md transition-colors">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Editar Comisiones - {selectedUser.username}</h2>
            <CommissionEditor
              user={selectedUser}
              onSave={updateCommissions}
              onCancel={() => setShowCommissionModal(false)}
            />
          </div>
        </div>
      )}

      {/* Modal Aprobar Solicitud */}
      {showApproveModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 w-full max-w-md transition-colors">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Aprobar Solicitud de Acceso</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Email: <strong className="text-slate-900 dark:text-slate-100">{selectedRequest.email}</strong></p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Usuario: <strong className="text-slate-900 dark:text-slate-100">{selectedRequest.username}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Contraseña Temporal (mínimo 8 caracteres) *
                </label>
                <input
                  type="password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors"
                  placeholder="Ingresa una contraseña temporal"
                  minLength={8}
                />
                <p className="text-xs text-slate-500 mt-1">El usuario deberá cambiar esta contraseña en su primer login</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleApproveRequest}
                  disabled={loadingAccessRequests || !tempPassword || tempPassword.length < 8}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loadingAccessRequests ? 'Aprobando...' : 'Aprobar y Crear Usuario'}
                </button>
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setSelectedRequest(null);
                    setTempPassword('');
                  }}
                  className="flex-1 bg-slate-500 hover:bg-slate-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rechazar Solicitud */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-6 w-full max-w-md transition-colors">
            <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">Rechazar Solicitud de Acceso</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Email: <strong className="text-slate-900 dark:text-slate-100">{selectedRequest.email}</strong></p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Usuario: <strong className="text-slate-900 dark:text-slate-100">{selectedRequest.username}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Razón del Rechazo (opcional)
                </label>
                <textarea
                  id="rejectionReason"
                  rows={3}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors"
                  placeholder="Especifica el motivo del rechazo (opcional)"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    const reason = (document.getElementById('rejectionReason') as HTMLTextAreaElement)?.value || undefined;
                    handleRejectRequest(reason);
                  }}
                  disabled={loadingAccessRequests}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loadingAccessRequests ? 'Rechazando...' : 'Rechazar Solicitud'}
                </button>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedRequest(null);
                  }}
                  className="flex-1 bg-slate-500 hover:bg-slate-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
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
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Comisión por Transacción (%) - Actual: {(user.commissionRate * 100).toFixed(1)}%
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={commissionRate}
          onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
          className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
        />
        <p className="text-xs text-slate-500 mt-1">
          Ingresa como decimal: 0.15 = 15%, 0.20 = 20%
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Costo Fijo Mensual (USD) - Actual: ${user.fixedMonthlyCost.toFixed(2)}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={fixedMonthlyCost}
          onChange={(e) => setFixedMonthlyCost(parseFloat(e.target.value) || 0)}
          className="mt-1 block w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
        />
      </div>

      <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm">Vista Previa del Cobro Mensual:</h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 tabular-nums">
          • Costo fijo: ${fixedMonthlyCost.toFixed(2)}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          • Comisión por venta: {(commissionRate * 100).toFixed(1)}% de cada transacción exitosa
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          • Ejemplo: Si el usuario genera $1000 en ganancias, pagará: 
          ${fixedMonthlyCost.toFixed(2)} + ${(1000 * commissionRate).toFixed(2)} = ${(fixedMonthlyCost + (1000 * commissionRate)).toFixed(2)}
        </p>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={() => onSave(user.id, commissionRate, fixedMonthlyCost)}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
        >
          Guardar Cambios
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-slate-500 hover:bg-slate-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
