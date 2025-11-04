const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Ivan Reseller Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, username, password } = req.body;
  
  console.log('Login attempt:', { email, username, password });
  
  const isValid = (
    (email === 'admin@ivanreseller.com' || username === 'admin' || username === 'admin@ivanreseller.com') 
    && password === 'admin123'
  );
  
  if (isValid) {
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
    console.log('Login failed for:', { email, username });
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

// Dashboard endpoint
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
          date: new Date().toISOString()
        }
      ]
    }
  });
});

// Products endpoint
app.get('/api/products', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        title: 'iPhone 15 Pro Max',
        status: 'PUBLISHED',
        suggestedPrice: 1199.99,
        createdAt: new Date().toISOString()
      }
    ]
  });
});

// === NUEVAS RUTAS DE AUTOMATIZACIÓN ===

// Configuración del sistema
app.get('/api/automation/config', (req, res) => {
  res.json({
    success: true,
    data: {
      config: {
        mode: 'manual',
        environment: 'sandbox',
        thresholds: {
          minProfitMargin: 15,
          maxInvestment: 500,
          minConfidence: 75,
          maxRiskLevel: 3
        }
      },
      credentials: [
        {
          id: 'ebay_sandbox_demo',
          marketplace: 'ebay',
          environment: 'sandbox',
          isActive: true,
          createdAt: new Date().toISOString()
        }
      ],
      metrics: {
        totalTransactions: 0,
        completedTransactions: 0,
        totalRevenue: 0,
        totalProfit: 0,
        automationRate: 0,
        averageProcessingTime: 0,
        activeRules: 4
      },
      systemStatus: 'operational'
    }
  });
});

// Buscar oportunidades IA
app.post('/api/automation/opportunities/search', (req, res) => {
  const { query } = req.body;
  
  // Simular oportunidades encontradas
  const mockOpportunities = [
    {
      id: `opp_${Date.now()}_1`,
      title: `Auriculares Gaming RGB - ${query}`,
      category: 'Electronics',
      sourcePrice: 25.99,
      suggestedPrice: 45.99,
      profitMargin: 43.5,
      confidence: 94,
      competition: 'low',
      demand: 'high',
      trend: 'rising',
      monthlySales: 1200,
      keywords: [query.toLowerCase(), 'gaming', 'rgb', 'wireless'],
      suppliers: 15,
      aiAnalysis: {
        strengths: [
          'Alto margen de ganancia potencial',
          'Baja competencia detectada',
          'Tendencia de mercado favorable'
        ],
        weaknesses: [
          'Mercado competitivo en expansión'
        ],
        recommendations: [
          'Optimizar keywords para SEO',
          'Considerar bundle con accesorios',
          'Monitorear precios semanalmente'
        ]
      },
      lastUpdated: new Date().toISOString()
    }
  ];

  res.json({
    success: true,
    data: {
      opportunities: mockOpportunities,
      count: mockOpportunities.length,
      query,
      timestamp: new Date().toISOString()
    }
  });
});

// Oportunidades trending
app.get('/api/automation/opportunities/trending', (req, res) => {
  const trendingOpportunities = [
    {
      id: 'trending_1',
      title: 'Cargador USB-C Rápido 65W',
      profitMargin: 38.2,
      confidence: 91,
      trend: 'rising'
    },
    {
      id: 'trending_2', 
      title: 'Soporte Laptop Ajustable',
      profitMargin: 45.8,
      confidence: 87,
      trend: 'stable'
    }
  ];

  res.json({
    success: true,
    data: {
      opportunities: trendingOpportunities,
      count: trendingOpportunities.length,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Procesar venta
app.post('/api/automation/sales/process', (req, res) => {
  const saleData = req.body;
  
  const mockTransaction = {
    id: `tx_${Date.now()}`,
    status: 'pending',
    wasAutomated: saleData.mode === 'automatic',
    estimatedProfit: (saleData.salePrice * 0.25) || 25.00
  };

  res.json({
    success: true,
    message: 'Venta procesada exitosamente',
    data: mockTransaction
  });
});

// Transacciones activas
app.get('/api/automation/transactions', (req, res) => {
  const mockTransactions = [
    {
      id: 'tx_demo_1',
      type: 'sale',
      productTitle: 'Auriculares Gaming RGB',
      status: 'completed',
      amounts: {
        salePrice: 45.99,
        purchasePrice: 25.99,
        profit: 15.50,
        fees: 4.50
      },
      automation: {
        wasAutomated: true
      },
      timestamps: {
        created: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completed: new Date().toISOString()
      }
    }
  ];

  res.json({
    success: true,
    data: {
      transactions: mockTransactions,
      count: mockTransactions.length,
      metrics: {
        pending: 0,
        processing: 0,
        fulfilled: 0,
        completed: 1,
        automated: 1
      }
    }
  });
});

// Reglas de automatización
app.get('/api/automation/rules', (req, res) => {
  const mockRules = [
    {
      id: 'auto-pricing',
      name: 'Ajuste automático de precios competitivos',
      type: 'pricing',
      active: true,
      executionCount: 156,
      successRate: 94
    },
    {
      id: 'auto-purchase',
      name: 'Compra automática al recibir orden',
      type: 'purchasing', 
      active: true,
      executionCount: 23,
      successRate: 87
    }
  ];

  res.json({
    success: true,
    data: {
      rules: mockRules,
      activeCount: mockRules.filter(r => r.active).length,
      totalCount: mockRules.length
    }
  });
});

// Métricas del sistema
app.get('/api/automation/metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      business: {
        totalTransactions: 23,
        completedTransactions: 21,
        totalRevenue: 2340.50,
        totalProfit: 856.75,
        automationRate: 0.85,
        averageProcessingTime: 45
      },
      credentials: {
        totalCredentials: 3,
        activeCredentials: 2,
        totalRequestsToday: 1250
      },
      notifications: {
        total: 45,
        last24h: 12,
        pending: 0,
        failed: 1
      },
      systemHealth: {
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    }
  });
});

// Sandbox test
app.post('/api/automation/sandbox/test', (req, res) => {
  const { action } = req.body;
  
  console.log(`🧪 SANDBOX TEST: ${action}`);
  
  res.json({
    success: true,
    message: `Acción de sandbox "${action}" ejecutada exitosamente`,
    data: {
      action,
      result: 'success',
      timestamp: new Date().toISOString()
    }
  });
});

// Validación de producción
app.get('/api/automation/production/validate', (req, res) => {
  res.json({
    success: true,
    data: {
      readinessScore: 75,
      isProductionReady: false,
      validationResults: {
        credentials: {
          ebay: { sandbox: true, production: false },
          amazon: { sandbox: false, production: false },
          mercadolibre: { sandbox: false, production: false }
        },
        configurations: {
          rateLimiting: true,
          notifications: true,
          security: true
        },
        systemHealth: {
          services: true,
          dependencies: true,
          performance: true
        }
      },
      recommendations: [
        'Configurar credenciales de producción para eBay',
        'Agregar credenciales de Amazon',
        'Configurar MercadoLibre API'
      ],
      timestamp: new Date().toISOString()
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log('🚀 Ivan Reseller Backend SIMPLE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log('🔐 Login: admin@ivanreseller.com / admin123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Backend ready!');
});