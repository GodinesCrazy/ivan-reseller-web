import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error.middleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// Schemas de validación
const dropshippingRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  supplierId: z.number().int().positive(),
  marketplace: z.string(),
  active: z.boolean().default(true),
  minMargin: z.number().min(0).max(100),
  maxMargin: z.number().min(0).max(100),
  priceMultiplier: z.number().positive().default(1.25),
  autoRepricing: z.boolean().default(true),
  autoStockSync: z.boolean().default(true),
  priority: z.number().int().positive().default(1)
});

const supplierSchema = z.object({
  name: z.string().min(1),
  apiUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  shippingTime: z.number().int().positive().default(7),
  reliabilityScore: z.number().min(0).max(100).default(85),
  active: z.boolean().default(true)
});

/**
 * GET /api/dropshipping/rules
 * Obtener todas las reglas de dropshipping
 */
router.get('/rules', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Obtener reglas desde SystemConfig
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_rules_${userId}` }
    });

    const rules = config ? JSON.parse(config.value) : [];

    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dropshipping/suppliers
 * Obtener todos los proveedores
 */
router.get('/suppliers', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    
    // Obtener proveedores desde SystemConfig
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_suppliers_${userId}` }
    });

    const suppliers = config ? JSON.parse(config.value) : [];

    res.json({ success: true, suppliers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dropshipping/rules
 * Crear nueva regla de dropshipping
 */
router.post('/rules', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const data = dropshippingRuleSchema.parse(req.body);

    // Obtener reglas existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_rules_${userId}` }
    });

    const rules = config ? JSON.parse(config.value) : [];
    const newRule = {
      id: Date.now(), // ID temporal
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    rules.push(newRule);

    // Guardar en SystemConfig
    await prisma.systemConfig.upsert({
      where: { key: `dropshipping_rules_${userId}` },
      update: { value: JSON.stringify(rules) },
      create: {
        key: `dropshipping_rules_${userId}`,
        value: JSON.stringify(rules)
      }
    });

    res.status(201).json({ success: true, rule: newRule });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * PUT /api/dropshipping/rules/:id
 * Actualizar regla de dropshipping
 */
router.put('/rules/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const ruleId = parseInt(req.params.id);
    const data = dropshippingRuleSchema.partial().parse(req.body);

    // Obtener reglas existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_rules_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Rules not found' });
    }

    const rules = JSON.parse(config.value);
    const ruleIndex = rules.findIndex((r: any) => r.id === ruleId);

    if (ruleIndex === -1) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    rules[ruleIndex] = {
      ...rules[ruleIndex],
      ...data,
      updatedAt: new Date().toISOString()
    };

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `dropshipping_rules_${userId}` },
      data: { value: JSON.stringify(rules) }
    });

    res.json({ success: true, rule: rules[ruleIndex] });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/dropshipping/rules/:id
 * Eliminar regla de dropshipping
 */
router.delete('/rules/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const ruleId = parseInt(req.params.id);

    // Obtener reglas existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_rules_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Rules not found' });
    }

    const rules = JSON.parse(config.value);
    const filteredRules = rules.filter((r: any) => r.id !== ruleId);

    if (rules.length === filteredRules.length) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `dropshipping_rules_${userId}` },
      data: { value: JSON.stringify(filteredRules) }
    });

    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dropshipping/suppliers
 * Crear nuevo proveedor
 */
router.post('/suppliers', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const data = supplierSchema.parse(req.body);

    // Obtener proveedores existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_suppliers_${userId}` }
    });

    const suppliers = config ? JSON.parse(config.value) : [];
    const newSupplier = {
      id: Date.now(), // ID temporal
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    suppliers.push(newSupplier);

    // Guardar en SystemConfig
    await prisma.systemConfig.upsert({
      where: { key: `dropshipping_suppliers_${userId}` },
      update: { value: JSON.stringify(suppliers) },
      create: {
        key: `dropshipping_suppliers_${userId}`,
        value: JSON.stringify(suppliers)
      }
    });

    res.status(201).json({ success: true, supplier: newSupplier });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * PUT /api/dropshipping/suppliers/:id
 * Actualizar proveedor
 */
router.put('/suppliers/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const supplierId = parseInt(req.params.id);
    const data = supplierSchema.partial().parse(req.body);

    // Obtener proveedores existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_suppliers_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Suppliers not found' });
    }

    const suppliers = JSON.parse(config.value);
    const supplierIndex = suppliers.findIndex((s: any) => s.id === supplierId);

    if (supplierIndex === -1) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    suppliers[supplierIndex] = {
      ...suppliers[supplierIndex],
      ...data,
      updatedAt: new Date().toISOString()
    };

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `dropshipping_suppliers_${userId}` },
      data: { value: JSON.stringify(suppliers) }
    });

    res.json({ success: true, supplier: suppliers[supplierIndex] });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid data', details: error.errors });
    }
    next(error);
  }
});

/**
 * DELETE /api/dropshipping/suppliers/:id
 * Eliminar proveedor
 */
router.delete('/suppliers/:id', async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.userId;
    const supplierId = parseInt(req.params.id);

    // Obtener proveedores existentes
    const config = await prisma.systemConfig.findUnique({
      where: { key: `dropshipping_suppliers_${userId}` }
    });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Suppliers not found' });
    }

    const suppliers = JSON.parse(config.value);
    const filteredSuppliers = suppliers.filter((s: any) => s.id !== supplierId);

    if (suppliers.length === filteredSuppliers.length) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }

    // Guardar actualizado
    await prisma.systemConfig.update({
      where: { key: `dropshipping_suppliers_${userId}` },
      data: { value: JSON.stringify(filteredSuppliers) }
    });

    res.json({ success: true, message: 'Supplier deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;

