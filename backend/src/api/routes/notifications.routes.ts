import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { notificationService } from '../../services/notification.service';
import { z } from 'zod';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const sendNotificationSchema = z.object({
  userId: z.number().optional(),
  userIds: z.array(z.number()).optional(),
  role: z.string().optional(),
  type: z.enum([
    'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED',
    'PRODUCT_SCRAPED', 'PRODUCT_PUBLISHED', 'INVENTORY_UPDATED',
    'SALE_CREATED', 'COMMISSION_CALCULATED', 'PAYOUT_PROCESSED',
    'SYSTEM_ALERT', 'USER_ACTION'
  ]),
  title: z.string(),
  message: z.string(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  category: z.enum(['JOB', 'PRODUCT', 'SALE', 'SYSTEM', 'USER']),
  data: z.any().optional(),
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    url: z.string().optional(),
    action: z.string().optional(),
    variant: z.enum(['primary', 'secondary', 'danger', 'success'])
  })).optional()
});

/**
 * @swagger
 * /api/notifications/history:
 *   get:
 *     tags: [Notifications]
 *     summary: Get user's notification history
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const notifications = notificationService.getNotificationHistory(userId);
    
    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get notification history'
    });
  }
});

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     tags: [Notifications]
 *     summary: Send notification (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - title
 *               - message
 *               - category
 *             properties:
 *               userId:
 *                 type: number
 *                 description: Send to specific user
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Send to multiple users
 *               role:
 *                 type: string
 *                 description: Send to users with specific role
 *               type:
 *                 type: string
 *                 enum: [JOB_STARTED, JOB_COMPLETED, JOB_FAILED, PRODUCT_SCRAPED, PRODUCT_PUBLISHED, INVENTORY_UPDATED, SALE_CREATED, COMMISSION_CALCULATED, PAYOUT_PROCESSED, SYSTEM_ALERT, USER_ACTION]
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *               category:
 *                 type: string
 *                 enum: [JOB, PRODUCT, SALE, SYSTEM, USER]
 *               data:
 *                 type: object
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Notification sent successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only admins can send custom notifications
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const validatedData = sendNotificationSchema.parse(req.body);
    const { userId, userIds, role, ...notificationData } = validatedData;

    // Send to specific user(s)
    if (userId) {
      notificationService.sendToUser(userId, notificationData as any);
    } else if (userIds && userIds.length > 0) {
      notificationService.sendToUser(userIds, notificationData as any);
    } else if (role) {
      notificationService.sendToRole(role, notificationData as any);
    } else {
      // Broadcast to all users
      notificationService.broadcast(notificationData as any);
    }

    res.json({
      success: true,
      message: 'Notification sent successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/stats:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification system stats (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification stats retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Only admins can view system stats
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const connectedUsers = notificationService.getConnectedUsers();
    const connectedCount = notificationService.getConnectedUsersCount();

    res.json({
      success: true,
      stats: {
        connectedUsers: connectedCount,
        connections: connectedUsers.map(user => ({
          userId: user.userId,
          username: user.username,
          role: user.role,
          connectedAt: user.connectedAt,
          lastActivity: user.lastActivity
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get notification stats'
    });
  }
});

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     tags: [Notifications]
 *     summary: Send test notification to current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test notification sent
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    notificationService.sendToUser(userId, {
      type: 'USER_ACTION',
      title: 'Notificación de Prueba',
      message: 'Esta es una notificación de prueba del sistema en tiempo real',
      priority: 'NORMAL',
      category: 'USER',
      data: {
        timestamp: new Date(),
        userAgent: req.headers['user-agent']
      },
      actions: [
        {
          id: 'dismiss',
          label: 'Entendido',
          variant: 'primary'
        }
      ]
    });

    res.json({
      success: true,
      message: 'Test notification sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

/**
 * @swagger
 * /api/notifications/system/alert:
 *   post:
 *     tags: [Notifications]
 *     summary: Send system alert (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, NORMAL, HIGH, URGENT]
 *                 default: NORMAL
 *     responses:
 *       200:
 *         description: System alert sent
 *       403:
 *         description: Insufficient permissions
 */
router.post('/system/alert', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    const { message, priority = 'NORMAL' } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    notificationService.notifySystemAlert(message, priority);

    res.json({
      success: true,
      message: 'System alert sent to admins'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send system alert'
    });
  }
});

/**
 * @swagger
 * /api/notifications/user/{userId}/online:
 *   get:
 *     tags: [Notifications]
 *     summary: Check if user is online
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to check
 *     responses:
 *       200:
 *         description: User online status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 online:
 *                   type: boolean
 */
router.get('/user/:userId/online', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    const isOnline = notificationService.isUserOnline(userId);

    res.json({
      success: true,
      online: isOnline
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check user online status'
    });
  }
});

export default router;