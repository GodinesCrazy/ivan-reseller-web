import { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Globe,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Trash2,
  TestTube,
  Loader2,
  Info
} from 'lucide-react';
import api from '../services/api';

// Tipos según backend
interface APICredential {
  id: number;
  userId: number;
  apiName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface APIStatus {
  apiName: string;
  available: boolean;
  message?: string;
  lastChecked?: string;
}

interface APIDefinition {
  name: string;
  displayName: string;
  description: string;
  fields: APIField[];
  icon: string;
  docsUrl?: string;
}

interface APIField {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'password';
  placeholder?: string;
  helpText?: string;
}

// Definiciones de APIs soportadas
const API_DEFINITIONS: Record<string, APIDefinition> = {
  ebay: {
    name: 'ebay',
    displayName: 'eBay Trading API',
    description: 'Publicar y gestionar productos en eBay',
    icon: '🛒',
    docsUrl: 'https://developer.ebay.com/api-docs/static/gs_trading-api-intro.html',
    fields: [
      { key: 'EBAY_APP_ID', label: 'App ID (Client ID)', required: true, type: 'text', placeholder: 'YourAppI-YourApp-PRD-...' },
      { key: 'EBAY_DEV_ID', label: 'Dev ID', required: true, type: 'text', placeholder: 'Your-DevI-PRD-...' },
      { key: 'EBAY_CERT_ID', label: 'Cert ID (Client Secret)', required: true, type: 'password', placeholder: 'PRD-...' },
      { key: 'EBAY_TOKEN', label: 'User Token (opcional)', required: false, type: 'password', placeholder: 'v^1.1#i^1#...' },
    ],
  },
  amazon: {
    name: 'amazon',
    displayName: 'Amazon SP-API',
    description: 'Integración con Amazon Seller Partner API',
    icon: '📦',
    docsUrl: 'https://developer-docs.amazon.com/sp-api/',
    fields: [
      { key: 'AMAZON_CLIENT_ID', label: 'Client ID (LWA)', required: true, type: 'text', placeholder: 'amzn1.application-oa2-client...' },
      { key: 'AMAZON_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password', placeholder: 'amzn1.oa2-cs.v1...' },
      { key: 'AMAZON_REFRESH_TOKEN', label: 'Refresh Token', required: true, type: 'password', placeholder: 'Atzr|IwEB...' },
      { key: 'AMAZON_REGION', label: 'Region', required: true, type: 'text', placeholder: 'us-east-1' },
    ],
  },
  mercadolibre: {
    name: 'mercadolibre',
    displayName: 'MercadoLibre API',
    description: 'Publicar productos en MercadoLibre',
    icon: '💛',
    docsUrl: 'https://developers.mercadolibre.com/',
    fields: [
      { key: 'MERCADOLIBRE_CLIENT_ID', label: 'Client ID (App ID)', required: true, type: 'text', placeholder: '1234567890123456' },
      { key: 'MERCADOLIBRE_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password', placeholder: 'abcdefghijklmnop...' },
      { key: 'MERCADOLIBRE_REDIRECT_URI', label: 'Redirect URI', required: false, type: 'text', placeholder: 'http://localhost:5173/auth/callback' },
    ],
  },
  groq: {
    name: 'groq',
    displayName: 'GROQ AI API',
    description: 'Generación de títulos y descripciones con IA',
    icon: '🤖',
    docsUrl: 'https://console.groq.com/',
    fields: [
      { key: 'GROQ_API_KEY', label: 'API Key', required: true, type: 'password', placeholder: 'gsk_...' },
    ],
  },
  scraperapi: {
    name: 'scraperapi',
    displayName: 'ScraperAPI',
    description: 'Web scraping de AliExpress y otros sitios',
    icon: '🕷️',
    docsUrl: 'https://www.scraperapi.com/documentation/',
    fields: [
      { key: 'SCRAPERAPI_KEY', label: 'API Key', required: true, type: 'password', placeholder: 'abc123def456...' },
    ],
  },
  zenrows: {
    name: 'zenrows',
    displayName: 'ZenRows API',
    description: 'Alternativa a ScraperAPI para web scraping',
    icon: '🌐',
    docsUrl: 'https://www.zenrows.com/documentation',
    fields: [
      { key: 'ZENROWS_API_KEY', label: 'API Key', required: true, type: 'password', placeholder: 'abc123def456...' },
    ],
  },
  '2captcha': {
    name: '2captcha',
    displayName: '2Captcha API',
    description: 'Resolver captchas automáticamente',
    icon: '🔐',
    docsUrl: 'https://2captcha.com/2captcha-api',
    fields: [
      { key: 'CAPTCHA_API_KEY', label: 'API Key', required: true, type: 'password', placeholder: 'abc123def456...' },
    ],
  },
  paypal: {
    name: 'paypal',
    displayName: 'PayPal Payouts',
    description: 'Pagar comisiones automáticamente',
    icon: '💳',
    docsUrl: 'https://developer.paypal.com/docs/payouts/',
    fields: [
      { key: 'PAYPAL_CLIENT_ID', label: 'Client ID', required: true, type: 'text', placeholder: 'AYSq3RDGsmBLJE...' },
      { key: 'PAYPAL_CLIENT_SECRET', label: 'Client Secret', required: true, type: 'password', placeholder: 'EGnHDxD_qRPOmeKm...' },
      { key: 'PAYPAL_MODE', label: 'Mode', required: true, type: 'text', placeholder: 'sandbox o live' },
    ],
  },
  aliexpress: {
    name: 'aliexpress',
    displayName: 'AliExpress API',
    description: 'Búsqueda y tracking de productos',
    icon: '🛍️',
    docsUrl: 'https://developers.aliexpress.com/',
    fields: [
      { key: 'ALIEXPRESS_APP_KEY', label: 'App Key', required: true, type: 'text', placeholder: '12345678' },
      { key: 'ALIEXPRESS_APP_SECRET', label: 'App Secret', required: true, type: 'password', placeholder: 'abc123def456...' },
    ],
  },
};

export default function APISettings() {
  const [credentials, setCredentials] = useState<APICredential[]>([]);
  const [statuses, setStatuses] = useState<Record<string, APIStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedApi, setExpandedApi] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      // Cargar lista de APIs disponibles desde /api/settings/apis
      const apisResponse = await api.get('/api/settings/apis');
      const apisData = apisResponse.data?.data || [];
      
      // Convertir a formato de credenciales
      const creds: APICredential[] = apisData
        .filter((api: any) => api.status === 'configured')
        .map((api: any) => ({
          id: 0, // Se obtendrá del backend
          userId: 0,
          apiName: api.apiName || api.id,
          isActive: api.isActive || false,
          createdAt: api.lastUpdated || new Date().toISOString(),
          updatedAt: api.lastUpdated || new Date().toISOString(),
        }));
      setCredentials(creds);

      // Cargar estados de todas las APIs
      const statusMap: Record<string, APIStatus> = {};
      apisData.forEach((api: any) => {
        statusMap[api.apiName || api.id] = {
          apiName: api.apiName || api.id,
          available: api.isActive && api.status === 'configured',
          message: api.status === 'configured' ? undefined : 'No configurada',
        };
      });
      setStatuses(statusMap);
    } catch (err: any) {
      console.error('Error loading credentials:', err);
      if (err.response?.status === 404) {
        setError('Route not found. Verificando configuración del backend...');
      } else {
        setError(err.response?.data?.message || err.message || 'Error al cargar credenciales');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (apiName: string, fieldKey: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [apiName]: {
        ...(prev[apiName] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSave = async (apiName: string) => {
    setSaving(apiName);
    setError(null);
    try {
      const apiDef = API_DEFINITIONS[apiName];
      const credentials: Record<string, string> = {};

      // Validar campos requeridos
      for (const field of apiDef.fields) {
        const value = formData[apiName]?.[field.key] || '';
        if (field.required && !value.trim()) {
          throw new Error(`El campo "${field.label}" es requerido`);
        }
        if (value.trim()) {
          credentials[field.key] = value.trim();
        }
      }

      // Guardar credencial usando /api/credentials
      await api.post('/api/credentials', {
        apiName,
        environment: 'production', // Por defecto production
        credentials,
        isActive: true,
      });

      // Recargar credenciales
      await loadCredentials();

      // Limpiar formulario
      setFormData(prev => ({ ...prev, [apiName]: {} }));
      setExpandedApi(null);

      alert(`✅ Credenciales de ${apiDef.displayName} guardadas exitosamente`);
    } catch (err: any) {
      console.error('Error saving credentials:', err);
      setError(err.response?.data?.message || err.message || 'Error al guardar credenciales');
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (apiName: string) => {
    setTesting(apiName);
    setError(null);
    try {
      // Probar conexión - usar endpoint de settings si existe
      const response = await api.post('/api/credentials/test', {
        apiName,
      });

      const status = response.data;
      if (status.available) {
        alert(`✅ Conexión exitosa con ${API_DEFINITIONS[apiName].displayName}`);
      } else {
        alert(`❌ Error de conexión: ${status.message || 'No disponible'}`);
      }

      // Actualizar estado
      setStatuses(prev => ({ ...prev, [apiName]: status }));
    } catch (err: any) {
      console.error('Error testing API:', err);
      setError(err.response?.data?.message || 'Error al probar conexión');
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (apiName: string, currentActive: boolean) => {
    setError(null);
    try {
      // Toggle activo/inactivo
      const credential = getCredentialForAPI(apiName);
      if (credential) {
        await api.put(`/api/credentials/${apiName}`, {
          isActive: !currentActive,
        });
      }
      
      // Actualizar estado local
      setCredentials(prev => prev.map(cred =>
        cred.apiName === apiName ? { ...cred, isActive: !currentActive } : cred
      ));

      alert(`${currentActive ? '❌ Desactivada' : '✅ Activada'} ${API_DEFINITIONS[apiName].displayName}`);
    } catch (err: any) {
      console.error('Error toggling API:', err);
      setError(err.response?.data?.message || 'Error al cambiar estado');
    }
  };

  const handleDelete = async (apiName: string) => {
    if (!confirm(`¿Estás seguro de eliminar las credenciales de ${API_DEFINITIONS[apiName].displayName}?`)) {
      return;
    }

    setDeleting(apiName);
    setError(null);
    try {
      await api.delete(`/api/credentials/${apiName}`);
      
      // Recargar credenciales
      await loadCredentials();

      alert(`🗑️ Credenciales de ${API_DEFINITIONS[apiName].displayName} eliminadas`);
    } catch (err: any) {
      console.error('Error deleting credentials:', err);
      setError(err.response?.data?.message || 'Error al eliminar credenciales');
    } finally {
      setDeleting(null);
    }
  };

  const getCredentialForAPI = (apiName: string): APICredential | undefined => {
    return credentials.find(c => c.apiName === apiName);
  };

  const getStatusIcon = (apiName: string, credential?: APICredential) => {
    if (!credential) {
      return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
    
    if (!credential.isActive) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }

    const status = statuses[apiName];
    if (!status) {
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }

    return status.available 
      ? <CheckCircle className="w-5 h-5 text-green-500" />
      : <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getStatusText = (apiName: string, credential?: APICredential) => {
    if (!credential) return 'No configurada';
    if (!credential.isActive) return 'Desactivada';
    
    const status = statuses[apiName];
    if (!status) return 'Estado desconocido';
    
    return status.available ? 'Disponible' : `Error: ${status.message || 'No disponible'}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-800">Configuración de APIs</h1>
        </div>
        <p className="text-gray-600">
          Configura tus credenciales para las APIs de marketplaces y servicios. Las credenciales se guardan encriptadas.
        </p>
      </div>

      {/* Error Global */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            ×
          </button>
        </div>
      )}

      {/* API Cards */}
      <div className="grid gap-4">
        {Object.values(API_DEFINITIONS).map((apiDef) => {
          const credential = getCredentialForAPI(apiDef.name);
          const isExpanded = expandedApi === apiDef.name;
          const isSaving = saving === apiDef.name;
          const isTesting = testing === apiDef.name;
          const isDeleting = deleting === apiDef.name;

          return (
            <div
              key={apiDef.name}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-3xl">{apiDef.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      {apiDef.displayName}
                      {apiDef.docsUrl && (
                        <a
                          href={apiDef.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                          title="Ver documentación"
                        >
                          <Info className="w-4 h-4" />
                        </a>
                      )}
                    </h3>
                    <p className="text-sm text-gray-600">{apiDef.description}</p>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(apiDef.name, credential)}
                    <span className="text-sm font-medium text-gray-700">
                      {getStatusText(apiDef.name, credential)}
                    </span>
                  </div>

                  {/* Actions */}
                  {credential ? (
                    <div className="flex gap-2">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggle(apiDef.name, credential.isActive)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          credential.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {credential.isActive ? 'ON' : 'OFF'}
                      </button>

                      {/* Test Connection */}
                      <button
                        onClick={() => handleTest(apiDef.name)}
                        disabled={isTesting || !credential.isActive}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Probar conexión"
                      >
                        {isTesting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <TestTube className="w-5 h-5" />
                        )}
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => setExpandedApi(isExpanded ? null : apiDef.name)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        title="Editar"
                      >
                        <Key className="w-5 h-5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(apiDef.name)}
                        disabled={isDeleting}
                        className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Eliminar"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedApi(isExpanded ? null : apiDef.name)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Configurar
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Form */}
              {isExpanded && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="space-y-4">
                    {apiDef.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <div className="relative">
                          <input
                            type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                            value={formData[apiDef.name]?.[field.key] || ''}
                            onChange={(e) => handleInputChange(apiDef.name, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                              {showPasswords[field.key] ? (
                                <EyeOff className="w-5 h-5" />
                              ) : (
                                <Eye className="w-5 h-5" />
                              )}
                            </button>
                          )}
                        </div>
                        {field.helpText && (
                          <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
                        )}
                      </div>
                    ))}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleSave(apiDef.name)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save className="w-5 h-5" />
                            Guardar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setExpandedApi(null);
                          setFormData(prev => ({ ...prev, [apiDef.name]: {} }));
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Información de seguridad</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Todas las credenciales se guardan encriptadas con AES-256-GCM</li>
              <li>Solo tú puedes ver y modificar tus credenciales</li>
              <li>Las APIs inactivas no se usarán en las operaciones del sistema</li>
              <li>Puedes probar la conexión antes de activar una API</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
