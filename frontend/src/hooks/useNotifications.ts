import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export interface NotificationPayload {
  id: string;
  type: 'JOB_STARTED' | 'JOB_PROGRESS' | 'JOB_COMPLETED' | 'JOB_FAILED' | 'PRODUCT_SCRAPED' | 'PRODUCT_PUBLISHED' | 'INVENTORY_UPDATED' | 'SALE_CREATED' | 'COMMISSION_CALCULATED' | 'PAYOUT_PROCESSED' | 'SYSTEM_ALERT' | 'USER_ACTION';
  title: string;
  message: string;
  data?: any;
  userId?: number;
  timestamp: Date;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category: 'JOB' | 'PRODUCT' | 'SALE' | 'SYSTEM' | 'USER';
  read?: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  url?: string;
  action?: string;
  variant: 'primary' | 'secondary' | 'danger' | 'success';
}

interface UseNotificationsReturn {
  notifications: NotificationPayload[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (notificationId: string) => void;
  clearAll: () => void;
  sendTestNotification: () => Promise<void>;
}

export const useNotifications = (): UseNotificationsReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { token, user } = useAuthStore();

  // Initialize socket connection
  useEffect(() => {
    if (!token || !user) {
      return;
    }

    console.log('🔌 Initializing Socket.IO connection...');

    const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      setIsConnected(true);
      
      // Join user-specific room
      newSocket.emit('join_room', `user_${user.id}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔌 Socket.IO connection error:', error);
      setIsConnected(false);
    });

    // Listen for notifications
    newSocket.on('notification', (notification: NotificationPayload) => {
      console.log('📨 New notification:', notification);
      
      setNotifications(prev => {
        // Avoid duplicates
        const exists = prev.some(n => n.id === notification.id);
        if (exists) return prev;
        
        // Add new notification to the beginning
        const updated = [notification, ...prev];
        
        // Keep only last 50 notifications
        return updated.slice(0, 50);
      });

      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        showBrowserNotification(notification);
      }

      // Play notification sound for important notifications
      if (notification.priority === 'HIGH' || notification.priority === 'URGENT') {
        playNotificationSound();
      }
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('📱 Notification permission:', permission);
      });
    }

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('🔌 Cleaning up Socket.IO connection...');
      newSocket.close();
    };
  }, [token, user]);

  // Send activity pings to keep connection alive
  useEffect(() => {
    if (!socket || !isConnected) return;

    const interval = setInterval(() => {
      socket.emit('activity');
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [socket, isConnected]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    if (socket) {
      socket.emit('mark_notification_read', notificationId);
    }
    
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  }, [socket]);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/notifications/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to send test notification');
      }

      console.log('✅ Test notification sent');
    } catch (error) {
      console.error('❌ Failed to send test notification:', error);
    }
  }, [token]);

  // Calculate unread count
  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    clearAll,
    sendTestNotification
  };
};

// Helper function to show browser notification
function showBrowserNotification(notification: NotificationPayload) {
  try {
    const browserNotification = new Notification(notification.title, {
      body: notification.message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: notification.id,
      requireInteraction: notification.priority === 'URGENT',
      silent: notification.priority === 'LOW'
    });

    // Auto-close after 5 seconds unless it's urgent
    if (notification.priority !== 'URGENT') {
      setTimeout(() => {
        browserNotification.close();
      }, 5000);
    }

    // Handle click
    browserNotification.onclick = () => {
      window.focus();
      browserNotification.close();
      
      // Navigate to action URL if available
      const primaryAction = notification.actions?.find(a => a.variant === 'primary');
      if (primaryAction?.url) {
        window.location.href = primaryAction.url;
      }
    };
  } catch (error) {
    console.error('Failed to show browser notification:', error);
  }
}

// Helper function to play notification sound
function playNotificationSound() {
  try {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
}
