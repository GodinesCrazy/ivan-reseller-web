import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Tipos de notificaciones
export type NotificationType = 
  | 'JOB_STARTED' 
  | 'JOB_COMPLETED' 
  | 'JOB_FAILED'
  | 'JOB_PROGRESS'
  | 'PRODUCT_SCRAPED'
  | 'PRODUCT_PUBLISHED'
  | 'INVENTORY_UPDATED'
  | 'SALE_CREATED'
  | 'COMMISSION_CALCULATED'
  | 'PAYOUT_PROCESSED'
  | 'SYSTEM_ALERT'
  | 'USER_ACTION';

export interface NotificationPayload {
  id: string;
  type: NotificationType;
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

export interface ConnectedUser {
  userId: number;
  socketId: string;
  username: string;
  role: string;
  connectedAt: Date;
  lastActivity: Date;
}

class NotificationService {
  private io: Server | null = null;
  private connectedUsers = new Map<number, ConnectedUser[]>();
  private notificationHistory = new Map<number, NotificationPayload[]>();

  /**
   * Initialize Socket.IO server
   */
  initialize(httpServer: HttpServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupSocketHandlers();
    console.log('✅ Socket.IO notification service initialized');
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      const user = socket.data.user;
      console.log(`🔗 User ${user.username} connected (${socket.id})`);

      // Add user to connected users
      this.addConnectedUser(user, socket.id);

      // Send recent notifications
      this.sendRecentNotifications(user.userId, socket.id);

      // Handle client events
      socket.on('mark_notification_read', (notificationId: string) => {
        this.markNotificationRead(user.userId, notificationId);
      });

      socket.on('get_notification_history', (callback) => {
        const history = this.getNotificationHistory(user.userId);
        callback(history);
      });

      socket.on('join_room', (room: string) => {
        socket.join(`user_${user.userId}`);
        socket.join(`role_${user.role}`);
        if (room) socket.join(room);
        console.log(`👥 User ${user.username} joined rooms`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 User ${user.username} disconnected (${socket.id})`);
        this.removeConnectedUser(user.userId, socket.id);
      });

      // Update last activity
      socket.on('activity', () => {
        this.updateUserActivity(user.userId, socket.id);
      });
    });
  }

  /**
   * Authenticate socket connections using JWT
   */
  private async authenticateSocket(socket: any, next: any): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      socket.data.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  }

  /**
   * Send notification to specific user(s)
   */
  sendToUser(userId: number | number[], notification: Omit<NotificationPayload, 'id' | 'timestamp'>): void {
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    userIds.forEach(uid => {
      const fullNotification: NotificationPayload = {
        ...notification,
        id: this.generateNotificationId(),
        timestamp: new Date(),
        userId: uid
      };

      // Store notification in history
      this.addToHistory(uid, fullNotification);

      // Send to connected sockets
      const connectedUser = this.connectedUsers.get(uid);
      if (connectedUser && connectedUser.length > 0) {
        connectedUser.forEach(user => {
          this.io?.to(user.socketId).emit('notification', fullNotification);
        });
      }

      console.log(`📨 Notification sent to user ${uid}: ${notification.title}`);
    });
  }

  /**
   * Send notification to all users with specific role
   */
  sendToRole(role: string, notification: Omit<NotificationPayload, 'id' | 'timestamp'>): void {
    const fullNotification: NotificationPayload = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: new Date()
    };

    this.io?.to(`role_${role}`).emit('notification', fullNotification);
    console.log(`📢 Broadcast notification to role ${role}: ${notification.title}`);
  }

  /**
   * Send notification to all connected users
   */
  broadcast(notification: Omit<NotificationPayload, 'id' | 'timestamp'>): void {
    const fullNotification: NotificationPayload = {
      ...notification,
      id: this.generateNotificationId(),
      timestamp: new Date()
    };

    this.io?.emit('notification', fullNotification);
    console.log(`📡 Broadcast notification: ${notification.title}`);
  }

  /**
   * Job-specific notifications
   */
  notifyJobStarted(userId: number, jobType: string, jobId: string): void {
    this.sendToUser(userId, {
      type: 'JOB_STARTED',
      title: 'Job Iniciado',
      message: `El trabajo ${jobType} ha comenzado`,
      data: { jobType, jobId },
      priority: 'NORMAL',
      category: 'JOB',
      actions: [
        {
          id: 'view_job',
          label: 'Ver Detalles',
          url: `/jobs/${jobId}`,
          variant: 'primary'
        }
      ]
    });
  }

  notifyJobCompleted(userId: number, jobType: string, jobId: string, result?: any): void {
    this.sendToUser(userId, {
      type: 'JOB_COMPLETED',
      title: 'Job Completado',
      message: `El trabajo ${jobType} ha terminado exitosamente`,
      data: { jobType, jobId, result },
      priority: 'NORMAL',
      category: 'JOB',
      actions: [
        {
          id: 'view_result',
          label: 'Ver Resultado',
          url: `/jobs/${jobId}/result`,
          variant: 'success'
        }
      ]
    });
  }

  notifyJobFailed(userId: number, jobType: string, jobId: string, error: string): void {
    this.sendToUser(userId, {
      type: 'JOB_FAILED',
      title: 'Job Fallido',
      message: `El trabajo ${jobType} ha fallado: ${error}`,
      data: { jobType, jobId, error },
      priority: 'HIGH',
      category: 'JOB',
      actions: [
        {
          id: 'retry_job',
          label: 'Reintentar',
          action: 'retry_job',
          variant: 'primary'
        },
        {
          id: 'view_error',
          label: 'Ver Error',
          url: `/jobs/${jobId}/error`,
          variant: 'danger'
        }
      ]
    });
  }

  /**
   * Product-specific notifications
   */
  notifyProductScraped(userId: number, productId: number, title: string): void {
    this.sendToUser(userId, {
      type: 'PRODUCT_SCRAPED',
      title: 'Producto Extraído',
      message: `Nuevo producto: ${title}`,
      data: { productId },
      priority: 'NORMAL',
      category: 'PRODUCT',
      actions: [
        {
          id: 'view_product',
          label: 'Ver Producto',
          url: `/products/${productId}`,
          variant: 'primary'
        },
        {
          id: 'publish_product',
          label: 'Publicar',
          action: 'publish_product',
          variant: 'success'
        }
      ]
    });
  }

  notifyProductPublished(userId: number, productId: number, marketplace: string, listingUrl?: string): void {
    this.sendToUser(userId, {
      type: 'PRODUCT_PUBLISHED',
      title: 'Producto Publicado',
      message: `Producto publicado en ${marketplace}`,
      data: { productId, marketplace, listingUrl },
      priority: 'NORMAL',
      category: 'PRODUCT',
      actions: [
        {
          id: 'view_listing',
          label: 'Ver Listado',
          url: listingUrl || `/products/${productId}`,
          variant: 'primary'
        }
      ]
    });
  }

  /**
   * Sale-specific notifications
   */
  notifySaleCreated(userId: number, saleId: number, orderId: string, amount: number): void {
    this.sendToUser(userId, {
      type: 'SALE_CREATED',
      title: 'Nueva Venta',
      message: `Venta por $${amount} - Orden: ${orderId}`,
      data: { saleId, orderId, amount },
      priority: 'HIGH',
      category: 'SALE',
      actions: [
        {
          id: 'view_sale',
          label: 'Ver Venta',
          url: `/sales/${saleId}`,
          variant: 'success'
        }
      ]
    });
  }

  /**
   * System notifications
   */
  notifySystemAlert(message: string, priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'): void {
    this.sendToRole('ADMIN', {
      type: 'SYSTEM_ALERT',
      title: 'Alerta del Sistema',
      message,
      priority,
      category: 'SYSTEM',
      actions: [
        {
          id: 'view_logs',
          label: 'Ver Logs',
          url: '/admin/logs',
          variant: 'primary'
        }
      ]
    });
  }

  /**
   * Get notification history for user
   */
  getNotificationHistory(userId: number): NotificationPayload[] {
    return this.notificationHistory.get(userId) || [];
  }

  /**
   * Mark notification as read
   */
  private markNotificationRead(userId: number, notificationId: string): void {
    const history = this.notificationHistory.get(userId);
    if (history) {
      const notification = history.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
      }
    }
  }

  /**
   * Send recent unread notifications to newly connected user
   */
  private sendRecentNotifications(userId: number, socketId: string): void {
    const history = this.notificationHistory.get(userId) || [];
    const unread = history.filter(n => !n.read).slice(-10); // Last 10 unread

    unread.forEach(notification => {
      this.io?.to(socketId).emit('notification', notification);
    });
  }

  /**
   * Add user to connected users map
   */
  private addConnectedUser(user: any, socketId: string): void {
    const connectedUser: ConnectedUser = {
      userId: user.userId,
      socketId,
      username: user.username,
      role: user.role,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    const existing = this.connectedUsers.get(user.userId) || [];
    existing.push(connectedUser);
    this.connectedUsers.set(user.userId, existing);
  }

  /**
   * Remove user from connected users map
   */
  private removeConnectedUser(userId: number, socketId: string): void {
    const users = this.connectedUsers.get(userId) || [];
    const filtered = users.filter(u => u.socketId !== socketId);
    
    if (filtered.length > 0) {
      this.connectedUsers.set(userId, filtered);
    } else {
      this.connectedUsers.delete(userId);
    }
  }

  /**
   * Update user activity timestamp
   */
  private updateUserActivity(userId: number, socketId: string): void {
    const users = this.connectedUsers.get(userId) || [];
    const user = users.find(u => u.socketId === socketId);
    if (user) {
      user.lastActivity = new Date();
    }
  }

  /**
   * Add notification to user history
   */
  private addToHistory(userId: number, notification: NotificationPayload): void {
    const history = this.notificationHistory.get(userId) || [];
    history.push(notification);

    // Keep only last 100 notifications per user
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.notificationHistory.set(userId, history);
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get all connected users (admin only)
   */
  getConnectedUsers(): ConnectedUser[] {
    const allUsers: ConnectedUser[] = [];
    this.connectedUsers.forEach(users => {
      allUsers.push(...users);
    });
    return allUsers;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: number): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Send automation alert
   */
  async sendAlert(alert: {
    type: 'success' | 'error' | 'warning' | 'info' | 'sale' | 'purchase' | 'action_required';
    title: string;
    message: string;
    data?: Record<string, any>;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    actions?: NotificationAction[];
  }): Promise<string> {
    const notificationPayload: NotificationPayload = {
      id: this.generateNotificationId(),
      type: this.mapAlertTypeToNotificationType(alert.type),
      title: alert.title,
      message: alert.message,
      data: alert.data || {},
      timestamp: new Date(),
      priority: alert.priority || 'NORMAL',
      category: this.getCategoryFromType(alert.type),
      read: false,
      actions: alert.actions
    };

    // Send to all connected users (in a real system, this would be more targeted)
    await this.broadcast(notificationPayload);

    return notificationPayload.id;
  }

  /**
   * Map alert type to notification type
   */
  private mapAlertTypeToNotificationType(alertType: string): NotificationType {
    switch (alertType) {
      case 'sale':
        return 'SALE_CREATED';
      case 'purchase':
        return 'PRODUCT_SCRAPED'; // Closest match
      case 'error':
        return 'SYSTEM_ALERT';
      case 'success':
        return 'JOB_COMPLETED';
      case 'warning':
        return 'SYSTEM_ALERT';
      case 'action_required':
        return 'USER_ACTION';
      case 'info':
      default:
        return 'SYSTEM_ALERT';
    }
  }

  /**
   * Get category from alert type
   */
  private getCategoryFromType(alertType: string): NotificationPayload['category'] {
    switch (alertType) {
      case 'sale':
      case 'purchase':
        return 'SALE';
      case 'error':
      case 'warning':
      case 'info':
        return 'SYSTEM';
      case 'action_required':
        return 'USER';
      case 'success':
      default:
        return 'JOB';
    }
  }

  /**
   * Send business opportunity notification
   */
  async notifyOpportunityFound(opportunity: any): Promise<void> {
    await this.sendAlert({
      type: 'info',
      title: 'Nueva oportunidad detectada',
      message: `Se encontró una oportunidad rentable: ${opportunity.title}`,
      data: {
        productTitle: opportunity.title,
        profitMargin: opportunity.profitMargin,
        confidence: opportunity.confidence,
        estimatedProfit: opportunity.estimatedProfit
      },
      priority: opportunity.confidence > 90 ? 'HIGH' : 'NORMAL'
    });
  }

  /**
   * Send transaction status notification
   */
  async notifyTransactionUpdate(transaction: any): Promise<void> {
    let alertType: 'success' | 'error' | 'info' | 'warning' = 'info';
    let title = 'Actualización de transacción';
    let message = `Transacción ${transaction.id} actualizada`;

    switch (transaction.status) {
      case 'completed':
        alertType = 'success';
        title = 'Transacción completada';
        message = `Venta completada exitosamente. Ganancia: $${transaction.amounts.profit.toFixed(2)}`;
        break;
      case 'error':
        alertType = 'error';
        title = 'Error en transacción';
        message = `Error procesando la transacción: ${transaction.error || 'Error desconocido'}`;
        break;
      case 'processing':
        alertType = 'info';
        title = 'Procesando transacción';
        message = `Procesando compra automática para: ${transaction.productTitle}`;
        break;
    }

    await this.sendAlert({
      type: alertType,
      title,
      message,
      data: {
        transactionId: transaction.id,
        productTitle: transaction.productTitle,
        status: transaction.status,
        profit: transaction.amounts?.profit,
        wasAutomated: transaction.automation?.wasAutomated
      },
      priority: alertType === 'error' ? 'HIGH' : 'NORMAL'
    });
  }

  /**
   * Send automation mode change notification
   */
  async notifyModeChange(oldMode: string, newMode: string, environment: string): Promise<void> {
    await this.sendAlert({
      type: 'info',
      title: 'Modo de sistema cambiado',
      message: `Sistema cambiado de ${oldMode} a ${newMode} en entorno ${environment}`,
      data: {
        oldMode,
        newMode,
        environment,
        timestamp: new Date().toISOString()
      },
      priority: 'NORMAL'
    });
  }

  /**
   * Send system health notification
   */
  async notifySystemHealth(status: 'healthy' | 'warning' | 'critical', details: string): Promise<void> {
    const alertType = status === 'healthy' ? 'success' : status === 'warning' ? 'warning' : 'error';
    const priority = status === 'critical' ? 'URGENT' : status === 'warning' ? 'HIGH' : 'NORMAL';

    await this.sendAlert({
      type: alertType,
      title: `Estado del sistema: ${status}`,
      message: details,
      data: {
        systemStatus: status,
        checkTime: new Date().toISOString()
      },
      priority
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
