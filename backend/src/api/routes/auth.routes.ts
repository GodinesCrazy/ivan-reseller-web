import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth.service';
import { AppError } from '../../middleware/error.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { loginRateLimit } from '../../middleware/rate-limit.middleware';
import { changePasswordSchema as changePasswordValidationSchema, registerPasswordSchema } from '../../utils/password-validation';
import { z } from 'zod';

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

// POST /api/auth/register - DISABLED: Solo admin puede crear usuarios
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  // ✅ REGISTRO PÚBLICO DESHABILITADO: Solo admin puede crear usuarios
  return res.status(403).json({
    success: false,
    message: 'Public registration is disabled. Please contact an administrator to create an account.',
  });
});

// POST /api/auth/login - Con rate limiting para prevenir brute force
router.post('/login', loginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const result = await authService.login(username, password);

    // Configurar cookie httpOnly para el token (más seguro que localStorage)
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Obtener el dominio del frontend desde el origin de la petición (más confiable)
    const origin = req.headers.origin || req.headers.referer;
    let frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173';
    
    // Si hay origin en la petición, usarlo (más preciso)
    if (origin) {
      try {
        const originUrl = new URL(origin);
        frontendUrl = `${originUrl.protocol}//${originUrl.host}`;
      } catch (e) {
        // Si falla, usar el valor por defecto
      }
    }
    
    // Detectar si la petición viene por HTTPS (importante para cookies secure)
    const requestProtocol = req.protocol || (req.headers['x-forwarded-proto'] as string) || 'http';
    const isHttps = requestProtocol === 'https' || frontendUrl.startsWith('https');
    
    // IMPORTANTE: Cuando el backend y frontend están en dominios diferentes (ej: Railway vs ivanreseller.com),
    // NO debemos establecer el dominio de la cookie. El navegador solo enviará cookies al dominio que las estableció.
    // Si establecemos domain: '.ivanreseller.com' pero el backend está en Railway, el navegador NO enviará las cookies.
    
    // Solo establecer domain si el backend está en el mismo dominio base que el frontend
    let cookieDomain: string | undefined = undefined;
    try {
      const frontendUrlObj = new URL(frontendUrl);
      const frontendHostname = frontendUrlObj.hostname;
      
      // Obtener el hostname del backend (desde el request)
      const backendHostname = req.get('host') || req.hostname || '';
      
      // Solo establecer domain si el backend y frontend están en el mismo dominio base
      // Por ejemplo: api.ivanreseller.com y www.ivanreseller.com comparten el dominio base
      const frontendBaseDomain = frontendHostname.replace(/^[^.]+\./, ''); // Remover subdominio
      const backendBaseDomain = backendHostname.replace(/^[^.]+\./, '');
      
      if (frontendBaseDomain === backendBaseDomain && frontendBaseDomain !== 'localhost' && !frontendBaseDomain.includes('127.0.0.1')) {
        // Mismo dominio base - podemos establecer domain para que funcione con subdominios
        cookieDomain = `.${frontendBaseDomain}`;
      } else {
        // Dominios diferentes (ej: Railway vs ivanreseller.com) - NO establecer domain
        // El navegador enviará las cookies al dominio que las estableció (Railway)
        cookieDomain = undefined;
      }
    } catch (e) {
      // Si falla, no establecer domain
      cookieDomain = undefined;
    }
    
    // Configurar cookies
    const cookieOptions: any = {
      httpOnly: true, // No accesible desde JavaScript (previene XSS)
      secure: isHttps, // Enviar sobre HTTPS si la petición es HTTPS o el frontend usa HTTPS
      sameSite: 'none' as const, // 'none' es necesario para cookies cross-domain (backend en Railway, frontend en otro dominio)
      maxAge: 60 * 60 * 1000, // 1 hora (debe coincidir con JWT_EXPIRES_IN)
      path: '/', // Disponible en toda la aplicación
    };
    
    // Establecer domain solo si backend y frontend están en el mismo dominio base
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
      // Si están en el mismo dominio, podemos usar 'lax'
      cookieOptions.sameSite = 'lax' as const;
    }
    // Si NO establecemos domain (dominios diferentes), sameSite debe ser 'none' y secure debe ser true

    // Configurar cookie para refresh token (más largo)
    const refreshCookieOptions = {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    };

    // Logging para debug (siempre activo para diagnosticar)
    console.log('🍪 Configurando cookies:', {
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      domain: cookieOptions.domain,
      isHttps,
      requestProtocol,
      frontendUrl,
      hasToken: !!result.token,
      origin: req.headers.origin,
      referer: req.headers.referer,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      protocol: req.protocol,
    });

    // IMPORTANTE: Para cookies cross-domain con sameSite: 'none', necesitamos asegurar que
    // el header Access-Control-Allow-Credentials esté presente (CORS ya lo maneja, pero lo verificamos)
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // CRÍTICO: Para cookies cross-domain, el Access-Control-Allow-Origin debe ser específico (no *)
    // y coincidir exactamente con el origin del request
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
    }
    
    // Establecer cookies con los tokens
    res.cookie('token', result.token, cookieOptions);
    res.cookie('refreshToken', result.refreshToken, refreshCookieOptions);

    // Logging adicional para verificar que las cookies se establecieron
    console.log('✅ Cookies establecidas:', {
      tokenLength: result.token.length,
      refreshTokenLength: result.refreshToken.length,
      cookieOptions,
      responseHeaders: {
        'set-cookie': res.getHeader('Set-Cookie'),
      },
    });

    // Retornar datos del usuario (sin los tokens en el body por seguridad)
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        // Tokens están en cookies httpOnly
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
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
    
    const cookieOptions: any = {
      httpOnly: true,
      secure: isHttps,
      sameSite: cookieDomain ? 'lax' : 'none',
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
    await authService.generatePasswordResetToken(email);

    // TODO: Send email with reset link
    // For now, just log the token (in production, send email)
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      // Don't reveal if email exists
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
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
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const refreshToken = req.cookies?.refreshToken;

    // Revoke refresh token if provided
    if (refreshToken && userId) {
      await authService.revokeRefreshToken(refreshToken, userId);
    }

    // Blacklist current access token
    const accessToken = req.cookies?.token;
    if (accessToken) {
      const expiresIn = 60 * 60; // 1 hour in seconds
      await authService.blacklistToken(accessToken, expiresIn);
    }

    // Limpiar cookies (usar misma configuración que al crear)
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
    
    // Misma lógica que en login - solo establecer domain si backend y frontend están en mismo dominio base
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
    
    const clearCookieOptions: any = {
      httpOnly: true,
      secure: isHttps,
      sameSite: cookieDomain ? 'lax' : 'none', // 'none' para cross-domain, 'lax' para mismo dominio
      path: '/',
    };
    
    if (cookieDomain) {
      clearCookieOptions.domain = cookieDomain;
    }
    
    // CRÍTICO: Establecer Access-Control-Allow-Origin específico para cookies cross-domain
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    
    res.clearCookie('token', clearCookieOptions);
    res.clearCookie('refreshToken', clearCookieOptions);

    res.json({
      success: true,
      message: 'Logout successful',
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
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

export default router;
