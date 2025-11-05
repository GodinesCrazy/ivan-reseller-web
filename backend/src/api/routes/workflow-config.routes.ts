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

export default router;

