import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError, ErrorCode } from './error.middleware';
import { authService } from '../services/auth.service';
import { getTokenFromRequest, parseCookiesFromHeader } from '../utils/cookie-parser';

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // ✅ FIX AUTH: Cookie-first - accept cookie OR Authorization header for post-login requests
    let token: string | undefined =
      req.cookies?.token ||
      (req.headers?.cookie ? parseCookiesFromHeader(req.headers.cookie).token : undefined) ||
      ((req.headers?.authorization?.replace(/^Bearer\s+/i, '') ?? '').trim() || undefined);
    if (!token) token = getTokenFromRequest(req);

    // ✅ FIX AUTH: Si no hay token pero hay refreshToken, intentar refrescar automáticamente
    if (!token) {
      // ✅ FIX AUTH: Obtener refreshToken desde múltiples fuentes
      const refreshToken = req.cookies?.refreshToken || 
                          (req.headers.cookie ? parseCookiesFromHeader(req.headers.cookie).refreshToken : undefined);
      
      // Si hay refreshToken, intentar refrescar el token automáticamente
      if (refreshToken && req.path !== '/api/auth/refresh' && req.path !== '/api/auth/logout') {
        try {
          const result = await authService.refreshAccessToken(refreshToken);
          
          // Usar el nuevo token para autenticar
          token = result.accessToken;
          
          // ✅ Establecer el nuevo token en la cookie para futuras peticiones
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
          };
          
          if (cookieDomain && !isProduction) {
            // ✅ FIX AUTH: En producción NO establecer domain para permitir cross-domain
            cookieOptions.domain = cookieDomain;
          }
          
          // Establecer el nuevo token en la cookie
          res.cookie('token', result.accessToken, cookieOptions);
          
          // Establecer headers CORS si es necesario
          const requestOrigin = req.headers.origin;
          if (requestOrigin) {
            res.header('Access-Control-Allow-Origin', requestOrigin);
          }
          res.header('Access-Control-Allow-Credentials', 'true');
          
          // Logging para debug
          const logger = (await import('../config/logger')).default;
          logger.debug('[Auth] Token auto-refreshed and cookie set', {
            path: req.path,
            method: req.method,
            hasRefreshToken: true
          });
        } catch (refreshError: any) {
          // Si falla el refresh, continuar con el flujo normal de error
          const logger = (await import('../config/logger')).default;
          logger.debug('[Auth] Auto-refresh failed', {
            path: req.path,
            method: req.method,
            error: refreshError?.message || String(refreshError)
          });
        }
      }
      
      // ✅ FIX AUTH: Logging mejorado para diagnosticar problemas de cookies
      if (!token) {
        const logger = (await import('../config/logger')).default;
        logger.debug('[Auth] No token encontrado', {
          hasCookies: !!req.cookies,
          cookieNames: req.cookies ? Object.keys(req.cookies) : [],
          hasCookieHeader: !!req.headers.cookie,
          cookieHeaderPreview: req.headers.cookie ? req.headers.cookie.substring(0, 100) + '...' : null,
          hasAuthHeader: !!req.headers.authorization,
          hasRefreshToken: !!refreshToken,
          path: req.path,
          method: req.method,
          origin: req.headers.origin,
          referer: req.headers.referer,
        });
      }
    }

    if (!token) {
      throw new AppError('Authentication required', 401);
    }

    // Check if token is blacklisted
    const isBlacklisted = await authService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AppError('Token has been revoked', 401);
    }

    try {
      // ✅ FIX AUTH: Validar formato del token antes de verificar
      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        throw new AppError('Token is empty or invalid format', 401);
      }
      
      // ✅ FIX AUTH: Validar que JWT_SECRET existe y es válido
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        const logger = (await import('../config/logger')).default;
        const correlationId = (req as any).correlationId || 'unknown';
        console.error(`[AUTH ERROR] ${correlationId} JWT_SECRET is missing or too short`, {
          hasSecret: !!env.JWT_SECRET,
          secretLength: env.JWT_SECRET?.length || 0,
          path: req.path,
          method: req.method,
        });
        logger.error('[Auth] JWT_SECRET is missing or too short', {
          correlationId,
          hasSecret: !!env.JWT_SECRET,
          secretLength: env.JWT_SECRET?.length || 0,
        });
        // ✅ FIX: Return 401 instead of 500 for auth failures
        throw new AppError('Authentication configuration error', 401, ErrorCode.UNAUTHORIZED);
      }
      
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      
      // ✅ FIX AUTH: Validar que el payload tiene los campos requeridos
      if (!decoded.userId || !decoded.username || !decoded.role) {
        const logger = (await import('../config/logger')).default;
        logger.warn('[Auth] Token decoded but missing required fields', {
          hasUserId: !!decoded.userId,
          hasUsername: !!decoded.username,
          hasRole: !!decoded.role,
        });
        throw new AppError('Invalid token payload', 401);
      }
      
      req.user = decoded;
      next();
    } catch (error) {
      const logger = (await import('../config/logger')).default;
      
      if (error instanceof AppError) {
        throw error;
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('[Auth] Token expired', {
          path: req.path,
          method: req.method,
        });
        throw new AppError('Token expired', 401);
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('[Auth] Invalid token', {
          path: req.path,
          method: req.method,
          error: error.message,
          tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
          hasCookies: !!req.cookies,
          cookieNames: req.cookies ? Object.keys(req.cookies) : [],
          cookieHeader: req.headers.cookie ? 'present' : 'missing',
        });
        throw new AppError('Invalid token', 401);
      }
      
      logger.error('[Auth] Unexpected error verifying token', {
        path: req.path,
        method: req.method,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('Invalid token', 401);
    }
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Normalizar roles a mayúsculas para comparación case-insensitive
    // ✅ Validar que todos los roles sean strings antes de llamar toUpperCase
    const userRoleUpper = typeof req.user.role === 'string' ? req.user.role.toUpperCase() : null;
    const allowedRolesUpper = roles
      .filter(r => typeof r === 'string' && r.trim().length > 0)
      .map(r => String(r).toUpperCase());

    if (!userRoleUpper || allowedRolesUpper.length === 0 || !allowedRolesUpper.includes(userRoleUpper)) {
      return next(new AppError('Insufficient permissions. Admin access required.', 403));
    }

    next();
  };
};
