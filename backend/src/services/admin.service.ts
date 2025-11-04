import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';
import { SecureCredentialManager } from './security.service';

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

    // Crear usuario con configuración de comisiones
    const newUser = await prisma.user.create({
      data: {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        fullName: userData.fullName,
        role: userData.role,
        commissionRate: userData.commissionRate,
        fixedMonthlyCost: userData.fixedMonthlyCost,
        isActive: userData.isActive ?? true
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
          userId_apiName: {
            userId: userId,
            apiName: apiConfig.marketplace
          }
        },
        update: {
          credentials: credentialId, // ID de las credenciales encriptadas
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          userId: userId,
          apiName: apiConfig.marketplace,
          credentials: credentialId,
          isActive: true
        }
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
    const totalRevenue = users.reduce((sum, user) => sum + user.totalEarnings, 0);
    
    // Calcular comisiones mensuales pendientes
    const monthlyCommissions = users.reduce((sum, user) => {
      return sum + user.fixedMonthlyCost + (user.totalEarnings * user.commissionRate);
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
          return sum + (sale.grossProfit * user.commissionRate);
        }, 0);

        const totalCharge = user.fixedMonthlyCost + salesCommission;

        // Actualizar balance del usuario
        await prisma.user.update({
          where: { id: user.id },
          data: {
            balance: user.balance - totalCharge
          }
        });

        // Crear registro de comisión
        for (const sale of thisMonthSales) {
          await prisma.commission.create({
            data: {
              userId: user.id,
              saleId: sale.id,
              amount: sale.grossProfit * user.commissionRate,
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

    // Aquí integrarías con tu servicio de email
    // Por ahora retornamos la información que se debe enviar
    const emailContent = {
      to: user.email,
      subject: 'Acceso a Ivan Reseller - Credenciales de ingreso',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">¡Bienvenido a Ivan Reseller!</h2>
          
          <p>Hola ${user.fullName || user.username},</p>
          
          <p>Tu cuenta ha sido creada exitosamente. Aquí tienes tus credenciales de acceso:</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>URL de acceso:</strong> <a href="${credentials.accessUrl}">${credentials.accessUrl}</a></p>
            <p><strong>Usuario:</strong> ${credentials.username}</p>
            <p><strong>Contraseña temporal:</strong> ${credentials.temporaryPassword}</p>
          </div>
          
          <p><strong>⚠️ IMPORTANTE:</strong> Por seguridad, cambia tu contraseña en el primer inicio de sesión.</p>
          
          <h3>¿Cómo usar el sistema?</h3>
          <ol>
            <li>Accede al link proporcionado</li>
            <li>Inicia sesión con tus credenciales</li>
            <li>Cambia tu contraseña temporal</li>
            <li>Explora el dashboard y sus funcionalidades</li>
            <li>Configura tus APIs de marketplace (opcional)</li>
          </ol>
          
          <p>Si tienes preguntas, contacta al administrador.</p>
          
          <p>¡Éxito en tus ventas!</p>
          <p><strong>Ivan Reseller Team</strong></p>
        </div>
      `
    };

    console.log('📧 Email a enviar:', emailContent);
    
    // TODO: Implementar envío real de email aquí
    // await emailService.send(emailContent);

    return true;
  }
}

export default AdminService;
