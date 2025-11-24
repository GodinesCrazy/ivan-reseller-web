import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';
import { workflowService } from './workflow.service';
import { workflowConfigService } from './workflow-config.service';
import { autopilotSystem } from './autopilot.service';
import opportunityFinder from './opportunity-finder.service';
import MarketplaceService from './marketplace.service';
import { productService } from './product.service';

const prisma = new PrismaClient();

export interface WorkflowExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  errors?: string[];
  executionTime?: number;
}

/**
 * ✅ FASE 4: Ejecutor de Workflows Personalizados
 * 
 * Este servicio ejecuta workflows personalizados según su tipo,
 * integrando con los servicios existentes sin modificar el autopilot básico.
 */
export class WorkflowExecutorService {
  /**
   * ✅ Ejecutar workflow por ID
   */
  async executeWorkflow(workflowId: number, userId: number): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Obtener workflow
      const workflow = await workflowService.getWorkflowById(workflowId, userId);

      // Verificar que esté habilitado
      if (!workflow.enabled) {
        throw new AppError('El workflow está deshabilitado. Actívalo antes de ejecutarlo', 400);
      }

      // Obtener configuración del usuario
      const userConfig = await workflowConfigService.getUserConfig(userId);
      const environment = userConfig.environment as 'sandbox' | 'production';

      logger.info('Ejecutando workflow', {
        workflowId,
        userId,
        type: workflow.type,
        name: workflow.name
      });

      // Validar condiciones si existen
      if (workflow.conditions && Object.keys(workflow.conditions as any).length > 0) {
        const conditionsValid = await this.validateConditions(workflow.conditions as any, userId, environment);
        if (!conditionsValid) {
          return {
            success: false,
            message: 'Las condiciones del workflow no se cumplen',
            errors: ['Condiciones no validadas'],
            executionTime: Date.now() - startTime
          };
        }
      }

      // Ejecutar según tipo
      let result: WorkflowExecutionResult;
      
      switch (workflow.type) {
        case 'search':
          result = await this.executeSearchWorkflow(workflow, userId, environment);
          break;
        case 'analyze':
          result = await this.executeAnalyzeWorkflow(workflow, userId, environment);
          break;
        case 'publish':
          result = await this.executePublishWorkflow(workflow, userId, environment);
          break;
        case 'reprice':
          result = await this.executeRepriceWorkflow(workflow, userId, environment);
          break;
        case 'custom':
          result = await this.executeCustomWorkflow(workflow, userId, environment);
          break;
        default:
          throw new AppError(`Tipo de workflow no soportado: ${workflow.type}`, 400);
      }

      // Actualizar estadísticas y logs del workflow
      const existingLogs = (workflow.logs as any[]) || [];
      const newLog = {
        timestamp: new Date().toISOString(),
        success: result.success,
        message: result.message,
        executionTime: result.executionTime,
        errors: result.errors || [],
        data: result.data ? JSON.stringify(result.data).substring(0, 500) : null // Limitar tamaño
      };

      // Mantener solo los últimos 50 logs
      const updatedLogs = [newLog, ...existingLogs].slice(0, 50);

      await prisma.autopilotWorkflow.update({
        where: { id: workflowId },
        data: {
          lastRun: new Date(),
          runCount: workflow.runCount + 1,
          logs: updatedLogs
        }
      });

      result.executionTime = Date.now() - startTime;

      logger.info('Workflow ejecutado', {
        workflowId,
        userId,
        type: workflow.type,
        success: result.success,
        executionTime: result.executionTime
      });

      return result;

    } catch (error: any) {
      logger.error('Error ejecutando workflow', {
        workflowId,
        userId,
        error: error.message || String(error)
      });

      return {
        success: false,
        message: error.message || 'Error ejecutando workflow',
        errors: [error.message || String(error)],
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * ✅ Q3: Validar condiciones del workflow y evitar conflictos con autopilot
   */
  private async validateConditions(
    conditions: Record<string, any>,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<boolean> {
    // ✅ Q3: Validación de capital disponible (compartido con autopilot)
    if (conditions.minCapital) {
      const workingCapital = await workflowConfigService.getWorkingCapital(userId);
      
      // Calcular capital disponible (similar a getAvailableCapital en autopilot)
      const pendingOrders = await prisma.sale.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'PROCESSING'] }
        }
      });
      const pendingCost = pendingOrders.reduce((sum, order) => 
        sum + (order.aliexpressCost || 0), 0
      );
      
      const approvedProducts = await prisma.product.findMany({
        where: {
          userId,
          status: 'APPROVED',
          isPublished: false
        }
      });
      const approvedCost = approvedProducts.reduce((sum, product) => 
        sum + (product.aliexpressPrice || 0), 0
      );
      
      const availableCapital = Math.max(0, workingCapital - pendingCost - approvedCost);
      
      if (availableCapital < conditions.minCapital) {
        logger.info('WorkflowExecutor: Condición de capital no cumplida', {
          userId,
          required: conditions.minCapital,
          available: availableCapital,
          total: workingCapital
        });
        return false;
      }
    }

    // ✅ Q3: Validación de productos pendientes (límite compartido)
    if (conditions.maxPendingProducts) {
      const pendingCount = await prisma.product.count({
        where: {
          userId,
          status: 'PENDING'
        }
      });
      if (pendingCount >= conditions.maxPendingProducts) {
        logger.info('WorkflowExecutor: Límite de productos pendientes alcanzado', {
          userId,
          pending: pendingCount,
          max: conditions.maxPendingProducts
        });
        return false;
      }
    }

    // ✅ Q3: Validar environment (debe coincidir con el configurado para el usuario)
    if (conditions.requiredEnvironment) {
      const userConfig = await workflowConfigService.getUserConfig(userId);
      const userEnvironment = userConfig.environment as 'sandbox' | 'production';
      if (userEnvironment !== conditions.requiredEnvironment) {
        logger.info('WorkflowExecutor: Environment no coincide', {
          userId,
          required: conditions.requiredEnvironment,
          actual: userEnvironment
        });
        return false;
      }
    }

    return true;
  }

  /**
   * ✅ Q3: Ejecutar workflow de tipo 'search' - Sin consumir capital, solo búsqueda
   */
  private async executeSearchWorkflow(
    workflow: any,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<WorkflowExecutionResult> {
    try {
      const actions = workflow.actions as any || {};
      const query = actions.query || actions.searchQuery || '';

      if (!query) {
        return {
          success: false,
          message: 'El workflow de búsqueda requiere un query en las acciones',
          errors: ['Query no especificado']
        };
      }

      // ✅ Q3: Validar que el environment coincida con el del usuario
      const userConfig = await workflowConfigService.getUserConfig(userId);
      const userEnvironment = userConfig.environment as 'sandbox' | 'production';
      if (environment !== userEnvironment) {
        logger.warn('WorkflowExecutor: Environment mismatch en search workflow', {
          userId,
          workflowEnvironment: environment,
          userEnvironment
        });
        // Usar el environment del usuario para consistencia
        environment = userEnvironment;
      }

      // Usar opportunity-finder service (no consume capital, solo busca)
      const maxItems = actions.maxItems || 10;
      const marketplaces = actions.marketplaces || ['ebay'];

      const opportunities = await opportunityFinder.findOpportunities(userId, {
        query,
        maxItems,
        marketplaces,
        environment
      });

      logger.info('WorkflowExecutor: Search workflow completado', {
        workflowId: workflow.id,
        userId,
        opportunitiesFound: opportunities.length,
        query
      });

      return {
        success: true,
        message: `Búsqueda completada. ${opportunities.length} oportunidades encontradas`,
        data: {
          opportunitiesFound: opportunities.length,
          opportunities
        }
      };
    } catch (error: any) {
      logger.error('WorkflowExecutor: Error en search workflow', {
        workflowId: workflow.id,
        userId,
        error: error.message
      });
      return {
        success: false,
        message: `Error en búsqueda: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  /**
   * ✅ Ejecutar workflow de tipo 'analyze'
   */
  private async executeAnalyzeWorkflow(
    workflow: any,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<WorkflowExecutionResult> {
    try {
      const actions = workflow.actions as any || {};
      
      // Obtener productos pendientes de análisis
      const statusFilter = actions.statusFilter || 'PENDING';
      const limit = actions.limit || 10;

      const products = await prisma.product.findMany({
        where: {
          userId,
          status: statusFilter
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      // Por ahora, solo retornar productos pendientes
      // En el futuro se puede agregar análisis más profundo
      return {
        success: true,
        message: `Análisis completado. ${products.length} productos encontrados`,
        data: {
          productsAnalyzed: products.length,
          products
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error en análisis: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  /**
   * ✅ Ejecutar workflow de tipo 'publish'
   */
  private async executePublishWorkflow(
    workflow: any,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<WorkflowExecutionResult> {
    try {
      const actions = workflow.actions as any || {};
      const marketplaceService = new MarketplaceService();

      // ✅ Q3: Validar environment del usuario antes de publicar
      const userConfig = await workflowConfigService.getUserConfig(userId);
      const userEnvironment = userConfig.environment as 'sandbox' | 'production';
      if (environment !== userEnvironment) {
        logger.warn('WorkflowExecutor: Environment mismatch en publish workflow', {
          userId,
          workflowEnvironment: environment,
          userEnvironment
        });
        environment = userEnvironment; // Usar el environment del usuario
      }

      // Obtener productos aprobados pendientes de publicación
      const limit = actions.limit || 5;
      const marketplaces = actions.marketplaces || ['ebay'];

      // ✅ Q3: Usar take() con límite para evitar conflictos con autopilot
      // Ambos sistemas pueden publicar productos, pero cada uno respeta los límites
      const products = await prisma.product.findMany({
        where: {
          userId,
          status: 'APPROVED',
          isPublished: false
        },
        take: Math.min(limit, 10), // Máximo 10 productos por ejecución de workflow
        orderBy: { createdAt: 'desc' }
      });

      if (products.length === 0) {
        return {
          success: true,
          message: 'No hay productos pendientes de publicación',
          data: {
            productsPublished: 0,
            totalProducts: 0,
            results: []
          }
        };
      }

      // ✅ P4: Validar credenciales para todos los marketplaces antes de intentar publicar
      const missingCredentials: string[] = [];
      const invalidCredentials: string[] = [];
      
      for (const marketplace of marketplaces) {
        try {
          const credentials = await marketplaceService.getCredentials(
            userId,
            marketplace as 'ebay' | 'amazon' | 'mercadolibre',
            environment
          );
          
          if (!credentials || !credentials.isActive) {
            missingCredentials.push(marketplace);
            continue;
          }
          
          // Verificar issues con las credenciales
          if (credentials.issues && credentials.issues.length > 0) {
            invalidCredentials.push(marketplace);
          }
        } catch (error: any) {
          logger.warn(`[WorkflowExecutor] Error validating credentials for ${marketplace}`, {
            userId,
            marketplace,
            environment,
            error: error.message
          });
          missingCredentials.push(marketplace);
        }
      }
      
      // Si faltan credenciales o hay problemas, retornar error descriptivo
      if (missingCredentials.length > 0 || invalidCredentials.length > 0) {
        const errors: string[] = [];
        if (missingCredentials.length > 0) {
          errors.push(`Missing credentials for: ${missingCredentials.join(', ')}`);
        }
        if (invalidCredentials.length > 0) {
          errors.push(`Invalid credentials for: ${invalidCredentials.join(', ')}`);
        }
        
        return {
          success: false,
          message: `Cannot publish products: ${errors.join('. ')}. Please configure your credentials in Settings → API Settings.`,
          errors: errors
        };
      }

      const results: Array<{ productId: number; success: boolean; error?: string }> = [];

      for (const product of products) {
        try {
          // ✅ P4: Credenciales ya validadas arriba, proceder con publicación
          const publishResult = await marketplaceService.publishToMultipleMarketplaces(
            userId,
            product.id,
            marketplaces,
            environment
          );

          const successCount = publishResult.filter(r => r.success).length;
          results.push({
            productId: product.id,
            success: successCount > 0,
            error: successCount === 0 ? 'Todos los marketplaces fallaron' : undefined
          });
        } catch (error: any) {
          results.push({
            productId: product.id,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return {
        success: successCount > 0,
        message: `Publicación completada. ${successCount}/${products.length} productos publicados exitosamente`,
        data: {
          productsPublished: successCount,
          totalProducts: products.length,
          results
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error en publicación: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  /**
   * ✅ Ejecutar workflow de tipo 'reprice'
   */
  private async executeRepriceWorkflow(
    workflow: any,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<WorkflowExecutionResult> {
    try {
      const actions = workflow.actions as any || {};
      const marketplaceService = new MarketplaceService();

      // Obtener productos publicados
      const limit = actions.limit || 10;
      const priceAdjustment = actions.priceAdjustment || 0; // Porcentaje de ajuste

      const products = await prisma.product.findMany({
        where: {
          userId,
          status: 'PUBLISHED',
          isPublished: true
        },
        take: limit,
        orderBy: { updatedAt: 'desc' }
      });

      const results: Array<{ productId: number; success: boolean; error?: string }> = [];

      for (const product of products) {
        try {
          // Calcular nuevo precio
          const currentPrice = product.suggestedPrice;
          const newPrice = currentPrice * (1 + priceAdjustment / 100);

          // Sincronizar precio (esto actualiza en BD, la sincronización real con APIs se implementará después)
          await marketplaceService.syncProductPrice(userId, product.id, newPrice, environment);

          results.push({
            productId: product.id,
            success: true
          });
        } catch (error: any) {
          results.push({
            productId: product.id,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return {
        success: successCount > 0,
        message: `Actualización de precios completada. ${successCount}/${products.length} productos actualizados`,
        data: {
          productsRepriced: successCount,
          totalProducts: products.length,
          results
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error en actualización de precios: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  /**
   * ✅ Ejecutar workflow de tipo 'custom'
   */
  private async executeCustomWorkflow(
    workflow: any,
    userId: number,
    environment: 'sandbox' | 'production'
  ): Promise<WorkflowExecutionResult> {
    try {
      const actions = workflow.actions as any || {};

      // Para workflows personalizados, ejecutar acciones según configuración
      // Por ahora, retornar éxito básico
      // En el futuro se puede extender con más acciones personalizadas

      return {
        success: true,
        message: 'Workflow personalizado ejecutado',
        data: {
          actions: Object.keys(actions),
          note: 'Las acciones personalizadas se implementarán según necesidades específicas'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Error en workflow personalizado: ${error.message}`,
        errors: [error.message]
      };
    }
  }
}

export const workflowExecutorService = new WorkflowExecutorService();

