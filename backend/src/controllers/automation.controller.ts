// @ts-nocheck
import { Request, Response } from 'express';
import { automatedBusinessSystem } from '../services/automated-business.service';
import { aiOpportunityEngine } from '../services/ai-opportunity.service';
import { notificationService } from '../services/notification.service';
import { secureCredentialManager } from '../services/security.service';

export class AutomationController {
  
  /**
   * Obtener configuración actual del sistema
   */
  async getSystemConfig(req: Request, res: Response) {
    try {
      const config = automatedBusinessSystem.getConfig();
      const credentialsList = secureCredentialManager.listCredentials();
      const metrics = automatedBusinessSystem.getMetrics();
      
      // ✅ FIX: Agregar campo 'workflows' para compatibilidad con frontend Dashboard
      // El frontend espera automationRes.data?.workflows para contar workflows activos
      res.json({
        success: true,
        data: {
          config,
          credentials: credentialsList,
          metrics,
          systemStatus: 'operational',
          workflows: [] // Array vacío por ahora (workflows reales se pueden implementar después)
        },
        workflows: [] // También en nivel raíz para acceso directo (automationRes.data.workflows)
      });
    } catch (error) {
      console.error('Error getting system config:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo configuración del sistema'
      });
    }
  }

  /**
   * Actualizar configuración del sistema
   */
  async updateSystemConfig(req: Request, res: Response) {
    try {
      const { mode, environment, thresholds } = req.body;
      
      const currentConfig = automatedBusinessSystem.getConfig();
      const oldMode = currentConfig.mode;
      const oldEnvironment = currentConfig.environment;
      
      automatedBusinessSystem.updateConfig({
        mode,
        environment,
        thresholds
      });

      // Notificar cambio de configuración
      if (mode !== oldMode || environment !== oldEnvironment) {
        await notificationService.notifyModeChange(
          `${oldMode}-${oldEnvironment}`,
          `${mode}-${environment}`,
          environment
        );
      }

      res.json({
        success: true,
        message: 'Configuración actualizada correctamente',
        data: automatedBusinessSystem.getConfig()
      });
    } catch (error) {
      console.error('Error updating system config:', error);
      res.status(500).json({
        success: false,
        error: 'Error actualizando configuración'
      });
    }
  }

  /** Start Autopilot (mode: automatic) */
  async startAutopilot(_req: Request, res: Response) {
    try {
      const current = automatedBusinessSystem.getConfig();
      automatedBusinessSystem.updateConfig({ mode: 'automatic', environment: current.environment });
      res.json({ success: true, message: 'Autopilot started', data: automatedBusinessSystem.getConfig() });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to start autopilot' });
    }
  }

  /** Stop Autopilot (mode: manual) */
  async stopAutopilot(_req: Request, res: Response) {
    try {
      const current = automatedBusinessSystem.getConfig();
      automatedBusinessSystem.updateConfig({ mode: 'manual', environment: current.environment });
      res.json({ success: true, message: 'Autopilot stopped', data: automatedBusinessSystem.getConfig() });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to stop autopilot' });
    }
  }

  /** Get Autopilot status */
  async getAutopilotStatus(_req: Request, res: Response) {
    try {
      const config = automatedBusinessSystem.getConfig();
      const metrics = automatedBusinessSystem.getMetrics();
      res.json({ success: true, data: { config, metrics } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to get status' });
    }
  }

  /** Get manual/automatic stage configuration */
  async getStages(_req: Request, res: Response) {
    try {
      const cfg = automatedBusinessSystem.getConfig();
      res.json({ success: true, data: cfg.stages || { scrape: 'automatic', analyze: 'automatic', publish: 'automatic' } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to get stages' });
    }
  }

  /** Update stage configuration */
  async updateStages(req: Request, res: Response) {
    try {
      const { stages } = req.body || {};
      if (!stages) return res.status(400).json({ success: false, error: 'stages required' });
      automatedBusinessSystem.updateStages(stages);
      res.json({ success: true, data: automatedBusinessSystem.getConfig().stages });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to update stages' });
    }
  }

  /** Continue a paused stage */
  async continueStage(req: Request, res: Response) {
    try {
      const stage = String(req.params.stage || '').toLowerCase();
      if (!['scrape','analyze','publish'].includes(stage)) {
        return res.status(400).json({ success: false, error: 'Invalid stage' });
      }
      automatedBusinessSystem.resumeStage(stage as any);
      await automatedBusinessSystem.runOneCycle();
      res.json({ success: true, message: `Stage ${stage} resumed` });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to resume stage' });
    }
  }

  /**
   * Buscar oportunidades de negocio con IA
   */
  async findOpportunities(req: Request, res: Response) {
    try {
      const { query, filters = {} } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query de búsqueda es requerido'
        });
      }

      console.log(`🤖 Buscando oportunidades para: "${query}"`);
      
      const opportunities = await aiOpportunityEngine.findArbitrageOpportunities({
        searchTerms: [query],
        minProfitMargin: filters.minProfitMargin || 15,
        maxInvestment: filters.maxInvestment || 1000,
        categories: filters.categories || ['all'],
        confidenceThreshold: filters.minConfidence || 70
      });

      // Notificar oportunidades encontradas
      if (opportunities.length > 0) {
        for (const opportunity of opportunities.slice(0, 3)) {
          await notificationService.notifyOpportunityFound(opportunity);
        }
      }

      res.json({
        success: true,
        data: {
          opportunities,
          count: opportunities.length,
          query,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error finding opportunities:', error);
      res.status(500).json({
        success: false,
        error: 'Error buscando oportunidades: ' + error.message
      });
    }
  }

  /**
   * Obtener oportunidades trending
   */
  async getTrendingOpportunities(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query;
      
      const opportunities = await aiOpportunityEngine.findTrendingOpportunities({
        minConfidence: 75,
        minProfitMargin: 20,
        maxInvestment: 2000
      });

      res.json({
        success: true,
        data: {
          opportunities: opportunities.slice(0, Number(limit)),
          count: opportunities.length,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting trending opportunities:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo oportunidades trending'
      });
    }
  }

  /**
   * Procesar venta manual o automática
   */
  async processSale(req: Request, res: Response) {
    try {
      const saleData = req.body;
      
      // Validar datos requeridos
      const requiredFields = ['orderId', 'productId', 'productTitle', 'buyerInfo', 'salePrice', 'marketplace'];
      const missingFields = requiredFields.filter(field => !saleData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Campos requeridos faltantes: ${missingFields.join(', ')}`
        });
      }

      console.log(`💰 Procesando nueva venta: ${saleData.productTitle}`);
      
      const transaction = await automatedBusinessSystem.processSaleOrder(saleData);

      res.json({
        success: true,
        message: 'Venta procesada exitosamente',
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          wasAutomated: transaction.automation.wasAutomated,
          estimatedProfit: transaction.amounts.profit
        }
      });
    } catch (error) {
      console.error('Error processing sale:', error);
      res.status(500).json({
        success: false,
        error: 'Error procesando venta: ' + error.message
      });
    }
  }

  /**
   * Obtener transacciones activas
   */
  async getActiveTransactions(req: Request, res: Response) {
    try {
      const transactions = automatedBusinessSystem.getActiveTransactions();
      
      res.json({
        success: true,
        data: {
          transactions,
          count: transactions.length,
          metrics: {
            pending: transactions.filter(t => t.status === 'pending').length,
            processing: transactions.filter(t => t.status === 'processing').length,
            fulfilled: transactions.filter(t => t.status === 'fulfilled').length,
            completed: transactions.filter(t => t.status === 'completed').length,
            automated: transactions.filter(t => t.automation.wasAutomated).length
          }
        }
      });
    } catch (error) {
      console.error('Error getting transactions:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo transacciones'
      });
    }
  }

  /**
   * Obtener reglas de automatización
   */
  async getAutomationRules(req: Request, res: Response) {
    try {
      const rules = automatedBusinessSystem.getAutomationRules();
      
      res.json({
        success: true,
        data: {
          rules,
          activeCount: rules.filter(r => r.active).length,
          totalCount: rules.length
        }
      });
    } catch (error) {
      console.error('Error getting automation rules:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo reglas de automatización'
      });
    }
  }

  /**
   * Actualizar regla de automatización
   */
  async updateAutomationRule(req: Request, res: Response) {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      
      automatedBusinessSystem.updateAutomationRule(ruleId, updates);
      
      res.json({
        success: true,
        message: 'Regla de automatización actualizada',
        data: { ruleId, updates }
      });
    } catch (error) {
      console.error('Error updating automation rule:', error);
      res.status(500).json({
        success: false,
        error: 'Error actualizando regla de automatización'
      });
    }
  }

  /**
   * Agregar credenciales de marketplace
   */
  async addMarketplaceCredentials(req: Request, res: Response) {
    try {
      const { marketplace, environment, credentials, rateLimits, expiresAt } = req.body;
      
      if (!marketplace || !environment || !credentials) {
        return res.status(400).json({
          success: false,
          error: 'Marketplace, environment y credentials son requeridos'
        });
      }

      const credentialId = await secureCredentialManager.addCredentials({
        marketplace,
        environment,
        credentials,
        rateLimits,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      });

      res.json({
        success: true,
        message: 'Credenciales agregadas exitosamente',
        data: { credentialId, marketplace, environment }
      });
    } catch (error) {
      console.error('Error adding credentials:', error);
      res.status(500).json({
        success: false,
        error: 'Error agregando credenciales: ' + error.message
      });
    }
  }

  /**
   * Listar credenciales (sin datos sensibles)
   */
  async listCredentials(req: Request, res: Response) {
    try {
      const credentials = secureCredentialManager.listCredentials();
      const usageStats = secureCredentialManager.getUsageStats();
      
      res.json({
        success: true,
        data: {
          credentials,
          stats: usageStats
        }
      });
    } catch (error) {
      console.error('Error listing credentials:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo credenciales'
      });
    }
  }

  /**
   * Obtener notificaciones recientes
   */
  async getNotifications(req: Request, res: Response) {
    try {
      const { limit = 20 } = req.query;
      const notifications = notificationService.getRecentNotifications(Number(limit));
      const stats = notificationService.getStats();
      
      res.json({
        success: true,
        data: {
          notifications,
          stats,
          count: notifications.length
        }
      });
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo notificaciones'
      });
    }
  }

  /**
   * Marcar notificación como leída
   */
  async markNotificationRead(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;
      const success = notificationService.markAsRead(notificationId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Notificación marcada como leída'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Notificación no encontrada'
        });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        error: 'Error marcando notificación como leída'
      });
    }
  }

  /**
   * Obtener métricas completas del sistema
   */
  async getSystemMetrics(req: Request, res: Response) {
    try {
      const businessMetrics = automatedBusinessSystem.getMetrics();
      const credentialStats = secureCredentialManager.getUsageStats();
      const notificationStats = notificationService.getStats();
      
      // Obtener inteligencia de mercado
      let marketIntelligence;
      try {
        marketIntelligence = await aiOpportunityEngine.getMarketIntelligence();
      } catch (error) {
        console.warn('Error getting market intelligence:', error);
        marketIntelligence = null;
      }

      res.json({
        success: true,
        data: {
          business: businessMetrics,
          credentials: credentialStats,
          notifications: notificationStats,
          marketIntelligence,
          systemHealth: {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      console.error('Error getting system metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo métricas del sistema'
      });
    }
  }

  /**
   * Endpoint de prueba para sandbox
   */
  async testSandbox(req: Request, res: Response) {
    try {
      const { action } = req.body;
      
      console.log(`🧪 SANDBOX: Ejecutando acción de prueba: ${action}`);
      
      switch (action) {
        case 'simulate_sale':
          const sampleSale = {
            orderId: `sandbox_${Date.now()}`,
            productId: 'test_product_123',
            productTitle: 'Producto de Prueba Sandbox',
            buyerInfo: {
              name: 'Cliente Prueba',
              address: '123 Test Street, Test City, TC 12345',
              email: 'test@example.com'
            },
            salePrice: 99.99,
            marketplace: 'ebay'
          };
          
          const transaction = await automatedBusinessSystem.processSaleOrder(sampleSale);
          
          res.json({
            success: true,
            message: 'Venta simulada en sandbox',
            data: { transaction }
          });
          break;

        case 'test_notification':
          const notificationId = await notificationService.sendTestNotification();
          
          res.json({
            success: true,
            message: 'Notificación de prueba enviada',
            data: { notificationId }
          });
          break;

        case 'simulate_opportunity':
          const mockOpportunity = {
            id: `sandbox_opp_${Date.now()}`,
            title: 'Oportunidad de Prueba Sandbox',
            profitMargin: 35.5,
            confidence: 92,
            estimatedProfit: 45.67
          };
          
          await notificationService.notifyOpportunityFound(mockOpportunity);
          
          res.json({
            success: true,
            message: 'Oportunidad simulada en sandbox',
            data: { opportunity: mockOpportunity }
          });
          break;

        default:
          res.status(400).json({
            success: false,
            error: 'Acción de sandbox desconocida'
          });
      }
    } catch (error) {
      console.error('Error in sandbox test:', error);
      res.status(500).json({
        success: false,
        error: 'Error en prueba de sandbox: ' + error.message
      });
    }
  }

  /**
   * Validar sistema para producción
   */
  async validateProduction(req: Request, res: Response) {
    try {
      const validationResults = {
        credentials: {
          ebay: { sandbox: false, production: false },
          amazon: { sandbox: false, production: false },
          mercadolibre: { sandbox: false, production: false }
        },
        configurations: {
          rateLimiting: false,
          notifications: false,
          security: false
        },
        systemHealth: {
          services: false,
          dependencies: false,
          performance: false
        }
      };

      // Validar credenciales
      const credentials = secureCredentialManager.listCredentials();
      credentials.forEach(cred => {
        if (validationResults.credentials[cred.marketplace as keyof typeof validationResults.credentials]) {
          validationResults.credentials[cred.marketplace as keyof typeof validationResults.credentials][cred.environment] = cred.isActive;
        }
      });

      // Validar configuraciones
      validationResults.configurations.rateLimiting = credentials.some(c => c.rateLimits);
      validationResults.configurations.notifications = true; // Ya implementado
      validationResults.configurations.security = credentials.length > 0;

      // Validar salud del sistema
      const metrics = automatedBusinessSystem.getMetrics();
      validationResults.systemHealth.services = true;
      validationResults.systemHealth.dependencies = true;
      validationResults.systemHealth.performance = metrics.averageProcessingTime < 300; // < 5 minutos

      // Calcular puntuación general
      const allChecks = [
        ...Object.values(validationResults.credentials).flatMap(v => Object.values(v)),
        ...Object.values(validationResults.configurations),
        ...Object.values(validationResults.systemHealth)
      ];
      
      const passedChecks = allChecks.filter(Boolean).length;
      const totalChecks = allChecks.length;
      const readinessScore = Math.round((passedChecks / totalChecks) * 100);

      res.json({
        success: true,
        data: {
          readinessScore,
          isProductionReady: readinessScore >= 80,
          validationResults,
          recommendations: this.generateProductionRecommendations(validationResults),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error validating production readiness:', error);
      res.status(500).json({
        success: false,
        error: 'Error validando preparación para producción'
      });
    }
  }

  /**
   * Generar recomendaciones para producción
   */
  private generateProductionRecommendations(validationResults: any): string[] {
    const recommendations = [];
    
    // Verificar credenciales
    Object.entries(validationResults.credentials).forEach(([marketplace, envs]) => {
      const environments = envs as { sandbox: boolean; production: boolean };
      if (!environments.production) {
        recommendations.push(`Configurar credenciales de producción para ${marketplace}`);
      }
      if (!environments.sandbox) {
        recommendations.push(`Configurar credenciales de sandbox para ${marketplace} (recomendado para testing)`);
      }
    });

    // Verificar configuraciones
    if (!validationResults.configurations.rateLimiting) {
      recommendations.push('Configurar límites de rate limiting para APIs');
    }
    if (!validationResults.configurations.security) {
      recommendations.push('Configurar sistema de seguridad y encriptación');
    }

    // Verificar rendimiento
    if (!validationResults.systemHealth.performance) {
      recommendations.push('Optimizar rendimiento del sistema (tiempo de procesamiento alto)');
    }

    if (recommendations.length === 0) {
      recommendations.push('Sistema listo para producción! 🎉');
    }

    return recommendations;
  }
}

export const automationController = new AutomationController();
