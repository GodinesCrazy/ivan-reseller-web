import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings,
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
  Info,
  Link2,
  Pencil,
  ClipboardPaste,
  Clock,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import api from '../services/api';
import { useAuthStatusStore } from '@stores/authStatusStore';
import { useAuthStore } from '@stores/authStore';
import { toast } from 'sonner';

// Tipos según backend
interface APICredential {
  id: number;
  apiName: string;
  environment: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  scope: 'user' | 'global';
  ownerUserId?: number | null;
  sharedByUserId?: number | null;
  owner?: {
    id: number;
    username: string;
    role: string;
    fullName?: string | null;
  } | null;
  sharedBy?: {
    id: number;
    username: string;
    role: string;
    fullName?: string | null;
  } | null;
}

interface APIStatus {
  apiName: string;
  environment: string;
  available: boolean;
  message?: string;
  lastChecked?: string;
  optional?: boolean;
}

const makeEnvKey = (apiName: string, environment: string) => `${apiName}-${environment}`;

const makeFormKey = (apiName: string, environment: string) => `${apiName}::${environment}`;

const STATUS_BADGE_STYLES: Record<string, { className: string; label: string }> = {
  healthy: {
    className: 'bg-green-100 border-green-200 text-green-700',
    label: 'Sesión activa',
  },
  refreshing: {
    className: 'bg-amber-100 border-amber-200 text-amber-700',
    label: 'Renovando sesión…',
  },
  manual_required: {
    className: 'bg-red-100 border-red-200 text-red-700',
    label: 'Requiere acción manual',
  },
  error: {
    className: 'bg-orange-100 border-orange-200 text-orange-700',
    label: 'Error en reintento automático',
  },
  unknown: {
    className: 'bg-gray-100 border-gray-200 text-gray-600',
    label: 'Sin información',
  },
};

interface APIDefinition {
  name: string;
  displayName: string;
  description: string;
  fields: APIField[];
  icon: string;
  docsUrl?: string;
  supportsOAuth?: boolean;
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
    supportsOAuth: true,
    fields: [
      { key: 'EBAY_APP_ID', label: 'App ID (Client ID)', required: true, type: 'text', placeholder: 'YourAppI-YourApp-PRD-...' },
      { key: 'EBAY_DEV_ID', label: 'Dev ID', required: true, type: 'text', placeholder: 'Your-DevI-PRD-...' },
      { key: 'EBAY_CERT_ID', label: 'Cert ID (Client Secret)', required: true, type: 'password', placeholder: 'PRD-...' },
      { key: 'EBAY_REDIRECT_URI', label: 'Redirect URI (RuName)', required: true, type: 'text', placeholder: 'IvMart_IvanRese-IvanMart... (RuName)' },
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
    supportsOAuth: true,
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
  const [marketplaceDiagnostics, setMarketplaceDiagnostics] = useState<Record<string, {
    environment?: string;
    issues: string[];
    warnings: string[];
    isActive?: boolean;
    present?: boolean;
  }>>({});
  const [oauthing, setOauthing] = useState<string | null>(null);
  const [manualCookieModalOpen, setManualCookieModalOpen] = useState(false);
  const [manualCookieInput, setManualCookieInput] = useState('');
  const [manualCookieError, setManualCookieError] = useState<string | null>(null);
  const [manualCookieSaving, setManualCookieSaving] = useState(false);
  const [manualSessionToken, setManualSessionToken] = useState<string | null>(null);
  const [manualSessionStatus, setManualSessionStatus] = useState<'idle' | 'pending' | 'completed' | 'expired'>('idle');
  const [manualSessionError, setManualSessionError] = useState<string | null>(null);
  const [manualSessionExpiresAt, setManualSessionExpiresAt] = useState<string | null>(null);
  const [manualSessionLoginUrl, setManualSessionLoginUrl] = useState<string | null>(null);
  const [manualSessionLoading, setManualSessionLoading] = useState(false);
  const manualSessionPollRef = useRef<number | null>(null);
  const lastHandledManualTokenRef = useRef<string | null>(null);
  const [auditSummary, setAuditSummary] = useState<any | null>(null);
  const apiBaseUrl = useMemo(() => {
    const base = api.defaults.baseURL || window.location.origin;
    return base.replace(/\/+$/, '');
  }, []);
  const apiBaseHasApiSuffix = useMemo(() => /\/api$/i.test(apiBaseUrl), [apiBaseUrl]);
  const authUser = useAuthStore((state) => state.user);
  const isAdmin = authUser?.role === 'ADMIN';
  const currentUserId = authUser?.id ?? null;
  const [scopeSelection, setScopeSelection] = useState<Record<string, 'user' | 'global'>>({});
  const [maskedScopes, setMaskedScopes] = useState<Record<string, boolean>>({});
  const authStatuses = useAuthStatusStore((state) => state.statuses);
  const fetchAuthStatuses = useAuthStatusStore((state) => state.fetchStatuses);
  const requestAuthRefresh = useAuthStatusStore((state) => state.requestRefresh);
  const pendingManualSession = useAuthStatusStore((state) => state.pendingManualSession);
  const markManualHandled = useAuthStatusStore((state) => state.markManualHandled);

  useEffect(() => {
    loadCredentials();
  }, []);

  useEffect(() => {
    if (!authStatuses || Object.keys(authStatuses).length === 0) {
      fetchAuthStatuses();
    }
  }, [authStatuses, fetchAuthStatuses]);

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
      const configuredApisRaw: any[] = Array.isArray(credsResponse.data?.data)
        ? credsResponse.data.data
        : [];
      
      // Crear un mapa de APIs configuradas por apiName-environment priorizando credenciales personales del usuario actual
      const configuredMap = new Map<string, any>();
      configuredApisRaw.forEach((record: any) => {
        const env = record.environment || 'production';
        const key = makeEnvKey(record.apiName, env);
        const ownerId = record.ownerUserId ?? record.userId ?? null;
        const existing = configuredMap.get(key);
        if (!existing) {
          configuredMap.set(key, record);
          return;
        }

        const existingOwnerId = existing.ownerUserId ?? existing.userId ?? null;
        const existingScope = existing.scope || 'user';
        const recordScope = record.scope || 'user';
        const recordIsPersonal = recordScope === 'user' && ownerId !== null && ownerId === currentUserId;
        const existingIsPersonal =
          existingScope === 'user' && existingOwnerId !== null && existingOwnerId === currentUserId;

        // Preferir credencial personal del usuario actual
        if (!existingIsPersonal && recordIsPersonal) {
          configuredMap.set(key, record);
          return;
        }

        // Si ambas son del mismo tipo, conservar la más reciente
        if (
          existingScope === recordScope &&
          (record.updatedAt && (!existing.updatedAt || new Date(record.updatedAt).getTime() > new Date(existing.updatedAt).getTime()))
        ) {
          configuredMap.set(key, record);
          return;
        }

        // Si ninguna es personal y no hay personal disponible, preferir la más reciente
        if (!existingIsPersonal && !recordIsPersonal) {
          const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
          const recordUpdated = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
          if (recordUpdated > existingUpdated) {
            configuredMap.set(key, record);
          }
        }
      });
      
      const defaultEnvSelection: Record<string, string> = {};
      const newScopeSelection: Record<string, 'user' | 'global'> = {};
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
            const scope = (configured?.scope as 'user' | 'global') || 'user';
            newScopeSelection[key] = scope;
            creds.push({
              id: configured?.id ?? 0,
              apiName: api.apiName,
              environment: env,
              isActive: configured?.isActive ?? envData.isActive ?? false,
              createdAt: configured?.updatedAt || envData.lastUpdated || new Date().toISOString(),
              updatedAt: configured?.updatedAt || envData.lastUpdated || new Date().toISOString(),
              scope,
              ownerUserId: configured?.ownerUserId ?? configured?.userId ?? null,
              sharedByUserId: configured?.sharedByUserId ?? null,
              owner: configured?.owner ?? null,
              sharedBy: configured?.sharedBy ?? null,
            });
          });
        } else {
          const key = makeEnvKey(api.apiName, 'production');
          const configured = configuredMap.get(key) as any;
          defaultEnvSelection[api.apiName] = 'production';
          const scope = (configured?.scope as 'user' | 'global') || 'user';
          newScopeSelection[key] = scope;
          creds.push({
            id: configured?.id ?? 0,
            apiName: api.apiName,
            environment: 'production',
            isActive: configured?.isActive ?? api.isActive ?? false,
            createdAt: configured?.updatedAt || api.lastUpdated || new Date().toISOString(),
            updatedAt: configured?.updatedAt || api.lastUpdated || new Date().toISOString(),
            scope,
            ownerUserId: configured?.ownerUserId ?? configured?.userId ?? null,
            sharedByUserId: configured?.sharedByUserId ?? null,
            owner: configured?.owner ?? null,
            sharedBy: configured?.sharedBy ?? null,
          });
        }
      });
      setCredentials(creds);
      setFormData({});
      setLoadingEnvironment({});
      setMaskedScopes({});
      setScopeSelection(newScopeSelection);
      setSelectedEnvironment(prev => {
        const next = { ...prev };
        Object.entries(defaultEnvSelection).forEach(([apiName, env]) => {
          if (!next[apiName]) {
            next[apiName] = env;
          }
        });
        return next;
      });

      const marketplacesToCheck = ['ebay', 'amazon', 'mercadolibre'];
      const diagPairs = await Promise.all(
        marketplacesToCheck.map(async (mp) => {
          try {
            const { data } = await api.get('/api/marketplace/credentials', {
              params: { marketplace: mp },
            });
            const payload = data?.data || {};
            return [
              mp,
              {
                environment: payload.environment,
                issues: Array.isArray(payload.issues) ? payload.issues : [],
                warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
                isActive: payload.isActive,
                present: payload.present,
              },
            ] as const;
          } catch (diagError: any) {
            console.warn(`No se pudo obtener diagnóstico de ${mp}:`, diagError?.message || diagError);
            return [
              mp,
              {
                environment: undefined,
                issues: [`No se pudo obtener el estado de ${mp.toUpperCase()}.`],
                warnings: [],
                isActive: false,
                present: false,
              },
            ] as const;
          }
        })
      );
      const diagMap = Object.fromEntries(diagPairs);
      setMarketplaceDiagnostics(diagMap);

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

        const diag = diagMap[cred.apiName];
        if (diag) {
          if (diag.issues?.length) {
            statusMap[makeEnvKey(cred.apiName, cred.environment)] = {
              apiName: cred.apiName,
              environment: cred.environment,
              available: false,
              message: diag.issues[0],
              lastChecked: undefined,
            };
          } else if (diag.warnings?.length) {
            statusMap[makeEnvKey(cred.apiName, cred.environment)] = {
              ...statusMap[makeEnvKey(cred.apiName, cred.environment)],
              message: diag.warnings[0],
            };
          }
        }
      });
      try {
        const statusResponse = await api.get('/api/credentials/status');
        const statusData = statusResponse.data?.data?.apis || statusResponse.data?.data || [];
        const normalize = (value: string) => value?.toString().toLowerCase().replace(/[^a-z0-9]/g, '') || '';
        const statusLookup = new Map<string, any>();
        if (Array.isArray(statusData)) {
          statusData.forEach((item: any) => {
            const normalizedName = normalize(item.apiName || item.name);
            if (normalizedName) {
              statusLookup.set(normalizedName, item);
              const env = typeof item.environment === 'string' ? item.environment : 'production';
                const apiNameRaw = (item.apiName || item.name || normalizedName) as string;
                const apiNameKey = apiNameRaw.toLowerCase();
                const envKey = makeEnvKey(apiNameKey, env);
              const messageValue = item.message ?? item.error;
              statusMap[envKey] = {
                  apiName: apiNameKey,
                environment: env,
                available: Boolean(item.isAvailable ?? item.available),
                message:
                  messageValue !== undefined && messageValue !== null ? String(messageValue) : undefined,
                lastChecked: item.lastChecked ? String(item.lastChecked) : undefined,
                optional: Boolean(item.isOptional),
              };
            }
          });
        }

        creds.forEach((cred) => {
          const match = statusLookup.get(normalize(cred.apiName));
          if (match) {
            const available = match.isAvailable ?? match.available ?? cred.isActive;
            const messageRaw = match.message ?? match.error;
            const lastCheckedRaw = match.lastChecked ?? match.checkedAt ?? match.timestamp ?? null;
            const key = makeEnvKey(cred.apiName, cred.environment);
            statusMap[key] = {
              ...statusMap[key],
              apiName: cred.apiName,
              environment: cred.environment,
              available: !!available,
              message: messageRaw ? String(messageRaw) : statusMap[key]?.message,
              lastChecked: lastCheckedRaw ? String(lastCheckedRaw) : statusMap[key]?.lastChecked,
              optional: statusMap[key]?.optional ?? Boolean(match.isOptional),
            };
          }
        });
      } catch (statusError) {
        // Ignorar errores; mantendremos estado básico
      }

      try {
        const auditResponse = await api.get('/api/config-audit');
        setAuditSummary(auditResponse.data?.data || null);
      } catch (auditError) {
        setAuditSummary(null);
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

  const loadEnvironmentForm = async (
    apiName: string,
    environment: string,
    force = false,
    scopeOverride?: 'user' | 'global'
  ) => {
    const formKey = makeFormKey(apiName, environment);
    if (!force && formData[formKey]) {
      return;
    }

    setLoadingEnvironment(prev => ({ ...prev, [formKey]: true }));
    try {
      const scopeKey = makeEnvKey(apiName, environment);
      
      // APIs de marketplaces y PayPal deben ser únicamente personales
      const PERSONAL_ONLY_APIS = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
      const isPersonalOnly = PERSONAL_ONLY_APIS.includes(apiName);
      
      // Para APIs personales, siempre usar scope 'user' y no incluir globales
      const effectiveScope = isPersonalOnly ? 'user' : (scopeOverride || scopeSelection[scopeKey] || 'user');
      const includeGlobal = isPersonalOnly ? false : (scopeOverride !== 'user' && scopeSelection[scopeKey] !== 'user');
      
      const { data } = await api.get(`/api/credentials/${apiName}`, {
        params: { environment, scope: effectiveScope, includeGlobal: includeGlobal ? 'true' : 'false' },
      });

      const creds = data?.data?.credentials || {};
      const responseScope = data?.data?.scope as 'user' | 'global' | undefined;
      const masked = !!data?.data?.masked;

      // Solo actualizar scopeSelection si no hay un scopeOverride explícito
      // Esto evita que se sobrescriba cuando el usuario selecciona 'user'
      if (responseScope && !scopeOverride) {
        setScopeSelection(prev => ({
          ...prev,
          [scopeKey]: responseScope,
        }));
      } else if (scopeOverride) {
        // Si hay un scopeOverride, mantenerlo
        setScopeSelection(prev => ({
          ...prev,
          [scopeKey]: scopeOverride,
        }));
      }

      // No marcar como masked si el usuario ha seleccionado explícitamente 'user'
      // Esto permite que el usuario edite incluso si hay credenciales globales
      const userSelectedPersonal = scopeOverride === 'user' || scopeSelection[scopeKey] === 'user';
      setMaskedScopes(prev => {
        const next = { ...prev };
        if (masked && !userSelectedPersonal) {
          next[formKey] = true;
        } else {
          delete next[formKey];
        }
        return next;
      });

      let normalized: Record<string, string> = {};
      
      // Si hay credenciales, normalizarlas
      if (creds && Object.keys(creds).length > 0) {
        Object.entries(creds).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            normalized[key] = '';
          } else if (typeof value === 'boolean') {
            normalized[key] = value ? 'true' : 'false';
          } else {
            normalized[key] = String(value);
          }
        });
      }
      // Si no hay credenciales (modo personal sin credenciales guardadas),
      // normalized queda como objeto vacío {}
      // Los valores por defecto se mostrarán en el input a través de field.value

      setFormData(prev => ({ ...prev, [formKey]: normalized }));
    } catch (error) {
      setFormData(prev => ({ ...prev, [formKey]: prev[formKey] || {} }));
    } finally {
      setLoadingEnvironment(prev => ({ ...prev, [formKey]: false }));
    }
  };

  const handleEnvironmentSelect = (apiName: string, environment: string) => {
    setSelectedEnvironment(prev => ({ ...prev, [apiName]: environment }));
    const scopeKey = makeEnvKey(apiName, environment);
    const credential = getCredentialForAPI(apiName, environment);
    const scopeForEnv = credential?.scope || scopeSelection[scopeKey] || 'user';
    setScopeSelection(prev => ({ ...prev, [scopeKey]: scopeForEnv }));
    loadEnvironmentForm(apiName, environment, true, scopeForEnv);
  };

  const handleScopeChange = (apiName: string, environment: string, scope: 'user' | 'global') => {
    if (!isAdmin && scope === 'global') {
      return;
    }
    const scopeKey = makeEnvKey(apiName, environment);
    setScopeSelection(prev => ({ ...prev, [scopeKey]: scope }));
    // Limpiar datos del formulario para evitar inconsistencias
    // Pero mantener los valores por defecto de los campos si existen
    setFormData(prev => {
      const formKey = makeFormKey(apiName, environment);
      const next = { ...prev };
      // Si cambiamos a modo personal, limpiar el formulario pero mantener estructura
      if (scope === 'user') {
        delete next[formKey];
      } else {
        // Si cambiamos a modo global, también limpiar
        delete next[formKey];
      }
      return next;
    });
    // Cargar el formulario con el nuevo scope
    loadEnvironmentForm(apiName, environment, true, scope);
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
      const credential = getCredentialForAPI(apiName, selectedEnvironment[apiName] || 'production');
      const supportsEnv = backendDef?.supportsEnvironments;
      const currentEnvironment = supportsEnv
        ? selectedEnvironment[apiName] || 'production'
        : 'production';
      const scopeKey = makeEnvKey(apiName, currentEnvironment);
      
      // APIs de marketplaces y PayPal deben ser únicamente personales
      const PERSONAL_ONLY_APIS = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
      const isPersonalOnly = PERSONAL_ONLY_APIS.includes(apiName);
      
      // Para usuarios no admin, siempre usar 'user' si han seleccionado explícitamente 'user'
      // o si no hay credencial existente
      const explicitScope = scopeSelection[scopeKey];
      let currentScope: 'user' | 'global';
      
      if (isPersonalOnly) {
        // Forzar scope 'user' para APIs de marketplaces y PayPal
        currentScope = 'user';
      } else {
        currentScope = explicitScope !== undefined 
          ? explicitScope 
          : (!isAdmin ? 'user' : (credential?.scope || 'user'));
      }
      
      if (!isAdmin && currentScope === 'global') {
        setSaving(null);
        setError('Estas credenciales son globales y solo el administrador puede modificarlas.');
        return;
      }
      
      if (isPersonalOnly && currentScope === 'global') {
        setSaving(null);
        setError('Las credenciales de marketplaces y PayPal deben ser personales. Cada usuario debe usar sus propias credenciales.');
        return;
      }
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
        'EBAY_REDIRECT_URI': 'redirectUri',
        'EBAY_TOKEN': 'token',
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
        
        // Obtener valor del formulario, o del campo por defecto, o cadena vacía
        // Primero intentar obtener de formData (valor editado por el usuario)
        const rawValue = formData[formKey]?.[fieldKey];
        // Si no hay valor en formData, usar el defaultValue del campo (puede venir del backend)
        // El defaultValue puede venir de field.value (del backend cuando se cargan credenciales)
        const defaultValue = field.value !== undefined && field.value !== null ? String(field.value) : '';
        
        // Intentar leer el valor directamente del input del DOM PRIMERO
        // Esto captura el valor visible en el input aunque no esté en formData
        // Esto es especialmente útil cuando el usuario ve un valor pero no lo ha editado
        let domValue: string = '';
        try {
          // Buscar el input usando atributos data- para identificarlo de forma única
          const inputSelector = `input[data-form-key="${formKey}"][data-field-key="${fieldKey}"]`;
          const inputElement = document.querySelector(inputSelector) as HTMLInputElement;
          if (inputElement) {
            domValue = inputElement.value || '';
            if (domValue && domValue.trim()) {
              console.log(`[APISettings] Valor leído del DOM para ${fieldLabel}:`, domValue.substring(0, 30) + (domValue.length > 30 ? '...' : ''));
            }
          }
        } catch (error) {
          // Si falla al leer del DOM, continuar con otros métodos
          console.warn(`[APISettings] Error al leer valor del DOM para ${fieldLabel}:`, error);
        }
        
        // Determinar el valor final: priorizar formData, luego DOM, luego defaultValue
        let value: string;
        if (rawValue !== undefined && rawValue !== null && String(rawValue).trim()) {
          // Si hay un valor en formData (y no está vacío), usarlo
          value = typeof rawValue === 'string' ? rawValue : String(rawValue);
        } else if (domValue && domValue.trim()) {
          // Si no hay valor en formData pero hay valor en el DOM, usarlo
          value = domValue;
          console.log(`[APISettings] Usando valor del DOM para ${fieldLabel} (no estaba en formData)`);
        } else if (defaultValue && defaultValue.trim()) {
          // Si no hay valor en formData ni DOM pero hay defaultValue, usarlo
          value = defaultValue;
        } else {
          // Si no hay ninguno, usar cadena vacía
          value = '';
        }

        // Log para debugging (solo para campos requeridos que fallan)
        if (fieldRequired && !value.toString().trim()) {
          console.warn(`[APISettings] Campo requerido vacío: ${fieldLabel}`, {
            fieldKey,
            rawValue,
            defaultValue,
            domValue,
            formDataKey: formData[formKey]?.[fieldKey],
            formKey,
            fieldValue: field.value,
            finalValue: value,
            valueType: typeof value,
            valueLength: value?.length,
          });
        } else if (fieldRequired && value.toString().trim()) {
          // Log cuando el campo requerido SÍ tiene valor (para debugging)
          console.log(`[APISettings] Campo requerido ${fieldLabel} tiene valor:`, {
            fieldKey,
            valueLength: value.length,
            valuePreview: value.substring(0, 20) + (value.length > 20 ? '...' : ''),
            source: rawValue !== undefined && rawValue !== null ? 'formData' : (domValue ? 'DOM' : 'defaultValue'),
          });
        }

        // Validar campo requerido: debe tener un valor no vacío después de trim
        // Si el campo es requerido y el valor está vacío después de trim, lanzar error
        if (fieldRequired) {
          const trimmedValue = value.toString().trim();
          if (!trimmedValue) {
            throw new Error(`El campo "${fieldLabel}" es requerido`);
          }
        }
        // Incluir campos incluso si están vacíos para AliExpress (twoFactorEnabled puede ser false)
        // IMPORTANTE: Para campos requeridos, siempre incluirlos si tienen valor (incluso si está vacío, la validación ya falló antes)
        if (value.trim() || (apiName === 'aliexpress' && fieldKey === 'twoFactorEnabled')) {
          // Mapear el nombre del campo al formato esperado por el backend
          const backendKey = fieldMapping[fieldKey] || fieldKey;
          
          // Manejar campos booleanos
          if (fieldKey === 'twoFactorEnabled') {
            credentials[backendKey] = value.trim().toLowerCase() === 'true';
          } else if (value.trim()) {
            credentials[backendKey] = value.trim();
            console.log(`[APISettings] Agregando campo ${fieldKey} -> ${backendKey} con valor (longitud: ${value.trim().length})`);
          }
        } else if (fieldRequired) {
          // Si es un campo requerido pero está vacío, ya deberíamos haber lanzado un error antes
          // Pero por si acaso, agregar logging adicional
          console.error(`[APISettings] ERROR: Campo requerido ${fieldLabel} está vacío pero no se lanzó error de validación`);
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
      const scopeToPersist = isAdmin ? currentScope : 'user';

      // Verificar que redirectUri esté presente si es eBay
      if (apiName === 'ebay' && !credentials.redirectUri) {
        console.error(`[APISettings] ERROR: redirectUri no está en credentials para eBay`, {
          credentialKeys: Object.keys(credentials),
          credentials: Object.keys(credentials).reduce((acc, key) => {
            acc[key] = key.includes('password') || key.includes('token') || key.includes('secret') || key.includes('cert') 
              ? '[HIDDEN]' 
              : credentials[key];
            return acc;
          }, {} as Record<string, any>),
        });
      }

      console.log(`[APISettings] Saving ${apiName}:`, {
        apiName,
        environment: currentEnvironment,
        credentialKeys: Object.keys(credentials),
        hasRedirectUri: !!credentials.redirectUri,
        redirectUriLength: credentials.redirectUri?.length || 0,
        hasEmail: !!credentials.email,
        hasPassword: !!credentials.password,
        twoFactorEnabled: credentials.twoFactorEnabled,
        twoFactorEnabledType: typeof credentials.twoFactorEnabled,
        scope: scopeToPersist,
        explicitScope,
        currentScope,
        isAdmin,
        scopeSelection: scopeSelection[scopeKey],
      });

      // Guardar credencial usando /api/credentials
      console.log(`[APISettings] Sending request to save ${apiName} with scope:`, scopeToPersist);
      const response = await api.post('/api/credentials', {
        apiName,
        environment: currentEnvironment,
        credentials,
        isActive: true,
        scope: scopeToPersist,
      });

      console.log(`[APISettings] Save response for ${apiName}:`, response.data);
      
      if (!response.data?.success) {
        throw new Error(response.data?.error || response.data?.message || 'Error desconocido al guardar');
      }

      setScopeSelection(prev => ({
        ...prev,
        [scopeKey]: scopeToPersist,
      }));

      // Recargar credenciales (con timeout para evitar que se quede colgado)
      try {
        await Promise.race([
          Promise.all([
            loadCredentials(),
            fetchAuthStatuses(),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
      } catch (reloadError) {
        console.warn('Error al recargar credenciales después de guardar:', reloadError);
        // Continuar aunque falle la recarga
      }

      // Limpiar formulario
      setFormData(prev => ({ ...prev, [formKey]: {} }));
      setExpandedApi(null);

      toast.success(`✅ Credenciales de ${apiDef.displayName} guardadas exitosamente`);
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
      const scopeKey = makeEnvKey(apiName, environment);
      const currentScope =
        scopeSelection[scopeKey] ||
        getCredentialForAPI(apiName, environment)?.scope ||
        'user';
      // ✅ Obtener credenciales del formulario si están presentes
      const formKey = makeFormKey(apiName, environment);
      let currentFormData = formData[formKey] || {};
      
      // ✅ Si el formulario está vacío, intentar cargar las credenciales guardadas
      if (Object.keys(currentFormData).length === 0) {
        try {
          const { data } = await api.get(`/api/credentials/${apiName}`, {
            params: { environment, scope: currentScope },
          });
          const creds = data?.data?.credentials || {};
          if (Object.keys(creds).length > 0) {
            // Normalizar credenciales guardadas al formato del formulario
            const normalized: Record<string, string> = {};
            Object.entries(creds).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                normalized[key] = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
              }
            });
            currentFormData = normalized;
            // Actualizar formData para futuras pruebas
            setFormData(prev => ({ ...prev, [formKey]: normalized }));
          }
        } catch (loadError) {
          // Si no se pueden cargar, continuar sin credenciales del formulario
          console.warn('No se pudieron cargar credenciales para test:', loadError);
        }
      }
      
      // ✅ Si hay datos en el formulario (o cargados), prepararlos para el test
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
          'EBAY_REDIRECT_URI': 'redirectUri',
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
        scope: currentScope,
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

  // Escuchar mensajes de la ventana de OAuth
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success') {
        toast.success('✅ Autorización OAuth completada exitosamente');
        // Recargar credenciales y estados
        setTimeout(async () => {
          await fetchAuthStatuses();
          await loadCredentials();
        }, 1000);
      } else if (event.data?.type === 'oauth_error') {
        const errorMsg = event.data.error || 'Error desconocido en OAuth';
        toast.error(`❌ Error en autorización OAuth: ${errorMsg}`);
        setError(`Error en autorización OAuth: ${errorMsg}`);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleOAuth = async (apiName: string, environment: string) => {
    setOauthing(apiName);
    setError(null);
    try {
      const scopeKey = makeEnvKey(apiName, environment);
      const currentScope =
        scopeSelection[scopeKey] ||
        getCredentialForAPI(apiName, environment)?.scope ||
        'user';
      if (!isAdmin && currentScope === 'global') {
        alert('Estas credenciales son compartidas por el administrador. Solicita que el administrador ejecute la autorización OAuth.');
        setOauthing(null);
        return;
      }
      const credentialResponse = await api.get(`/api/credentials/${apiName}`, {
        params: { environment, scope: currentScope },
      });
      const storedCreds = credentialResponse.data?.data?.credentials || {};
      const ruName = storedCreds.redirectUri || storedCreds.ruName || storedCreds.RuName;
      if (!ruName) {
        alert('⚠️ Debes completar y guardar el campo "Redirect URI (RuName)" antes de autorizar.');
        return;
      }
      if (apiName === 'ebay') {
        const missing = ['appId', 'devId', 'certId'].filter((field) => !String(storedCreds[field] || '').trim());
        if (missing.length) {
          alert('⚠️ Completa y guarda App ID, Dev ID y Cert ID antes de autorizar con OAuth.');
          return;
        }
      }
      if (apiName === 'mercadolibre') {
        const missing = ['clientId', 'clientSecret'].filter((field) => !String(storedCreds[field] || '').trim());
        if (missing.length) {
          alert('⚠️ Completa y guarda Client ID y Client Secret antes de autorizar con OAuth.');
          return;
        }
      }

      const { data } = await api.get(`/api/marketplace/auth-url/${apiName}`, {
        params: {
          redirect_uri: ruName,
          environment,
        },
      });
      
      // Verificar si hay errores en la respuesta
      if (!data.success) {
        const errorMsg = data.message || 'Error al generar URL de autorización';
        const errorCode = data.code || '';
        const hint = data.hint || '';
        
        let fullMessage = errorMsg;
        if (hint) {
          fullMessage += `\n\n💡 ${hint}`;
        }
        
        if (errorCode === 'INVALID_APP_ID_FORMAT') {
          fullMessage += `\n\n📋 Verifica en eBay Developer Portal que el App ID sea correcto para el ambiente ${environment === 'sandbox' ? 'Sandbox' : 'Production'}.`;
        }
        
        alert(`❌ ${fullMessage}`);
        setError(errorMsg);
        setOauthing(null);
        return;
      }
      
      // Mostrar advertencia si existe (pero no bloquear)
      if (data.warning) {
        console.warn('[APISettings] OAuth warning:', data.warning);
        toast.warning(data.warning, { duration: 8000 });
      }
      
      const authUrl = data?.data?.authUrl || data?.authUrl || data?.url;
      if (authUrl) {
        // Validar que el App ID no esté vacío antes de abrir OAuth
        if (apiName === 'ebay' && !storedCreds.appId?.trim()) {
          alert('❌ Error: El App ID está vacío. Por favor, verifica que hayas guardado correctamente las credenciales de eBay.');
          setOauthing(null);
          return;
        }
        
        // Abrir ventana de OAuth
        const oauthWindow = window.open(authUrl, '_blank', 'noopener,noreferrer');
        
        if (!oauthWindow) {
          alert('⚠️ No se pudo abrir la ventana de OAuth. Por favor, permite ventanas emergentes para este sitio.');
          setOauthing(null);
          return;
        }
        
        toast.info('Se abrió la ventana oficial de OAuth. Completa el login y vuelve para refrescar el estado.');
        
        // Monitorear si la ventana se cierra
        const checkInterval = setInterval(() => {
          if (oauthWindow.closed) {
            clearInterval(checkInterval);
            // Esperar un momento y luego verificar si las credenciales se actualizaron
            setTimeout(async () => {
              try {
                await fetchAuthStatuses();
                await loadCredentials();
              } catch (err) {
                console.warn('Error al recargar credenciales después de OAuth:', err);
              }
            }, 2000);
          }
        }, 1000);
        
        // Limpiar intervalo después de 5 minutos
        setTimeout(() => clearInterval(checkInterval), 300000);
      } else {
        alert('❌ No recibimos una URL de autorización OAuth para este marketplace.');
      }
    } catch (err: any) {
      console.error('Error iniciando OAuth:', err);
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Error iniciando OAuth';
      alert(`❌ ${message}`);
    } finally {
      setOauthing(null);
    }
  };

  const handleToggle = async (apiName: string, environment: string, currentActive: boolean) => {
    setError(null);
    try {
      const scopeKey = makeEnvKey(apiName, environment);
      const scope =
        getCredentialForAPI(apiName, environment)?.scope ||
        scopeSelection[scopeKey] ||
        'user';
      if (!isAdmin && scope === 'global') {
        alert('Solo el administrador puede activar o desactivar credenciales globales.');
        return;
      }
      // Toggle activo/inactivo usando el endpoint correcto: /api/credentials/:apiName/toggle
      await api.put(`/api/credentials/${apiName}/toggle`, {
        environment,
        scope,
      });
      
      // Recargar credenciales para obtener el estado actualizado
      await loadCredentials();
      await fetchAuthStatuses();

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
      const scopeKey = makeEnvKey(apiName, environment);
      const scope =
        getCredentialForAPI(apiName, environment)?.scope ||
        scopeSelection[scopeKey] ||
        'user';
      if (!isAdmin && scope === 'global') {
        alert('Solo el administrador puede eliminar credenciales globales.');
        setDeleting(null);
        return;
      }
      // Eliminar usando el endpoint correcto con query parameter para environment
      await api.delete(`/api/credentials/${apiName}?environment=${environment}&scope=${scope}`);
      
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

  const automatedCookieSnippet = useMemo(() => {
    if (!manualSessionToken) {
      return '';
    }
    const endpointBase = apiBaseHasApiSuffix ? apiBaseUrl : `${apiBaseUrl}/api`;
    const endpoint = `${endpointBase}/manual-auth/${manualSessionToken}/complete`;
    return `(async () => {
  const endpoint = '${endpoint}';
  const provider = 'aliexpress';

  const normalizeExpires = (value) => {
    if (!value) return null;
    if (typeof value === 'number') {
      if (value <= 0) return null;
      const ms = value > 1e12 ? value : value * 1000;
      return new Date(ms).toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  };

  async function collectCookies() {
    if (window.cookieStore && window.cookieStore.getAll) {
      const list = await window.cookieStore.getAll();
      return list.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || location.hostname.replace(/^www\\./, '.'),
        path: cookie.path || '/',
        expires: normalizeExpires(cookie.expires ?? cookie.expirationDate ?? cookie.expiry ?? null),
        sameSite: cookie.sameSite || 'unspecified',
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly,
      }));
    }

    return document.cookie.split(';').map(raw => {
      const [name, ...rest] = raw.trim().split('=');
      return {
        name,
        value: rest.join('='),
        domain: location.hostname.replace(/^www\\./, '.'),
        path: '/',
        expires: null,
      };
    });
  }

  const cookies = await collectCookies();
  if (!cookies.length) {
    throw new Error('No se encontraron cookies en esta pestaña.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, cookies })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error('Error enviando cookies: ' + response.status + ' ' + text);
  }

  console.log('✅ Cookies enviadas. Vuelve a la plataforma para confirmar.');
})();`;
  }, [apiBaseUrl, apiBaseHasApiSuffix, manualSessionToken]);

  const fallbackCookieSnippet = `copy(JSON.stringify(
  document.cookie.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name, value: rest.join('='), domain: '.aliexpress.com', path: '/' };
  })
))`;

  const manualSessionExpiresLabel = useMemo(() => {
    if (!manualSessionExpiresAt) {
      return null;
    }
    const expiresAt = new Date(manualSessionExpiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return null;
    }
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) {
      return 'Expirado';
    }
    const totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
    return `${Math.max(totalMinutes, 1)}m`;
  }, [manualSessionExpiresAt]);

  const manualSessionStatusDisplay = useMemo(() => {
    switch (manualSessionStatus) {
      case 'completed':
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
          text: 'Cookies recibidas automáticamente. Esta ventana se cerrará en unos segundos.',
          textClass: 'text-green-700',
        };
      case 'expired':
        return {
          icon: <XCircle className="h-5 w-5 text-red-600" />,
          text: 'El token expiró. Genera uno nuevo y repite el proceso.',
          textClass: 'text-red-700',
        };
      case 'pending':
        return {
          icon: <Clock className="h-5 w-5 text-amber-600" />,
          text: 'Esperando que envíes las cookies desde la pestaña de AliExpress.',
          textClass: 'text-amber-700',
        };
      default:
        return {
          icon: <Clock className="h-5 w-5 text-gray-500" />,
          text: 'Preparando sesión manual…',
          textClass: 'text-gray-600',
        };
    }
  }, [manualSessionStatus]);

  const cleanupManualSessionPolling = () => {
    if (manualSessionPollRef.current !== null) {
      window.clearInterval(manualSessionPollRef.current);
      manualSessionPollRef.current = null;
    }
  };

  const pollManualSessionStatus = async (token: string) => {
    try {
      const response = await api.get(`/api/manual-auth/${token}`);
      const status = response.data?.status as 'pending' | 'completed' | 'expired' | undefined;
      if (!status) {
        return;
      }
      if (status === 'completed') {
        setManualSessionStatus('completed');
        cleanupManualSessionPolling();
        toast.success('Cookies recibidas correctamente. Actualizando credenciales…');
        await loadCredentials();
        setTimeout(() => {
          setManualCookieModalOpen(false);
        }, 1500);
      } else if (status === 'expired') {
        setManualSessionStatus('expired');
        cleanupManualSessionPolling();
        toast.error('La sesión manual expiró. Solicita un nuevo token.');
      } else {
        setManualSessionStatus('pending');
      }
    } catch (error) {
      console.error('Error polling manual session:', error);
      setManualSessionError('No se pudo verificar el estado de la sesión manual.');
    }
  };

  const startManualSession = async () => {
    setManualSessionLoading(true);
    setManualSessionError(null);
    setManualSessionStatus('idle');
    try {
      const response = await api.post('/api/manual-auth', { provider: 'aliexpress' });
      const token = response.data?.token as string | undefined;
      if (token) {
        setManualSessionToken(token);
        setManualSessionStatus('pending');
        setManualSessionLoginUrl(response.data?.loginUrl ?? null);
        setManualSessionExpiresAt(response.data?.expiresAt ?? null);
        cleanupManualSessionPolling();
        pollManualSessionStatus(token);
        manualSessionPollRef.current = window.setInterval(() => {
          pollManualSessionStatus(token);
        }, 5000);
      } else {
        setManualSessionError('No se pudo crear la sesión manual. Intenta nuevamente.');
      }
    } catch (error: any) {
      console.error('Error creando sesión manual:', error);
      setManualSessionError(error.response?.data?.message || 'No se pudo iniciar la sesión manual.');
    } finally {
      setManualSessionLoading(false);
    }
  };

  const openManualCookieModal = () => {
    setManualCookieInput('');
    setManualCookieError(null);
    setManualSessionStatus('idle');
    setManualSessionError(null);
    setManualCookieModalOpen(true);
  };

  const closeManualCookieModal = () => {
    if (!manualCookieSaving) {
      setManualCookieModalOpen(false);
    }
  };

  const handleCopyAutomatedSnippet = async () => {
    if (!automatedCookieSnippet) {
      toast.error('Primero genera una sesión manual para obtener el snippet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(automatedCookieSnippet);
      toast.success('Snippet automatizado copiado al portapapeles.');
    } catch (error) {
      console.error('No se pudo copiar el snippet automatizado:', error);
      toast.error('No fue posible copiar automáticamente. Copia manualmente el texto.');
    }
  };

  const handleCopyFallbackSnippet = async () => {
    try {
      await navigator.clipboard.writeText(fallbackCookieSnippet);
      toast.success('Snippet manual copiado.');
    } catch (error) {
      console.error('No se pudo copiar el snippet manual:', error);
      toast.error('No fue posible copiar automáticamente. Copia manualmente el texto.');
    }
  };

  useEffect(() => {
    if (manualCookieModalOpen) {
      cleanupManualSessionPolling();
      if (manualSessionToken) {
        pollManualSessionStatus(manualSessionToken);
        manualSessionPollRef.current = window.setInterval(() => {
          pollManualSessionStatus(manualSessionToken);
        }, 5000);
      } else {
        startManualSession();
      }
    } else {
      cleanupManualSessionPolling();
      setManualSessionToken(null);
      setManualSessionStatus('idle');
      setManualSessionError(null);
      setManualSessionExpiresAt(null);
      setManualSessionLoginUrl(null);
    }

    return () => {
      cleanupManualSessionPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualCookieModalOpen, manualSessionToken]);

  useEffect(() => {
    if (
      pendingManualSession &&
      pendingManualSession.token &&
      lastHandledManualTokenRef.current !== pendingManualSession.token
    ) {
      lastHandledManualTokenRef.current = pendingManualSession.token;
      setManualCookieInput('');
      setManualCookieError(null);
      setManualSessionToken(pendingManualSession.token);
      setManualSessionStatus('pending');
      setManualSessionError(null);
      setManualSessionExpiresAt(pendingManualSession.expiresAt ?? null);
      setManualSessionLoginUrl(
        pendingManualSession.loginUrl?.startsWith('http')
          ? pendingManualSession.loginUrl
          : pendingManualSession.loginUrl
          ? `${window.location.origin}${pendingManualSession.loginUrl}`
          : null
      );
      setManualCookieModalOpen(true);
      markManualHandled(pendingManualSession.token);
    }
  }, [pendingManualSession, markManualHandled]);

  const handleManualCookiesSave = async () => {
    if (!manualCookieInput.trim()) {
      setManualCookieError('Pega el JSON de cookies generado en la consola de AliExpress.');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(manualCookieInput);
    } catch (error) {
      setManualCookieError('Formato inválido. Asegúrate de pegar el JSON sin modificarlo.');
      return;
    }

    if (!Array.isArray(parsed)) {
      setManualCookieError('El contenido debe ser un arreglo JSON de cookies.');
      return;
    }

    setManualCookieSaving(true);
    setManualCookieError(null);

    try {
      await api.post('/api/manual-auth/save-cookies', { cookies: parsed });
      toast.success('Cookies guardadas correctamente. La sesión se actualizará en segundos.');
      cleanupManualSessionPolling();
      setManualSessionStatus('completed');
      setManualCookieModalOpen(false);
      setManualCookieInput('');
      await requestAuthRefresh('aliexpress');
      await loadCredentials();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'No se pudieron guardar las cookies.';
      setManualCookieError(message);
    } finally {
      setManualCookieSaving(false);
    }
  };

  const getCredentialForAPI = (apiName: string, environment: string): APICredential | undefined => {
    return credentials.find(c => c.apiName === apiName && c.environment === environment);
  };

  const getStatusIcon = (apiName: string, environment: string) => {
    const credential = getCredentialForAPI(apiName, environment);
    const status = statuses[makeEnvKey(apiName, environment)];

    if (!credential) {
      if (status?.optional) {
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      }
      return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
    
    if (!credential.isActive) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }

    if (!status) {
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }

    if (!status.available) {
      if (status.optional) {
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      }
      return <XCircle className="w-5 h-5 text-red-500" />;
    }

    return <CheckCircle className="w-5 h-5 text-green-500" />;
  };

  const getStatusText = (apiName: string, environment: string) => {
    const credential = getCredentialForAPI(apiName, environment);
    const status = statuses[makeEnvKey(apiName, environment)];

    if (!credential) {
      if (status?.optional) {
        return status.message || 'Opcional (sin configurar)';
      }
      return 'No configurada';
    }
    if (!credential.isActive) return 'Desactivada';
    
    const diag = marketplaceDiagnostics[apiName];
    if (diag) {
      if (diag.issues?.length) {
        return diag.issues[0];
      }
      if (diag.warnings?.length) {
        return diag.warnings[0];
      }
    }

    if (!status) return 'Estado desconocido';
    
    if (status.optional && !status.available) {
      return status.message || 'Opcional (configura para mayor precisión)';
    }

    return status.available ? 'Disponible' : `Error: ${status.message || 'No disponible'}`;
  };

  const optionalCoverage = useMemo(() => {
    if (!auditSummary?.optionalApis) return [];
    return (auditSummary.optionalApis as Array<any>).map((entry) => {
      const configured = entry.environments?.some((env: any) => env?.summary);
      const errors =
        entry.environments
          ?.filter((env: any) => env?.error)
          ?.map((env: any) => `${env.environment}: ${env.error}`) ?? [];
      return {
        apiName: entry.apiName,
        configured,
        errors,
      };
    });
  }, [auditSummary]);

  const missingOptional = optionalCoverage.filter(item => !item.configured);

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
        {missingOptional.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-semibold">
              Algunas fuentes opcionales todavía no están configuradas. Puedes operar igual, pero la precisión será mayor cuando completes:
            </div>
            <ul className="list-disc list-inside space-y-1">
              {missingOptional.map(item => (
                <li key={item.apiName}>
                  {item.apiName} {item.errors.length ? `- ${item.errors.join(' | ')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
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
          const scopeKey = makeEnvKey(apiDef.name, currentEnvironment);
          
          // APIs de marketplaces y PayPal deben ser únicamente personales
          const PERSONAL_ONLY_APIS = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
          const isPersonalOnly = PERSONAL_ONLY_APIS.includes(apiDef.name);
          
          // Si el usuario ha seleccionado explícitamente 'user', usar eso; de lo contrario, usar la credencial existente o 'user' por defecto
          const explicitScope = scopeSelection[scopeKey];
          const credentialScope = credential?.scope || 'user';
          
          // Para APIs personales, siempre usar scope 'user'
          // Para otras APIs, respetar la selección explícita del usuario o usar la credencial existente
          const currentScope = isPersonalOnly 
            ? 'user' 
            : (explicitScope !== undefined ? explicitScope : credentialScope);
          const isGlobalScope = isPersonalOnly ? false : (currentScope === 'global');
          // isReadOnly: deshabilitar solo si es global Y el usuario no ha seleccionado 'user' explícitamente
          // Si explicitScope === 'user', entonces NO debe ser readonly, incluso si hay una credencial global
          // Si el usuario ha seleccionado explícitamente 'user', siempre permitir edición
          const isReadOnly = explicitScope === 'user' 
            ? false 
            : ((!isAdmin && isGlobalScope) || !!maskedScopes[formKey]);

          const fieldsToUse = supportsEnv
            ? backendDef?.environments?.[currentEnvironment]?.fields || apiDef.fields
            : backendDef?.fields || apiDef.fields;
          const displayName = backendDef?.name || apiDef.displayName;
          const description = backendDef?.description || apiDef.description;
          const diag = marketplaceDiagnostics[apiDef.name] || null;
          const statusInfo = authStatuses?.[apiDef.name];
          const badgeTheme =
            statusInfo?.status && STATUS_BADGE_STYLES[statusInfo.status]
              ? STATUS_BADGE_STYLES[statusInfo.status]
              : STATUS_BADGE_STYLES.unknown;

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
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
                          isGlobalScope
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : 'bg-gray-100 border-gray-200 text-gray-600'
                        }`}
                      >
                        {isGlobalScope ? 'Compartida (global)' : 'Personal'}
                      </span>
                      {isGlobalScope && credential?.owner ? (
                        <span className="text-gray-500">
                          Administrada por {credential.owner.fullName || credential.owner.username}
                        </span>
                      ) : null}
                      {!isGlobalScope && credential?.sharedBy ? (
                        <span className="text-gray-500">
                          Actualizada por {credential.sharedBy.fullName || credential.sharedBy.username}
                        </span>
                      ) : null}
                    </div>
                    {['ebay', 'amazon', 'mercadolibre'].includes(apiDef.name) && diag && (
                      <div className="mt-2 space-y-1 text-sm">
                        {diag.issues?.length ? (
                          <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded">
                            <p className="font-semibold">Acción requerida</p>
                            {diag.issues.map((issue, idx) => (
                              <div key={idx}>• {issue}</div>
                            ))}
                          </div>
                        ) : null}
                        {!diag.issues?.length && diag.warnings?.length ? (
                          <div className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded">
                            <p className="font-semibold">Aviso</p>
                            {diag.warnings.map((warning, idx) => (
                              <div key={idx}>• {warning}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {statusInfo ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <div
                          className={`inline-flex items-center gap-2 px-3 py-1 border rounded-full font-semibold ${badgeTheme.className}`}
                        >
                          {badgeTheme.label}
                        </div>
                        {statusInfo.message ? (
                          <p className="text-gray-500">{statusInfo.message}</p>
                        ) : null}
                        {apiDef.name === 'aliexpress' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await requestAuthRefresh('aliexpress');
                                } catch {
                                  /* handled in store */
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition text-xs"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reintentar automático
                            </button>
                            <button
                              onClick={openManualCookieModal}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition text-xs"
                              title="Pega el JSON de cookies generado desde la consola de AliExpress"
                            >
                              <ClipboardPaste className="w-3 h-3" />
                              Guardar cookies manualmente
                            </button>
                            {statusInfo.manualSession?.token ? (
                              <a
                                href={
                                  statusInfo.manualSession.loginUrl?.startsWith('http')
                                    ? statusInfo.manualSession.loginUrl
                                    : `${window.location.origin}${
                                        statusInfo.manualSession.loginUrl ||
                                        `/manual-login/${statusInfo.manualSession.token}`
                                      }`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition text-xs"
                              >
                                Abrir login manual
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
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
                        disabled={!isAdmin && isGlobalScope}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          credential.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } ${!isAdmin && isGlobalScope ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {credential.isActive ? 'ON' : 'OFF'}
                      </button>

                      {/* OAuth Authorization */}
                      {apiDef.supportsOAuth && (
                        (() => {
                          const requiresBaseCreds =
                            diag?.issues?.some((issue) =>
                              issue.toLowerCase().includes('faltan credenciales')
                            ) ?? false;
                          const oauthDisabled = oauthing === apiDef.name || requiresBaseCreds;
                          const oauthTitle = requiresBaseCreds
                            ? 'Completa y guarda las credenciales requeridas antes de autorizar.'
                            : 'Autorizar OAuth';
                          return (
                        <button
                          onClick={() => handleOAuth(apiDef.name, currentEnvironment)}
                          disabled={oauthDisabled}
                          className="px-3 py-1 rounded text-sm font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          title={oauthTitle}
                        >
                          {oauthing === apiDef.name ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Autorizando…
                            </>
                          ) : (
                            <>
                              <Link2 className="w-4 h-4" />
                              OAuth
                            </>
                          )}
                        </button>
                          );
                        })()
                      )}
 
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
                        <Pencil className="w-5 h-5" />
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

                    {isAdmin && (() => {
                      // APIs de marketplaces y PayPal deben ser únicamente personales
                      const PERSONAL_ONLY_APIS = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
                      const isPersonalOnly = PERSONAL_ONLY_APIS.includes(apiDef.name);
                      
                      // Solo mostrar selector de scope si la API puede ser global
                      if (isPersonalOnly) {
                        return null; // No mostrar selector para APIs que deben ser personales
                      }
                      
                      return (
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-gray-600">Alcance:</span>
                          <div className="inline-flex rounded border border-gray-200 overflow-hidden w-fit">
                            <button
                              onClick={() => handleScopeChange(apiDef.name, currentEnvironment, 'user')}
                              className={`px-3 py-1 text-sm font-medium transition ${
                                currentScope === 'user'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              Personal
                            </button>
                            <button
                              onClick={() => handleScopeChange(apiDef.name, currentEnvironment, 'global')}
                              className={`px-3 py-1 text-sm font-medium transition ${
                                currentScope === 'global'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              Compartida
                            </button>
                          </div>
                          {currentScope === 'user' && credential?.sharedBy ? (
                            <p className="text-xs text-gray-500">
                              Última actualización por {credential.sharedBy.fullName || credential.sharedBy.username}
                            </p>
                          ) : null}
                          {currentScope === 'global' && credential?.owner ? (
                            <p className="text-xs text-gray-500">
                              Administrada por {credential.owner.fullName || credential.owner.username}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}

                    {!isAdmin && isGlobalScope && explicitScope !== 'user' && (
                      <div className="px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm space-y-2">
                        <p>
                          Estas credenciales son compartidas por el administrador. Si prefieres usar tus propias claves,
                          crea una versión personal.
                        </p>
                        <button
                          onClick={() => handleScopeChange(apiDef.name, currentEnvironment, 'user')}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                        >
                          Usar mis credenciales personales
                        </button>
                      </div>
                    )}
                    {!isAdmin && explicitScope === 'user' && credential?.scope === 'global' && (
                      <div className="px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
                        <p className="font-medium">✓ Modo personal activado</p>
                        <p className="text-xs mt-1">Ahora puedes ingresar tus propias credenciales. Se guardarán como personales.</p>
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
                      const inputDisabled = isDisabled || isReadOnly;

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
                              disabled={inputDisabled}
                              data-form-key={formKey}
                              data-field-key={fieldKey}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                inputDisabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'
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
                        disabled={isSaving || isReadOnly}
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

      {manualCookieModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-800">Guardar cookies de AliExpress manualmente</h2>
              <button
                onClick={closeManualCookieModal}
                className="text-gray-500 hover:text-gray-700"
                disabled={manualCookieSaving}
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-blue-800">
                    <Sparkles className="h-5 w-5" />
                    <span className="text-sm font-semibold">Automatiza el guardado de las cookies</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {manualSessionExpiresLabel ? (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        <Clock className="h-4 w-4" />
                        Expira en {manualSessionExpiresLabel}
                      </span>
                    ) : null}
                    <button
                      onClick={startManualSession}
                      className="inline-flex items-center gap-2 rounded border border-blue-400 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={manualSessionLoading}
                    >
                      {manualSessionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {manualSessionToken ? 'Reiniciar token' : 'Generar token'}
                    </button>
                  </div>
                </div>
                <ol className="mt-3 list-decimal list-inside space-y-1 text-xs text-blue-800">
                  <li>
                    Abre la pestaña de AliExpress con tu cuenta. Puedes usar el botón{' '}
                    <span className="font-semibold">Abrir login de AliExpress</span>.
                  </li>
                  <li>
                    Presiona <code className="rounded bg-blue-100 px-1 py-0.5 text-[11px]">F12</code>, entra a{' '}
                    <span className="font-semibold">Console</span> y escribe{' '}
                    <code className="rounded bg-blue-100 px-1 py-0.5 text-[11px]">allow pasting</code> si Chrome lo pide.
                  </li>
                  <li>Pega el snippet automático, presiona Enter y espera el mensaje de confirmación.</li>
                  <li>Vuelve a esta ventana: detectaremos el envío en cuanto llegue.</li>
                </ol>
                {manualSessionLoginUrl ? (
                  <div className="mt-3">
                    <button
                      onClick={() => window.open(manualSessionLoginUrl, '_blank', 'noopener')}
                      className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                      type="button"
                    >
                      <Link2 className="h-4 w-4" />
                      Abrir login de AliExpress
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex items-start justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <div className={`flex items-center gap-2 text-sm ${manualSessionStatusDisplay.textClass}`}>
                  {manualSessionStatusDisplay.icon}
                  <span>{manualSessionStatusDisplay.text}</span>
                </div>
                {manualSessionError ? (
                  <span className="ml-4 text-xs text-red-600">{manualSessionError}</span>
                ) : null}
              </div>

              <div className="rounded border border-emerald-300 bg-emerald-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-700">Snippet automático (recomendado)</span>
                  <button
                    onClick={handleCopyAutomatedSnippet}
                    className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={!automatedCookieSnippet}
                  >
                    <ClipboardPaste className="h-4 w-4" />
                    Copiar snippet
                  </button>
                </div>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-emerald-900">
{automatedCookieSnippet || 'Generando token y snippet...'}
                </pre>
              </div>

              <div className="rounded border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Snippet manual (solo si falla el automático)</span>
                  <button
                    onClick={handleCopyFallbackSnippet}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    type="button"
                  >
                    Copiar
                  </button>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-gray-800">
{fallbackCookieSnippet}
                </pre>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Pega aquí el JSON generado (solo modo manual)</label>
                <textarea
                  value={manualCookieInput}
                  onChange={(event) => {
                    setManualCookieInput(event.target.value);
                    if (manualCookieError) setManualCookieError(null);
                  }}
                  rows={6}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder='[{"name":"aep_usuc_f","value":"...","domain":".aliexpress.com","path":"/"}, … ]'
                  disabled={manualCookieSaving}
                />
                {manualCookieError ? (
                  <p className="mt-2 text-sm text-red-600">{manualCookieError}</p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    Usa este campo solo si el método automático no funcionó y copiaste el JSON manualmente.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={closeManualCookieModal}
                className="rounded px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={manualCookieSaving}
                type="button"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualCookiesSave}
                className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={manualCookieSaving}
                type="button"
              >
                {manualCookieSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
