/**
 * ✅ GO-LIVE: Diagnostics Page
 * 
 * Página de diagnóstico para verificar configuración y conectividad
 */

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { API_BASE_URL, getDiagnosticsInfo } from '@/config/runtime';
import api from '@/services/api';

interface DiagnosticResult {
  name: string;
  status: 'success' | 'error' | 'loading' | 'unknown';
  message: string;
  data?: any;
}

export default function Diagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const diagnosticsInfo = getDiagnosticsInfo();

  const runDiagnostics = async () => {
    setIsLoading(true);
    setResults([]);

    const newResults: DiagnosticResult[] = [];

    // 1. Información de configuración local
    newResults.push({
      name: 'Configuración Local',
      status: 'success',
      message: 'Configuración cargada correctamente',
      data: diagnosticsInfo,
    });

    // 2. Test /health
    try {
      const healthResponse = await fetch(`${API_BASE_URL}/health`);
      const healthData = await healthResponse.json();
      newResults.push({
        name: 'Health Check (/health)',
        status: healthResponse.ok ? 'success' : 'error',
        message: healthResponse.ok 
          ? `Status: ${healthData.status || 'ok'}` 
          : `Error: ${healthResponse.status} ${healthResponse.statusText}`,
        data: healthData,
      });
    } catch (error: any) {
      newResults.push({
        name: 'Health Check (/health)',
        status: 'error',
        message: `Error de conexión: ${error.message}`,
      });
    }

    // 3. Test /ready
    try {
      const readyResponse = await fetch(`${API_BASE_URL}/ready`);
      const readyData = await readyResponse.json();
      newResults.push({
        name: 'Readiness Check (/ready)',
        status: readyResponse.ok && readyData.ready ? 'success' : 'error',
        message: readyData.ready 
          ? 'Servicio listo para recibir tráfico' 
          : `Servicio no listo: ${JSON.stringify(readyData.checks || {})}`,
        data: readyData,
      });
    } catch (error: any) {
      newResults.push({
        name: 'Readiness Check (/ready)',
        status: 'error',
        message: `Error de conexión: ${error.message}`,
      });
    }

    // 4. Test /version
    try {
      const versionResponse = await fetch(`${API_BASE_URL}/version`);
      const versionData = await versionResponse.json();
      newResults.push({
        name: 'Version Info (/version)',
        status: versionResponse.ok ? 'success' : 'error',
        message: versionResponse.ok 
          ? `Environment: ${versionData.env || 'unknown'}` 
          : `Error: ${versionResponse.status}`,
        data: versionData,
      });
    } catch (error: any) {
      newResults.push({
        name: 'Version Info (/version)',
        status: 'error',
        message: `Error de conexión: ${error.message}`,
      });
    }

    // 5. Test /config
    try {
      const configResponse = await fetch(`${API_BASE_URL}/config`);
      const configData = await configResponse.json();
      newResults.push({
        name: 'Config Info (/config)',
        status: configResponse.ok ? 'success' : 'error',
        message: configResponse.ok 
          ? `CORS Origins: ${configData.corsOriginCount || 0}` 
          : `Error: ${configResponse.status}`,
        data: configData,
      });
    } catch (error: any) {
      newResults.push({
        name: 'Config Info (/config)',
        status: 'error',
        message: `Error de conexión: ${error.message}`,
      });
    }

    // 6. Test CORS (preflight)
    try {
      const corsResponse = await fetch(`${API_BASE_URL}/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
        },
      });
      newResults.push({
        name: 'CORS Preflight',
        status: corsResponse.ok || corsResponse.status === 204 ? 'success' : 'error',
        message: corsResponse.ok || corsResponse.status === 204
          ? 'CORS preflight exitoso'
          : `Error: ${corsResponse.status}`,
        data: {
          status: corsResponse.status,
          headers: Object.fromEntries(corsResponse.headers.entries()),
        },
      });
    } catch (error: any) {
      newResults.push({
        name: 'CORS Preflight',
        status: 'error',
        message: `Error: ${error.message}`,
      });
    }

    setResults(newResults);
    setIsLoading(false);
    setLastUpdate(new Date());
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Diagnóstico del Sistema</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Verifica la configuración y conectividad con el backend
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {lastUpdate && `Última actualización: ${lastUpdate.toLocaleTimeString()}`}
        </div>
        <button
          onClick={runDiagnostics}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(result.status)}
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{result.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{result.message}</p>
                {result.data && (
                  <details className="mt-2">
                    <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                      Ver detalles
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && results.length === 0 && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
            <p className="text-gray-600 dark:text-gray-400">Ejecutando diagnósticos...</p>
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">Información de Configuración</h3>
        <div className="text-sm space-y-1">
          <p><strong>API Base URL:</strong> {diagnosticsInfo.apiBaseUrl}</p>
          <p><strong>Window Origin:</strong> {diagnosticsInfo.windowOrigin}</p>
          <p><strong>Environment:</strong> {diagnosticsInfo.isProduction ? 'Production' : 'Development'}</p>
          <p><strong>Log Level:</strong> {diagnosticsInfo.logLevel}</p>
        </div>
      </div>
    </div>
  );
}

