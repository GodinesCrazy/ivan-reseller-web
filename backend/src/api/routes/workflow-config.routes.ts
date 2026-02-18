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

// ✅ GET /api/workflow/config/test - Return saved config (for validation)
router.get('/config/test', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const config = await workflowConfigService.getUserConfig(userId);
    res.json(config);
  } catch (error) {
    next(error);
  }
});

const stageModeEnum = z.enum(['manual', 'automatic', 'guided']);

const optionalNum = (min = 0, max?: number) =>
  z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
  }).pipe(max != null ? z.number().min(min).max(max).optional() : z.number().min(min).optional());

const updateSchema = z
  .object({
    workingCapital: optionalNum(0),
    environment: z.enum(['sandbox', 'production']).optional(),
    workflowMode: z.enum(['manual', 'automatic', 'hybrid']).optional(),

    scrapeStage: stageModeEnum.optional(),
    analyzeStage: stageModeEnum.optional(),
    publishStage: stageModeEnum.optional(),
    purchaseStage: stageModeEnum.optional(),
    fulfillmentStage: stageModeEnum.optional(),
    customerServiceStage: stageModeEnum.optional(),

    stageScrape: stageModeEnum.optional(),
    stageAnalyze: stageModeEnum.optional(),
    stagePublish: stageModeEnum.optional(),
    stagePurchase: stageModeEnum.optional(),
    stageFulfillment: stageModeEnum.optional(),
    stageCustomerService: stageModeEnum.optional(),

    autoApproveThreshold: optionalNum(0, 100),
    autoPublishThreshold: optionalNum(0, 100),
    maxAutoInvestment: optionalNum(0),

    thresholds: z
      .object({
        autoApproveConfidence: optionalNum(0, 100),
        autoPublishConfidence: optionalNum(0, 100),
        maxInvestmentPerProduct: optionalNum(0)
      })
      .optional(),

    stages: z
      .object({
        scrape: stageModeEnum.optional(),
        analyze: stageModeEnum.optional(),
        publish: stageModeEnum.optional(),
        purchase: stageModeEnum.optional(),
        fulfillment: stageModeEnum.optional(),
        customerService: stageModeEnum.optional()
      })
      .optional()
  })
  .passthrough();

type UpdateWorkflowConfigDto = {
  environment?: 'sandbox' | 'production';
  workflowMode?: 'manual' | 'automatic' | 'hybrid';
  stageScrape?: 'manual' | 'automatic' | 'guided';
  stageAnalyze?: 'manual' | 'automatic' | 'guided';
  stagePublish?: 'manual' | 'automatic' | 'guided';
  stagePurchase?: 'manual' | 'automatic' | 'guided';
  stageFulfillment?: 'manual' | 'automatic' | 'guided';
  stageCustomerService?: 'manual' | 'automatic' | 'guided';
  autoApproveThreshold?: number;
  autoPublishThreshold?: number;
  maxAutoInvestment?: number;
  workingCapital?: number;
};

function normalizeWorkflowConfig(
  input: z.infer<typeof updateSchema> & Record<string, unknown>,
  existingConfig: Record<string, unknown>
): UpdateWorkflowConfigDto {
  const stage = (key: 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService') => {
    const flatKey = `stage${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof typeof input;
    const altKey = `${key}Stage` as keyof typeof input;
    return (input[flatKey] ?? input[altKey] ?? input.stages?.[key] ?? existingConfig[flatKey]) as string | undefined;
  };
  return {
    workflowMode: (input.workflowMode ?? existingConfig.workflowMode) as UpdateWorkflowConfigDto['workflowMode'],
    environment: (input.environment ?? existingConfig.environment) as UpdateWorkflowConfigDto['environment'],
    workingCapital: input.workingCapital ?? (existingConfig.workingCapital as number) ?? 500,

    stageScrape: (stage('scrape') ?? existingConfig.stageScrape) as UpdateWorkflowConfigDto['stageScrape'],
    stageAnalyze: (stage('analyze') ?? existingConfig.stageAnalyze) as UpdateWorkflowConfigDto['stageAnalyze'],
    stagePublish: (stage('publish') ?? existingConfig.stagePublish) as UpdateWorkflowConfigDto['stagePublish'],
    stagePurchase: (stage('purchase') ?? existingConfig.stagePurchase) as UpdateWorkflowConfigDto['stagePurchase'],
    stageFulfillment: (stage('fulfillment') ?? existingConfig.stageFulfillment) as UpdateWorkflowConfigDto['stageFulfillment'],
    stageCustomerService: (stage('customerService') ?? existingConfig.stageCustomerService) as UpdateWorkflowConfigDto['stageCustomerService'],

    autoApproveThreshold:
      input.autoApproveThreshold ??
      (input.thresholds as { autoApproveConfidence?: number })?.autoApproveConfidence ??
      (existingConfig.autoApproveThreshold as number | undefined),
    autoPublishThreshold:
      input.autoPublishThreshold ??
      (input.thresholds as { autoPublishConfidence?: number })?.autoPublishConfidence ??
      (existingConfig.autoPublishThreshold as number | undefined),
    maxAutoInvestment:
      input.maxAutoInvestment ??
      (input.thresholds as { maxInvestmentPerProduct?: number })?.maxInvestmentPerProduct ??
      (existingConfig.maxAutoInvestment as number | undefined)
  };
}

async function handlePutWorkflowConfig(req: Request, res: Response, next: (err: any) => void): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    console.log('[WORKFLOW CONFIG DEBUG] RAW BODY:', JSON.stringify(body, null, 2));

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[WORKFLOW CONFIG DEBUG] VALIDATION ERROR:', parsed.error.flatten());
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: parsed.error.flatten()
      });
      return;
    }
    const validatedData = parsed.data as z.infer<typeof updateSchema> & Record<string, unknown>;
    console.log('[WORKFLOW CONFIG DEBUG] VALIDATED BODY:', JSON.stringify(validatedData, null, 2));

    const existing = await workflowConfigService.getUserConfig(userId);
    const existingConfig = existing as unknown as Record<string, unknown>;
    const toSave = normalizeWorkflowConfig(validatedData, existingConfig);

    if (typeof toSave.workingCapital === 'number' && toSave.workingCapital < 0) {
      console.error('[WORKFLOW CONFIG DEBUG] VALIDATION ERROR: workingCapital cannot be negative');
      res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        errors: ['El capital de trabajo no puede ser negativo']
      });
      return;
    }

    const config = await workflowConfigService.updateUserConfig(userId, toSave);
    console.log('[WORKFLOW CONFIG] CONFIG SAVED SUCCESSFULLY');

    if (toSave.environment) {
      const oldEnvironment = existing.environment;
      const newEnvironment = toSave.environment;
      if (oldEnvironment !== newEnvironment) {
        const logger = (await import('../../config/logger')).default;
        logger.info('[WorkflowConfig] Environment changed', {
          userId,
          oldEnvironment,
          newEnvironment,
          changedBy: req.user?.username || 'unknown',
          timestamp: new Date().toISOString()
        });
        try {
          const { notificationService } = await import('../../services/notification.service');
          notificationService.sendToUser(userId, {
            type: 'SYSTEM_ALERT',
            title: 'Ambiente cambiado',
            message: `El ambiente ha sido cambiado de ${oldEnvironment} a ${newEnvironment}. Las próximas publicaciones usarán el nuevo ambiente.`,
            priority: 'NORMAL',
            category: 'SYSTEM',
            data: { oldEnvironment, newEnvironment, changedBy: req.user?.username || 'unknown' }
          });
        } catch (notifError: any) {
          (await import('../../config/logger')).default.warn('[WorkflowConfig] Failed to send notification', {
            error: notifError?.message || String(notifError),
            userId
          });
        }
      }
    }

    res.json({ success: true, config });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      console.error('[WORKFLOW CONFIG DEBUG] VALIDATION ERROR:', error?.errors ?? error);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error?.errors ?? error?.message
      });
      return;
    }
    next(error);
  }
}

router.put('/config', handlePutWorkflowConfig);
router.post('/config', handlePutWorkflowConfig);

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
          const system: any = automatedBusinessSystem;
          if (system && typeof system.resumeStage === 'function') {
            system.resumeStage(stage as any);
            if (typeof system.runOneCycle === 'function') {
              await system.runOneCycle();
            }
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
            category: 'JOB',
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
          error: serviceError?.message || String(serviceError),
          userId,
          stage
        });
        
        res.status(500).json({ 
          success: false, 
          error: 'Error continuing stage',
          details: serviceError?.message || String(serviceError)
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
    } else {
      res.status(400).json({ 
        success: false, 
        error: `Unknown action: ${action}` 
      });
    }
  } catch (error: any) {
    next(error);
  }
});

// ✅ POST /api/workflow/handle-guided-action - Manejar acciones de modo guided
router.post('/handle-guided-action', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const schema = z.object({
      action: z.string(), // Ej: 'confirm_purchase_guided', 'cancel_publish_guided'
      actionId: z.string().optional(),
      data: z.any().optional()
    });

    const { action, actionId, data } = schema.parse(req.body);
    const logger = (await import('../../config/logger')).default;

    // Procesar acciones según tipo
    if (action === 'confirm_purchase_guided' && actionId) {
      // Confirmar compra guided usando tracker
      const { guidedActionTracker } = await import('../../services/guided-action-tracker.service');
      
      const confirmed = await guidedActionTracker.confirmAction(userId, actionId);
      
      if (!confirmed) {
        return res.status(404).json({ 
          success: false, 
          error: 'Action not found or already processed' 
        });
      }

      logger.info('[Workflow] Guided purchase confirmed and executed', {
        userId,
        actionId
      });

      res.json({ success: true, message: 'Purchase confirmed and executed' });
    } else if (action === 'cancel_purchase_guided' && actionId) {
      // Cancelar compra guided usando tracker
      const { guidedActionTracker } = await import('../../services/guided-action-tracker.service');
      
      const cancelled = await guidedActionTracker.cancelAction(userId, actionId);
      
      if (!cancelled) {
        return res.status(404).json({ 
          success: false, 
          error: 'Action not found or already processed' 
        });
      }

      logger.info('[Workflow] Guided purchase cancelled', {
        userId,
        actionId
      });

      res.json({ success: true, message: 'Purchase cancelled' });
    } else if (action.startsWith('confirm_publish_guided')) {
      // Confirmar publicación guided
      // Esta acción se manejaría cuando el usuario confirma la publicación
      logger.info('[Workflow] Guided publish confirmed', {
        userId,
        action,
        data
      });

      res.json({ success: true, message: 'Publish confirmed' });
    } else if (action.startsWith('cancel_publish_guided')) {
      // Cancelar publicación guided
      logger.info('[Workflow] Guided publish cancelled', {
        userId,
        action,
        data
      });

      res.json({ success: true, message: 'Publish cancelled' });
    } else if (action.startsWith('confirm_') && action.includes('_guided')) {
      // Acción genérica guided confirmada
      logger.info('[Workflow] Guided action confirmed', {
        userId,
        action,
        actionId,
        data
      });

      res.json({ success: true, message: 'Action confirmed' });
    } else if (action.startsWith('cancel_') && action.includes('_guided')) {
      // Acción genérica guided cancelada
      logger.info('[Workflow] Guided action cancelled', {
        userId,
        action,
        actionId,
        data
      });

      res.json({ success: true, message: 'Action cancelled' });
    } else {
      res.status(400).json({ 
        success: false, 
        error: `Unknown guided action: ${action}` 
      });
    }
  } catch (error: any) {
    next(error);
  }
});

export default router;

