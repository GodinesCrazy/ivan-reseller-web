import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';
import { SecureCredentialManager } from './security.service';
import { toNumber } from '../utils/decimal.utils';

export interface UserCreationData {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  role: 'ADMIN' | 'USER';
  commissionRate: number; // Porcentaje de comisión (ej: 0.15 = 15%)
  fixedMonthlyCost: number; // Costo fijo mensual en USD
  isActive?: boolean;
}

export interface CommissionSettings {
  userId: number;
  commissionRate: number; // Porcentaje por transacción exitosa
  fixedMonthlyCost: number; // Costo mensual fijo
  paymentDay: number; // Día del mes para cobrar (1-28)
  autoPayment: boolean; // ¿Cobrar automáticamente?
}

export class AdminService {
  private credentialManager: SecureCredentialManager;

  constructor() {
    this.credentialManager = new SecureCredentialManager();
  }

  /**
   * 👤 CREAR USUARIO CON COMISIONES PERSONALIZADAS
   * Solo administradores pueden crear usuarios
   */
  async createUser(adminId: number, userData: UserCreationData): Promise<{
    user: any;
    accessUrl: string;
    loginCredentials: {
      username: string;
      temporaryPassword: string;
    };
  }> {
    // Verificar que el creador es admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden crear usuarios');
    }

    // Verificar que username y email no existan
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: userData.username },
          { email: userData.email }
        ]
      }
    });

    if (existingUser) {
      throw new Error('Usuario o email ya existe');
    }

    // Hash de la contraseña
    const hashedPassword = bcrypt.hashSync(userData.password, 10);

    // ✅ Crear usuario con configuración de comisiones y tracking de creador
    const newUser = await prisma.user.create({
      data: {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        fullName: userData.fullName,
        role: userData.role,
        commissionRate: userData.commissionRate,
        fixedMonthlyCost: userData.fixedMonthlyCost,
        isActive: userData.isActive ?? true,
        createdBy: adminId // ✅ Trackear admin que creó el usuario
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        isActive: true,
        createdAt: true
      }
    });

    // ✅ Crear configuración de workflow por defecto para el nuevo usuario
    await prisma.userWorkflowConfig.create({
      data: {
        userId: newUser.id,
        environment: 'sandbox',
        workflowMode: 'manual',
        stageScrape: 'automatic',
        stageAnalyze: 'automatic',
        stagePublish: 'manual',
        stagePurchase: 'manual',
        stageFulfillment: 'manual',
        stageCustomerService: 'manual'
      }
    });

    // Registrar actividad del admin
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'user_created',
        description: `Admin creó usuario: ${userData.username}`,
        metadata: JSON.stringify({
          newUserId: newUser.id,
          commissionRate: userData.commissionRate,
          fixedMonthlyCost: userData.fixedMonthlyCost
        })
      }
    });

    // URL de acceso al sistema
    const accessUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    return {
      user: newUser,
      accessUrl,
      loginCredentials: {
        username: userData.username,
        temporaryPassword: userData.password
      }
    };
  }

  /**
   * ⚙️ CONFIGURAR COMISIONES DE USUARIO
   */
  async updateUserCommissions(adminId: number, userId: number, settings: CommissionSettings): Promise<any> {
    // Verificar permisos de admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden modificar comisiones');
    }

    // Actualizar configuración de comisiones
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        commissionRate: settings.commissionRate,
        fixedMonthlyCost: settings.fixedMonthlyCost,
        updatedAt: new Date()
      },
      select: {
        id: true,
        username: true,
        email: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        totalEarnings: true,
        totalSales: true
      }
    });

    // Registrar cambio
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'commission_updated',
        description: `Admin actualizó comisiones de usuario ${updatedUser.username}`,
        metadata: JSON.stringify({
          targetUserId: userId,
          newCommissionRate: settings.commissionRate,
          newFixedMonthlyCost: settings.fixedMonthlyCost
        })
      }
    });

    return updatedUser;
  }

  /**
   * 🔑 CONFIGURAR APIs DE MARKETPLACE PARA USUARIO
   */
  async configureUserAPIs(adminId: number, userId: number, apiConfigs: {
    marketplace: 'ebay' | 'amazon' | 'mercadolibre';
    environment: 'sandbox' | 'production';
    credentials: {
      appId?: string;
      clientId?: string;
      clientSecret?: string;
      accessToken?: string;
      apiKey?: string;
      secretKey?: string;
    };
  }[]): Promise<string[]> {
    // Verificar permisos
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden configurar APIs');
    }

    const credentialIds: string[] = [];

    for (const apiConfig of apiConfigs) {
      // Agregar credenciales usando el sistema seguro
      const credentialId = await this.credentialManager.addCredentials({
        marketplace: apiConfig.marketplace,
        environment: apiConfig.environment,
        credentials: apiConfig.credentials
      });

      // Asociar credenciales al usuario en la base de datos
      await prisma.apiCredential.upsert({
        where: {
          userId_apiName_environment_scope: {
            userId,
            apiName: apiConfig.marketplace,
            environment: apiConfig.environment || 'production',
            scope: 'user',
          },
        },
        update: {
          credentials: credentialId, // ID de las credenciales encriptadas
          isActive: true,
          updatedAt: new Date(),
          sharedById: adminId,
        },
        create: {
          userId,
          apiName: apiConfig.marketplace,
          environment: apiConfig.environment || 'production',
          credentials: credentialId,
          isActive: true,
          scope: 'user',
          sharedById: adminId,
        },
      });

      credentialIds.push(credentialId);
    }

    // Registrar configuración
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'api_configured',
        description: `Admin configuró APIs para usuario ID: ${userId}`,
        metadata: JSON.stringify({
          targetUserId: userId,
          configuredAPIs: apiConfigs.map(api => `${api.marketplace}-${api.environment}`)
        })
      }
    });

    return credentialIds;
  }

  /**
   * 📊 OBTENER PANEL DE CONTROL DE USUARIOS
   */
  async getUsersDashboard(adminId: number): Promise<{
    users: any[];
    totalUsers: number;
    activeUsers: number;
    totalRevenue: number;
    monthlyCommissions: number;
  }> {
    // Verificar permisos
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden ver el dashboard');
    }

    // Obtener todos los usuarios con estadísticas
    const users = await prisma.user.findMany({
      where: {
        role: 'USER'
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        commissionRate: true,
        fixedMonthlyCost: true,
        balance: true,
        totalEarnings: true,
        totalSales: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            sales: true,
            products: true,
            commissions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calcular estadísticas
    const totalUsers = users.length;
    const activeUsers = users.filter(user => user.isActive).length;
    const totalRevenue = users.reduce((sum, user) => sum + toNumber(user.totalEarnings), 0);
    
    // Calcular comisiones mensuales pendientes
    const monthlyCommissions = users.reduce((sum, user) => {
      return sum + toNumber(user.fixedMonthlyCost) + (toNumber(user.totalEarnings) * toNumber(user.commissionRate));
    }, 0);

    return {
      users,
      totalUsers,
      activeUsers,
      totalRevenue,
      monthlyCommissions
    };
  }

  /**
   * 💰 PROCESAR COBROS MENSUALES
   */
  async processMonthlyCharges(adminId: number): Promise<{
    processed: number;
    totalCharged: number;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Solo administradores pueden procesar cobros');
    }

    const users = await prisma.user.findMany({
      where: {
        role: 'USER',
        isActive: true
      }
    });

    let processed = 0;
    let totalCharged = 0;
    const errors: Array<{ userId: number; error: string }> = [];

    for (const user of users) {
      try {
        // Calcular cobro total (fijo + comisiones de ventas del mes)
        const thisMonthSales = await prisma.sale.findMany({
          where: {
            userId: user.id,
            status: 'DELIVERED',
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        });

        const salesCommission = thisMonthSales.reduce((sum, sale) => {
          return sum + (toNumber(sale.grossProfit) * toNumber(user.commissionRate));
        }, 0);

        const totalCharge = toNumber(user.fixedMonthlyCost) + salesCommission;

        // Actualizar balance del usuario
        await prisma.user.update({
          where: { id: user.id },
          data: {
            balance: toNumber(user.balance) - totalCharge
          }
        });

        // Crear registro de comisión
        for (const sale of thisMonthSales) {
          await prisma.commission.create({
            data: {
              userId: user.id,
              saleId: sale.id,
              amount: toNumber(sale.grossProfit) * toNumber(user.commissionRate),
              status: 'PAID',
              paidAt: new Date()
            }
          });
        }

        processed++;
        totalCharged += totalCharge;

      } catch (error) {
        errors.push({
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Registrar procesamiento
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'monthly_charges_processed',
        description: `Procesados cobros mensuales: ${processed} usuarios, $${totalCharged.toFixed(2)}`,
        metadata: JSON.stringify({
          processed,
          totalCharged,
          errors: errors.length
        })
      }
    });

    return {
      processed,
      totalCharged,
      errors
    };
  }

  /**
   * 📧 ENVIAR CREDENCIALES DE ACCESO AL USUARIO
   */
  async sendUserCredentials(userId: number, credentials: {
    username: string;
    temporaryPassword: string;
    accessUrl: string;
  }): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, username: true }
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // ✅ Enviar email de bienvenida con credenciales
    try {
      const emailService = (await import('./email.service')).default;
      const sent = await emailService.sendWelcomeEmail(user.email, credentials);
      
      if (sent) {
        const { logger } = await import('../config/logger');
        logger.info('Welcome email sent successfully', { userId, email: user.email });
      } else {
        const { logger } = await import('../config/logger');
        logger.warn('Failed to send welcome email', { userId, email: user.email });
      }
      
      return sent;
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error sending welcome email', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        email: user.email
      });
      // No fallar la creación de usuario si el email falla
      return false;
    }
  }
}

export default AdminService;
