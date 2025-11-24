import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink, Settings } from 'lucide-react';
import api from '../../services/api';

interface APIStatus {
  apiName: string;
  environment: string;
  configured: boolean;
  isActive: boolean;
  status?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastChecked?: string;
  issues?: string[];
  warnings?: string[];
}

export default function APIDashboard() {
  const [apis, setApis] = useState<APIStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'configured' | 'not-configured' | 'active' | 'inactive'>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<'all' | 'sandbox' | 'production'>('all');

  useEffect(() => {
    loadAPIs();
  }, []);

  const loadAPIs = async () => {
    try {
      setLoading(true);
      const [apisResponse, credentialsResponse] = await Promise.all([
        api.get('/api/settings/apis'),
        api.get('/api/credentials'),
      ]);

      const apisData = apisResponse.data?.data || [];
      const credentialsData = credentialsResponse.data?.data || [];

      const statusMap: Record<string, APIStatus> = {};

      apisData.forEach((api: any) => {
        const envs = api.supportsEnvironments ? ['sandbox', 'production'] : ['production'];
        envs.forEach((env: string) => {
          const key = `${api.apiName}-${env}`;
          const credential = credentialsData.find(
            (c: any) => c.apiName === api.apiName && c.environment === env
          );

          statusMap[key] = {
            apiName: api.apiName,
            environment: env,
            configured: !!credential,
            isActive: credential?.isActive || false,
            status: credential?.isActive ? 'healthy' : 'unknown',
            lastChecked: credential?.updatedAt,
            issues: [],
            warnings: [],
          };
        });
      });

      setApis(Object.values(statusMap));
    } catch (error) {
      console.error('Error loading APIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredApis = apis.filter((api) => {
    if (filter === 'configured' && !api.configured) return false;
    if (filter === 'not-configured' && api.configured) return false;
    if (filter === 'active' && !api.isActive) return false;
    if (filter === 'inactive' && api.isActive) return false;
    if (environmentFilter !== 'all' && api.environment !== environmentFilter) return false;
    return true;
  });

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (api: APIStatus) => {
    if (!api.configured) return 'No configurada';
    if (!api.isActive) return 'Inactiva';
    if (api.status === 'healthy') return 'Funcionando';
    if (api.status === 'degraded') return 'Con problemas';
    if (api.status === 'unhealthy') return 'No disponible';
    return 'Estado desconocido';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de APIs</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Vista unificada del estado de todas las APIs configuradas
          </p>
        </div>
        <button
          onClick={loadAPIs}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Estado
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Todas</option>
            <option value="configured">Configuradas</option>
            <option value="not-configured">No configuradas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Ambiente
          </label>
          <select
            value={environmentFilter}
            onChange={(e) => setEnvironmentFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">Todos</option>
            <option value="sandbox">Sandbox</option>
            <option value="production">Producción</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total APIs</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{apis.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Configuradas</div>
          <div className="text-2xl font-bold text-green-600">
            {apis.filter(a => a.configured).length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Activas</div>
          <div className="text-2xl font-bold text-blue-600">
            {apis.filter(a => a.isActive).length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Funcionando</div>
          <div className="text-2xl font-bold text-green-600">
            {apis.filter(a => a.status === 'healthy').length}
          </div>
        </div>
      </div>

      {/* API List */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                API
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ambiente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Última verificación
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredApis.map((api) => (
              <tr key={`${api.apiName}-${api.environment}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900 dark:text-white">{api.apiName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    api.environment === 'sandbox'
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                  }`}>
                    {api.environment}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(api.status)}
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {getStatusText(api)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {api.lastChecked
                    ? new Date(api.lastChecked).toLocaleString()
                    : 'Nunca'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <a
                    href="/api-settings"
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 flex items-center gap-1"
                  >
                    <Settings className="w-4 h-4" />
                    Configurar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

