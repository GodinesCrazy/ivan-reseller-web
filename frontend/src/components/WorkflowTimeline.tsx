import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle, XCircle, Clock, Loader2, Info } from 'lucide-react';
import type { TimelineEvent, WorkflowStage } from '@/types/product-workflow.types';

interface WorkflowTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const stageLabels: Record<WorkflowStage, string> = {
  scrape: 'SCRAPE',
  analyze: 'ANALYZE',
  publish: 'PUBLISH',
  purchase: 'PURCHASE',
  fulfillment: 'FULFILLMENT',
  customerService: 'SERVICE',
};

export default function WorkflowTimeline({ events, className = '' }: WorkflowTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className={`text-sm text-gray-500 italic ${className}`}>
        No hay eventos registrados aún
      </div>
    );
  }

  const getEventIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'in-progress':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      case 'in-progress':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-5 h-5 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Timeline de Eventos</h3>
      </div>
      <div className="space-y-2">
        {events.map((event, index) => {
          const eventDate = new Date(event.timestamp);
          let timeAgo: string;
          try {
            timeAgo = formatDistanceToNow(eventDate, { addSuffix: true, locale: es });
          } catch {
            // Fallback si hay error con la localización
            timeAgo = formatDistanceToNow(eventDate, { addSuffix: true });
          }

          return (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getEventColor(
                event.status
              )}`}
            >
              <div className="mt-0.5">{getEventIcon(event.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700">
                    {stageLabels[event.stage]}
                  </span>
                  <span className="text-xs text-gray-600">•</span>
                  <span className="text-xs text-gray-600">{timeAgo}</span>
                  {event.actor && (
                    <>
                      <span className="text-xs text-gray-600">•</span>
                      <span className="text-xs text-gray-500">{event.actor === 'system' ? 'Sistema' : 'Usuario'}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-900 mt-1">{event.action}</p>
                {event.details && (
                  <p className="text-xs text-gray-600 mt-1">{event.details}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

