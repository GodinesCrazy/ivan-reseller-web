import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth.service';
import { AppError } from '../../middleware/error.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { loginRateLimit } from '../../middleware/rate-limit.middleware';
import { changePasswordSchema as changePasswordValidationSchema, registerPasswordSchema } from '../../utils/password-validation';
import { z } from 'zod';
import logger from '../../config/logger';

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

// POST /api/auth/login - Con rate limiting para prevenir brute force
router.post('/login', loginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const result = await authService.login(username, password);

    // ✅ FIX AUTH: Configurar cookie httpOnly para el token (más seguro que localStorage)
    // CRÍTICO: En producción, backend está en Railway y frontend en Vercel (dominios diferentes)
    // Por lo tanto, SIEMPRE usar sameSite: 'none' y secure: true en producción
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
    
    // ✅ FIX AUTH: Configurar cookies para producción (cross-domain Vercel -> Railway)
    // Usar isProduction ya declarado arriba
    const cookieOptions: any = {
      httpOnly: true, // No accesible desde JavaScript (previene XSS)
      secure: isProduction ? true : isHttps, // ✅ CRÍTICO: En producción SIEMPRE true para sameSite: 'none'
      sameSite: (isProduction || !cookieDomain) ? 'none' as const : 'lax' as const, // ✅ CRÍTICO: 'none' para cross-domain en producción
      maxAge: 60 * 60 * 1000, // 1 hora (debe coincidir con JWT_EXPIRES_IN)
      path: '/', // Disponible en toda la aplicación
    };
    
    // Establecer domain solo si backend y frontend están en el mismo dominio base
    // ✅ FIX AUTH: En producción (Railway vs Vercel), NO establecer domain para permitir cross-domain
    if (cookieDomain && !isProduction) {
      cookieOptions.domain = cookieDomain;
      // Si están en el mismo dominio y NO es producción, podemos usar 'lax'
      cookieOptions.sameSite = 'lax' as const;
    }
    // Si NO establecemos domain (dominios diferentes), sameSite debe ser 'none' y secure debe ser true

    // Configurar cookie para refresh token (más largo)
    const refreshCookieOptions = {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    };

    // Logging para debug (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Configurando cookies', {
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
    }

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

    // Logging adicional para verificar que las cookies se establecieron (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      const setCookieHeaders = res.getHeader('Set-Cookie');
      logger.debug('Cookies establecidas', {
        tokenLength: result.token.length,
        refreshTokenLength: result.refreshToken.length,
        cookieOptions,
        responseHeaders: {
          'set-cookie': setCookieHeaders,
          'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin'),
          'access-control-allow-credentials': res.getHeader('Access-Control-Allow-Credentials'),
        },
        requestOrigin: requestOrigin,
      });
    }

    // SOLUCIÓN HÍBRIDA: Devolver token en el body como fallback para todos los navegadores
    // Esto asegura que el login funcione incluso si las cookies cross-domain no se establecen correctamente
    // El frontend usará cookies si están disponibles, o el token del body como fallback
    // CRÍTICO: Siempre devolver el token en el body para garantizar que el login funcione en producción
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        // Token en el body como fallback (siempre disponible para garantizar login exitoso)
        token: result.token,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    next(error);
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
    
    // ✅ FIX AUTH: En producción, usar sameSite: 'none' y secure: true siempre
    const isProduction = process.env.NODE_ENV === 'production';
    const clearCookieOptions: any = {
      httpOnly: true,
      secure: isProduction ? true : isHttps, // ✅ CRÍTICO: En producción SIEMPRE true
      sameSite: (isProduction || !cookieDomain) ? 'none' as const : 'lax' as const, // ✅ CRÍTICO: 'none' para cross-domain
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
