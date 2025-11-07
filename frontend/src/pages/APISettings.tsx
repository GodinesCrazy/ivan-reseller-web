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
  environment: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface APIStatus {
  apiName: string;
  environment: string;
  available: boolean;
  message?: string;
  lastChecked?: string;
}

const makeEnvKey = (apiName: string, environment: string) => `${apiName}-${environment}`;

const makeFormKey = (apiName: string, environment: string) => `${apiName}::${environment}`;

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
    displayName: 'AliExpress Auto-Purchase',
    description: 'Credenciales de AliExpress para compra automática (usa automatización con navegador)',
    icon: '🛍️',
    fields: [
      { key: 'email', label: 'Email / Username', required: true, type: 'text', placeholder: 'tu-email@ejemplo.com', helpText: 'Email o username de tu cuenta de AliExpress' },
      { key: 'password', label: 'Password', required: true, type: 'password', placeholder: 'Tu contraseña de AliExpress', helpText: 'Contraseña de tu cuenta de AliExpress' },
      { key: 'twoFactorEnabled', label: '2FA Habilitado', required: false, type: 'text', placeholder: 'true o false', helpText: 'Marca "true" si tu cuenta tiene autenticación de dos factores activada' },
      { key: 'twoFactorSecret', label: '2FA Secret (TOTP)', required: false, type: 'password', placeholder: 'Solo si tienes 2FA', helpText: 'Secret para generar códigos TOTP si tienes 2FA habilitado' },
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
  const [selectedEnvironment, setSelectedEnvironment] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [loadingEnvironment, setLoadingEnvironment] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  // Estado para almacenar las definiciones de APIs del backend
  const [backendApiDefinitions, setBackendApiDefinitions] = useState<Record<string, any>>({});

  const loadCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      // Cargar lista de APIs disponibles desde /api/settings/apis
      const apisResponse = await api.get('/api/settings/apis');
      const apisData = apisResponse.data?.data || [];
      
      // Crear un mapa de definiciones de APIs del backend (para usar campos correctos)
      const backendDefs: Record<string, any> = {};
      apisData.forEach((api: any) => {
        if (api.apiName) {
          backendDefs[api.apiName] = api;
        }
      });
      setBackendApiDefinitions(backendDefs);
      
      // Cargar credenciales configuradas desde /api/credentials
      const credsResponse = await api.get('/api/credentials');
      const configuredApis = credsResponse.data?.data || [];
      
      // Crear un mapa de APIs configuradas por apiName-environment
      const configuredMap = new Map(
        configuredApis.map((c: any) => [makeEnvKey(c.apiName, c.environment || 'production'), c])
      );
      
      const defaultEnvSelection: Record<string, string> = {};
      const creds: APICredential[] = [];
      
      apisData.forEach((api: any) => {
        if (api.supportsEnvironments && api.environments) {
          const envKeys = Object.keys(api.environments);
          const preferredEnv = envKeys.find(env => configuredMap.has(makeEnvKey(api.apiName, env)))
            || (envKeys.includes('production') ? 'production' : envKeys[0]);
          defaultEnvSelection[api.apiName] = preferredEnv;
          envKeys.forEach((env: string) => {
            const envData = (api.environments?.[env] ?? {}) as any;
            const key = makeEnvKey(api.apiName, env);
            const configured = configuredMap.get(key) as any;
            creds.push({
              id: configured ? 1 : 0,
              userId: 0,
              apiName: api.apiName,
              environment: env,
              isActive: configured?.isActive || envData.isActive || false,
              createdAt: configured?.updatedAt || envData.lastUpdated || new Date().toISOString(),
              updatedAt: configured?.updatedAt || envData.lastUpdated || new Date().toISOString(),
            });
          });
        } else {
          const key = makeEnvKey(api.apiName, 'production');
          const configured = configuredMap.get(key) as any;
          defaultEnvSelection[api.apiName] = 'production';
          creds.push({
            id: configured ? 1 : 0,
            userId: 0,
            apiName: api.apiName,
            environment: 'production',
            isActive: configured?.isActive || api.isActive || false,
            createdAt: configured?.updatedAt || api.lastUpdated || new Date().toISOString(),
            updatedAt: configured?.updatedAt || api.lastUpdated || new Date().toISOString(),
          });
        }
      });
      setCredentials(creds);
      setFormData({});
      setLoadingEnvironment({});
      setSelectedEnvironment(prev => {
        const next = { ...prev };
        Object.entries(defaultEnvSelection).forEach(([apiName, env]) => {
          if (!next[apiName]) {
            next[apiName] = env;
          }
        });
        return next;
      });
      
      // Construir mapa de estados por entorno (simple, basado en activación)
      const statusMap: Record<string, APIStatus> = {};
      creds.forEach((cred) => {
        statusMap[makeEnvKey(cred.apiName, cred.environment)] = {
          apiName: cred.apiName,
          environment: cred.environment,
          available: cred.isActive,
          message: cred.isActive ? undefined : 'No configurada',
          lastChecked: undefined,
        };
      });
      try {
        const statusResponse = await api.get('/api/credentials/status');
        const statusData = statusResponse.data?.data?.apis || statusResponse.data?.data || [];
        const normalize = (value: string) => value?.toString().toLowerCase().replace(/[^a-z0-9]/g, '') || '';
        const statusLookup = new Map<string, any>();
        if (Array.isArray(statusData)) {
          statusData.forEach((item: any) => {
            const key = normalize(item.apiName || item.name);
            if (key) {
              statusLookup.set(key, item);
            }
          });
        }

        creds.forEach((cred) => {
          const match = statusLookup.get(normalize(cred.apiName));
          if (match) {
            const available = match.isAvailable ?? match.available ?? cred.isActive;
            const messageRaw = match.message ?? match.error;
            const lastCheckedRaw = match.lastChecked ?? match.checkedAt ?? match.timestamp ?? null;
            statusMap[makeEnvKey(cred.apiName, cred.environment)] = {
              apiName: cred.apiName,
              environment: cred.environment,
              available: !!available,
              message: messageRaw ? String(messageRaw) : undefined,
              lastChecked: lastCheckedRaw ? String(lastCheckedRaw) : undefined,
            };
          }
        });
      } catch (statusError) {
        // Ignorar errores; mantendremos estado básico
      }

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

  const loadEnvironmentForm = async (apiName: string, environment: string, force = false) => {
    const formKey = makeFormKey(apiName, environment);
    if (!force && formData[formKey]) {
      return;
    }

    setLoadingEnvironment(prev => ({ ...prev, [formKey]: true }));
    try {
      const { data } = await api.get(`/api/credentials/${apiName}`, {
        params: { environment },
      });

      const creds = data?.data?.credentials || {};
      const normalized: Record<string, string> = {};
      Object.entries(creds || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          normalized[key] = '';
        } else if (typeof value === 'boolean') {
          normalized[key] = value ? 'true' : 'false';
        } else {
          normalized[key] = String(value);
        }
      });

      setFormData(prev => ({ ...prev, [formKey]: normalized }));
    } catch (error) {
      setFormData(prev => ({ ...prev, [formKey]: prev[formKey] || {} }));
    } finally {
      setLoadingEnvironment(prev => ({ ...prev, [formKey]: false }));
    }
  };

  const handleEnvironmentSelect = (apiName: string, environment: string) => {
    setSelectedEnvironment(prev => ({ ...prev, [apiName]: environment }));
    loadEnvironmentForm(apiName, environment, true);
  };

  const handleInputChange = (apiName: string, environment: string, fieldKey: string, value: string) => {
    const formKey = makeFormKey(apiName, environment);
    setFormData(prev => ({
      ...prev,
      [formKey]: {
        ...(prev[formKey] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSave = async (apiName: string) => {
    setSaving(apiName);
    setError(null);
    try {
      const apiDef = API_DEFINITIONS[apiName];
      const backendDef = backendApiDefinitions[apiName];
      const supportsEnv = backendDef?.supportsEnvironments;
      const currentEnvironment = supportsEnv
        ? selectedEnvironment[apiName] || 'production'
        : 'production';
      const formKey = makeFormKey(apiName, currentEnvironment);
      const fieldsToUse = supportsEnv
        ? backendDef?.environments?.[currentEnvironment]?.fields || apiDef.fields
        : backendDef?.fields || apiDef.fields;
      
      const credentials: Record<string, any> = {};

      // Mapear campos del frontend a los campos esperados por el backend
      // El backend espera campos en camelCase (appId, devId, certId, etc.)
      // pero el frontend usa UPPER_CASE (EBAY_APP_ID, etc.)
      const fieldMapping: Record<string, string> = {
        'EBAY_APP_ID': 'appId',
        'EBAY_DEV_ID': 'devId',
        'EBAY_CERT_ID': 'certId',
        'EBAY_TOKEN': 'authToken',
        'AMAZON_CLIENT_ID': 'clientId',
        'AMAZON_CLIENT_SECRET': 'clientSecret',
        'AMAZON_REFRESH_TOKEN': 'refreshToken',
        'AMAZON_REGION': 'region',
        'MERCADOLIBRE_CLIENT_ID': 'clientId',
        'MERCADOLIBRE_CLIENT_SECRET': 'clientSecret',
        'MERCADOLIBRE_REDIRECT_URI': 'redirectUri',
        'GROQ_API_KEY': 'apiKey',
        'SCRAPERAPI_KEY': 'apiKey',
        'ZENROWS_API_KEY': 'apiKey',
        'CAPTCHA_API_KEY': 'apiKey',
        'PAYPAL_CLIENT_ID': 'clientId',
        'PAYPAL_CLIENT_SECRET': 'clientSecret',
        'PAYPAL_MODE': 'environment',
        // AliExpress usa email/password directamente del backend
        'email': 'email',
        'password': 'password',
        'twoFactorEnabled': 'twoFactorEnabled',
        'twoFactorSecret': 'twoFactorSecret',
      };

      // Validar campos requeridos y mapear
      for (const field of fieldsToUse) {
        // Normalizar campo del backend o del frontend
        const fieldKey = field.key;
        const fieldRequired = field.required !== undefined ? field.required : (field.required || false);
        const fieldLabel = field.label || fieldKey;

        if (field.disabled) {
          continue;
        }
        
        const rawValue = formData[formKey]?.[fieldKey] ?? (field.value !== undefined && field.value !== null ? String(field.value) : '');
        const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');

        if (fieldRequired && !value.toString().trim()) {
          throw new Error(`El campo "${fieldLabel}" es requerido`);
        }
        // Incluir campos incluso si están vacíos para AliExpress (twoFactorEnabled puede ser false)
        if (value.trim() || (apiName === 'aliexpress' && fieldKey === 'twoFactorEnabled')) {
          // Mapear el nombre del campo al formato esperado por el backend
          const backendKey = fieldMapping[fieldKey] || fieldKey;
          
          // Manejar campos booleanos
          if (fieldKey === 'twoFactorEnabled') {
            credentials[backendKey] = value.trim().toLowerCase() === 'true';
          } else if (value.trim()) {
            credentials[backendKey] = value.trim();
          }
        }
      }

      // Agregar campos específicos según el tipo de API
      if (apiName === 'ebay') {
        credentials.sandbox = currentEnvironment === 'sandbox';
      } else if (apiName === 'amazon') {
        credentials.sandbox = currentEnvironment === 'sandbox';
        // Si no se proporciona region, usar default
        if (!credentials.region) {
          credentials.region = 'us-east-1';
        }
      } else if (apiName === 'mercadolibre') {
        credentials.sandbox = currentEnvironment === 'sandbox';
      } else if (apiName === 'paypal') {
        // PayPal usa 'environment' en lugar de 'sandbox'
        if (credentials.environment === 'sandbox') {
          credentials.environment = 'sandbox';
        } else {
          credentials.environment = 'live';
        }
      } else if (apiName === 'aliexpress') {
        // AliExpress: asegurar que twoFactorEnabled sea boolean (false por defecto si no se proporciona)
        if (credentials.twoFactorEnabled === undefined) {
          credentials.twoFactorEnabled = false;
        }
        // Validar que email y password estén presentes ANTES de enviar
        if (!credentials.email || !credentials.password) {
          throw new Error('Email y Password son requeridos para AliExpress');
        }
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(credentials.email)) {
          throw new Error('El email debe tener un formato válido');
        }
        // Asegurar que twoFactorSecret solo se incluya si twoFactorEnabled es true
        if (!credentials.twoFactorEnabled && credentials.twoFactorSecret) {
          delete credentials.twoFactorSecret;
        }
      }

      // Log para debugging (sin datos sensibles)
      console.log(`[APISettings] Saving ${apiName}:`, {
        apiName,
        environment: currentEnvironment,
        credentialKeys: Object.keys(credentials),
        hasEmail: !!credentials.email,
        hasPassword: !!credentials.password,
        twoFactorEnabled: credentials.twoFactorEnabled,
        twoFactorEnabledType: typeof credentials.twoFactorEnabled
      });

      // Guardar credencial usando /api/credentials
      const response = await api.post('/api/credentials', {
        apiName,
        environment: currentEnvironment,
        credentials,
        isActive: true,
      });

      console.log(`[APISettings] Save response for ${apiName}:`, response.data);

      // Recargar credenciales
      await loadCredentials();

      // Limpiar formulario
      setFormData(prev => ({ ...prev, [formKey]: {} }));
      setExpandedApi(null);

      alert(`✅ Credenciales de ${apiDef.displayName} guardadas exitosamente`);
    } catch (err: any) {
      console.error('Error saving credentials:', err);
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Error al guardar credenciales';
      setError(errorMessage);
      if (err.response?.data?.details) {
        setError(`${errorMessage}: ${JSON.stringify(err.response.data.details)}`);
      }
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (apiName: string, environment: string) => {
    setTesting(apiName);
    setError(null);
    try {
      // ✅ Obtener credenciales del formulario si están presentes
      const formKey = makeFormKey(apiName, environment);
      const currentFormData = formData[formKey] || {};
      
      // ✅ Si hay datos en el formulario, prepararlos para el test
      let testCredentials: any = null;
      if (Object.keys(currentFormData).length > 0) {
        const backendDef = backendApiDefinitions[apiName];
        const supportsEnv = backendDef?.supportsEnvironments || false;
        const currentEnvironment = environment;
        const fieldsToUse = supportsEnv
          ? backendDef?.environments?.[currentEnvironment]?.fields || []
          : backendDef?.fields || [];

        // Mapear campos del formulario a formato del backend
        // Los campos del formulario vienen con keys como 'apiKey', 'clientId', etc. (del backend)
        // No necesitamos mapear, solo usar directamente
        const fieldMapping: Record<string, string> = {
          // Mantener compatibilidad con nombres antiguos si existen
          'EBAY_APP_ID': 'appId',
          'EBAY_DEV_ID': 'devId',
          'EBAY_CERT_ID': 'certId',
          'AMAZON_SELLER_ID': 'sellerId',
          'AMAZON_CLIENT_ID': 'clientId',
          'AMAZON_CLIENT_SECRET': 'clientSecret',
          'MERCADOLIBRE_CLIENT_ID': 'clientId',
          'MERCADOLIBRE_CLIENT_SECRET': 'clientSecret',
          'GROQ_API_KEY': 'apiKey',
          'SCRAPERAPI_KEY': 'apiKey',
          'ZENROWS_API_KEY': 'apiKey',
          'CAPTCHA_API_KEY': 'apiKey',
          'PAYPAL_CLIENT_ID': 'clientId',
          'PAYPAL_CLIENT_SECRET': 'clientSecret',
          'email': 'email',
          'password': 'password',
          'twoFactorEnabled': 'twoFactorEnabled',
          'twoFactorSecret': 'twoFactorSecret',
          // Los campos del backend ya vienen con nombres correctos
          'appId': 'appId',
          'devId': 'devId',
          'certId': 'certId',
          'sellerId': 'sellerId',
          'clientId': 'clientId',
          'clientSecret': 'clientSecret',
          'apiKey': 'apiKey',
        };

        testCredentials = {};
        for (const field of fieldsToUse) {
          const fieldKey = field.key;
          const rawValue = currentFormData[fieldKey] ?? (field.value !== undefined ? String(field.value) : '');
          const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
          
          if (value.trim() || (apiName === 'aliexpress' && fieldKey === 'twoFactorEnabled')) {
            const backendKey = fieldMapping[fieldKey] || fieldKey;
            if (fieldKey === 'twoFactorEnabled') {
              testCredentials[backendKey] = value.trim().toLowerCase() === 'true';
            } else if (value.trim()) {
              testCredentials[backendKey] = value.trim();
            }
          }
        }

        // Agregar campos específicos según el tipo de API
        if (apiName === 'ebay' || apiName === 'amazon' || apiName === 'mercadolibre') {
          testCredentials.sandbox = environment === 'sandbox';
        } else if (apiName === 'paypal') {
          testCredentials.environment = environment === 'sandbox' ? 'sandbox' : 'live';
        } else if (apiName === 'aliexpress') {
          if (testCredentials.twoFactorEnabled === undefined) {
            testCredentials.twoFactorEnabled = false;
          }
        }
      }

      // Probar conexión usando el endpoint correcto: /api/credentials/:apiName/test
      // ✅ Si hay credenciales en el formulario, enviarlas para test temporal
      const response = await api.post(`/api/credentials/${apiName}/test`, {
        environment,
        ...(testCredentials && { credentials: testCredentials }), // Enviar credenciales del formulario si existen
      });

      const status = response.data?.data || response.data;
      const isAvailable = status.isAvailable || status.available || false;
      const errorMessage = status.error || status.message || 'No disponible';
      const missingFields = status.missingFields || [];

      if (isAvailable) {
        alert(`✅ Conexión exitosa con ${API_DEFINITIONS[apiName]?.displayName || apiName}`);
      } else {
        // Construir mensaje de error más descriptivo
        let errorMsg = errorMessage;
        if (missingFields && missingFields.length > 0) {
          errorMsg = `Faltan credenciales: ${missingFields.join(', ')}`;
        } else if (errorMessage === 'No disponible' || !errorMessage) {
          errorMsg = status.isConfigured === false 
            ? 'API no configurada. Por favor, guarda las credenciales primero.'
            : 'No disponible. Verifica que las credenciales sean correctas.';
        }
        alert(`❌ Error de conexión: ${errorMsg}`);
      }

      // Actualizar estado
      setStatuses(prev => ({
        ...prev,
        [makeEnvKey(apiName, environment)]: {
          apiName,
          environment,
          available: isAvailable,
          message: errorMessage,
          lastChecked: status.lastChecked || status.checkedAt || new Date().toISOString(),
        },
      }));
    } catch (err: any) {
      console.error('Error testing API:', err);
      
      // Manejar diferentes tipos de errores
      let errorMsg = 'Error al probar conexión';
      
      if (err.response) {
        // Error del servidor
        errorMsg = err.response.data?.error || 
                   err.response.data?.message || 
                   `Error del servidor: ${err.response.status} ${err.response.statusText}`;
      } else if (err.request) {
        // Error de red (sin respuesta del servidor)
        errorMsg = 'Error de conexión: No se pudo conectar con el servidor. Verifica tu conexión a internet.';
      } else {
        // Otro tipo de error
        errorMsg = err.message || 'Error desconocido al probar la conexión';
      }
      
      setError(errorMsg);
      alert(`❌ ${errorMsg}`);
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (apiName: string, environment: string, currentActive: boolean) => {
    setError(null);
    try {
      // Toggle activo/inactivo usando el endpoint correcto: /api/credentials/:apiName/toggle
      await api.put(`/api/credentials/${apiName}/toggle`, {
        environment,
      });
      
      // Recargar credenciales para obtener el estado actualizado
      await loadCredentials();

      alert(`${!currentActive ? '✅ Activada' : '❌ Desactivada'} ${API_DEFINITIONS[apiName].displayName} (${environment})`);
    } catch (err: any) {
      console.error('Error toggling API:', err);
      setError(err.response?.data?.message || 'Error al cambiar estado');
    }
  };

  const handleDelete = async (apiName: string, environment: string) => {
    if (!confirm(`¿Estás seguro de eliminar las credenciales de ${API_DEFINITIONS[apiName].displayName} (${environment})?`)) {
      return;
    }

    setDeleting(apiName);
    setError(null);
    try {
      // Eliminar usando el endpoint correcto con query parameter para environment
      await api.delete(`/api/credentials/${apiName}?environment=${environment}`);
      
      // Recargar credenciales
      await loadCredentials();

      alert(`🗑️ Credenciales de ${API_DEFINITIONS[apiName].displayName} (${environment}) eliminadas`);
    } catch (err: any) {
      console.error('Error deleting credentials:', err);
      setError(err.response?.data?.message || err.response?.data?.error || 'Error al eliminar credenciales');
    } finally {
      setDeleting(null);
    }
  };

  const getCredentialForAPI = (apiName: string, environment: string): APICredential | undefined => {
    return credentials.find(c => c.apiName === apiName && c.environment === environment);
  };

  const getStatusIcon = (apiName: string, environment: string) => {
    const credential = getCredentialForAPI(apiName, environment);
    if (!credential) {
      return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
    
    if (!credential.isActive) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }

    const status = statuses[makeEnvKey(apiName, environment)];
    if (!status) {
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }

    return status.available 
      ? <CheckCircle className="w-5 h-5 text-green-500" />
      : <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getStatusText = (apiName: string, environment: string) => {
    const credential = getCredentialForAPI(apiName, environment);
    if (!credential) return 'No configurada';
    if (!credential.isActive) return 'Desactivada';
    
    const status = statuses[makeEnvKey(apiName, environment)];
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
          const backendDef = backendApiDefinitions[apiDef.name];
          const supportsEnv = backendDef?.supportsEnvironments && backendDef?.environments;
          const envOptions: string[] = supportsEnv ? Object.keys(backendDef.environments) : ['production'];
          const currentEnvironment = supportsEnv
            ? selectedEnvironment[apiDef.name] || envOptions[0] || 'production'
            : 'production';
          const credential = getCredentialForAPI(apiDef.name, currentEnvironment);
          const statusKey = makeEnvKey(apiDef.name, currentEnvironment);
          const isExpanded = expandedApi === apiDef.name;
          const isSaving = saving === apiDef.name;
          const isTesting = testing === apiDef.name;
          const isDeleting = deleting === apiDef.name;
          const formKey = makeFormKey(apiDef.name, currentEnvironment);

          const fieldsToUse = supportsEnv
            ? backendDef?.environments?.[currentEnvironment]?.fields || apiDef.fields
            : backendDef?.fields || apiDef.fields;
          const displayName = backendDef?.name || apiDef.displayName;
          const description = backendDef?.description || apiDef.description;

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
                      {displayName}
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
                    <p className="text-sm text-gray-600">{description}</p>
                    {supportsEnv && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {envOptions.map(env => (
                          <button
                            key={env}
                            onClick={() => handleEnvironmentSelect(apiDef.name, env)}
                            className={`px-2 py-1 rounded text-xs font-medium border ${
                              currentEnvironment === env
                                ? 'bg-blue-100 border-blue-400 text-blue-700'
                                : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {env.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(apiDef.name, currentEnvironment)}
                    <span className="text-sm font-medium text-gray-700">
                      {getStatusText(apiDef.name, currentEnvironment)}
                    </span>
                  </div>

                  {/* Actions */}
                  {credential ? (
                    <div className="flex gap-2">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggle(apiDef.name, currentEnvironment, credential.isActive)}
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
                        onClick={() => handleTest(apiDef.name, currentEnvironment)}
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
                        onClick={() => {
                          const nextExpanded = isExpanded ? null : apiDef.name;
                          if (!isExpanded) {
                            loadEnvironmentForm(apiDef.name, currentEnvironment);
                          }
                          setExpandedApi(nextExpanded);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        title="Editar"
                      >
                        <Key className="w-5 h-5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(apiDef.name, currentEnvironment)}
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
                      onClick={() => {
                        const nextExpanded = isExpanded ? null : apiDef.name;
                        if (!isExpanded) {
                          loadEnvironmentForm(apiDef.name, currentEnvironment);
                        }
                        setExpandedApi(nextExpanded);
                      }}
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
                    {supportsEnv && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Entorno:</span>
                        {envOptions.map(env => (
                          <button
                            key={env}
                            onClick={() => handleEnvironmentSelect(apiDef.name, env)}
                            className={`px-2 py-1 rounded text-xs font-medium border ${
                              currentEnvironment === env
                                ? 'bg-blue-100 border-blue-400 text-blue-700'
                                : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {env.toUpperCase()}
                          </button>
                        ))}
                        {loadingEnvironment[formKey] && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}
                      </div>
                    )}

                    {fieldsToUse.map((field: any) => {
                      // Normalizar campo del backend o del frontend
                      const fieldKey = field.key;
                      const fieldLabel = field.label;
                      const fieldRequired = field.required !== undefined ? field.required : (field.required || false);
                      const fieldType = field.type === 'password' || field.type === 'email' ? field.type : 'text';
                      const fieldPlaceholder = field.placeholder || '';
                      const fieldHelpText = field.helpText;
                      const showKey = `${formKey}:${fieldKey}`;
                      const isDisabled = field.disabled || false;
                      const defaultValue = field.value !== undefined && field.value !== null ? String(field.value) : '';

                      return (
                        <div key={fieldKey}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {fieldLabel}
                            {fieldRequired && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <div className="relative">
                            <input
                              type={fieldType === 'password' && !showPasswords[showKey] ? 'password' : 'text'}
                              value={formData[formKey]?.[fieldKey] ?? defaultValue}
                              onChange={(e) => handleInputChange(apiDef.name, currentEnvironment, fieldKey, e.target.value)}
                              placeholder={fieldPlaceholder}
                              disabled={isDisabled}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                isDisabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'
                              }`}
                            />
                            {fieldType === 'password' && (
                              <button
                                type="button"
                                onClick={() => setShowPasswords(prev => ({ ...prev, [showKey]: !prev[showKey] }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                              >
                                {showPasswords[showKey] ? (
                                  <EyeOff className="w-5 h-5" />
                                ) : (
                                  <Eye className="w-5 h-5" />
                                )}
                              </button>
                            )}
                          </div>
                          {fieldHelpText && (
                            <p className="mt-1 text-xs text-gray-500">{fieldHelpText}</p>
                          )}
                        </div>
                      );
                    })}

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
                          setFormData(prev => ({ ...prev, [formKey]: {} }));
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
