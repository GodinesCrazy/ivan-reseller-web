import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// Schema de validación
const regionalConfigSchema = z.object({
  country: z.string().min(1),
  countryCode: z.string().length(2),
  marketplace: z.string().min(1),
  currency: z.string().length(3),
  currencySymbol: z.string().min(1),
  taxRate: z.number().min(0).max(100).default(0),
  shippingZone: z.string().default('domestic'),
  shippingCost: z.number().min(0).default(0),
  freeShippingThreshold: z.number().min(0).default(0),
  language: z.string().length(2).default('en'),
  priceAdjustment: z.number().default(0),
  active: z.boolean().default(true)
});

/**
 * GET /api/regional/configs
 * Obtener todas las configuraciones regionales
 */
router.get('/configs', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Obtener configuraciones desde SystemConfig
    const config = await prisma.systemConfig.findUnique({
      where: { key: `regional_configs_${userId}` }
    });

    const configs = config ? JSON.parse(config.value) : [];

    res.json({ success: true, configs });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/regional/configs
 * Crear nueva configuración regional
 */
router.post('/configs', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const data = regionalConfigSchema.parse(req.body);

    // Obtener configuraciones existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `regional_configs_${userId}` }
    });

    const configs = config ? JSON.parse(config.value) : [];
    
    // Verificar que no exista ya una configuración para este país/marketplace
    const existing = configs.find((c: any) => 
      c.countryCode === data.countryCode && c.marketplace === data.marketplace
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Configuration already exists for this country and marketplace'
      });
    }

    const newConfig = {
      id: Date.now(), // ID temporal
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    configs.push(newConfig);

    // Guardar en SystemConfig
    await prisma.systemConfig.upsert({
      where: { key: `regional_configs_${userId}` },
      update: { value: JSON.stringify(configs) },
      create: {
        key: `regional_configs_${userId}`,
        value: JSON.stringify(configs)
      }
    });

    res.status(201).json({ success: true, config: newConfig });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * PUT /api/regional/configs/:id
 * Actualizar configuración regional
 */
router.put('/configs/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const configId = parseInt(req.params.id);
    const data = regionalConfigSchema.partial().parse(req.body);

    // Obtener configuraciones existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `regional_configs_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Configs not found' });
    }

    const configs = JSON.parse(config.value);
    const configIndex = configs.findIndex((c: any) => c.id === configId);

    if (configIndex === -1) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    configs[configIndex] = {
      ...configs[configIndex],
      ...data,
      updatedAt: new Date().toISOString()
    };

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `regional_configs_${userId}` },
      data: { value: JSON.stringify(configs) }
    });

    res.json({ success: true, config: configs[configIndex] });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/regional/configs/:id
 * Eliminar configuración regional
 */
router.delete('/configs/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const configId = parseInt(req.params.id);

    // Obtener configuraciones existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `regional_configs_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Configs not found' });
    }

    const configs = JSON.parse(config.value);
    const filteredConfigs = configs.filter((c: any) => c.id !== configId);

    if (configs.length === filteredConfigs.length) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `regional_configs_${userId}` },
      data: { value: JSON.stringify(filteredConfigs) }
    });

    res.json({ success: true, message: 'Config deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;

