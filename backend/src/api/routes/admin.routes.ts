import express from 'express';
import { AdminService } from '../../services/admin.service';
import { authenticate } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';

const router = express.Router();
const adminService = new AdminService();

/**
 * 👤 CREAR NUEVO USUARIO (Solo Admin)
 */
router.post('/users', authenticate, async (req, res, next) => {
  try {
    const adminId = req.user!.userId;
    const userData = req.body;

    const result = await adminService.createUser(adminId, userData);
    
    // Enviar credenciales por email
    await adminService.sendUserCredentials(result.user.id, {
      ...result.loginCredentials,
      accessUrl: result.accessUrl
    });

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
    next(error);
  }
});

/**
 * ⚙️ ACTUALIZAR COMISIONES DE USUARIO (Solo Admin)
 */
router.put('/users/:userId/commissions', authenticate, async (req, res, next) => {
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
router.post('/users/:userId/apis', authenticate, async (req, res, next) => {
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
router.get('/dashboard', authenticate, async (req, res, next) => {
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
router.post('/charges/monthly', authenticate, async (req, res, next) => {
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
 * 📧 REENVIAR CREDENCIALES DE ACCESO
 */
router.post('/users/:userId/resend-credentials', authenticate, async (req, res, next) => {
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