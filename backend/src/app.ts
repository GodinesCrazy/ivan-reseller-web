import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';

// Import routes
import authRoutes from './api/routes/auth.routes';
import userRoutes from './api/routes/users.routes';
import productRoutes from './api/routes/products.routes';
import saleRoutes from './api/routes/sales.routes';
import commissionRoutes from './api/routes/commissions.routes';
import dashboardRoutes from './api/routes/dashboard.routes';

// Additional routes
import opportunitiesRoutes from './api/routes/opportunities.routes';
import { automationRoutes } from './routes/automation.routes';
import settingsRoutes from './routes/settings.routes';
import marketplaceRoutes from './api/routes/marketplace.routes';
import marketplaceOauthRoutes from './api/routes/marketplace-oauth.routes';
import amazonRoutes from './api/routes/amazon.routes';
import jobsRoutes from './api/routes/jobs.routes';
import reportsRoutes from './api/routes/reports.routes';
import notificationsRoutes from './api/routes/notifications.routes';
import webhooksRoutes from './api/routes/webhooks.routes';
import systemRoutes from './api/routes/system.routes';
import logsRoutes from './api/routes/logs.routes';
import proxiesRoutes from './api/routes/proxies.routes';
import publisherRoutes from './api/routes/publisher.routes';
import currencyRoutes from './api/routes/currency.routes';
import captchaRoutes from './api/routes/captcha.routes';
import apiCredentialsRoutes from './api/routes/api-credentials.routes';
import adminRoutes from './api/routes/admin.routes';

const app: Application = express();

// ====================================
// MIDDLEWARE
// ====================================

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Request logging (development)
if (env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ====================================
// ROUTES
// ====================================

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Additional API routes
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/marketplace-oauth', marketplaceOauthRoutes);
app.use('/api/amazon', amazonRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/proxies', proxiesRoutes);
app.use('/api/publisher', publisherRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/credentials', apiCredentialsRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
