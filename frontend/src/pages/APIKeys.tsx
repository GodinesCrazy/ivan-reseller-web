import { useState, useEffect } from 'react';
import { Settings, Globe, Zap, Database, Eye, EyeOff, Save, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

type Marketplace = 'ebay' | 'mercadolibre' | 'amazon';

const MARKETPLACES: { key: Marketplace; label: string; icon: any; fields: { key: string; label: string; type?: 'password' | 'text' }[] }[] = [
  { key: 'ebay', label: 'eBay', icon: Globe, fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'devId', label: 'Dev ID' },
    { key: 'certId', label: 'Cert ID' },
    { key: 'token', label: 'OAuth Token', type: 'password' },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password' },
  ]},
  { key: 'mercadolibre', label: 'Mercado Libre', icon: Zap, fields: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
    { key: 'userId', label: 'User ID' },
    { key: 'siteId', label: 'Site ID (MLM/MLA/MLB...)' },
  ]},
  { key: 'amazon', label: 'Amazon SP-API', icon: Database, fields: [
    { key: 'clientId', label: 'LWA Client ID' },
    { key: 'clientSecret', label: 'LWA Client Secret', type: 'password' },
    { key: 'refreshToken', label: 'Refresh Token', type: 'password' },
  ]},
];

export default function APIKeys() {
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<Marketplace, { present: boolean; isActive: boolean }>>({
    ebay: { present: false, isActive: false },
    mercadolibre: { present: false, isActive: false },
    amazon: { present: false, isActive: false },
  });
  const [form, setForm] = useState<Record<Marketplace, Record<string, string>>>({
    ebay: {}, mercadolibre: {}, amazon: {},
  });
  const [show, setShow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    MARKETPLACES.forEach(async (m) => {
      try {
        // Usar endpoint unificado /api/credentials
        const { data } = await api.get(`/api/credentials/${m.key}?environment=production`);
        setStatus((prev) => ({ ...prev, [m.key]: { present: !!data?.data, isActive: !!data?.data?.isActive } }));
        
        // Si hay credenciales, cargar datos en el formulario
        if (data?.data?.credentials) {
          setForm((prev) => ({
            ...prev,
            [m.key]: data.data.credentials
          }));
        }
      } catch {
        // Si no hay credenciales, mantener estado por defecto
      }
    });
  }, []);

  const save = async (mk: Marketplace) => {
    setSaving(mk);
    try {
      // Usar endpoint unificado /api/credentials
      await api.post('/api/credentials', {
        apiName: mk,
        environment: 'production',
        credentials: form[mk],
        isActive: true
      });
      setStatus((s) => ({ ...s, [mk]: { present: true, isActive: true } }));
      alert(`✅ ${mk} credentials saved successfully`);
    } catch (e: any) {
      const errorMsg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
      alert(`❌ Error saving ${mk} credentials: ${errorMsg}`);
    } finally {
      setSaving(null);
    }
  };

  const test = async (mk: Marketplace) => {
    setTesting(mk);
    try {
      // Usar endpoint unificado /api/credentials/:apiName/test
      const { data } = await api.post(`/api/credentials/${mk}/test`);
      const result = data?.data || data;
      if (result?.isAvailable || result?.available) {
        alert(`✅ ${mk} connection test: SUCCESS`);
      } else {
        alert(`❌ ${mk} connection test: ${result?.message || 'FAILED'}`);
      }
    } catch (e: any) {
      const errorMsg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
      alert(`❌ Error testing ${mk}: ${errorMsg}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-semibold">API Keys</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {MARKETPLACES.map((m) => (
          <div key={m.key} className="bg-white rounded-xl border shadow-sm">
            <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <m.icon className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <div className="text-lg font-semibold">{m.label}</div>
                  <div className="flex items-center gap-2">
                    {status[m.key].isActive ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                    <span className="text-xs text-gray-600">{status[m.key].isActive ? 'Configured' : 'Not configured'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => test(m.key)} disabled={testing===m.key} className="px-3 py-2 border rounded text-sm">
                  {testing===m.key ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Test'}
                </button>
                {['ebay','mercadolibre'].includes(m.key) && (
                  <button onClick={() => connectOAuth(m.key as Marketplace)} className="px-3 py-2 border rounded text-sm">OAuth</button>
                )}
                <button onClick={() => save(m.key)} disabled={saving===m.key} className="px-3 py-2 bg-blue-600 text-white rounded text-sm flex items-center gap-1">
                  {saving===m.key ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving===m.key ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {m.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <div className="relative">
                    <input
                      type={f.type === 'password' && !show[`${m.key}_${f.key}`] ? 'password' : 'text'}
                      value={form[m.key]?.[f.key] || ''}
                      onChange={(e) => setForm(prev => ({ ...prev, [m.key]: { ...prev[m.key], [f.key]: e.target.value } }))}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-primary-500"
                      placeholder={`Enter ${f.label}`}
                    />
                    {f.type === 'password' && (
                      <button type="button" onClick={() => setShow(prev => ({ ...prev, [`${m.key}_${f.key}`]: !prev[`${m.key}_${f.key}`] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {show[`${m.key}_${f.key}`] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {m.key === 'amazon' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AWS Access Key ID</label>
                    <input className="w-full px-3 py-2 border rounded" value={form.amazon?.awsAccessKeyId||''} onChange={e=>setForm(p=>({...p, amazon:{...p.amazon, awsAccessKeyId:e.target.value}}))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AWS Secret Access Key</label>
                    <input type="password" className="w-full px-3 py-2 border rounded" value={form.amazon?.awsSecretAccessKey||''} onChange={e=>setForm(p=>({...p, amazon:{...p.amazon, awsSecretAccessKey:e.target.value}}))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                    <input className="w-full px-3 py-2 border rounded" placeholder="us-east-1|eu-west-1|ap-northeast-1" value={form.amazon?.region||''} onChange={e=>setForm(p=>({...p, amazon:{...p.amazon, region:e.target.value}}))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Marketplace Id</label>
                    <input className="w-full px-3 py-2 border rounded" placeholder="ATVPDKIKX0DER (US)" value={form.amazon?.marketplace||''} onChange={e=>setForm(p=>({...p, amazon:{...p.amazon, marketplace:e.target.value}}))} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function connectOAuth(mk: Marketplace) {
  const redirect = window.location.origin + '/api-keys';
  try {
    // Usar endpoint de marketplace OAuth
    const { data } = await api.get(`/api/marketplace-oauth/auth-url/${mk}`, { params: { redirect_uri: redirect } });
    const url = data?.data?.authUrl || data?.authUrl || data?.url;
    if (url) {
      window.location.href = url; // Redirigir en la misma ventana para OAuth
    } else {
      alert('❌ No auth URL available for OAuth');
    }
  } catch (e: any) {
    const errorMsg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
    alert(`❌ OAuth initialization failed: ${errorMsg}`);
  }
}
