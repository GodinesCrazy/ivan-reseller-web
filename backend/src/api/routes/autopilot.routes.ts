import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { autopilotSystem } from '../../services/autopilot.service';
import { workflowConfigService } from '../../services/workflow-config.service';
import { workflowService } from '../../services/workflow.service';
import logger from '../../config/logger';
import { z } from 'zod';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

/**
 * ✅ FASE 3: GET /api/autopilot/workflows - Obtener workflows del usuario
 */
router.get('/workflows', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflows = await workflowService.getUserWorkflows(userId);
    
    res.json({
      success: true,
      workflows
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
    const stats = status.stats; // ✅ CORRECCIÓN: usar status.stats en lugar de status.basicStats
    
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
 * ✅ GET /api/autopilot/health - Health endpoint for autopilot observability
 * Returns autopilot status, stage metrics, and readiness
 */
router.get('/health', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = autopilotSystem.getStatus();
    const lastCycle = status.lastCycle;
    let stageMetrics: Record<string, { success: number; failed: number }> = {};
    try {
      const { autopilotCycleLogService } = await import('../../services/autopilot-cycle-log.service');
      const since = new Date();
      since.setHours(since.getHours() - 24); // Last 24h
      stageMetrics = await autopilotCycleLogService.getStageMetrics(userId, since);
    } catch (_) {
      // Service or DB may be unavailable; return empty metrics
    }

    res.json({
      success: true,
      autopilot: {
        isRunning: status.isRunning,
        status: status.stats.currentStatus,
        lastCycle: lastCycle?.timestamp?.toISOString(),
        config: {
          enabled: status.config.enabled,
          cycleIntervalMinutes: status.config.cycleIntervalMinutes,
        },
      },
      stageMetrics,
      healthy: status.stats.currentStatus !== 'error',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET /api/autopilot/status - Estado del autopilot (production)
 */
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = autopilotSystem.getStatus();
    const stats = status.stats;
    const isRunning = stats.currentStatus === 'running';
    const lastCycle = status.lastCycle;
    const workflowMode = await workflowConfigService.getWorkflowMode(userId);

    res.json({
      success: true,
      running: isRunning,
      status: stats.currentStatus,
      workflowMode,
      totalRuns: stats.totalRuns,
      itemsProcessed: stats.totalProductsProcessed,
      productsPublished: stats.totalProductsPublished,
      opportunitiesGenerated: lastCycle?.opportunitiesFound ?? stats.totalProductsProcessed ?? 0,
      successRate: stats.successRate,
      lastRun: stats.lastRunTimestamp ? stats.lastRunTimestamp.toISOString() : null,
      lastCycle: stats.lastRunTimestamp,
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

    // ✅ Pasar userId al método start() (ahora es obligatorio)
    await autopilotSystem.start(userId);
    
    res.json({
      success: true,
      message: 'Autopilot started successfully'
    });
  } catch (error: any) {
    console.error('[AUTOPILOT ROUTE ERROR]', error);
    logger.error('Error starting autopilot', { error, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to start autopilot'
    });
  }
});

/**
 * ✅ POST /api/autopilot/run-cycle - Ejecutar un ciclo manualmente (forzar ciclo real)
 */
router.post('/run-cycle', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const query = typeof req.body?.query === 'string' ? req.body.query : undefined;
    const environment = (req.body?.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production';

    const result = await autopilotSystem.runSingleCycle(query, userId, environment);

    res.json({
      success: true,
      result: {
        success: result.success,
        message: result.message,
        category: result.category,
        query: result.query,
        opportunitiesFound: result.opportunitiesFound,
        opportunitiesProcessed: result.opportunitiesProcessed,
        productsPublished: result.productsPublished,
        productsApproved: result.productsApproved,
        capitalUsed: result.capitalUsed,
        errors: result.errors,
      },
    });
  } catch (error: any) {
    logger.error('Error running autopilot cycle', { error: error?.message, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run cycle',
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

    // ✅ Pasar userId para validación (opcional pero recomendado)
    autopilotSystem.stop(userId);
    
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
 * ✅ FASE 6: GET /api/autopilot/workflows/:id/logs - Obtener logs de un workflow
 */
router.get('/workflows/:id/logs', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflowId = parseInt(req.params.id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ success: false, error: 'ID de workflow inválido' });
    }

    // Verificar ownership y obtener workflow
    const workflow = await workflowService.getWorkflowById(workflowId, userId);
    const logs = (workflow.logs as any[]) || [];

    res.json({
      success: true,
      logs,
      total: logs.length
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
 * ✅ FASE 3: POST /api/autopilot/workflows - Crear workflow personalizado
 */
const createWorkflowSchema = z.object({
  name: z.string().min(1, 'El nombre del workflow es requerido').max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['search', 'analyze', 'publish', 'reprice', 'custom']),
  enabled: z.boolean().optional().default(true),
  schedule: z.string().optional().nullable(),
  conditions: z.record(z.any()).optional().nullable(),
  actions: z.record(z.any()).optional().nullable()
});

router.post('/workflows', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const validatedData = createWorkflowSchema.parse(req.body);
    // ✅ FIX: Asegurar que validatedData cumple con CreateWorkflowDto
    const workflow = await workflowService.createWorkflow(userId, validatedData as any);

    res.status(201).json({
      success: true,
      message: 'Workflow creado exitosamente',
      workflow
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FASE 3: PUT /api/autopilot/workflows/:id - Actualizar workflow
 */
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(['search', 'analyze', 'publish', 'reprice', 'custom']).optional(),
  enabled: z.boolean().optional(),
  schedule: z.string().optional().nullable(),
  conditions: z.record(z.any()).optional().nullable(),
  actions: z.record(z.any()).optional().nullable()
});

router.put('/workflows/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflowId = parseInt(req.params.id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ success: false, error: 'ID de workflow inválido' });
    }

    const validatedData = updateWorkflowSchema.parse(req.body);
    const workflow = await workflowService.updateWorkflow(workflowId, userId, validatedData);

    res.json({
      success: true,
      message: 'Workflow actualizado exitosamente',
      workflow
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FASE 3: PUT /api/autopilot/workflows/:id/enabled - Activar/desactivar workflow
 */
const toggleWorkflowSchema = z.object({
  enabled: z.boolean()
});

router.put('/workflows/:id/enabled', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflowId = parseInt(req.params.id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ success: false, error: 'ID de workflow inválido' });
    }

    const { enabled } = toggleWorkflowSchema.parse(req.body);
    const workflow = await workflowService.toggleWorkflow(workflowId, userId, enabled);

    res.json({
      success: true,
      message: `Workflow ${enabled ? 'activado' : 'desactivado'} exitosamente`,
      workflow
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FASE 3: DELETE /api/autopilot/workflows/:id - Eliminar workflow
 */
router.delete('/workflows/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflowId = parseInt(req.params.id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ success: false, error: 'ID de workflow inválido' });
    }

    const result = await workflowService.deleteWorkflow(workflowId, userId);

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FASE 3: POST /api/autopilot/workflows/:id/run - Ejecutar workflow manualmente
 */
router.post('/workflows/:id/run', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workflowId = parseInt(req.params.id, 10);
    if (isNaN(workflowId)) {
      return res.status(400).json({ success: false, error: 'ID de workflow inválido' });
    }

    const result = await workflowService.executeWorkflow(workflowId, userId);

    res.json({
      success: true,
      message: result.message,
      workflow: result.workflow,
      executed: result.executed
    });
  } catch (error) {
    next(error);
  }
});

export default router;

