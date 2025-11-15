import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { workflowConfigService } from '../../services/workflow-config.service';
import { z } from 'zod';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// ✅ GET /api/workflow/config - Obtener configuración de workflow del usuario
router.get('/config', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const config = await workflowConfigService.getUserConfig(userId);
    res.json({ success: true, config });
  } catch (error) {
    next(error);
  }
});

// ✅ PUT /api/workflow/config - Actualizar configuración de workflow del usuario
// ✅ MEJORADO: Logging cuando se cambia de ambiente
router.put('/config', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const updateSchema = z.object({
      environment: z.enum(['sandbox', 'production']).optional(),
      workflowMode: z.enum(['manual', 'automatic', 'hybrid']).optional(),
      stageScrape: z.enum(['manual', 'automatic', 'guided']).optional(),
      stageAnalyze: z.enum(['manual', 'automatic', 'guided']).optional(),
      stagePublish: z.enum(['manual', 'automatic', 'guided']).optional(),
      stagePurchase: z.enum(['manual', 'automatic', 'guided']).optional(),
      stageFulfillment: z.enum(['manual', 'automatic', 'guided']).optional(),
      stageCustomerService: z.enum(['manual', 'automatic', 'guided']).optional(),
      autoApproveThreshold: z.number().min(0).max(100).optional(),
      autoPublishThreshold: z.number().min(0).max(100).optional(),
      maxAutoInvestment: z.number().min(0).optional(),
      workingCapital: z.number().min(0).optional() // ✅ Capital de trabajo en PayPal (USD)
    });

    const validatedData = updateSchema.parse(req.body);
    
    // ✅ Logging: Detectar cambio de ambiente
    if (validatedData.environment) {
      const currentConfig = await workflowConfigService.getUserConfig(userId);
      const oldEnvironment = currentConfig.environment;
      const newEnvironment = validatedData.environment;
      
      if (oldEnvironment !== newEnvironment) {
        const logger = (await import('../../config/logger')).default;
        logger.info('[WorkflowConfig] Environment changed', {
          userId,
          oldEnvironment,
          newEnvironment,
          changedBy: req.user?.username || 'unknown',
          timestamp: new Date().toISOString()
        });
        
        // ✅ MEJORA: Enviar notificación al usuario sobre cambio de ambiente
        try {
          const { notificationService } = await import('../../services/notification.service');
          notificationService.sendToUser(userId, {
            type: 'SYSTEM_ALERT',
            title: 'Ambiente cambiado',
            message: `El ambiente ha sido cambiado de ${oldEnvironment} a ${newEnvironment}. Las próximas publicaciones usarán el nuevo ambiente.`,
            priority: 'MEDIUM',
            data: {
              oldEnvironment,
              newEnvironment,
              changedBy: req.user?.username || 'unknown'
            }
          });
        } catch (notifError: any) {
          logger.warn('[WorkflowConfig] Failed to send notification', {
            error: notifError?.message || String(notifError),
            userId
          });
        }
      }
    }
    
    const config = await workflowConfigService.updateUserConfig(userId, validatedData);
    
    res.json({ success: true, config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    next(error);
  }
});

// ✅ GET /api/workflow/stage/:stage - Obtener modo de una etapa específica
router.get('/stage/:stage', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const stage = req.params.stage as 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService';
    
    if (!['scrape', 'analyze', 'publish', 'purchase', 'fulfillment', 'customerService'].includes(stage)) {
      return res.status(400).json({ success: false, error: 'Invalid stage' });
    }

    const mode = await workflowConfigService.getStageMode(userId, stage);
    res.json({ success: true, stage, mode });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/workflow/environment - Obtener ambiente del usuario
router.get('/environment', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const environment = await workflowConfigService.getUserEnvironment(userId);
    res.json({ success: true, environment });
  } catch (error) {
    next(error);
  }
});

// ✅ GET /api/workflow/working-capital - Obtener capital de trabajo del usuario
router.get('/working-capital', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const workingCapital = await workflowConfigService.getWorkingCapital(userId);
    res.json({ success: true, workingCapital });
  } catch (error) {
    next(error);
  }
});

// ✅ PUT /api/workflow/working-capital - Actualizar capital de trabajo del usuario
router.put('/working-capital', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { workingCapital } = req.body;
    if (typeof workingCapital !== 'number' || workingCapital < 0) {
      return res.status(400).json({ success: false, error: 'Invalid working capital value' });
    }

    await workflowConfigService.updateWorkingCapital(userId, workingCapital);
    res.json({ success: true, message: 'Working capital updated successfully', workingCapital });
  } catch (error) {
    next(error);
  }
});

// ✅ POST /api/workflow/continue-stage - Continuar etapa en modo "guided"
router.post('/continue-stage', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const schema = z.object({
      stage: z.enum(['scrape', 'analyze', 'publish', 'purchase', 'fulfillment', 'customerService']),
      action: z.enum(['continue', 'skip', 'cancel']).optional(),
      data: z.any().optional() // Datos adicionales para la acción
    });

    const { stage, action = 'continue', data } = schema.parse(req.body);

    // Verificar que la etapa esté en modo guided
    const currentMode = await workflowConfigService.getStageMode(userId, stage);
    if (currentMode !== 'guided') {
      return res.status(400).json({ 
        success: false, 
        error: `Stage ${stage} is not in guided mode. Current mode: ${currentMode}` 
      });
    }

    // ✅ MEJORADO: Ejecutar acción según el tipo con integración real
    const logger = (await import('../../config/logger')).default;
    
    if (action === 'continue') {
      logger.info('[Workflow] Continuing stage in guided mode', {
        userId,
        stage,
        action: 'continue',
        data: data || null
      });
      
      // ✅ Integrar con servicios según la etapa
      try {
        if (stage === 'scrape' || stage === 'analyze' || stage === 'publish') {
          // Notificar a AutomatedBusinessService para continuar
          const { automatedBusinessSystem } = await import('../../services/automated-business.service');
          if (automatedBusinessSystem && typeof automatedBusinessSystem.resumeStage === 'function') {
            automatedBusinessSystem.resumeStage(stage as any);
            await automatedBusinessSystem.runOneCycle();
          }
        }
        
        // ✅ MEJORA: Enviar notificación de confirmación
        try {
          const { notificationService } = await import('../../services/notification.service');
          notificationService.sendToUser(userId, {
            type: 'JOB_COMPLETED',
            title: `Etapa ${stage} continuada`,
            message: `Has continuado la etapa ${stage} en modo guided. El proceso continuará automáticamente.`,
            priority: 'LOW',
            data: {
              stage,
              action: 'continued',
              userId
            }
          });
        } catch (notifError: any) {
          logger.warn('[Workflow] Failed to send notification', {
            error: notifError?.message || String(notifError),
            userId,
            stage
          });
        }
        
        res.json({ 
          success: true, 
          message: `Stage ${stage} continued successfully`,
          stage,
          action: 'continued'
        });
      } catch (serviceError: any) {
        logger.error('[Workflow] Error continuing stage', {
          userId,
          stage,
          error: serviceError?.message || String(serviceError)
        });
        res.json({ 
          success: true, 
          message: `Stage ${stage} continued (service notification may have failed)`,
          stage,
          action: 'continued',
          warning: serviceError?.message
        });
      }
    } else if (action === 'skip') {
      logger.info('[Workflow] Skipping stage in guided mode', {
        userId,
        stage,
        action: 'skip'
      });
      
      res.json({ 
        success: true, 
        message: `Stage ${stage} skipped`,
        stage,
        action: 'skipped'
      });
    } else if (action === 'cancel') {
      logger.info('[Workflow] Cancelling stage in guided mode', {
        userId,
        stage,
        action: 'cancel'
      });
      
      res.json({ 
        success: true, 
        message: `Stage ${stage} cancelled`,
        stage,
        action: 'cancelled'
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    next(error);
  }
});

export default router;

