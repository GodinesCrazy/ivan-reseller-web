import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { meetingRoomService } from '../../services/meeting-room.service';
import { logger } from '../../config/logger';
import { AppError } from '../../middleware/error.middleware';

const router = Router();
router.use(authenticate);

/**
 * GET /api/meeting-room/availability
 * Verificar disponibilidad del admin
 */
router.get('/availability', async (req: Request, res: Response) => {
  try {
    const status = await meetingRoomService.checkAdminAvailability();
    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    logger.error('Error checking admin availability', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Error al verificar disponibilidad del administrador'
    });
  }
});

/**
 * POST /api/meeting-room/create
 * Crear o unirse a una reunión
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user?.role?.toUpperCase() || 'USER';
    const isAdmin = userRole === 'ADMIN';

    const meetingInfo = await meetingRoomService.createOrJoinMeeting(userId, isAdmin);

    res.json({
      success: true,
      data: meetingInfo
    });
  } catch (error: any) {
    logger.error('Error creating or joining meeting', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Error al crear o unirse a la reunión'
    });
  }
});

/**
 * GET /api/meeting-room/:roomId
 * Obtener información de una reunión
 */
router.get('/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.userId;

    const meetingInfo = await meetingRoomService.getMeetingInfo(roomId, userId);

    if (!meetingInfo) {
      return res.status(404).json({
        success: false,
        error: 'Reunión no encontrada'
      });
    }

    res.json({
      success: true,
      data: meetingInfo
    });
  } catch (error: any) {
    logger.error('Error getting meeting info', {
      error: error?.message || String(error),
      roomId: req.params.roomId,
      userId: req.user?.userId
    });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Error al obtener información de la reunión'
    });
  }
});

/**
 * POST /api/meeting-room/:roomId/end
 * Finalizar una reunión
 */
router.post('/:roomId/end', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.userId;

    await meetingRoomService.endMeeting(roomId, userId);

    res.json({
      success: true,
      message: 'Reunión finalizada correctamente'
    });
  } catch (error: any) {
    logger.error('Error ending meeting', {
      error: error?.message || String(error),
      roomId: req.params.roomId,
      userId: req.user?.userId
    });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Error al finalizar la reunión'
    });
  }
});

/**
 * GET /api/meeting-room/history
 * Obtener historial de reuniones del usuario
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const history = await meetingRoomService.getUserMeetingHistory(userId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error: any) {
    logger.error('Error getting meeting history', {
      error: error?.message || String(error),
      userId: req.user?.userId
    });
    res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Error al obtener historial de reuniones'
    });
  }
});

export default router;

