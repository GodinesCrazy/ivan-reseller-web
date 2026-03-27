import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getTokenFromRequest } from '../utils/cookie-parser';
import type { JwtPayload } from './auth.middleware';

/**
 * Lightweight JWT decode for tiered rate limiting only.
 * Runs before global /api rate limit so ADMIN_LIMIT and per-user keys apply.
 * Does not check token blacklist (avoids DB on every request); route handlers still use full authenticate().
 */
export function optionalJwtUserForRateLimit(req: Request, _res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    return next();
  }
  const token = getTokenFromRequest(req as any);
  if (!token || typeof token !== 'string' || !token.trim()) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (decoded?.userId && decoded?.username && decoded?.role) {
      req.user = decoded;
    }
  } catch {
    // Invalid/expired token — treat as anonymous for rate limit only
  }
  next();
}
