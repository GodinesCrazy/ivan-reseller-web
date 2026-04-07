import { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Search,
  Play,
  Pause,
  Package,
  StopCircle,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import KpiCard from '@/components/ui/KpiCard';

interface Job {
  id: string;
  name: string;
  type: 'publish' | 'sync' | 'scrape' | 'analyze' | 'import' | 'export' | 'other';
  status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'cancelled';
  progress: number;
  data: any;
  result?: any;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade?: number;
  attemptsMax?: number;
}

interface JobStats {
  total: number;
  active: number;
  completed: number;
  failed: number;
  pending: number;
  delayed: number;
}

const STATUS_LABEL_ES: Record<string, string> = {
  completed: 'Completado',
  failed: 'Fallido',
  active: 'Activo',
  pending: 'Pendiente',
  delayed: 'Retrasado',
  cancelled: 'Cancelado',
};

const TYPE_LABEL_ES: Record<string, string> = {
  publish: 'Publicar',
  sync: 'Sincronizar',
  scrape: 'Raspado',
  analyze: 'Analizar',
  import: 'Importar',
  export: 'Exportar',
  other: 'Otro',
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats>({
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    delayed: 0
  });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Selected jobs for bulk actions
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJobs();
    loadStats();
    
  let interval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadJobs();
        loadStats();
      }, 5000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const loadJobs = async () => {
    try {
      const { data } = await api.get('/api/jobs');
      setJobs(data?.jobs || []);
    } catch (error: any) {
      // Silent fail para no molestar con toasts cada 5s
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await api.get('/api/jobs/stats');
      setStats(data?.stats || stats);
    } catch (error: any) {
      // Silent fail
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await api.post(`/api/jobs/${jobId}/retry`);
      toast.success('Reintento programado');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al reintentar el trabajo');
    }
  };

  const cancelJob = async (jobId: string) => {
    if (!confirm('¿Seguro que quieres cancelar este trabajo?')) return;

    try {
      await api.post(`/api/jobs/${jobId}/cancel`);
      toast.success('Trabajo cancelado');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al cancelar el trabajo');
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('¿Seguro que quieres eliminar este trabajo?')) return;

    try {
      await api.delete(`/api/jobs/${jobId}`);
      toast.success('Trabajo eliminado');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al eliminar el trabajo');
    }
  };

  const bulkRetry = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No hay trabajos seleccionados');
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.post(`/api/jobs/${jobId}/retry`))
      );
      toast.success(`${selectedJobs.size} reintentos programados`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al reintentar trabajos');
    }
  };

  const bulkCancel = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No hay trabajos seleccionados');
      return;
    }

    if (!confirm(`¿Cancelar ${selectedJobs.size} trabajos seleccionados?`)) return;

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.post(`/api/jobs/${jobId}/cancel`))
      );
      toast.success(`${selectedJobs.size} trabajos cancelados`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al cancelar trabajos');
    }
  };

  const bulkDelete = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No hay trabajos seleccionados');
      return;
    }

    if (!confirm(`¿Eliminar ${selectedJobs.size} trabajos seleccionados?`)) return;

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.delete(`/api/jobs/${jobId}`))
      );
      toast.success(`${selectedJobs.size} trabajos eliminados`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al eliminar trabajos');
    }
  };

  const clearCompleted = async () => {
    if (!confirm('¿Eliminar todos los trabajos completados?')) return;

    try {
      await api.delete('/api/jobs/completed');
      toast.success('Trabajos completados eliminados');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error al limpiar trabajos');
    }
  };

  const toggleJobSelection = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === paginatedJobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(paginatedJobs.map(j => j.id)));
    }
  };

  // Filtering
  const filteredJobs = jobs
    .filter(job => {
      const matchesType = filterType === 'all' || job.type === filterType;
      const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
      const matchesSearch = !searchQuery || 
                           job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           job.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const jobDate = new Date(job.timestamp);
        const now = new Date();
        const diffHours = (now.getTime() - jobDate.getTime()) / (1000 * 60 * 60);
        
        if (dateFilter === 'today') matchesDate = diffHours <= 24;
        else if (dateFilter === 'week') matchesDate = diffHours <= 24 * 7;
        else if (dateFilter === 'month') matchesDate = diffHours <= 24 * 30;
      }
      
      return matchesType && matchesStatus && matchesSearch && matchesDate;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  // Pagination
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'active': return 'text-blue-600 bg-blue-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'delayed': return 'text-orange-600 bg-orange-100';
      case 'cancelled': return 'text-slate-600 bg-slate-100';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      case 'active': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'delayed': return <AlertCircle className="w-4 h-4" />;
      case 'cancelled': return <StopCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'publish': return 'bg-blue-100 text-blue-700';
      case 'sync': return 'bg-purple-100 text-purple-700';
      case 'scrape': return 'bg-green-100 text-green-700';
      case 'analyze': return 'bg-yellow-100 text-yellow-700';
      case 'import': return 'bg-cyan-100 text-cyan-700';
      case 'export': return 'bg-pink-100 text-pink-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const formatDuration = (start: number, end?: number) => {
    if (!end) return '—';
    const seconds = Math.floor((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={RefreshCw}
        title="Cola de trabajos"
        subtitle="Monitorea y gestiona trabajos en segundo plano · actualización automática cada 5s"
        badge={
          stats.active > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {stats.active} activo{stats.active !== 1 ? 's' : ''}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                autoRefresh
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              Auto-refresh {autoRefresh ? 'on' : 'off'}
            </button>
            <button
              type="button"
              onClick={() => { loadJobs(); loadStats(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={clearCompleted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar completados
            </button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Package} label="Total" value={stats.total} subtitle="todos los jobs" tone="default" />
        <KpiCard icon={RefreshCw} label="Activos" value={stats.active} subtitle="ejecutándose" tone={stats.active > 0 ? 'info' : 'default'} />
        <KpiCard icon={Clock} label="Pendientes" value={stats.pending} subtitle="en cola" tone={stats.pending > 0 ? 'warning' : 'default'} />
        <KpiCard icon={CheckCircle} label="Completados" value={stats.completed} subtitle="finalizados" tone={stats.completed > 0 ? 'success' : 'default'} />
        <KpiCard icon={XCircle} label="Fallidos" value={stats.failed} subtitle="con error" tone={stats.failed > 0 ? 'danger' : 'default'} />
        <KpiCard icon={AlertCircle} label="Retrasados" value={stats.delayed} subtitle="delayed" tone={stats.delayed > 0 ? 'warning' : 'default'} />
      </div>

      {/* Bulk Actions */}
      {selectedJobs.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <strong>{selectedJobs.size}</strong>{' '}
              {selectedJobs.size !== 1 ? 'trabajos seleccionados' : 'trabajo seleccionado'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={bulkRetry}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reintentar
              </button>
              <button
                onClick={bulkCancel}
                className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 flex items-center gap-1"
              >
                <StopCircle className="w-3 h-3" />
                Cancelar
              </button>
              <button
                onClick={bulkDelete}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Eliminar
              </button>
              <button
                onClick={() => setSelectedJobs(new Set())}
                className="px-3 py-1 border border-slate-200 dark:border-slate-800 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                Quitar selección
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o ID..."
              className="w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los tipos</option>
            <option value="publish">Publicar</option>
            <option value="sync">Sincronizar</option>
            <option value="scrape">Raspado</option>
            <option value="analyze">Analizar</option>
            <option value="import">Importar</option>
            <option value="export">Exportar</option>
            <option value="other">Otro</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="active">Activo</option>
            <option value="completed">Completado</option>
            <option value="failed">Fallido</option>
            <option value="delayed">Retrasado</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todo el período</option>
            <option value="today">Últimas 24 horas</option>
            <option value="week">Últimos 7 días</option>
            <option value="month">Últimos 30 días</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={paginatedJobs.length > 0 && selectedJobs.size === paginatedJobs.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">ID trabajo</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nombre</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Progreso</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Intentos</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Duración</th>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Creado</th>
              <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {paginatedJobs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                  <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <div>No hay trabajos</div>
                </td>
              </tr>
            )}
            {paginatedJobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(job.id)}
                    onChange={() => toggleJobSelection(job.id)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-xs font-mono text-slate-600 dark:text-slate-400">{job.id.slice(0, 8)}...</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{job.name}</div>
                  {job.failedReason && (
                    <div className="text-xs text-red-600 mt-1">{job.failedReason}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadgeColor(job.type)}`}>
                    {TYPE_LABEL_ES[job.type] ?? job.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(job.status)}`}>
                    {getStatusIcon(job.status)}
                    {STATUS_LABEL_ES[job.status] ?? job.status}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-32">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          job.status === 'active' ? 'bg-blue-500' :
                          'bg-slate-300 dark:bg-slate-600'
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                  {job.attemptsMade !== undefined ? `${job.attemptsMade}/${job.attemptsMax || 3}` : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                  {formatDuration(job.processedOn || job.timestamp, job.finishedOn)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                  {new Date(job.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {(job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => retryJob(job.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Reintentar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'active' || job.status === 'delayed') && (
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Cancelar"
                      >
                        <StopCircle className="w-4 h-4" />
                      </button>
                    )}
                    {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card px-4 py-3">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredJobs.length)} de {filteredJobs.length} trabajos
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            >
              Primera
            </button>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            <span className="px-3 py-1 text-slate-700 dark:text-slate-300">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            >
              Siguiente
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            >
              Última
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
