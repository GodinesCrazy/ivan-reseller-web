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
    // Trim whitespace from inputs
    const trimmedUsername = username?.trim();
    const trimmedPassword = password?.trim();

    if (!trimmedUsername || !trimmedPassword) {
      throw new AppError('Username and password are required', 400);
    }

    console.log(`[Auth] Login attempt - input: "${trimmedUsername}"`);

    // Try to find user by username (exact match first)
    // Especificar campos explícitamente para evitar errores si falta el campo 'plan'
    let user = await prisma.user.findUnique({
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

    if (!user) {
      console.warn(`[Auth] Login failed: User not found - input: "${trimmedUsername}"`);
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      console.warn(`[Auth] Login failed: Account disabled - username: "${user.username}"`);
      throw new AppError('Account is disabled', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(trimmedPassword, user.password);

    if (!isPasswordValid) {
      console.warn(`[Auth] Login failed: Invalid password - username: "${user.username}"`);
      throw new AppError('Invalid credentials', 401);
    }

    console.log(`[Auth] Login successful - username: "${user.username}", email: "${user.email}"`);

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
