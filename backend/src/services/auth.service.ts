import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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
        passwordHash,
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
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        action: 'login',
        description: `User ${username} logged in`,
      },
    });

    // Generate token
    const token = this.generateToken(user.id, user.username, user.role);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
      token,
    };
  }

  generateToken(userId: number, username: string, role: string): string {
    return jwt.sign(
      { userId, username, role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
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
}

export const authService = new AuthService();
