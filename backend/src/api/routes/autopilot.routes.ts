import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { autopilotSystem } from '../../services/autopilot.service';
import { workflowConfigService } from '../../services/workflow-config.service';
import logger from '../../config/logger';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

/**
 * ✅ GET /api/autopilot/workflows - Obtener workflows configurados (placeholder)
 * Nota: El sistema de autopilot usa un enfoque diferente, pero mantenemos este endpoint
 * para compatibilidad con el frontend
 */
router.get('/workflows', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Por ahora retornar workflows vacíos ya que el sistema usa configuración diferente
    // TODO: Implementar sistema de workflows si es necesario
    res.json({
      success: true,
      workflows: []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET /api/autopilot/stats - Obtener estadísticas del autopilot
 */
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = autopilotSystem.getStatus();
    const stats = status.basicStats;
    
    res.json({
      success: true,
      stats: {
        activeWorkflows: 0,
        totalRuns: stats.totalRuns,
        successRate: stats.successRate,
        itemsProcessed: stats.totalProductsProcessed,
        lastRunTime: stats.lastRunTimestamp?.toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET /api/autopilot/status - Obtener estado del autopilot
 */
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = autopilotSystem.getStatus();
    const stats = status.basicStats;
    const isRunning = stats.currentStatus === 'running';
    
    res.json({
      success: true,
      running: isRunning,
      status: stats.currentStatus,
      lastCycle: stats.lastRunTimestamp
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ POST /api/autopilot/start - Iniciar autopilot
 */
router.post('/start', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // TODO: Pasar userId al método start() cuando esté disponible
    // Por ahora usar método existente
    await autopilotSystem.start();
    
    res.json({
      success: true,
      message: 'Autopilot started successfully'
    });
  } catch (error: any) {
    logger.error('Error starting autopilot', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start autopilot'
    });
  }
});

/**
 * ✅ POST /api/autopilot/stop - Detener autopilot
 */
router.post('/stop', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    autopilotSystem.stop();
    
    res.json({
      success: true,
      message: 'Autopilot stopped successfully'
    });
  } catch (error: any) {
    logger.error('Error stopping autopilot', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to stop autopilot'
    });
  }
});

/**
 * ✅ GET /api/autopilot/workflows/:id/logs - Obtener logs de un workflow (placeholder)
 */
router.get('/workflows/:id/logs', async (req: Request, res: Response, next) => {
  try {
    res.json({
      success: true,
      logs: []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET /api/autopilot/logs - Obtener logs generales del autopilot
 */
router.get('/logs', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Por ahora retornar logs vacíos
    // TODO: Implementar sistema de logs si es necesario
    res.json({
      success: true,
      logs: []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ POST /api/autopilot/workflows - Crear workflow (placeholder)
 */
router.post('/workflows', async (req: Request, res: Response, next) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Workflow system not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ PUT /api/autopilot/workflows/:id - Actualizar workflow (placeholder)
 */
router.put('/workflows/:id', async (req: Request, res: Response, next) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Workflow system not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ PUT /api/autopilot/workflows/:id - Toggle workflow enabled (placeholder)
 */
router.put('/workflows/:id/enabled', async (req: Request, res: Response, next) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Workflow system not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ DELETE /api/autopilot/workflows/:id - Eliminar workflow (placeholder)
 */
router.delete('/workflows/:id', async (req: Request, res: Response, next) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Workflow system not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ POST /api/autopilot/workflows/:id/run - Ejecutar workflow manualmente (placeholder)
 */
router.post('/workflows/:id/run', async (req: Request, res: Response, next) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Workflow system not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

export default router;

