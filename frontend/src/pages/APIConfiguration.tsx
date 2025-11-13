import { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  ExternalLink,
  Info,
  Zap,
  Database,
  Cloud
} from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface APIField {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'password';
  placeholder?: string;
}

interface APIConfig {
  id: number;
  name: string;
  status: 'configured' | 'not_configured' | 'error';
  environment: 'sandbox' | 'production';
  lastUsed: string | null;
  requestsToday: number;
  limit: number;
  fields: APIField[];
  description?: string;
}

export default function APIConfigurationPage() {
  const [apis, setApis] = useState<APIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<number, Record<string, string>>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchAPIConfigs();
  }, []);

  const fetchAPIConfigs = async () => {
    setLoading(true);
    try {
      // Usar endpoint correcto /api/settings/apis que existe en el backend
      const response = await api.get('/api/settings/apis');
      
      const data = response.data;
      const apisData = data?.data || data?.apis || [];
      
      // Convertir formato del backend al formato esperado por el componente
      const formattedApis: APIConfig[] = apisData.map((api: any, index: number) => {
        // Si la API soporta ambientes, usar production por defecto
        const env = api.supportsEnvironments && api.environments 
          ? api.environments.production || api.environments.sandbox
          : api;
        
        const fields = (env.fields || []).map((field: any) => ({
          key: field.key,
          label: field.label,
          required: field.required || false,
          type: field.type === 'password' ? 'password' : 'text',
          placeholder: field.placeholder
        }));
        
        return {
          id: api.id || index + 1,
          name: api.name || api.apiName || 'Unknown API',
          status: env.status === 'configured' ? 'configured' : 'not_configured',
          environment: env.status === 'configured' ? 'production' : 'sandbox',
          lastUsed: env.lastUpdated || null,
          requestsToday: 0,
          limit: 10000,
          fields,
          description: api.description
        };
      });
      
      setApis(formattedApis);
      
      // Initialize form data
      const initialFormData: Record<number, Record<string, string>> = {};
      formattedApis.forEach((api: APIConfig) => {
        initialFormData[api.id] = {};
        api.fields.forEach(field => {
          initialFormData[api.id][field.key] = '';
        });
      });
      setFormData(initialFormData);
    } catch (error) {
      console.error('Error fetching API configs:', error);
      // Si falla, mostrar mensaje pero no bloquear la UI
      setApis([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAPI = async (apiId: number, apiName: string) => {
    setSaving(apiId);
    try {
      const apiConfig = apis.find(a => a.id === apiId);
      if (!apiConfig) {
        throw new Error('API not found');
      }

      // Mapear apiName al formato correcto
      const apiNameMap: Record<string, string> = {
        'eBay API': 'ebay',
        'Amazon SP-API': 'amazon',
        'MercadoLibre API': 'mercadolibre',
        'PayPal Payouts API': 'paypal',
        'GROQ AI API': 'groq',
        'ScraperAPI': 'scraperapi',
        'ZenRows API': 'zenrows',
        '2Captcha API': '2captcha',
        'AliExpress API': 'aliexpress',
        'AliExpress Auto-Purchase': 'aliexpress' // También mapear el nombre completo del backend
      };
      
      const mappedApiName = apiNameMap[apiName] || apiName.toLowerCase().replace(/\s+/g, '');

      // Procesar credenciales según el tipo de API
      let processedCredentials: Record<string, any> = { ...formData[apiId] };

      // Procesamiento especial para AliExpress
      if (mappedApiName === 'aliexpress') {
        // Asegurar que twoFactorEnabled sea boolean
        if (processedCredentials.twoFactorEnabled !== undefined) {
          processedCredentials.twoFactorEnabled = 
            processedCredentials.twoFactorEnabled === 'true' || 
            processedCredentials.twoFactorEnabled === true;
        } else {
          processedCredentials.twoFactorEnabled = false;
        }
        
        // Validar campos requeridos
        if (!processedCredentials.email || !processedCredentials.password) {
          throw new Error('Email y Password son requeridos para AliExpress');
        }
      }

      // Procesamiento para otras APIs que necesiten conversión de tipos
      if (mappedApiName === 'ebay') {
        processedCredentials.sandbox = false;
      } else if (mappedApiName === 'amazon') {
        processedCredentials.sandbox = false;
        if (!processedCredentials.region) {
          processedCredentials.region = 'us-east-1';
        }
      } else if (mappedApiName === 'mercadolibre') {
        processedCredentials.sandbox = false;
      } else if (mappedApiName === 'paypal') {
        if (processedCredentials.environment !== 'sandbox') {
          processedCredentials.environment = 'live';
        }
      }

      // Usar endpoint unificado /api/credentials
      const response = await api.post('/api/credentials', {
        apiName: mappedApiName,
        environment: apiConfig.environment || 'production',
        credentials: processedCredentials,
        isActive: true
      });

      if (response.data) {
        const result = response.data;
        // Update API status
        setApis(prev => prev.map(a => 
          a.id === apiId 
            ? { ...a, status: 'configured' as const, lastUsed: new Date().toISOString() }
            : a
        ));
        
        // Show success message
        toast.success(`${apiName} configurada exitosamente`);
        
        // Limpiar formulario
        setFormData(prev => ({
          ...prev,
          [apiId]: {}
        }));
      }
    } catch (error: any) {
      console.error('Error saving API:', error);
      toast.error(`Error al configurar API: ${error.message || 'Error desconocido'}`);
    } finally {
      setSaving(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'configured':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Cargando configuración de APIs...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Settings className="w-8 h-8 text-blue-600" />
                Configuración de APIs
              </h1>
              <p className="text-gray-600 mt-2">
                Configura las APIs de los marketplaces y servicios para activar todas las funcionalidades
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">Encriptación AES-256</span>
            </div>
          </div>
        </div>

        {/* APIs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {apis.map((api) => (
            <div key={api.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {/* API Header */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      {api.name.includes('eBay') && <Globe className="w-6 h-6 text-blue-600" />}
                      {api.name.includes('Amazon') && <Database className="w-6 h-6 text-orange-600" />}
                      {api.name.includes('MercadoLibre') && <Zap className="w-6 h-6 text-yellow-600" />}
                      {api.name.includes('GROQ') && <Cloud className="w-6 h-6 text-purple-600" />}
                      {api.name.includes('Scraper') && <Eye className="w-6 h-6 text-green-600" />}
                      {api.name.includes('ZenRows') && <Eye className="w-6 h-6 text-blue-600" />}
                      {api.name.includes('2Captcha') && <Shield className="w-6 h-6 text-red-600" />}
                      {api.name.includes('PayPal') && <Zap className="w-6 h-6 text-blue-500" />}
                      {api.name.includes('AliExpress') && <Globe className="w-6 h-6 text-red-500" />}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{api.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(api.status)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(api.status)}`}>
                          {api.status === 'configured' ? 'Configurada' : 
                           api.status === 'error' ? 'Error' : 'No configurada'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {api.environment === 'production' ? 'Producción' : 'Sandbox'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Stats */}
                {api.status === 'configured' && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Último uso</p>
                      <p className="text-sm font-medium">
                        {api.lastUsed ? new Date(api.lastUsed).toLocaleDateString() : 'Nunca'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Hoy</p>
                      <p className="text-sm font-medium">{api.requestsToday} requests</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Límite</p>
                      <p className="text-sm font-medium">{api.limit.toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Configuration Form */}
              <div className="p-6">
                {api.description && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">{api.description}</p>
                  </div>
                )}
                
                <div className="space-y-4">
                  {api.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.placeholder && (
                        <p className="text-xs text-gray-500 mb-1">{field.placeholder}</p>
                      )}
                      <div className="relative">
                        <input
                          type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                          value={formData[api.id]?.[field.key] || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            [api.id]: {
                              ...prev[api.id],
                              [field.key]: e.target.value
                            }
                          }))}
                          placeholder={field.placeholder || `Ingresa tu ${field.label.toLowerCase()}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                        />
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(field.key)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPasswords[field.key] ? 
                              <EyeOff className="w-4 h-4" /> : 
                              <Eye className="w-4 h-4" />
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => handleSaveAPI(api.id, api.name)}
                    disabled={saving === api.id}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {saving === api.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving === api.id ? 'Guardando...' : 'Guardar Configuración'}
                  </button>
                  
                  {api.name.includes('eBay') && (
                    <a
                      href="https://developer.ebay.com/api-docs/static/gs_create-the-ebay-api-keysets.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Guía
                    </a>
                  )}
                  {api.name.includes('Amazon') && (
                    <a
                      href="https://developer-docs.amazon.com/sp-api/docs/registering-your-application"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Docs
                    </a>
                  )}
                  {api.name.includes('PayPal') && (
                    <a
                      href="https://developer.paypal.com/api/rest/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      API
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Information Panel */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Información Importante
              </h3>
              <div className="text-blue-800 space-y-2 text-sm">
                <p>• <strong>Seguridad:</strong> Todas las credenciales se encriptan con AES-256-GCM antes de almacenarse</p>
                <p>• <strong>Sandbox vs Producción:</strong> Usa sandbox para pruebas, producción para operaciones reales</p>
                <p>• <strong>Rate Limits:</strong> El sistema respeta automáticamente los límites de cada API</p>
                <p>• <strong>Monitoreo:</strong> Se registra cada uso de las APIs para auditoría y debugging</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}