/**
 * System Status Panel - RC1
 * Shows: PayPal Connected, eBay Connected, AliExpress OAuth, Autopilot Enabled, Profit Guard Enabled
 */

import { useState, useEffect } from 'react';
import api from '@/services/api';
import { CheckCircle, XCircle, Loader2, Activity } from 'lucide-react';

interface StatusData {
  paypalConnected: boolean;
  ebayConnected: boolean;
  aliexpressOAuth: boolean;
  autopilotEnabled: boolean;
  profitGuardEnabled: boolean;
}

export default function SystemStatus() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/api/system/status')
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setStatus(res.data.data);
        } else {
          setError('No se pudo cargar el estado');
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.error || err?.message || 'Error al cargar');
      })
      .finally(() => setLoading(false));
  }, []);

  const Item = ({ label, connected }: { label: string; connected: boolean }) => (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {connected ? (
        <CheckCircle className="w-5 h-5 text-green-600" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500" />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-red-700 dark:text-red-300">{error || 'Error desconocido'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Estado del sistema</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Resumen de conexiones y m�dulos activos
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <Item label="PayPal conectado" connected={status.paypalConnected} />
        <Item label="eBay conectado" connected={status.ebayConnected} />
        <Item label="AliExpress OAuth" connected={status.aliexpressOAuth} />
        <Item label="Autopilot habilitado" connected={status.autopilotEnabled} />
        <Item label="Profit Guard habilitado" connected={status.profitGuardEnabled} />
      </div>
    </div>
  );
}
