/**
 * Rutas para manejo de resolución manual de CAPTCHA
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import ManualCaptchaService from '../../services/manual-captcha.service';
import { AppError } from '../../middleware/error.middleware';

const router = Router();
router.use(authenticate);

/**
 * POST /api/manual-captcha/start
 * Iniciar sesión de resolución manual de CAPTCHA
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { captchaUrl, pageUrl } = req.body;

    if (!captchaUrl && !pageUrl) {
      throw new AppError('captchaUrl o pageUrl es requerido', 400);
    }

    const session = await ManualCaptchaService.startSession(
      userId,
      captchaUrl || pageUrl,
      pageUrl || captchaUrl
    );

    res.json({
      success: true,
      data: session,
      message: 'Sesión de CAPTCHA iniciada. Se ha abierto un navegador para que resuelvas el CAPTCHA.',
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Error al iniciar sesión de CAPTCHA',
    });
  }
});

/**
 * GET /api/manual-captcha/status/:token
 * Verificar estado de sesión de CAPTCHA
 */
router.get('/status/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user!.userId;

    const solved = await ManualCaptchaService.checkCaptchaSolved(token);

    res.json({
      success: true,
      data: {
        token,
        solved,
        message: solved
          ? 'CAPTCHA resuelto. El sistema continuará con la búsqueda.'
          : 'Esperando resolución del CAPTCHA...',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Error al verificar estado de CAPTCHA',
    });
  }
});

/**
 * GET /api/manual-captcha/active
 * Obtener sesión activa de CAPTCHA para el usuario
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const session = await ManualCaptchaService.getActiveSession(userId);

    if (!session) {
      return res.json({
        success: true,
        data: null,
        message: 'No hay sesión activa de CAPTCHA',
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener sesión activa',
    });
  }
});

/**
 * POST /api/manual-captcha/complete/:token
 * Marcar sesión de CAPTCHA como completada manualmente
 */
router.post('/complete/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    await ManualCaptchaService.completeSession(token);

    res.json({
      success: true,
      message: 'CAPTCHA marcado como resuelto. El sistema continuará con la búsqueda.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Error al completar sesión de CAPTCHA',
    });
  }
});

/**
 * POST /api/manual-captcha/cancel/:token
 * Cancelar sesión de CAPTCHA
 */
router.post('/cancel/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    await ManualCaptchaService.cancelSession(token);

    res.json({
      success: true,
      message: 'Sesión de CAPTCHA cancelada',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Error al cancelar sesión de CAPTCHA',
    });
  }
});

export default router;

