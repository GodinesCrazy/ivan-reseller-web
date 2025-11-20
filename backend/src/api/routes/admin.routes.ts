import express from 'express';
import { AdminService } from '../../services/admin.service';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { userService } from '../../services/user.service';
import bcrypt from 'bcryptjs';
import { logger } from '../../config/logger';
import { z } from 'zod';
import { registerPasswordSchema } from '../../utils/password-validation';

const router = express.Router();
const adminService = new AdminService();

// ✅ API-005: Validation schema para crear usuario (reemplazar validación manual)
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: registerPasswordSchema,
  fullName: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']).optional().default('USER'),
  commissionRate: z.number().min(0).max(1).optional(),
  fixedMonthlyCost: z.number().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

/**
 * 📋 OBTENER TODOS LOS USUARIOS (Solo Admin)
 */
router.get('/users', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const dashboard = await adminService.getUsersDashboard(req.user!.userId);
    res.json({
      success: true,
      users: dashboard.users
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 👤 OBTENER USUARIO POR ID (Solo Admin)
 */
router.get('/users/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await userService.getUserById(userId);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 📊 OBTENER ESTADÍSTICAS DE USUARIO (Solo Admin)
 */
router.get('/users/:id/stats', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const stats = await userService.getUserStats(userId);
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 👤 CREAR NUEVO USUARIO (Solo Admin)
 */
router.post('/users', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    
    // ✅ API-005: Usar Zod en lugar de validación manual
    const validatedData = createUserSchema.parse(req.body);

    // ✅ C11: Logging de acción crítica - creación de usuario por admin
    logger.info('[Admin] Creating new user', {
      service: 'admin',
      adminId,
      newUserUsername: validatedData.username,
      newUserEmail: validatedData.email,
      newUserRole: validatedData.role || 'USER',
      hasFullName: !!validatedData.fullName
    });

    // Normalizar datos (los datos ya están validados por Zod)
    const normalizedData = {
      username: validatedData.username.trim(),
      email: validatedData.email.trim().toLowerCase(),
      password: validatedData.password,
      fullName: validatedData.fullName?.trim() || undefined,
      role: (validatedData.role || 'USER') as 'ADMIN' | 'USER',
      commissionRate: validatedData.commissionRate ?? 0.20, // 20% por defecto
      fixedMonthlyCost: validatedData.fixedMonthlyCost ?? 0.0, // $0 USD por defecto
      isActive: validatedData.isActive !== undefined ? validatedData.isActive : true
    };

    const result = await adminService.createUser(adminId, normalizedData);
    
    // Enviar credenciales por email (no bloquear si falla)
    try {
      await adminService.sendUserCredentials(result.user.id, {
        ...result.loginCredentials,
        accessUrl: result.accessUrl
      });
    } catch (emailError) {
      logger.warn('Failed to send user credentials email', { 
        error: emailError instanceof Error ? emailError.message : String(emailError),
        userId: result.user.id
      });
      // No fallar la creación si el email falla
    }

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        user: result.user,
        accessUrl: result.accessUrl,
        emailSent: true
      }
    });
  } catch (error) {
    // Mejorar mensajes de error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ya existe') || errorMessage.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: errorMessage,
        error: 'User already exists'
      });
    }
    
    if (errorMessage.includes('administradores')) {
      return res.status(403).json({
        success: false,
        message: errorMessage,
        error: 'Admin only'
      });
    }
    
    // Log error no manejado
    logger.error('[Admin] Error creating user', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      adminId: req.user?.userId
    });

    next(error);
  }
});

/**
 * ✏️ ACTUALIZAR USUARIO (Solo Admin)
 */
router.put('/users/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const updateData: any = { ...req.body };
    
    // Si se está actualizando la contraseña, hashearla
    if (updateData.password) {
      updateData.password = bcrypt.hashSync(updateData.password, 10);
    }
    
    const user = await userService.updateUser(userId, updateData);
    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 🗑️ ELIMINAR USUARIO (Solo Admin)
 */
router.delete('/users/:id', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await userService.deleteUser(userId);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 🔑 RESETEAR CONTRASEÑA DE USUARIO (Solo Admin)
 */
router.post('/users/:id/reset-password', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
    
    res.json({
      success: true,
      message: 'Contraseña reseteada exitosamente'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ⚙️ ACTUALIZAR COMISIONES DE USUARIO (Solo Admin)
 */
router.put('/users/:userId/commissions', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    const userId = parseInt(req.params.userId);
    const settings = req.body;

    const updatedUser = await adminService.updateUserCommissions(adminId, userId, settings);

    res.json({
      success: true,
      message: 'Comisiones actualizadas exitosamente',
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 🔑 CONFIGURAR APIs DE MARKETPLACE PARA USUARIO (Solo Admin)
 */
router.post('/users/:userId/apis', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    const userId = parseInt(req.params.userId);
    const apiConfigs = req.body.apis;

    const credentialIds = await adminService.configureUserAPIs(adminId, userId, apiConfigs);

    res.json({
      success: true,
      message: 'APIs configuradas exitosamente',
      data: {
        configuredAPIs: credentialIds.length,
        credentialIds
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 📊 OBTENER DASHBOARD DE USUARIOS (Solo Admin)
 */
router.get('/dashboard', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    
    const dashboard = await adminService.getUsersDashboard(adminId);

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 💰 PROCESAR COBROS MENSUALES (Solo Admin)
 */
router.post('/charges/monthly', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    
    const result = await adminService.processMonthlyCharges(adminId);

    res.json({
      success: true,
      message: `Procesados ${result.processed} usuarios. Total cobrado: $${result.totalCharged.toFixed(2)}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 📧 REENVIAR CREDENCIALES DE ACCESO (Solo Admin)
 */
router.post('/users/:userId/resend-credentials', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const { temporaryPassword } = req.body;

    // Obtener datos del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const credentials = {
      username: user.username,
      temporaryPassword: temporaryPassword || 'nueva-contraseña-temporal',
      accessUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`
    };

    await adminService.sendUserCredentials(userId, credentials);

    res.json({
      success: true,
      message: 'Credenciales reenviadas exitosamente'
    });
  } catch (error) {
    next(error);
  }
});

export default router;