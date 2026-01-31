import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth.service';
import { AppError } from '../../middleware/error.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { loginRateLimit } from '../../middleware/rate-limit.middleware';
import { changePasswordSchema as changePasswordValidationSchema, registerPasswordSchema } from '../../utils/password-validation';
import { z } from 'zod';
import logger from '../../config/logger';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: registerPasswordSchema,
  fullName: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/auth/register - DISABLED: Redirigir a solicitud de acceso
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  // ✅ P0.5: REGISTRO PÚBLICO DESHABILITADO: Redirigir a solicitud de acceso
  return res.status(403).json({
    success: false,
    message: 'Public registration is disabled. Please request access instead.',
    action: 'request_access',
    requestUrl: '/api/access-requests',
    frontendUrl: '/request-access'
  });
});

// POST /api/auth/login - Cookie-based session (JWT in httpOnly cookie)
router.post('/login', async (req: Request, res: Response) => {
  try {
    console.log('[LOGIN] body keys:', Object.keys(req.body || {}));
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing credentials',
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !user.password) {
      return res.status(401).json({ success: false });
    }

    let ok: boolean;
    try {
      ok = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      console.error('LOGIN_FATAL_ERROR bcrypt', bcryptErr);
      return res.status(401).json({ success: false });
    }
    if (!ok) {
      return res.status(401).json({ success: false });
    }

    // Set JWT in httpOnly cookie for session persistence (cross-origin: Vercel → Railway)
    let token: string;
    try {
      token = authService.generateToken(user.id, user.username, user.role);
    } catch (tokenErr) {
      console.error('LOGIN_FATAL_ERROR token', tokenErr);
      return res.status(500).json({ success: false });
    }

    try {
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      });
    } catch (cookieErr) {
      console.error('COOKIE_SET_FAILED', cookieErr);
      // Still return success - session works via response body
    }

    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    console.log('[LOGIN] success for user', user.username);
    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('LOGIN_FATAL_ERROR', err);
    return res.status(500).json({
      success: false,
      error: 'Internal login error',
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not found', 404);
    }

    // Get full user data from database
    const { prisma } = await import('../../config/database');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        fullName: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        balance: true,
        totalEarnings: true,
        totalSales: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Normalizar rol a mayúsculas para consistencia
    const normalizedUser = {
      ...user,
      role: user.role.toUpperCase()
    };

    res.json({
      success: true,
      data: normalizedUser,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    const result = await authService.refreshAccessToken(refreshToken);

    // Usar la misma lógica de cookies que en login para mantener consistencia
    const origin = req.headers.origin || req.headers.referer;
    let frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    
    if (origin) {
      try {
        const originUrl = new URL(origin);
        frontendUrl = `${originUrl.protocol}//${originUrl.host}`;
      } catch (e) {
        // Si falla, usar el valor por defecto
      }
    }
    
    const requestProtocol = req.protocol || (req.headers['x-forwarded-proto'] as string) || 'http';
    const isHttps = requestProtocol === 'https' || frontendUrl.startsWith('https');
    
    let cookieDomain: string | undefined = undefined;
    try {
      const frontendUrlObj = new URL(frontendUrl);
      const frontendHostname = frontendUrlObj.hostname;
      const backendHostname = req.get('host') || req.hostname || '';
      
      const frontendBaseDomain = frontendHostname.replace(/^[^.]+\./, '');
      const backendBaseDomain = backendHostname.replace(/^[^.]+\./, '');
      
      if (frontendBaseDomain === backendBaseDomain && frontendBaseDomain !== 'localhost' && !frontendBaseDomain.includes('127.0.0.1')) {
        cookieDomain = `.${frontendBaseDomain}`;
      } else {
        cookieDomain = undefined;
      }
    } catch (e) {
      cookieDomain = undefined;
    }
    
    // ✅ FIX AUTH: En producción, usar sameSite: 'none' y secure: true siempre
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProduction ? true : isHttps, // ✅ CRÍTICO: En producción SIEMPRE true
      sameSite: (isProduction || !cookieDomain) ? 'none' as const : 'lax' as const, // ✅ CRÍTICO: 'none' para cross-domain
      maxAge: 60 * 60 * 1000, // 1 hora
      path: '/',
    };
    
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }
    
    const refreshCookieOptions = {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    };

    // CRÍTICO: Establecer Access-Control-Allow-Origin específico para cookies cross-domain
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    res.cookie('token', result.accessToken, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    
    // Generate token (always return success to prevent email enumeration)
    const token = await authService.generatePasswordResetToken(email);

    // ✅ Enviar email con link de reset (solo si el token es válido, no dummy)
    if (token && token !== 'token') {
      const frontendUrl = process.env.FRONTEND_URL || 'https://ivanreseller.com';
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;
      
      // Importar emailService dinámicamente para evitar dependencias circulares
      const emailService = (await import('../../services/email.service')).default;
      await emailService.sendPasswordResetEmail(email, resetLink);
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    // No diferenciamos email existente o no para evitar enumeración
    // Los errores de validación de Zod serán manejados por el middleware central
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = z.object({
      token: z.string().min(1),
      newPassword: z.string().min(12),
    }).parse(req.body);

    await authService.resetPassword(token, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - No auth required; clear cookie only so browser logout never returns 401
router.post('/logout', async (req: Request, res: Response) => {
  const opts = { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/' };
  res.clearCookie('token', opts);
  res.clearCookie('refreshToken', opts);
  return res.json({ success: true });
});

// GET /api/auth/test-cookies - Endpoint de prueba para verificar cookies
router.get('/test-cookies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // CRÍTICO: Establecer Access-Control-Allow-Origin específico
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    
    res.json({
      success: true,
      message: 'Cookies test endpoint',
      cookies: req.cookies,
      cookieHeader: req.headers.cookie,
      hasToken: !!req.cookies?.token,
      hasRefreshToken: !!req.cookies?.refreshToken,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent'],
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password

router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { currentPassword, newPassword } = changePasswordValidationSchema.parse(req.body);
    const result = await authService.changePassword(userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
