import { useEffect, useState } from 'react';
import { Lock, Save, RefreshCw, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';

interface OtherAPIDefinition {
  id: string;
  name: string;
  apiName: string;
  description: string;
  category: string;
  fields: OtherAPIField[];
  documentation?: string | null;
  status: 'configured' | 'not_configured';
  isActive: boolean;
  lastUpdated?: string | null;
}

interface OtherAPIField {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'password' | 'email' | 'boolean';
  placeholder?: string;
  helpText?: string;
}

interface APICredentialsStatus {
  configured: boolean;
  isActive: boolean;
  lastUpdated?: string | null;
}

const DEFAULT_ENVIRONMENT = 'production';

export default function OtherCredentials() {
  const [apis, setApis] = useState<OtherAPIDefinition[]>([]);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [showField, setShowField] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, APICredentialsStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDefinitions();
  }, []);

  const loadDefinitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/settings/apis');
      const definitions = (data?.data || [])
        .filter((api: any) => api.category === 'automation')
        .map((api: any) => ({
          ...api,
          fields: (api.fields || []).map((field: any) =>
            field.key === 'twoFactorEnabled'
              ? { ...field, type: 'boolean' }
              : field
          ),
        }));

      setApis(definitions);

      // For each API, load existing credentials
      for (const apiDef of definitions) {
        try {
          const { data: credentialData } = await api.get(`/api/credentials/${apiDef.apiName}`, {
            params: { environment: DEFAULT_ENVIRONMENT },
          });
          if (credentialData?.data?.credentials) {
            const stored = credentialData.data.credentials;
            setFormData((prev) => ({ ...prev, [apiDef.apiName]: normalizeCredentials(stored) }));
            setStatus((prev) => ({
              ...prev,
              [apiDef.apiName]: {
                configured: true,
                isActive: !!credentialData.data.isActive,
                lastUpdated: credentialData.data.updatedAt || null,
              },
            }));
          }
        } catch {
          setStatus((prev) => ({
            ...prev,
            [apiDef.apiName]: {
              configured: false,
              isActive: false,
            },
          }));
        }
      }
    } catch (err: any) {
      console.error('Error loading other credentials:', err);
      setError(err?.response?.data?.error || err?.message || 'Unexpected error loading credentials');
    } finally {
      setLoading(false);
    }
  };

  const normalizeCredentials = (creds: Record<string, any>) => {
    const normalized: Record<string, string> = {};
    Object.entries(creds || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (typeof value === 'boolean') {
          normalized[key] = value ? 'true' : 'false';
        } else {
          normalized[key] = String(value);
        }
      }
    });
    return normalized;
  };

  const handleInputChange = (apiName: string, field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [apiName]: {
        ...(prev[apiName] || {}),
        [field]: value,
      },
    }));
  };

  const toggleFieldVisibility = (apiName: string, field: string) => {
    const key = `${apiName}:${field}`;
    setShowField((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (apiDef: OtherAPIDefinition) => {
    setSaving(apiDef.apiName);
    setError(null);
    try {
      const currentData = formData[apiDef.apiName] || {};
      const processed = { ...currentData };

      if (processed.twoFactorEnabled !== undefined) {
        processed.twoFactorEnabled = String(processed.twoFactorEnabled).toLowerCase() === 'true';
      }

      // Basic validation for required fields
      const missing = apiDef.fields.filter((field) => field.required && !processed[field.key]);
      if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.map((f) => f.label).join(', ')}`);
      }

      await api.post('/api/credentials', {
        apiName: apiDef.apiName,
        environment: DEFAULT_ENVIRONMENT,
        credentials: processed,
        isActive: true,
      });

      setStatus((prev) => ({
        ...prev,
        [apiDef.apiName]: {
          configured: true,
          isActive: true,
          lastUpdated: new Date().toISOString(),
        },
      }));

      alert(`✅ ${apiDef.name} credentials saved successfully`);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Unknown error';
      alert(`❌ Error saving ${apiDef.name} credentials: ${message}`);
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (apiDef: OtherAPIDefinition) => {
    setTesting(apiDef.apiName);
    setError(null);
    try {
      const currentData = formData[apiDef.apiName] || {};
      const hasData = Object.keys(currentData).length > 0;

      const payload: any = {
        environment: DEFAULT_ENVIRONMENT,
      };

      if (hasData) {
        const processed = { ...currentData } as any;
        if (processed.twoFactorEnabled !== undefined) {
          processed.twoFactorEnabled = String(processed.twoFactorEnabled).toLowerCase() === 'true';
        }
        payload.credentials = processed;
      }

      const response = await api.post(`/api/credentials/${apiDef.apiName}/test`, payload);
      const data = response.data?.data || response.data;

      if (data.isAvailable || data.isConfigured) {
        alert(`✅ ${apiDef.name} credentials validated successfully`);
      } else {
        const message = data.error || data.message || 'Credentials not valid';
        alert(`❌ ${apiDef.name} test failed: ${message}`);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Unknown error during test';
      alert(`❌ Error testing ${apiDef.name} credentials: ${message}`);
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading credentials...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary-600" /> Other Credentials
        </h1>
        <p className="text-gray-600">Store AliExpress login and other non-API credentials required for automation.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {apis.length === 0 && (
        <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-gray-500">
          No additional credentials are required at this time.
        </div>
      )}

      <div className="space-y-4">
        {apis.map((apiDef) => {
          const currentStatus = status[apiDef.apiName];
          const currentData = formData[apiDef.apiName] || {};

          return (
            <div key={apiDef.apiName} className="border rounded-lg p-5 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{apiDef.name}</h2>
                  <p className="text-sm text-gray-600 mb-4">{apiDef.description}</p>
                  {apiDef.documentation && (
                    <a
                      href={apiDef.documentation}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Documentation
                    </a>
                  )}
                </div>
                <div className="text-right text-sm">
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${currentStatus?.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {currentStatus?.configured ? 'Configured' : 'Not configured'}
                  </div>
                  {currentStatus?.lastUpdated && (
                    <div className="text-gray-500 mt-1">Last updated: {new Date(currentStatus.lastUpdated).toLocaleString()}</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {apiDef.fields.map((field) => {
                  const key = `${apiDef.apiName}:${field.key}`;
                  const value = currentData[field.key] || '';
                  const isPassword = field.type === 'password';
                  const isBoolean = field.type === 'boolean';

                  if (isBoolean) {
                    return (
                      <div key={field.key} className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">{field.label}</label>
                        <select
                          value={value || 'false'}
                          onChange={(e) => handleInputChange(apiDef.apiName, field.key, e.target.value)}
                          className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="false">False</option>
                          <option value="true">True</option>
                        </select>
                        {field.helpText && <p className="text-xs text-gray-500">{field.helpText}</p>}
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700">{field.label}</label>
                      <div className="relative">
                        <input
                          type={isPassword && !showField[key] ? 'password' : field.type === 'email' ? 'email' : 'text'}
                          value={value}
                          onChange={(e) => handleInputChange(apiDef.apiName, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 pr-10"
                        />
                        {isPassword && (
                          <button
                            type="button"
                            onClick={() => toggleFieldVisibility(apiDef.apiName, field.key)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showField[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      {field.helpText && <p className="text-xs text-gray-500">{field.helpText}</p>}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 border-t pt-4">
                <button
                  onClick={() => handleTest(apiDef)}
                  disabled={testing === apiDef.apiName}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-lg text-primary-600 border-primary-600 hover:bg-primary-50 disabled:opacity-50"
                >
                  {testing === apiDef.apiName ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Test Credentials
                </button>
                <button
                  onClick={() => handleSave(apiDef)}
                  disabled={saving === apiDef.apiName}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving === apiDef.apiName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Credentials
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
