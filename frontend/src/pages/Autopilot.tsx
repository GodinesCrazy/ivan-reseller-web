import { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Plus, 
  Edit, 
  Trash2, 
  Clock,
  Zap,
  CheckCircle,
  XCircle,
  BarChart3,
  Activity,
  AlertCircle,
  Settings as SettingsIcon,
  Calendar,
  Target,
  TrendingUp,
  Save,
  X,
  Copy,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface Workflow {
  id: number;
  name: string;
  description?: string;
  type: 'search' | 'analyze' | 'publish' | 'reprice' | 'custom';
  enabled: boolean;
  schedule: string;
  conditions: any;
  actions: any;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  successRate: number;
  createdAt: string;
}

interface WorkflowLog {
  id: number;
  workflowId: number;
  workflowName: string;
  status: 'success' | 'failed' | 'running';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  itemsProcessed: number;
  errors?: string;
}

interface AutopilotStats {
  activeWorkflows: number;
  totalRuns: number;
  successRate: number;
  itemsProcessed: number;
  lastRunTime?: string;
}

export default function Autopilot() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [stats, setStats] = useState<AutopilotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autopilotRunning, setAutopilotRunning] = useState(false);

  // Modals
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  // Form state
  const [workflowForm, setWorkflowForm] = useState({
    name: '',
    description: '',
    type: 'search' as 'search' | 'analyze' | 'publish' | 'reprice' | 'custom',
    enabled: true,
    schedule: 'manual',
    conditions: {},
    actions: {}
  });

  // Predefined schedules
  const schedules = [
    { value: 'manual', label: 'Manual Only' },
    { value: '*/15 * * * *', label: 'Every 15 minutes' },
    { value: '0 * * * *', label: 'Every hour' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
    { value: '0 0 * * *', label: 'Daily at midnight' },
    { value: '0 9 * * *', label: 'Daily at 9 AM' },
    { value: '0 0 * * 0', label: 'Weekly (Sunday)' },
    { value: '0 0 1 * *', label: 'Monthly (1st day)' }
  ];

  useEffect(() => {
    loadData();
    checkAutopilotStatus();
  }, []);

  const loadData = async () => {
    try {
      const [workflowsRes, statsRes] = await Promise.all([
        api.get('/api/autopilot/workflows'),
        api.get('/api/autopilot/stats')
      ]);
      
      setWorkflows(workflowsRes.data?.workflows || []);
      setStats(statsRes.data?.stats || null);
    } catch (error: any) {
      toast.error('Error loading autopilot data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (workflowId?: number) => {
    try {
      const url = workflowId 
        ? `/api/autopilot/workflows/${workflowId}/logs`
        : '/api/autopilot/logs';
      const { data } = await api.get(url);
      setLogs(data?.logs || []);
      setShowLogsModal(true);
    } catch (error: any) {
      toast.error('Error loading logs');
    }
  };

  const checkAutopilotStatus = async () => {
    try {
      const { data } = await api.get('/api/autopilot/status');
      setAutopilotRunning(data?.running || false);
    } catch (error: any) {
      // Silent fail
    }
  };

  const toggleAutopilot = async () => {
    try {
      if (autopilotRunning) {
        await api.post('/api/autopilot/stop');
        toast.success('Autopilot stopped');
        setAutopilotRunning(false);
      } else {
        await api.post('/api/autopilot/start');
        toast.success('Autopilot started');
        setAutopilotRunning(true);
      }
      loadData();
    } catch (error: any) {
      toast.error('Error toggling autopilot: ' + (error.response?.data?.error || error.message));
    }
  };

  const openWorkflowModal = (workflow?: Workflow) => {
    if (workflow) {
      setSelectedWorkflow(workflow);
      setWorkflowForm({
        name: workflow.name,
        description: workflow.description || '',
        type: workflow.type,
        enabled: workflow.enabled,
        schedule: workflow.schedule,
        conditions: workflow.conditions || {},
        actions: workflow.actions || {}
      });
    } else {
      setSelectedWorkflow(null);
      setWorkflowForm({
        name: '',
        description: '',
        type: 'search',
        enabled: true,
        schedule: 'manual',
        conditions: {},
        actions: {}
      });
    }
    setShowWorkflowModal(true);
  };

  const saveWorkflow = async () => {
    if (!workflowForm.name) {
      toast.error('Workflow name is required');
      return;
    }

    try {
      if (selectedWorkflow) {
        await api.put(`/api/autopilot/workflows/${selectedWorkflow.id}`, workflowForm);
        toast.success('Workflow updated successfully');
      } else {
        await api.post('/api/autopilot/workflows', workflowForm);
        toast.success('Workflow created successfully');
      }
      setShowWorkflowModal(false);
      loadData();
    } catch (error: any) {
      toast.error('Error saving workflow: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleWorkflow = async (workflowId: number, currentStatus: boolean) => {
    try {
      await api.put(`/api/autopilot/workflows/${workflowId}`, { enabled: !currentStatus });
      toast.success(`Workflow ${!currentStatus ? 'enabled' : 'disabled'}`);
      loadData();
    } catch (error: any) {
      toast.error('Error updating workflow');
    }
  };

  const deleteWorkflow = async (workflowId: number) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
      await api.delete(`/api/autopilot/workflows/${workflowId}`);
      toast.success('Workflow deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error deleting workflow');
    }
  };

  const runWorkflow = async (workflowId: number) => {
    try {
      await api.post(`/api/autopilot/workflows/${workflowId}/run`);
      toast.success('Workflow execution started');
      loadData();
    } catch (error: any) {
      toast.error('Error running workflow: ' + (error.response?.data?.error || error.message));
    }
  };

  const duplicateWorkflow = async (workflow: Workflow) => {
    try {
      const newWorkflow = {
        ...workflow,
        name: `${workflow.name} (Copy)`,
        id: undefined,
        createdAt: undefined,
        lastRun: undefined,
        nextRun: undefined,
        runCount: 0,
        successRate: 0
      };
      await api.post('/api/autopilot/workflows', newWorkflow);
      toast.success('Workflow duplicated successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error duplicating workflow');
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'search': return 'bg-blue-100 text-blue-700';
      case 'analyze': return 'bg-purple-100 text-purple-700';
      case 'publish': return 'bg-green-100 text-green-700';
      case 'reprice': return 'bg-yellow-100 text-yellow-700';
      case 'custom': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getLogStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'running': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
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
          <h1 className="text-2xl font-bold text-gray-900">Autopilot</h1>
          <p className="text-gray-600">Configure and run automated workflows</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadLogs()}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Activity className="w-4 h-4" />
            View All Logs
          </button>
          <button
            onClick={toggleAutopilot}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              autopilotRunning 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {autopilotRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {autopilotRunning ? 'Stop Autopilot' : 'Start Autopilot'}
          </button>
          <button
            onClick={() => openWorkflowModal()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`border rounded-lg p-4 flex items-center gap-3 ${
        autopilotRunning ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className={`p-3 rounded-full ${autopilotRunning ? 'bg-green-100' : 'bg-gray-100'}`}>
          {autopilotRunning ? (
            <Activity className="w-6 h-6 text-green-600 animate-pulse" />
          ) : (
            <Pause className="w-6 h-6 text-gray-600" />
          )}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-gray-900">
            Autopilot Status: {autopilotRunning ? 'Running' : 'Stopped'}
          </div>
          <div className="text-sm text-gray-600">
            {autopilotRunning 
              ? `${stats?.activeWorkflows || 0} active workflows executing automatically`
              : 'No workflows are running. Start autopilot to enable scheduled executions.'}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Active Workflows</div>
              <div className="text-2xl font-bold text-gray-900">
                {stats?.activeWorkflows || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Runs</div>
              <div className="text-2xl font-bold text-gray-900">
                {stats?.totalRuns || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Success Rate</div>
              <div className="text-2xl font-bold text-gray-900">
                {stats?.successRate?.toFixed(1) || 0}%
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Target className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Items Processed</div>
              <div className="text-2xl font-bold text-gray-900">
                {stats?.itemsProcessed || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflows Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Workflows ({workflows.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workflows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No workflows configured yet
                  </td>
                </tr>
              )}
              {workflows.map((workflow) => (
                <tr key={workflow.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{workflow.name}</div>
                    {workflow.description && (
                      <div className="text-sm text-gray-500">{workflow.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadgeColor(workflow.type)}`}>
                      {workflow.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm text-gray-900">
                      <Clock className="w-3 h-3" />
                      {schedules.find(s => s.value === workflow.schedule)?.label || workflow.schedule}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {workflow.lastRun ? new Date(workflow.lastRun).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {workflow.nextRun ? new Date(workflow.nextRun).toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {workflow.runCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-gray-900">
                        {workflow.successRate?.toFixed(1) || 0}%
                      </div>
                      {workflow.successRate >= 80 ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : workflow.successRate >= 50 ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {workflow.enabled ? (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-700">
                        Enabled
                      </span>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-700">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => runWorkflow(workflow.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Run Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => loadLogs(workflow.id)}
                        className="text-purple-600 hover:text-purple-900"
                        title="View Logs"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openWorkflowModal(workflow)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => duplicateWorkflow(workflow)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleWorkflow(workflow.id, workflow.enabled)}
                        className="text-yellow-600 hover:text-yellow-900"
                        title={workflow.enabled ? 'Disable' : 'Enable'}
                      >
                        {workflow.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteWorkflow(workflow.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
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
      </div>

      {/* Modal: Create/Edit Workflow */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {selectedWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
              </h3>
              <button onClick={() => setShowWorkflowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Name *</label>
                <input
                  type="text"
                  value={workflowForm.name}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="E.g. Auto Search High Margin Products"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={workflowForm.description}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Optional description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Type</label>
                  <select
                    value={workflowForm.type}
                    onChange={(e) => setWorkflowForm({ ...workflowForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="search">Search Opportunities</option>
                    <option value="analyze">Analyze Products</option>
                    <option value="publish">Publish Products</option>
                    <option value="reprice">Reprice Products</option>
                    <option value="custom">Custom Workflow</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
                  <select
                    value={workflowForm.schedule}
                    onChange={(e) => setWorkflowForm({ ...workflowForm, schedule: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    {schedules.map(schedule => (
                      <option key={schedule.value} value={schedule.value}>
                        {schedule.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={workflowForm.enabled}
                    onChange={(e) => setWorkflowForm({ ...workflowForm, enabled: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Workflow Enabled</span>
                </label>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 mb-1">Workflow Configuration:</div>
                <div className="text-sm text-blue-800">
                  {workflowForm.type === 'search' && 'This workflow will search for profitable products based on configured criteria.'}
                  {workflowForm.type === 'analyze' && 'This workflow will analyze existing products for profitability and optimization.'}
                  {workflowForm.type === 'publish' && 'This workflow will automatically publish approved products to marketplaces.'}
                  {workflowForm.type === 'reprice' && 'This workflow will adjust product prices based on market conditions.'}
                  {workflowForm.type === 'custom' && 'Configure custom actions and conditions for this workflow.'}
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveWorkflow}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {selectedWorkflow ? 'Update Workflow' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Workflow Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">Workflow Execution Logs</h3>
              <button onClick={() => setShowLogsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No logs available
                        </td>
                      </tr>
                    )}
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{log.workflowName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLogStatusColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(log.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDuration(log.duration)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {log.itemsProcessed}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {log.errors || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
