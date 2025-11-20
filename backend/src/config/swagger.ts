import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ivan Reseller API',
      version: '1.0.0',
      description: 'API completa para el sistema de dropshipping multi-tenant',
      contact: {
        name: 'Ivan Reseller Support',
        email: 'support@ivanreseller.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3001',
        description: 'Servidor de desarrollo',
      },
      {
        url: 'https://api.ivanreseller.com',
        description: 'Servidor de producción',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'Error message',
            },
            errorCode: {
              type: 'string',
              example: 'VALIDATION_ERROR',
            },
            errorId: {
              type: 'string',
              example: 'ERR-1234567890-ABC123',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
            },
            message: {
              type: 'string',
              example: 'Operation successful',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'johndoe' },
            email: { type: 'string', example: 'john@example.com' },
            fullName: { type: 'string', nullable: true, example: 'John Doe' },
            role: { type: 'string', enum: ['ADMIN', 'USER'], example: 'USER' },
            commissionRate: { type: 'number', example: 0.20 },
            fixedMonthlyCost: { type: 'number', example: 0 },
            balance: { type: 'number', example: 150.50 },
            totalEarnings: { type: 'number', example: 500.00 },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiCredential: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            apiName: { type: 'string', example: 'ebay', enum: ['ebay', 'amazon', 'mercadolibre', 'groq', 'openai', 'scraperapi', 'zenrows', '2captcha', 'paypal', 'aliexpress', 'email', 'twilio', 'slack', 'stripe'] },
            environment: { type: 'string', enum: ['sandbox', 'production'], example: 'production' },
            isActive: { type: 'boolean', example: true },
            scope: { type: 'string', enum: ['user', 'global'], example: 'user' },
            credentials: { type: 'object', description: 'Credenciales encriptadas/redactadas' },
            issues: { type: 'array', items: { type: 'string' }, description: 'Problemas detectados' },
            warnings: { type: 'array', items: { type: 'string' }, description: 'Advertencias' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            userId: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Wireless Earbuds' },
            description: { type: 'string', nullable: true },
            aliexpressUrl: { type: 'string', format: 'uri', example: 'https://aliexpress.com/item/123' },
            aliexpressPrice: { type: 'number', example: 15.99 },
            suggestedPrice: { type: 'number', example: 29.99 },
            finalPrice: { type: 'number', nullable: true },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'INACTIVE'], example: 'PENDING' },
            isPublished: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Sale: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            userId: { type: 'integer', example: 1 },
            productId: { type: 'integer', example: 1 },
            orderId: { type: 'string', example: 'ORD-123456' },
            marketplace: { type: 'string', example: 'ebay' },
            salePrice: { type: 'number', example: 29.99 },
            aliexpressCost: { type: 'number', example: 15.99 },
            grossProfit: { type: 'number', example: 13.00 },
            commissionAmount: { type: 'number', example: 2.60 },
            netProfit: { type: 'number', example: 10.40 },
            status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'CANCELLED'], example: 'PENDING' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Opportunity: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            userId: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Wireless Earbuds' },
            sourceMarketplace: { type: 'string', example: 'aliexpress' },
            costUsd: { type: 'number', example: 10.00 },
            suggestedPriceUsd: { type: 'number', example: 25.00 },
            profitMargin: { type: 'number', example: 0.60 },
            roiPercentage: { type: 'number', example: 150 },
            competitionLevel: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'], example: 'low' },
            confidenceScore: { type: 'number', example: 0.85 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'No autenticado o token inválido',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'No tienes permiso para esta acción',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Recurso no encontrado',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ValidationError: {
          description: 'Error de validación',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Endpoints de autenticación y autorización' },
      { name: 'Users', description: 'Gestión de usuarios (Admin only)' },
      { name: 'API Credentials', description: 'Gestión de credenciales de API (eBay, Amazon, MercadoLibre, etc.)' },
      { name: 'Products', description: 'Gestión de productos (crear, listar, actualizar, eliminar)' },
      { name: 'Sales', description: 'Gestión de ventas y órdenes' },
      { name: 'Opportunities', description: 'Búsqueda y gestión de oportunidades de negocio con IA' },
      { name: 'Marketplace', description: 'Integraciones con marketplaces (publicar, actualizar, sincronizar)' },
      { name: 'Jobs', description: 'Gestión de trabajos en background (scraping, publishing, payouts)' },
      { name: 'Reports', description: 'Reportes y estadísticas (ventas, productos, usuarios, marketplaces)' },
      { name: 'Dashboard', description: 'Datos del dashboard y métricas' },
      { name: 'Autopilot', description: 'Control del sistema Autopilot (búsqueda y publicación automática)' },
      { name: 'Automation', description: 'Configuración de automatizaciones y workflows' },
      { name: 'AI Suggestions', description: 'Sugerencias inteligentes generadas por IA' },
      { name: 'Notifications', description: 'Sistema de notificaciones en tiempo real' },
      { name: 'System', description: 'Estado del sistema y health checks' },
      { name: 'Admin', description: 'Funciones administrativas (solo Admin)' },
    ],
  },
  apis: [
    './src/api/routes/*.ts',
    './src/server.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Ivan Reseller API Documentation',
  }));

  // Endpoint JSON para el spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

