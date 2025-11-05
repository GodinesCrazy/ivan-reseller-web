import { useState, useEffect } from 'react';
import { 
  Globe, 
  Plus, 
  Edit, 
  Trash2, 
  DollarSign, 
  Percent, 
  Truck, 
  Languages,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  MapPin,
  Package
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface RegionalConfig {
  id: number;
  country: string;
  countryCode: string;
  marketplace: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  shippingZone: string;
  shippingCost: number;
  freeShippingThreshold?: number;
  language: string;
  priceAdjustment: number;
  active: boolean;
}

export default function RegionalConfig() {
  const [configs, setConfigs] = useState<RegionalConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<RegionalConfig | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    country: '',
    countryCode: '',
    marketplace: '',
    currency: 'USD',
    currencySymbol: '$',
    taxRate: 0,
    shippingZone: 'domestic',
    shippingCost: 0,
    freeShippingThreshold: 0,
    language: 'en',
    priceAdjustment: 0,
    active: true
  });

  // Predefined data
  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' }
  ];

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' }
  ];

  const shippingZones = ['domestic', 'international', 'regional', 'express', 'standard', 'economy'];

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data } = await api.get('/api/regional/configs');
      setConfigs(data?.configs || []);
    } catch (error: any) {
      toast.error('Error loading regional configs: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const openModal = (config?: RegionalConfig) => {
    if (config) {
      setSelectedConfig(config);
      setFormData({
        country: config.country,
        countryCode: config.countryCode,
        marketplace: config.marketplace,
        currency: config.currency,
        currencySymbol: config.currencySymbol,
        taxRate: config.taxRate,
        shippingZone: config.shippingZone,
        shippingCost: config.shippingCost,
        freeShippingThreshold: config.freeShippingThreshold || 0,
        language: config.language,
        priceAdjustment: config.priceAdjustment,
        active: config.active
      });
    } else {
      setSelectedConfig(null);
      setFormData({
        country: '',
        countryCode: '',
        marketplace: '',
        currency: 'USD',
        currencySymbol: '$',
        taxRate: 0,
        shippingZone: 'domestic',
        shippingCost: 0,
        freeShippingThreshold: 0,
        language: 'en',
        priceAdjustment: 0,
        active: true
      });
    }
    setShowModal(true);
  };

  const saveConfig = async () => {
    if (!formData.country || !formData.countryCode || !formData.marketplace) {
      toast.error('Country, country code and marketplace are required');
      return;
    }

    try {
      if (selectedConfig) {
        await api.put(`/api/regional/configs/${selectedConfig.id}`, formData);
        toast.success('Regional config updated successfully');
      } else {
        await api.post('/api/regional/configs', formData);
        toast.success('Regional config created successfully');
      }
      setShowModal(false);
      loadConfigs();
    } catch (error: any) {
      toast.error('Error saving config: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteConfig = async (configId: number) => {
    if (!confirm('Are you sure you want to delete this regional configuration?')) return;

    try {
      await api.delete(`/api/regional/configs/${configId}`);
      toast.success('Config deleted successfully');
      loadConfigs();
    } catch (error: any) {
      toast.error('Error deleting config');
    }
  };

  const toggleStatus = async (configId: number, currentStatus: boolean) => {
    try {
      await api.put(`/api/regional/configs/${configId}`, { active: !currentStatus });
      toast.success(`Config ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadConfigs();
    } catch (error: any) {
      toast.error('Error updating config status');
    }
  };

  // Update currency symbol when currency changes
  const handleCurrencyChange = (currencyCode: string) => {
    const currency = currencies.find(c => c.code === currencyCode);
    setFormData({
      ...formData,
      currency: currencyCode,
      currencySymbol: currency?.symbol || '$'
    });
  };

  // Group configs by marketplace
  const configsByMarketplace = configs.reduce((acc, config) => {
    if (!acc[config.marketplace]) {
      acc[config.marketplace] = [];
    }
    acc[config.marketplace].push(config);
    return acc;
  }, {} as Record<string, RegionalConfig[]>);

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
          <h1 className="text-2xl font-bold text-gray-900">Regional Configuration</h1>
          <p className="text-gray-600">Currencies, taxes, shipping and language presets by country/marketplace</p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Regional Config
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Globe className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Configs</div>
              <div className="text-2xl font-bold text-gray-900">{configs.length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Active Configs</div>
              <div className="text-2xl font-bold text-gray-900">
                {configs.filter(c => c.active).length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Currencies</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Set(configs.map(c => c.currency)).size}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Languages className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Languages</div>
              <div className="text-2xl font-bold text-gray-900">
                {new Set(configs.map(c => c.language)).size}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configs by Marketplace */}
      {Object.keys(configsByMarketplace).length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No regional configurations yet</h3>
          <p className="text-gray-600 mb-4">Create your first regional config to get started</p>
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Create First Config
          </button>
        </div>
      ) : (
        Object.entries(configsByMarketplace).map(([marketplace, marketplaceConfigs]) => (
          <div key={marketplace} className="bg-white border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5" />
                {marketplace}
                <span className="text-sm font-normal text-gray-500">
                  ({marketplaceConfigs.length} {marketplaceConfigs.length === 1 ? 'config' : 'configs'})
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shipping</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Free Ship.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Language</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price Adj.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {marketplaceConfigs.map((config) => (
                    <tr key={config.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{config.country}</div>
                            <div className="text-sm text-gray-500">{config.countryCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {config.currencySymbol} {config.currency}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Percent className="w-3 h-3" />
                          {config.taxRate}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {config.currencySymbol}{config.shippingCost.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">{config.shippingZone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {config.freeShippingThreshold 
                            ? `${config.currencySymbol}${config.freeShippingThreshold}`
                            : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{config.language.toUpperCase()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${config.priceAdjustment > 0 ? 'text-green-600' : config.priceAdjustment < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {config.priceAdjustment > 0 ? '+' : ''}{config.priceAdjustment}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {config.active ? (
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
                            onClick={() => openModal(config)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleStatus(config.id, config.active)}
                            className="text-gray-600 hover:text-gray-900"
                            title={config.active ? 'Deactivate' : 'Activate'}
                          >
                            {config.active ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteConfig(config.id)}
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
        ))
      )}

      {/* Modal: Create/Edit Config */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {selectedConfig ? 'Edit Regional Config' : 'Create New Regional Config'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="United States"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country Code *</label>
                    <input
                      type="text"
                      value={formData.countryCode}
                      onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="US"
                      maxLength={2}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Marketplace *</label>
                    <input
                      type="text"
                      value={formData.marketplace}
                      onChange={(e) => setFormData({ ...formData, marketplace: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="Amazon US"
                    />
                  </div>
                </div>
              </div>

              {/* Currency & Language */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Currency & Language</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => handleCurrencyChange(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      {currencies.map(curr => (
                        <option key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.code} - {curr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                    <select
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      {languages.map(lang => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Tax & Pricing */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Tax & Pricing</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tax Rate (%)</label>
                    <input
                      type="number"
                      value={formData.taxRate}
                      onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      step={0.1}
                      min={0}
                      max={100}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Price Adjustment (%)</label>
                    <input
                      type="number"
                      value={formData.priceAdjustment}
                      onChange={(e) => setFormData({ ...formData, priceAdjustment: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      step={0.1}
                      placeholder="0 = no adjustment, +10 = +10%, -5 = -5%"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Shipping Configuration</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Zone</label>
                    <select
                      value={formData.shippingZone}
                      onChange={(e) => setFormData({ ...formData, shippingZone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      {shippingZones.map(zone => (
                        <option key={zone} value={zone}>{zone}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Cost ({formData.currencySymbol})</label>
                    <input
                      type="number"
                      value={formData.shippingCost}
                      onChange={(e) => setFormData({ ...formData, shippingCost: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      step={0.01}
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Free Ship. Threshold ({formData.currencySymbol})</label>
                    <input
                      type="number"
                      value={formData.freeShippingThreshold}
                      onChange={(e) => setFormData({ ...formData, freeShippingThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                      step={0.01}
                      min={0}
                      placeholder="0 = disabled"
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Config Active</span>
                </label>
              </div>

              {/* Preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 mb-2">Configuration Preview:</div>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>• Product at $100 will show as {formData.currencySymbol}{(100 * (1 + formData.priceAdjustment / 100)).toFixed(2)}</div>
                  <div>• Tax added: {formData.currencySymbol}{(100 * formData.taxRate / 100).toFixed(2)} ({formData.taxRate}%)</div>
                  <div>• Shipping: {formData.currencySymbol}{formData.shippingCost.toFixed(2)} ({formData.shippingZone})</div>
                  {formData.freeShippingThreshold > 0 && (
                    <div>• Free shipping over {formData.currencySymbol}{formData.freeShippingThreshold}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveConfig}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {selectedConfig ? 'Update Config' : 'Create Config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

