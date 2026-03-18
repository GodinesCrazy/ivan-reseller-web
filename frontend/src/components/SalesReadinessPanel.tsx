/**
 * SalesReadinessPanel - Muestra si las notificaciones de ventas (webhooks) están configuradas.
 * Las ventas solo se registran cuando eBay/Mercado Libre envían la notificación al backend.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle, XCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface WebhookStatus {
  ebay?: { configured: boolean };
  mercadolibre?: { configured: boolean };
  amazon?: { configured: boolean };
}

interface SalesReadinessPanelProps {
  /** Called after a successful manual sync so the parent can refetch sales and sync-status */
  onSyncComplete?: () => void;
}

export default function SalesReadinessPanel({ onSyncComplete }: SalesReadinessPanelProps) {
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ webhookStatus?: WebhookStatus }>('/api/setup-status')
      .then((res) => {
        if (mounted && res.data?.webhookStatus) {
          setWebhookStatus(res.data.webhookStatus);
          return;
        }
        // Fallback: older backend may not send webhookStatus; try GET /api/webhooks/status
        return api.get<WebhookStatus>('/api/webhooks/status').then((statusRes) => {
          if (mounted && statusRes.data) setWebhookStatus(statusRes.data);
        });
      })
      .catch(() => {
        if (!mounted) return;
        return api.get<WebhookStatus>('/api/webhooks/status').then((statusRes) => {
          if (mounted && statusRes.data) setWebhookStatus(statusRes.data);
        }).catch(() => {});
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  if (loading) return null;
  // Show panel even when status is null (e.g. network error) so user sees the explanation and help link
  const status = webhookStatus ?? { ebay: { configured: false }, mercadolibre: { configured: false }, amazon: { configured: false } };

  const ebayOk = status.ebay?.configured === true;
  const mlOk = status.mercadolibre?.configured === true;
  const amazonOk = status.amazon?.configured === true;

  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5" />
          Listo para recibir ventas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Las ventas aparecen aquí cuando eBay o Mercado Libre envían la notificación a nuestro servidor.
          También pueden aparecer por sincronización automática con eBay (cada unos minutos), aunque no tengas la URL de notificaciones configurada; configurar webhooks mejora la inmediatez.
          Si no ves tu venta, usa &quot;Sincronizar ahora&quot; o comprueba las credenciales eBay y espera unos minutos.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const res = await api.post<{ ok: boolean; lastSyncAt: string | null }>('/api/orders/sync-marketplace');
                if (res.data?.ok) {
                  toast.success('Sincronización completada');
                  onSyncComplete?.();
                }
              } catch (e: any) {
                toast.error(e?.response?.data?.error || 'Error al sincronizar');
              } finally {
                setSyncing(false);
              }
            }}
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar ahora
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            {ebayOk ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
            eBay: {ebayOk ? 'Notificaciones configuradas' : 'No configuradas'}
          </span>
          <span className="flex items-center gap-2">
            {mlOk ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
            Mercado Libre: {mlOk ? 'Notificaciones configuradas' : 'No configuradas'}
          </span>
          <span className="flex items-center gap-2">
            {amazonOk ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-gray-400" />}
            Amazon: {amazonOk ? 'Notificaciones configuradas' : 'No configuradas'}
          </span>
        </div>
        <Link
          to="/help?section=webhooks"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          <HelpCircle className="w-4 h-4" />
          Cómo configurar notificaciones de ventas
        </Link>
      </CardContent>
    </Card>
  );
}
