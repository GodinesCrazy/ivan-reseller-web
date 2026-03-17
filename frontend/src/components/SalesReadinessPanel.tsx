/**
 * SalesReadinessPanel - Muestra si las notificaciones de ventas (webhooks) están configuradas.
 * Las ventas solo se registran cuando eBay/Mercado Libre envían la notificación al backend.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/services/api';

interface WebhookStatus {
  ebay?: { configured: boolean };
  mercadolibre?: { configured: boolean };
  amazon?: { configured: boolean };
}

export default function SalesReadinessPanel() {
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);

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
          Si no tienes ventas, comprueba que hayas registrado la URL de notificaciones en tu cuenta de desarrollador.
        </p>
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
