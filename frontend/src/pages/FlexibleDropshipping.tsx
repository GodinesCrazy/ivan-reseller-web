import { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Filter,
  Settings,
  ToggleLeft,
  ToggleRight,
  Edit,
  Trash2,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  Percent,
  ShoppingCart,
  X,
  Save,
  Copy
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface DropshippingRule {
  id: number;
  name: string;
  description?: string;
  supplierId: number;
  supplierName?: string;
  marketplace: 'amazon' | 'ebay' | 'walmart' | 'mercadolibre' | 'all';
  active: boolean;
  minMargin: number;
  maxMargin: number;
  priceMultiplier: number;
  autoRepricing: boolean;
  autoStockSync: boolean;
  priority: number;
  conditions?: any;
  createdAt: string;
  updatedAt: string;
}

interface Supplier {
  id: number;
  name: string;
  apiUrl?: string;
  apiKey?: string;
  shippingTime?: number;
  reliabilityScore?: number;
  active: boolean;
}

export default function FlexibleDropshipping() {
  const [rules, setRules] = useState<DropshippingRule[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMarketplace, setFilterMarketplace] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modals
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<DropshippingRule | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form states
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    supplierId: 0,
    marketplace: 'all' as 'amazon' | 'ebay' | 'walmart' | 'mercadolibre' | 'all',
    active: true,
    minMargin: 15,
    maxMargin: 40,
    priceMultiplier: 1.25,
    autoRepricing: true,
    autoStockSync: true,
    priority: 1
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    shippingTime: 7,
    reliabilityScore: 85,
    active: true
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rulesRes, suppliersRes] = await Promise.all([
        api.get('/api/dropshipping/rules'),
        api.get('/api/dropshipping/suppliers')
      ]);
      
      setRules(rulesRes.data?.rules || []);
      setSuppliers(suppliersRes.data?.suppliers || []);
    } catch (error: any) {
      toast.error('Error loading dropshipping data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const openRuleModal = (rule?: DropshippingRule) => {
    if (rule) {
      setSelectedRule(rule);
      setRuleForm({
        name: rule.name,
        description: rule.description || '',
        supplierId: rule.supplierId,
        marketplace: rule.marketplace,
        active: rule.active,
        minMargin: rule.minMargin,
        maxMargin: rule.maxMargin,
        priceMultiplier: rule.priceMultiplier,
        autoRepricing: rule.autoRepricing,
        autoStockSync: rule.autoStockSync,
        priority: rule.priority
      });
    } else {
      setSelectedRule(null);
      setRuleForm({
        name: '',
        description: '',
        supplierId: suppliers[0]?.id || 0,
        marketplace: 'all',
        active: true,
        minMargin: 15,
        maxMargin: 40,
        priceMultiplier: 1.25,
        autoRepricing: true,
        autoStockSync: true,
        priority: 1
      });
    }
    setShowRuleModal(true);
  };

  const openSupplierModal = (supplier?: Supplier) => {
    if (supplier) {
      setSelectedSupplier(supplier);
      setSupplierForm({
        name: supplier.name,
        apiUrl: supplier.apiUrl || '',
        apiKey: supplier.apiKey || '',
        shippingTime: supplier.shippingTime || 7,
        reliabilityScore: supplier.reliabilityScore || 85,
        active: supplier.active
      });
    } else {
      setSelectedSupplier(null);
      setSupplierForm({
        name: '',
        apiUrl: '',
        apiKey: '',
        shippingTime: 7,
        reliabilityScore: 85,
        active: true
      });
    }
    setShowSupplierModal(true);
  };

  const saveRule = async () => {
    if (!ruleForm.name || !ruleForm.supplierId) {
      toast.error('Name and supplier are required');
      return;
    }

    try {
      if (selectedRule) {
        await api.put(`/api/dropshipping/rules/${selectedRule.id}`, ruleForm);
        toast.success('Rule updated successfully');
      } else {
        await api.post('/api/dropshipping/rules', ruleForm);
        toast.success('Rule created successfully');
      }
      setShowRuleModal(false);
      loadData();
    } catch (error: any) {
      toast.error('Error saving rule: ' + (error.response?.data?.error || error.message));
    }
  };

  const saveSupplier = async () => {
    if (!supplierForm.name) {
      toast.error('Supplier name is required');
      return;
    }

    try {
      if (selectedSupplier) {
        await api.put(`/api/dropshipping/suppliers/${selectedSupplier.id}`, supplierForm);
        toast.success('Supplier updated successfully');
      } else {
        await api.post('/api/dropshipping/suppliers', supplierForm);
        toast.success('Supplier created successfully');
      }
      setShowSupplierModal(false);
      loadData();
    } catch (error: any) {
      toast.error('Error saving supplier: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleRuleStatus = async (ruleId: number, currentStatus: boolean) => {
    try {
      await api.put(`/api/dropshipping/rules/${ruleId}`, { active: !currentStatus });
      toast.success(`Rule ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadData();
    } catch (error: any) {
      toast.error('Error updating rule status');
    }
  };

  const toggleSupplierStatus = async (supplierId: number, currentStatus: boolean) => {
    try {
      await api.put(`/api/dropshipping/suppliers/${supplierId}`, { active: !currentStatus });
      toast.success(`Supplier ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadData();
    } catch (error: any) {
      toast.error('Error updating supplier status');
    }
  };

  const deleteRule = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await api.delete(`/api/dropshipping/rules/${ruleId}`);
      toast.success('Rule deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error deleting rule');
    }
  };

  const deleteSupplier = async (supplierId: number) => {
    if (!confirm('Are you sure you want to delete this supplier? All related rules will be affected.')) return;

    try {
      await api.delete(`/api/dropshipping/suppliers/${supplierId}`);
      toast.success('Supplier deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error deleting supplier');
    }
  };

  const duplicateRule = async (rule: DropshippingRule) => {
    try {
      const newRule = {
        ...rule,
        name: `${rule.name} (Copy)`,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined
      };
      await api.post('/api/dropshipping/rules', newRule);
      toast.success('Rule duplicated successfully');
      loadData();
    } catch (error: any) {
      toast.error('Error duplicating rule');
    }
  };

  // Filtrado
  const filteredRules = rules
    .filter(rule => {
      const matchesSearch = rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           rule.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMarketplace = filterMarketplace === 'all' || rule.marketplace === filterMarketplace;
      const matchesStatus = filterStatus === 'all' || 
                           (filterStatus === 'active' && rule.active) ||
                           (filterStatus === 'inactive' && !rule.active);
      return matchesSearch && matchesMarketplace && matchesStatus;
    })
    .sort((a, b) => b.priority - a.priority);

  // Paginación
  const totalPages = Math.ceil(filteredRules.length / itemsPerPage);
  const paginatedRules = filteredRules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getMarketplaceBadgeColor = (marketplace: string) => {
    switch (marketplace) {
      case 'amazon': return 'bg-orange-100 text-orange-700';
      case 'ebay': return 'bg-blue-100 text-blue-700';
      case 'walmart': return 'bg-cyan-100 text-cyan-700';
      case 'mercadolibre': return 'bg-yellow-100 text-yellow-700';
      case 'all': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const calculateProfit = (price: number, margin: number) => {
    return (price * margin / 100).toFixed(2);
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
          <h1 className="text-2xl font-bold text-gray-900">Flexible Dropshipping</h1>
          <p className="text-gray-600">Multi-supplier, multi-marketplace strategy controls</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openSupplierModal()}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Manage Suppliers
          </button>
          <button
            onClick={() => openRuleModal()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Active Rules</div>
              <div className="text-2xl font-bold text-gray-900">
                {rules.filter(r => r.active).length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Rules</div>
              <div className="text-2xl font-bold text-gray-900">{rules.length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Active Suppliers</div>
              <div className="text-2xl font-bold text-gray-900">
                {suppliers.filter(s => s.active).length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Avg. Margin</div>
              <div className="text-2xl font-bold text-gray-900">
                {rules.length > 0 
                  ? ((rules.reduce((sum, r) => sum + r.minMargin, 0) / rules.length).toFixed(1))
                  : '0'}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rules..."
              className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={filterMarketplace}
            onChange={(e) => setFilterMarketplace(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Marketplaces</option>
            <option value="amazon">Amazon</option>
            <option value="ebay">eBay</option>
            <option value="walmart">Walmart</option>
            <option value="mercadolibre">MercadoLibre</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marketplace</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Margin Range</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Multiplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auto Features</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedRules.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                  No rules found
                </td>
              </tr>
            )}
            {paginatedRules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium">
                    #{rule.priority}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                  {rule.description && (
                    <div className="text-sm text-gray-500">{rule.description}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {suppliers.find(s => s.id === rule.supplierId)?.name || 'Unknown'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getMarketplaceBadgeColor(rule.marketplace)}`}>
                    {rule.marketplace}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {rule.minMargin}% - {rule.maxMargin}%
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    ×{rule.priceMultiplier}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    {rule.autoRepricing && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Auto-repricing
                      </span>
                    )}
                    {rule.autoStockSync && (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Stock sync
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {rule.active ? (
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-700">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openRuleModal(rule)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => duplicateRule(rule)}
                      className="text-purple-600 hover:text-purple-900"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleRuleStatus(rule.id, rule.active)}
                      className="text-gray-600 hover:text-gray-900"
                      title={rule.active ? 'Deactivate' : 'Activate'}
                    >
                      {rule.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
          <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredRules.length)} of {filteredRules.length} rules
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>
      )}

      {/* Modal: Create/Edit Rule */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {selectedRule ? 'Edit Rule' : 'Create New Rule'}
              </h3>
              <button onClick={() => setShowRuleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rule Name *</label>
                  <input
                    type="text"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="E.g. High Margin Electronics"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={ruleForm.description}
                    onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    rows={2}
                    placeholder="Optional description..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier *</label>
                  <select
                    value={ruleForm.supplierId}
                    onChange={(e) => setRuleForm({ ...ruleForm, supplierId: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={0}>Select supplier</option>
                    {suppliers.filter(s => s.active).map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Marketplace</label>
                  <select
                    value={ruleForm.marketplace}
                    onChange={(e) => setRuleForm({ ...ruleForm, marketplace: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">All Marketplaces</option>
                    <option value="amazon">Amazon</option>
                    <option value="ebay">eBay</option>
                    <option value="walmart">Walmart</option>
                    <option value="mercadolibre">MercadoLibre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Min Margin (%)</label>
                  <input
                    type="number"
                    value={ruleForm.minMargin}
                    onChange={(e) => setRuleForm({ ...ruleForm, minMargin: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    min={0}
                    max={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Margin (%)</label>
                  <input
                    type="number"
                    value={ruleForm.maxMargin}
                    onChange={(e) => setRuleForm({ ...ruleForm, maxMargin: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    min={0}
                    max={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price Multiplier</label>
                  <input
                    type="number"
                    value={ruleForm.priceMultiplier}
                    onChange={(e) => setRuleForm({ ...ruleForm, priceMultiplier: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    step={0.01}
                    min={1}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <input
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    min={1}
                  />
                </div>

                <div className="col-span-2 space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.autoRepricing}
                      onChange={(e) => setRuleForm({ ...ruleForm, autoRepricing: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable Auto-Repricing</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.autoStockSync}
                      onChange={(e) => setRuleForm({ ...ruleForm, autoStockSync: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable Auto Stock Sync</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.active}
                      onChange={(e) => setRuleForm({ ...ruleForm, active: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Rule Active</span>
                  </label>
                </div>
              </div>

              {/* Example Calculation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 mb-2">Example Calculation:</div>
                <div className="text-sm text-blue-800">
                  If supplier price is $100:
                  <br />• Final price: ${(100 * ruleForm.priceMultiplier).toFixed(2)}
                  <br />• Min profit: ${calculateProfit(100, ruleForm.minMargin)} ({ruleForm.minMargin}%)
                  <br />• Max profit: ${calculateProfit(100, ruleForm.maxMargin)} ({ruleForm.maxMargin}%)
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowRuleModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {selectedRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manage Suppliers */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">Manage Suppliers</h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {/* Supplier Form */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-900 mb-4">
                  {selectedSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                    <input
                      type="text"
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="Supplier name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
                    <input
                      type="url"
                      value={supplierForm.apiUrl}
                      onChange={(e) => setSupplierForm({ ...supplierForm, apiUrl: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="https://api.supplier.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                    <input
                      type="password"
                      value={supplierForm.apiKey}
                      onChange={(e) => setSupplierForm({ ...supplierForm, apiKey: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Time (days)</label>
                    <input
                      type="number"
                      value={supplierForm.shippingTime}
                      onChange={(e) => setSupplierForm({ ...supplierForm, shippingTime: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reliability Score (%)</label>
                    <input
                      type="number"
                      value={supplierForm.reliabilityScore}
                      onChange={(e) => setSupplierForm({ ...supplierForm, reliabilityScore: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={supplierForm.active}
                        onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  {selectedSupplier && (
                    <button
                      onClick={() => {
                        setSelectedSupplier(null);
                        setSupplierForm({
                          name: '',
                          apiUrl: '',
                          apiKey: '',
                          shippingTime: 7,
                          reliabilityScore: 85,
                          active: true
                        });
                      }}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    onClick={saveSupplier}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {selectedSupplier ? 'Update' : 'Add'} Supplier
                  </button>
                </div>
              </div>

              {/* Suppliers List */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-4">Current Suppliers ({suppliers.length})</h4>
                <div className="space-y-2">
                  {suppliers.map(supplier => (
                    <div key={supplier.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{supplier.name}</div>
                        <div className="text-sm text-gray-500">
                          Shipping: {supplier.shippingTime || 'N/A'} days | 
                          Reliability: {supplier.reliabilityScore || 'N/A'}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {supplier.active ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                            Inactive
                          </span>
                        )}
                        <button
                          onClick={() => openSupplierModal(supplier)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleSupplierStatus(supplier.id, supplier.active)}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                        >
                          {supplier.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteSupplier(supplier.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {suppliers.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No suppliers configured yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
