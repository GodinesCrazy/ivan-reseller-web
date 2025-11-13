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
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            fullName: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['ADMIN', 'USER'] },
            commissionRate: { type: 'number' },
            fixedMonthlyCost: { type: 'number' },
            balance: { type: 'number' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiCredential: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            apiName: { type: 'string', example: 'ebay' },
            environment: { type: 'string', enum: ['sandbox', 'production'] },
            isActive: { type: 'boolean' },
            scope: { type: 'string', enum: ['user', 'global'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Endpoints de autenticación' },
      { name: 'Users', description: 'Gestión de usuarios' },
      { name: 'API Credentials', description: 'Gestión de credenciales de API' },
      { name: 'Products', description: 'Gestión de productos' },
      { name: 'Sales', description: 'Gestión de ventas' },
      { name: 'Opportunities', description: 'Búsqueda de oportunidades' },
      { name: 'Marketplace', description: 'Integraciones con marketplaces' },
      { name: 'Jobs', description: 'Gestión de trabajos en background' },
      { name: 'Reports', description: 'Reportes y estadísticas' },
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

