import express from 'express';
import { automationController } from '../controllers/automation.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// === CONFIGURACIÓN DEL SISTEMA ===
router.get('/config', automationController.getSystemConfig.bind(automationController));
router.put('/config', automationController.updateSystemConfig.bind(automationController));
// Autopilot control
router.post('/autopilot/start', automationController.startAutopilot.bind(automationController));
router.post('/autopilot/stop', automationController.stopAutopilot.bind(automationController));
router.get('/autopilot/status', automationController.getAutopilotStatus.bind(automationController));

// Stages (manual/automatic per step)
router.get('/stages', automationController.getStages.bind(automationController));
router.put('/stages', automationController.updateStages.bind(automationController));

// Continue a paused stage
router.post('/continue/:stage', automationController.continueStage.bind(automationController));

// === OPORTUNIDADES DE NEGOCIO IA ===
router.post('/opportunities/search', automationController.findOpportunities.bind(automationController));
router.get('/opportunities/trending', automationController.getTrendingOpportunities.bind(automationController));

// === TRANSACCIONES Y VENTAS ===
router.post('/sales/process', automationController.processSale.bind(automationController));
router.get('/transactions', automationController.getActiveTransactions.bind(automationController));

// === REGLAS DE AUTOMATIZACIÓN ===
router.get('/rules', automationController.getAutomationRules.bind(automationController));
router.put('/rules/:ruleId', automationController.updateAutomationRule.bind(automationController));

// === CREDENCIALES Y SEGURIDAD ===
router.post('/credentials', automationController.addMarketplaceCredentials.bind(automationController));
router.get('/credentials', automationController.listCredentials.bind(automationController));

// === NOTIFICACIONES ===
router.get('/notifications', automationController.getNotifications.bind(automationController));
router.patch('/notifications/:notificationId/read', automationController.markNotificationRead.bind(automationController));

// === MÉTRICAS Y MONITOREO ===
router.get('/metrics', automationController.getSystemMetrics.bind(automationController));

// === SANDBOX Y PRUEBAS ===
router.post('/sandbox/test', automationController.testSandbox.bind(automationController));

// === VALIDACIÓN DE PRODUCCIÓN ===
router.get('/production/validate', automationController.validateProduction.bind(automationController));

export { router as automationRoutes };
