import React, { useState } from 'react';
import { Bell, X, Check, AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useNotifications, NotificationPayload, NotificationAction } from '../../hooks/useNotifications';
import { api } from '../../services/api';

interface NotificationItemProps {
  notification: NotificationPayload;
  onMarkAsRead: (id: string) => void;
  onAction: (action: NotificationAction) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onAction
}) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'JOB_COMPLETED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'JOB_FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'JOB_STARTED':
      case 'JOB_PROGRESS':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'PRODUCT_SCRAPED':
      case 'PRODUCT_PUBLISHED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'SALE_CREATED':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'SYSTEM_ALERT':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPriorityColor = () => {
    switch (notification.priority) {
      case 'URGENT':
        return 'border-l-red-500 bg-red-50';
      case 'HIGH':
        return 'border-l-orange-500 bg-orange-50';
      case 'NORMAL':
        return 'border-l-blue-500 bg-blue-50';
      case 'LOW':
        return 'border-l-gray-500 bg-gray-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const handleActionClick = (action: NotificationAction) => {
    if (action.url) {
      window.open(action.url, '_blank');
    }
    onAction(action);
  };

  const getActionButtonClass = (variant: string) => {
    const baseClass = 'px-3 py-1 rounded text-sm font-medium transition-colors';
    switch (variant) {
      case 'primary':
        return `${baseClass} bg-blue-600 text-white hover:bg-blue-700`;
      case 'success':
        return `${baseClass} bg-green-600 text-white hover:bg-green-700`;
      case 'danger':
        return `${baseClass} bg-red-600 text-white hover:bg-red-700`;
      case 'secondary':
      default:
        return `${baseClass} bg-gray-600 text-white hover:bg-gray-700`;
    }
  };

  return (
    <div
      className={`border-l-4 p-4 mb-3 rounded-r-lg ${getPriorityColor()} ${
        notification.read ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {notification.title}
            </h4>
            
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">
                {new Date(notification.timestamp).toLocaleTimeString()}
              </span>
              
              {!notification.read && (
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Marcar como leído"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <p className="text-sm text-gray-700 mt-1">
            {notification.message}
          </p>
          
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {notification.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleActionClick({ ...action, notification } as any)}
                  className={getActionButtonClass(action.variant)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface NotificationCenterProps {
  className?: string;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    clearAll,
    sendTestNotification
  } = useNotifications();

  const handleAction = async (action: NotificationAction) => {
    try {
      if (action.action && action.action.startsWith('continue_stage:')) {
        const stage = action.action.split(':')[1];
        await api.post(`/api/workflow/continue-stage`, {
          stage,
          action: 'continue'
        });
      } else if (action.action && (action.action.includes('_guided') || action.action.includes('guided'))) {
        // Manejar acciones guided (confirm/cancel)
        const notificationData = (action as any).notification?.data || {};
        const actionId = notificationData.actionId || action.id;
        
        if (action.action.includes('confirm_')) {
          // Confirmar acción guided
          await api.post('/api/workflow/handle-guided-action', {
            action: action.action,
            actionId: actionId,
            data: notificationData
          });
        } else if (action.action.includes('cancel_')) {
          // Cancelar acción guided
          await api.post('/api/workflow/handle-guided-action', {
            action: action.action,
            actionId: actionId,
            data: notificationData
          });
        }
      }
    } catch (e: any) {
      console.error('Failed to perform action:', e);
      // Mostrar error al usuario
      if (e.response?.data?.error) {
        alert(`Error: ${e.response.data.error}`);
      } else {
        alert('Error al procesar la acción. Por favor, intenta nuevamente.');
      }
    }
  };

  const connectionStatus = () => {
    if (isConnected) {
      return (
        <div className="flex items-center text-green-600 text-xs mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          Conectado en tiempo real
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-red-600 text-xs mb-2">
          <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
          Desconectado
        </div>
      );
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        title="Notificaciones"
      >
        <Bell className="w-6 h-6" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Panel */}
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border z-50 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Notificaciones
                  {unreadCount > 0 && (
                    <span className="ml-2 text-sm text-gray-500">
                      ({unreadCount} nuevas)
                    </span>
                  )}
                </h3>
                
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {connectionStatus()}
              
              {/* Action Buttons */}
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={clearAll}
                  disabled={notifications.length === 0}
                  className="text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  Limpiar Todo
                </button>
                
                <button
                  onClick={sendTestNotification}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Enviar Prueba
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No hay notificaciones</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onAction={handleAction}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
