import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../middleware/error.middleware';
import { logger } from '../config/logger';
import { redis, isRedisAvailable } from '../config/redis';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

export class AuthService {
  async register(data: {
    username: string;
    email: string;
    password: string;
    fullName?: string;
  }) {
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
      },
    });

    if (existingUser) {
      throw new AppError('Username or email already exists', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: passwordHash, // ✅ CORREGIDO: usar 'password' según schema
        fullName: data.fullName,
        role: 'USER',
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        fullName: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = this.generateToken(user.id, user.username, user.role);

    return {
      user,
      token,
    };
  }

  async login(username: string, password: string, correlationId?: string): Promise<{
    user: { id: number; username: string; email: string; role: string; fullName: string | null };
    token: string;
    refreshToken: string;
  } | null> {
    // ✅ CRITICAL: Envolver TODO en try/catch - NUNCA lanzar throw, siempre retornar null en caso de error
    try {
      const logCorrelationId = correlationId || 'unknown';
      
      // Trim whitespace from inputs
      const trimmedUsername = username?.trim();
      const trimmedPassword = password?.trim();

      if (!trimmedUsername || !trimmedPassword) {
        console.error(`[LOGIN ERROR] ${logCorrelationId} Missing username or password`);
        return null;
      }

      logger.debug('Login attempt', { username: trimmedUsername, correlationId: logCorrelationId });

      // ✅ CRITICAL: Wrap database queries in try-catch - retornar null en caso de error
      let user;
      try {
        // Try to find user by username (exact match first)
        // Especificar campos explícitamente para evitar errores si falta el campo 'plan'
        user = await prisma.user.findUnique({
          where: { username: trimmedUsername },
          select: {
            id: true,
            username: true,
            email: true,
            password: true,
            fullName: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            // plan puede no existir en la BD, no lo incluimos en select
          },
        });

        // If not found, try case-insensitive search by username or email
        if (!user) {
          const allUsers = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, username: true, email: true },
          });
          
          const lowerInput = trimmedUsername.toLowerCase();
          const foundUser = allUsers.find(
            u => u.username.toLowerCase() === lowerInput || u.email.toLowerCase() === lowerInput
          );
          
          if (foundUser) {
            user = await prisma.user.findUnique({
              where: { id: foundUser.id },
              select: {
                id: true,
                username: true,
                email: true,
                password: true,
                fullName: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                // plan puede no existir en la BD, no lo incluimos en select
              },
            });
          }
        }
      } catch (dbError: any) {
        // ✅ CRITICAL: Catch database errors - retornar null en lugar de throw
        console.error(`[LOGIN_SERVICE_FATAL] ${logCorrelationId} Database error during login`, {
          error: dbError?.message || String(dbError),
          code: dbError?.code,
          username: trimmedUsername,
          stack: dbError?.stack,
        });
        logger.error('Database error during login', {
          correlationId: logCorrelationId,
          error: dbError?.message || String(dbError),
          code: dbError?.code,
          username: trimmedUsername,
        });
        return null;
      }

      // ✅ CRITICAL: Si user no existe → return null
      if (!user) {
        console.error(`[LOGIN ERROR] ${logCorrelationId} User not found`, { username: trimmedUsername });
        logger.warn('Login failed: User not found', { correlationId: logCorrelationId, username: trimmedUsername });
        return null;
      }

      if (!user.isActive) {
        console.error(`[LOGIN ERROR] ${logCorrelationId} Account disabled`, { username: user.username, userId: user.id });
        logger.warn('Login failed: Account disabled', { correlationId: logCorrelationId, username: user.username });
        return null;
      }

      // ✅ CRITICAL: Si user.password es null/undefined → return null
      if (!user.password) {
        console.error(`[LOGIN ERROR] ${logCorrelationId} User has no password set`, { username: user.username, userId: user.id });
        logger.warn('Login failed: User has no password set', { correlationId: logCorrelationId, username: user.username });
        return null;
      }

      // ✅ CRITICAL: bcrypt.compare envuelto en try/catch - retornar null en caso de error
      let isPasswordValid = false;
      try {
        isPasswordValid = await bcrypt.compare(trimmedPassword, user.password);
      } catch (bcryptError: any) {
        // If bcrypt.compare throws (e.g., invalid hash format), log and return null
        console.error(`[LOGIN_SERVICE_FATAL] ${logCorrelationId} Password comparison error`, {
          error: bcryptError?.message || String(bcryptError),
          username: user.username,
          userId: user.id,
          stack: bcryptError?.stack,
        });
        logger.error('Password comparison error during login', {
          correlationId: logCorrelationId,
          error: bcryptError?.message || String(bcryptError),
          username: user.username,
        });
        return null;
      }

      if (!isPasswordValid) {
        console.error(`[LOGIN ERROR] ${logCorrelationId} Invalid password`, { username: user.username, userId: user.id });
        logger.warn('Login failed: Invalid password', { correlationId: logCorrelationId, username: user.username });
        return null;
      }

      logger.info('Login successful', { correlationId: logCorrelationId, userId: user.id, username: user.username, email: user.email });

      // ✅ FIX: Wrap post-login database operations in try-catch to prevent 500 errors
      // These operations are non-critical and should not block login
      try {
        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch((updateError) => {
          console.error(`[LOGIN WARN] ${logCorrelationId} Failed to update lastLoginAt`, {
            error: updateError?.message || String(updateError),
            userId: user.id,
          });
          logger.warn('Failed to update lastLoginAt', {
            correlationId: logCorrelationId,
            error: updateError?.message || String(updateError),
            userId: user.id,
          });
        });

        // Log activity
        await prisma.activity.create({
          data: {
            userId: user.id,
            action: 'login',
            description: `User ${username} logged in`,
          },
        }).catch((activityError) => {
          console.error(`[LOGIN WARN] ${logCorrelationId} Failed to create login activity`, {
            error: activityError?.message || String(activityError),
            userId: user.id,
          });
          logger.warn('Failed to create login activity', {
            correlationId: logCorrelationId,
            error: activityError?.message || String(activityError),
            userId: user.id,
          });
        });
      } catch (postLoginError: any) {
        // Log but don't fail login if post-login operations fail
        console.error(`[LOGIN WARN] ${logCorrelationId} Post-login operations failed`, {
          error: postLoginError?.message || String(postLoginError),
          userId: user.id,
        });
        logger.warn('Post-login operations failed', {
          correlationId: logCorrelationId,
          error: postLoginError?.message || String(postLoginError),
          userId: user.id,
        });
      }

      // Normalizar rol a mayúsculas para consistencia
      const normalizedRole = user.role.toUpperCase();

      // ✅ CRITICAL: jwt.sign y generateRefreshToken envueltos en try/catch - retornar null en caso de error
      let accessToken: string;
      let refreshToken: string;
      try {
        accessToken = this.generateToken(user.id, user.username, normalizedRole, undefined, logCorrelationId);
        refreshToken = await this.generateRefreshToken(user.id, logCorrelationId);
      } catch (tokenError: any) {
        console.error(`[LOGIN_SERVICE_FATAL] ${logCorrelationId} Token generation error`, {
          error: tokenError?.message || String(tokenError),
          userId: user.id,
          username: user.username,
          stack: tokenError?.stack,
        });
        logger.error('Token generation error during login', {
          correlationId: logCorrelationId,
          error: tokenError?.message || String(tokenError),
          userId: user.id,
        });
        // ✅ CRITICAL: Retornar null en lugar de throw
        return null;
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: normalizedRole,
          fullName: user.fullName,
        },
        token: accessToken,
        refreshToken,
      };
    } catch (err: any) {
      // ✅ CRITICAL: Catch cualquier error inesperado - retornar null, NUNCA throw
      console.error('[LOGIN_SERVICE_FATAL]', {
        error: err?.message || String(err),
        stack: err?.stack,
        correlationId: correlationId || 'unknown',
      });
      return null;
    }
  }

  generateToken(userId: number, username: string, role: string, jti?: string, correlationId?: string): string {
    const logCorrelationId = correlationId || 'unknown';
    
    // Normalizar rol a mayúsculas para consistencia
    const normalizedRole = role.toUpperCase();
    
    // ✅ FIX: Defensive JWT_SECRET validation with detailed logging
    const secret: Secret = env.JWT_SECRET as string;
    if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
      const errorMsg = 'JWT_SECRET is missing or invalid';
      console.error(`[AUTH ERROR] ${logCorrelationId} ${errorMsg}`, {
        hasSecret: !!secret,
        secretType: typeof secret,
        secretLength: secret ? secret.length : 0,
        minRequiredLength: 32,
        userId,
        username,
      });
      logger.error('JWT_SECRET validation failed', {
        correlationId: logCorrelationId,
        hasSecret: !!secret,
        secretLength: secret ? secret.length : 0,
        userId,
      });
      // ✅ FIX: Return 401 instead of 500 for auth failures
      throw new AppError('Authentication configuration error', 401, ErrorCode.UNAUTHORIZED);
    }

    const signOptions: SignOptions = {
      expiresIn: (env.JWT_EXPIRES_IN || '1h') as SignOptions['expiresIn'],
      jwtid: jti || crypto.randomBytes(16).toString('hex'), // JWT ID for blacklisting
    };

    try {
      return jwt.sign(
        { userId, username, role: normalizedRole },
        secret,
        signOptions
      );
    } catch (jwtError: any) {
      console.error(`[AUTH ERROR] ${logCorrelationId} JWT sign error`, {
        error: jwtError?.message || String(jwtError),
        userId,
        username,
        stack: jwtError?.stack,
      });
      logger.error('JWT sign error', {
        correlationId: logCorrelationId,
        error: jwtError?.message || String(jwtError),
        userId,
      });
      // ✅ FIX: Return 401 instead of 500 for auth failures
      throw new AppError('Authentication failed', 401, ErrorCode.UNAUTHORIZED);
    }
  }

  async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      return decoded;
    } catch (error) {
      throw new AppError('Invalid token', 401);
    }
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // ✅ FIX: Check if password exists before comparing
    if (!user.password) {
      throw new AppError('User has no password set', 400);
    }

    // ✅ FIX: Verify current password with defensive error handling
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    } catch (bcryptError: any) {
      logger.error('Password comparison error during changePassword', {
        error: bcryptError?.message || String(bcryptError),
        userId: user.id,
      });
      throw new AppError('Current password is incorrect', 401);
    }

    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: newPasswordHash },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        action: 'password_changed',
        description: `User ${user.username} changed password`,
      },
    });

    return { message: 'Password changed successfully' };
  }

  /**
   * Generate refresh token and store in database
   */
  async generateRefreshToken(userId: number, correlationId?: string): Promise<string> {
    const logCorrelationId = correlationId || 'unknown';
    
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    // Parse JWT_REFRESH_EXPIRES_IN (e.g., "30d" = 30 days)
    const refreshExpiresIn = env.JWT_REFRESH_EXPIRES_IN || '30d';
    const daysMatch = refreshExpiresIn.match(/(\d+)d/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
    expiresAt.setDate(expiresAt.getDate() + days);

    // ✅ FIX: Wrap database operation in try-catch to prevent 500 errors
    try {
      await prisma.refreshToken.create({
        data: {
          token,
          userId,
          expiresAt,
        },
      });

      logger.debug('Refresh token generated', { correlationId: logCorrelationId, userId });
      return token;
    } catch (dbError: any) {
      console.error(`[AUTH ERROR] ${logCorrelationId} Failed to create refresh token`, {
        error: dbError?.message || String(dbError),
        code: dbError?.code,
        userId,
        stack: dbError?.stack,
      });
      logger.error('Failed to create refresh token', {
        correlationId: logCorrelationId,
        error: dbError?.message || String(dbError),
        code: dbError?.code,
        userId,
      });
      // ✅ FIX: Return 401 instead of 500 for auth failures
      throw new AppError('Authentication failed', 401, ErrorCode.UNAUTHORIZED);
    }
  }

  /**
   * Verify and refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Check if token is blacklisted
    if (isRedisAvailable) {
      const isBlacklisted = await redis.get(`blacklist:refresh:${refreshToken}`);
      if (isBlacklisted) {
        throw new AppError('Refresh token has been revoked', 401);
      }
    }

    // Find refresh token in database
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Check if token is expired
    if (tokenRecord.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: tokenRecord.id } });
      throw new AppError('Refresh token expired', 401);
    }

    // Check if token is revoked
    if (tokenRecord.revokedAt) {
      throw new AppError('Refresh token has been revoked', 401);
    }

    // Check if user is active
    if (!tokenRecord.user.isActive) {
      throw new AppError('User account is disabled', 403);
    }

    // Generate new access token
    const normalizedRole = tokenRecord.user.role.toUpperCase();
    const accessToken = this.generateToken(tokenRecord.user.id, tokenRecord.user.username, normalizedRole);

    // Generate new refresh token (rotate)
    const newRefreshToken = await this.generateRefreshToken(tokenRecord.user.id);

    // Revoke old refresh token
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Add old token to blacklist
    if (isRedisAvailable) {
      const ttl = Math.floor((tokenRecord.expiresAt.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await redis.setex(`blacklist:refresh:${refreshToken}`, ttl, '1');
      }
    }

    logger.info('Access token refreshed', { userId: tokenRecord.user.id });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Revoke refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string, userId: number): Promise<void> {
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (tokenRecord && tokenRecord.userId === userId && !tokenRecord.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });

      // Add to blacklist
      if (isRedisAvailable) {
        const ttl = Math.floor((tokenRecord.expiresAt.getTime() - Date.now()) / 1000);
        if (ttl > 0) {
          await redis.setex(`blacklist:refresh:${refreshToken}`, ttl, '1');
        }
      }

      logger.info('Refresh token revoked', { userId });
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(userId: number): Promise<void> {
    const tokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
      },
    });

    for (const token of tokens) {
      await prisma.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });

      // Add to blacklist
      if (isRedisAvailable) {
        const ttl = Math.floor((token.expiresAt.getTime() - Date.now()) / 1000);
        if (ttl > 0) {
          await redis.setex(`blacklist:refresh:${token.token}`, ttl, '1');
        }
      }
    }

    logger.info('All refresh tokens revoked', { userId });
  }

  /**
   * Check if access token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!isRedisAvailable) {
      return false;
    }

    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.jti) {
        return false;
      }

      const isBlacklisted = await redis.get(`blacklist:access:${decoded.jti}`);
      return !!isBlacklisted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add access token to blacklist
   */
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    if (!isRedisAvailable) {
      return;
    }

    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.jti) {
        await redis.setex(`blacklist:access:${decoded.jti}`, expiresIn, '1');
      }
    } catch (error) {
      logger.warn('Failed to blacklist token', { error });
    }
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isActive: true },
    });

    if (!user) {
      // Don't reveal if user exists (security best practice)
      logger.warn('Password reset requested for non-existent email', { email });
      return 'token'; // Return dummy token to prevent email enumeration
    }

    if (!user.isActive) {
      throw new AppError('Account is disabled', 403);
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration

    // Revoke any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        email: user.email,
        expiresAt,
      },
    });

    logger.info('Password reset token generated', { userId: user.id, email: user.email });

    return token;
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    // Check if token is expired
    if (tokenRecord.expiresAt < new Date()) {
      await prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
      throw new AppError('Reset token has expired', 400);
    }

    // Check if token was already used
    if (tokenRecord.usedAt) {
      throw new AppError('Reset token has already been used', 400);
    }

    // Check if user is active
    if (!tokenRecord.user.isActive) {
      throw new AppError('Account is disabled', 403);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { password: passwordHash },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Revoke all refresh tokens (force re-login)
    await this.revokeAllRefreshTokens(tokenRecord.userId);

    // Log activity
    await prisma.activity.create({
      data: {
        userId: tokenRecord.userId,
        action: 'password_reset',
        description: `User ${tokenRecord.user.username} reset password via token`,
      },
    });

    logger.info('Password reset successful', { userId: tokenRecord.userId });
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    // Delete expired refresh tokens
    const deletedRefreshTokens = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    // Delete expired password reset tokens
    const deletedResetTokens = await prisma.passwordResetToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    logger.info('Expired tokens cleaned up', {
      refreshTokens: deletedRefreshTokens.count,
      resetTokens: deletedResetTokens.count,
    });
  }
}

export const authService = new AuthService();
