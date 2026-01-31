import { trace } from '../utils/boot-trace';
trace('loading user.service');

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
    fullName?: string;
    role?: string;
    commissionRate?: number;
    fixedMonthlyCost?: number;
    isActive?: boolean;
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
    // Preparar datos para crear usuario (sin plan)
    const userData: any = {
      username: data.username,
      email: data.email,
      password: hashedPassword,
      fullName: data.fullName || null,
      role: data.role || 'USER',
      commissionRate: data.commissionRate ?? 0.20, // 20% por defecto (sobre utilidad de operación exitosa)
      fixedMonthlyCost: data.fixedMonthlyCost ?? 0.0, // $0 USD por defecto (costo fijo mensual)
      isActive: data.isActive !== undefined ? data.isActive : true,
    };

    const user = await prisma.user.create({
      data: userData,
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

  // Get complete user profile
  async getUserProfile(userId: number) {
    // Primero obtener usuario sin plan para evitar errores
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        balance: true,
        totalEarnings: true,
        totalSales: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Obtener relaciones
    const [apiCredentials, workflowConfig, stats] = await Promise.all([
      prisma.apiCredential.findMany({
        where: { userId },
        select: {
          id: true,
          apiName: true,
          environment: true,
          isActive: true,
          scope: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { apiName: 'asc' },
      }),
      prisma.userWorkflowConfig.findUnique({
        where: { userId },
        select: {
          environment: true,
          workflowMode: true,
          stageScrape: true,
          stageAnalyze: true,
          stagePublish: true,
        },
      }),
      Promise.all([
        prisma.product.count({ where: { userId } }),
        prisma.sale.count({ where: { userId } }),
        prisma.opportunity.count({ where: { userId } }),
        prisma.activity.count({ where: { userId } }),
        prisma.commission.count({ where: { userId } }),
      ]).then(([products, sales, opportunities, activities, commissions]) => ({
        products,
        sales,
        opportunities,
        activities,
        commissions,
      })),
    ]);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      commissionRate: user.commissionRate,
      fixedMonthlyCost: user.fixedMonthlyCost,
      balance: user.balance,
      totalEarnings: user.totalEarnings,
      totalSales: user.totalSales,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdBy: user.createdBy,
      workflowConfig: workflowConfig,
      apiCredentials: apiCredentials,
      stats: {
        products: stats.products,
        sales: stats.sales,
        opportunities: stats.opportunities,
        activities: stats.activities,
        commissions: stats.commissions,
      },
    };
  }

  // Get user profile by username
  async getUserProfileByUsername(username: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { email: { equals: username, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.getUserProfile(user.id);
  }
}

export const userService = new UserService();
