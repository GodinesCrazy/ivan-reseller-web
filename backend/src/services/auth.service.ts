import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

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

  async login(username: string, password: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is disabled', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        action: 'login',
        description: `User ${username} logged in`,
      },
    });

    // Normalizar rol a mayúsculas para consistencia
    const normalizedRole = user.role.toUpperCase();

    // Generate token
    const token = this.generateToken(user.id, user.username, normalizedRole);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: normalizedRole,
        fullName: user.fullName,
      },
      token,
    };
  }

  generateToken(userId: number, username: string, role: string): string {
    // Normalizar rol a mayúsculas para consistencia
    const normalizedRole = role.toUpperCase();
    
    const secret: Secret = env.JWT_SECRET as string;
    if (!secret) {
      throw new AppError('JWT secret not configured', 500);
    }

    const signOptions: SignOptions = {
      expiresIn: (env.JWT_EXPIRES_IN || '1h') as SignOptions['expiresIn'],
    };

    return jwt.sign(
      { userId, username, role: normalizedRole },
      secret,
      signOptions
    );
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

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
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
}

export const authService = new AuthService();
