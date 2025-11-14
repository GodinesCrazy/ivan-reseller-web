import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './error.middleware';
import { authService } from '../services/auth.service';

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
  _res: Response,
  next: NextFunction
) => {
  try {
    // Prioridad 1: Token desde cookie (httpOnly, más seguro)
    // Prioridad 2: Token desde header Authorization (para compatibilidad)
    let token: string | undefined = req.cookies?.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // Logging para debug cuando no hay token (siempre activo para diagnosticar)
    if (!token) {
      console.log('🔍 Auth debug - No token encontrado:', {
        hasCookies: !!req.cookies,
        cookieNames: req.cookies ? Object.keys(req.cookies) : [],
        cookies: req.cookies, // Mostrar todas las cookies recibidas
        hasAuthHeader: !!req.headers.authorization,
        path: req.path,
        method: req.method,
        origin: req.headers.origin,
        referer: req.headers.referer,
        'cookie-header': req.headers.cookie, // Header raw de cookies
        'user-agent': req.headers['user-agent'],
        'accept': req.headers.accept,
        'accept-language': req.headers['accept-language'],
        allHeaders: Object.keys(req.headers),
      });
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
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token expired', 401);
      }
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
    const userRoleUpper = req.user.role?.toUpperCase();
    const allowedRolesUpper = roles.map(r => r.toUpperCase());

    if (!userRoleUpper || !allowedRolesUpper.includes(userRoleUpper)) {
      return next(new AppError('Insufficient permissions. Admin access required.', 403));
    }

    next();
  };
};
