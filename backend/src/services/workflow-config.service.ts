import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export interface WorkflowStageConfig {
  stage: 'scrape' | 'analyze' | 'publish' | 'purchase' | 'fulfillment' | 'customerService';
  mode: 'manual' | 'automatic' | 'guided';
}

export interface UpdateWorkflowConfigDto {
  environment?: 'sandbox' | 'production';
  workflowMode?: 'manual' | 'automatic' | 'hybrid';
  stageScrape?: 'manual' | 'automatic' | 'guided';
  stageAnalyze?: 'manual' | 'automatic' | 'guided';
  stagePublish?: 'manual' | 'automatic' | 'guided';
  stagePurchase?: 'manual' | 'automatic' | 'guided';
  stageFulfillment?: 'manual' | 'automatic' | 'guided';
  stageCustomerService?: 'manual' | 'automatic' | 'guided';
  autoApproveThreshold?: number;
  autoPublishThreshold?: number;
  maxAutoInvestment?: number;
  workingCapital?: number; // ✅ Capital de trabajo disponible en PayPal (USD)
}

export class WorkflowConfigService {
  /**
   * Obtener configuración de workflow del usuario
   */
  async getUserConfig(userId: number) {
    let config = await prisma.userWorkflowConfig.findUnique({
      where: { userId }
    });

    // Si no existe, crear configuración por defecto
    if (!config) {
      config = await prisma.userWorkflowConfig.create({
        data: {
          userId,
          environment: 'sandbox',
          workflowMode: 'manual',
          stageScrape: 'automatic',
          stageAnalyze: 'automatic',
          stagePublish: 'manual',
          stagePurchase: 'manual',
          stageFulfillment: 'manual',
          stageCustomerService: 'manual',
          workingCapital: 500 // ✅ Capital de trabajo por defecto: 500 USD
        }
      });
    }

    return config;
  }

  /**
   * Actualizar configuración de workflow del usuario
   */
  async updateUserConfig(userId: number, data: UpdateWorkflowConfigDto) {
    const existing = await prisma.userWorkflowConfig.findUnique({
      where: { userId }
    });

    if (existing) {
      return await prisma.userWorkflowConfig.update({
        where: { userId },
        data
      });
    } else {
      return await prisma.userWorkflowConfig.create({
        data: {
          userId,
          ...data
        }
      });
    }
  }

  /**
   * Obtener modo de una etapa específica
   */
  async getStageMode(userId: number, stage: WorkflowStageConfig['stage']): Promise<'manual' | 'automatic' | 'guided'> {
    const config = await this.getUserConfig(userId);
    
    switch (stage) {
      case 'scrape':
        return config.stageScrape as 'manual' | 'automatic' | 'guided';
      case 'analyze':
        return config.stageAnalyze as 'manual' | 'automatic' | 'guided';
      case 'publish':
        return config.stagePublish as 'manual' | 'automatic' | 'guided';
      case 'purchase':
        return config.stagePurchase as 'manual' | 'automatic' | 'guided';
      case 'fulfillment':
        return config.stageFulfillment as 'manual' | 'automatic' | 'guided';
      case 'customerService':
        return config.stageCustomerService as 'manual' | 'automatic' | 'guided';
      default:
        return 'manual';
    }
  }

  /**
   * Verificar si una etapa está en modo automático
   */
  async isStageAutomatic(userId: number, stage: WorkflowStageConfig['stage']): Promise<boolean> {
    const mode = await this.getStageMode(userId, stage);
    return mode === 'automatic';
  }

  /**
   * Obtener ambiente del usuario (sandbox/production)
   */
  async getUserEnvironment(userId: number): Promise<'sandbox' | 'production'> {
    const config = await this.getUserConfig(userId);
    return config.environment as 'sandbox' | 'production';
  }

  /**
   * Obtener modo de workflow general
   */
  async getWorkflowMode(userId: number): Promise<'manual' | 'automatic' | 'hybrid'> {
    const config = await this.getUserConfig(userId);
    return config.workflowMode as 'manual' | 'automatic' | 'hybrid';
  }

  /**
   * ✅ Obtener capital de trabajo del usuario (default 500 USD)
   */
  async getWorkingCapital(userId: number): Promise<number> {
    const config = await this.getUserConfig(userId);
    return config.workingCapital || 500; // Default 500 USD
  }

  /**
   * ✅ Actualizar capital de trabajo del usuario
   */
  async updateWorkingCapital(userId: number, workingCapital: number): Promise<void> {
    if (workingCapital < 0) {
      throw new AppError('El capital de trabajo no puede ser negativo', 400);
    }
    
    await this.updateUserConfig(userId, { workingCapital });
  }
}

export const workflowConfigService = new WorkflowConfigService();

