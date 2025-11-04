import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';

export class UserService {
  // Get all users (Admin only)
  async getAllUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return users;
  }

  // Get user by ID
  async getUserById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  // Create new user (Admin only)
  async createUser(data: {
    username: string;
    email: string;
    password: string;
    role?: string;
    commissionRate?: number;
    fixedMonthlyCost?: number;
  }) {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: data.username },
        ],
      },
    });

    if (existingUser) {
      throw new Error('User with this email or username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        role: data.role || 'USER',
        commissionRate: data.commissionRate || 10.0,
        fixedMonthlyCost: data.fixedMonthlyCost || 17.0,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        createdAt: true,
      },
    });

    return user;
  }

  // Update user
  async updateUser(
    userId: number,
    data: {
      username?: string;
      email?: string;
      password?: string;
      role?: string;
      commissionRate?: number;
      fixedMonthlyCost?: number;
    }
  ) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    // Prepare update data
    const updateData: any = {};

    if (data.username) updateData.username = data.username;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.commissionRate !== undefined) updateData.commissionRate = data.commissionRate;
    if (data.fixedMonthlyCost !== undefined) updateData.fixedMonthlyCost = data.fixedMonthlyCost;

    // Hash password if provided
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        updatedAt: true,
      },
    });

    return user;
  }

  // Delete user (Admin only)
  async deleteUser(userId: number) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    // Don't allow deleting the last admin
    if (existingUser.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }

    // Delete user
    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'User deleted successfully' };
  }

  // Get user stats
  async getUserStats(userId: number) {
    const [productsCount, salesCount, commissionsTotal] = await Promise.all([
      prisma.product.count({ where: { userId } }),
      prisma.sale.count({ where: { userId } }),
      prisma.commission.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
    ]);

    return {
      productsCount,
      salesCount,
      commissionsTotal: commissionsTotal._sum.amount || 0,
    };
  }
}

export const userService = new UserService();
