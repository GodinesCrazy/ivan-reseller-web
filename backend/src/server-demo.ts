import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Simple server for demo
const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Ivan Reseller Backend is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Basic auth endpoint for login
app.post('/api/auth/login', (req, res) => {
  const { email, username, password } = req.body;
  
  // Demo credentials - accept both email and username
  const isValidLogin = (
    (email === 'admin@ivanreseller.com' || username === 'admin' || username === 'admin@ivanreseller.com') 
    && password === 'admin123'
  );
  
  if (isValidLogin) {
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: 'demo-jwt-token-' + Date.now(),
        user: {
          id: 1,
          email: 'admin@ivanreseller.com',
          username: 'admin',
          role: 'ADMIN'
        }
      }
    });
  } else {
    console.log('Login attempt failed:', { email, username, password });
    res.status(401).json({
      success: false,
      message: 'Invalid credentials. Use: admin@ivanreseller.com / admin123'
    });
  }
});

// Basic dashboard endpoint
app.get('/api/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      totalProducts: 156,
      totalSales: 89,
      totalRevenue: 12450.75,
      totalProfit: 4567.25,
      recentSales: [
        {
          id: 1,
          product: 'iPhone 15 Pro',
          marketplace: 'eBay',
          amount: 899.99,
          profit: 150.50,
          date: new Date().toISOString()
        },
        {
          id: 2,
          product: 'Samsung Galaxy S24',
          marketplace: 'Amazon',
          amount: 749.99,
          profit: 125.75,
          date: new Date().toISOString()
        }
      ]
    }
  });
});

// Basic products endpoint
app.get('/api/products', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        title: 'iPhone 15 Pro Max',
        status: 'PUBLISHED',
        suggestedPrice: 1199.99,
        aliexpressPrice: 950.00,
        profit: 249.99,
        marketplace: 'eBay',
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        title: 'Samsung Galaxy S24 Ultra',
        status: 'DRAFT',
        suggestedPrice: 899.99,
        aliexpressPrice: 720.00,
        profit: 179.99,
        marketplace: 'Amazon',
        createdAt: new Date().toISOString()
      }
    ],
    pagination: {
      total: 2,
      page: 1,
      pages: 1
    }
  });
});

// Catch all for other routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found. This is a demo version.`,
    availableEndpoints: [
      'GET /health',
      'POST /api/auth/login',
      'GET /api/dashboard', 
      'GET /api/products'
    ]
  });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 Ivan Reseller Backend Demo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 Demo Login:');
  console.log('   Email: admin@ivanreseller.com');
  console.log('   Password: admin123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Backend ready for connections!');
});