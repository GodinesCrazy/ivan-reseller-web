import { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  Trash2,
  Filter,
  Search,
  Calendar,
  BarChart3,
  Play,
  Pause,
  Package,
  StopCircle,
  RotateCcw,
  Download
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

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
    
    let interval: NodeJS.Timeout | null = null;
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
      toast.success('Job retry scheduled');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error retrying job');
    }
  };

  const cancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    try {
      await api.post(`/api/jobs/${jobId}/cancel`);
      toast.success('Job cancelled');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error cancelling job');
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await api.delete(`/api/jobs/${jobId}`);
      toast.success('Job deleted');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error deleting job');
    }
  };

  const bulkRetry = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No jobs selected');
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.post(`/api/jobs/${jobId}/retry`))
      );
      toast.success(`${selectedJobs.size} jobs retry scheduled`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error retrying jobs');
    }
  };

  const bulkCancel = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No jobs selected');
      return;
    }

    if (!confirm(`Cancel ${selectedJobs.size} selected jobs?`)) return;

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.post(`/api/jobs/${jobId}/cancel`))
      );
      toast.success(`${selectedJobs.size} jobs cancelled`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error cancelling jobs');
    }
  };

  const bulkDelete = async () => {
    if (selectedJobs.size === 0) {
      toast.error('No jobs selected');
      return;
    }

    if (!confirm(`Delete ${selectedJobs.size} selected jobs?`)) return;

    try {
      await Promise.all(
        Array.from(selectedJobs).map(jobId => api.delete(`/api/jobs/${jobId}`))
      );
      toast.success(`${selectedJobs.size} jobs deleted`);
      setSelectedJobs(new Set());
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error deleting jobs');
    }
  };

  const clearCompleted = async () => {
    if (!confirm('Clear all completed jobs?')) return;

    try {
      await api.delete('/api/jobs/completed');
      toast.success('Completed jobs cleared');
      loadJobs();
      loadStats();
    } catch (error: any) {
      toast.error('Error clearing jobs');
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
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
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
      default: return 'bg-gray-100 text-gray-700';
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
          <h1 className="text-2xl font-bold text-gray-900">Job Queue</h1>
          <p className="text-gray-600">Monitor and manage background jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${
              autoRefresh ? 'bg-green-50 border-green-300' : 'hover:bg-gray-50'
            }`}
          >
            {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => { loadJobs(); loadStats(); }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Now
          </button>
          <button
            onClick={clearCompleted}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Completed
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-blue-600 mb-1">
            <RefreshCw className="w-4 h-4" />
            Active
          </div>
          <div className="text-2xl font-bold text-blue-900">{stats.active}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-yellow-600 mb-1">
            <Clock className="w-4 h-4" />
            Pending
          </div>
          <div className="text-2xl font-bold text-yellow-900">{stats.pending}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            Completed
          </div>
          <div className="text-2xl font-bold text-green-900">{stats.completed}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-red-600 mb-1">
            <XCircle className="w-4 h-4" />
            Failed
          </div>
          <div className="text-2xl font-bold text-red-900">{stats.failed}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-orange-600 mb-1">
            <AlertCircle className="w-4 h-4" />
            Delayed
          </div>
          <div className="text-2xl font-bold text-orange-900">{stats.delayed}</div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedJobs.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-blue-900">
              <strong>{selectedJobs.size}</strong> job{selectedJobs.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={bulkRetry}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
              <button
                onClick={bulkCancel}
                className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 flex items-center gap-1"
              >
                <StopCircle className="w-3 h-3" />
                Cancel
              </button>
              <button
                onClick={bulkDelete}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                onClick={() => setSelectedJobs(new Set())}
                className="px-3 py-1 border border-gray-300 text-sm rounded hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Types</option>
            <option value="publish">Publish</option>
            <option value="sync">Sync</option>
            <option value="scrape">Scrape</option>
            <option value="analyze">Analyze</option>
            <option value="import">Import</option>
            <option value="export">Export</option>
            <option value="other">Other</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="delayed">Delayed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Time</option>
            <option value="today">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={paginatedJobs.length > 0 && selectedJobs.size === paginatedJobs.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedJobs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <div>No jobs found</div>
                </td>
              </tr>
            )}
            {paginatedJobs.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(job.id)}
                    onChange={() => toggleJobSelection(job.id)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-xs font-mono text-gray-600">{job.id.slice(0, 8)}...</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{job.name}</div>
                  {job.failedReason && (
                    <div className="text-xs text-red-600 mt-1">{job.failedReason}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadgeColor(job.type)}`}>
                    {job.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(job.status)}`}>
                    {getStatusIcon(job.status)}
                    {job.status}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-32">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          job.status === 'active' ? 'bg-blue-500' :
                          'bg-gray-300'
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {job.attemptsMade !== undefined ? `${job.attemptsMade}/${job.attemptsMax || 3}` : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {formatDuration(job.processedOn || job.timestamp, job.finishedOn)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(job.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {(job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => retryJob(job.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Retry"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'active' || job.status === 'delayed') && (
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="text-yellow-600 hover:text-yellow-900"
                        title="Cancel"
                      >
                        <StopCircle className="w-4 h-4" />
                      </button>
                    )}
                    {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => deleteJob(job.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
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
        <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
          <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} jobs
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
    </div>
  );
}

