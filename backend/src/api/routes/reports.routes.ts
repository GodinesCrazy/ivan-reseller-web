import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import reportsService, { ReportFilters } from '../../services/reports.service';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * Generate sales report
 * GET /api/reports/sales
 * Query params: startDate, endDate, userId, marketplace, status, format
 */
router.get('/sales', async (req, res) => {
  try {
    const filters: ReportFilters = {};
    
    // Parse query parameters
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }
    if (req.query.userId) {
      filters.userId = parseInt(req.query.userId as string);
    }
    if (req.query.marketplace) {
      filters.marketplace = req.query.marketplace as string;
    }
    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    const format = req.query.format as string || 'json';

    // Generate report data
    const salesData = await reportsService.generateSalesReport(filters);

    // Handle different output formats
    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        const excelBuffer = await reportsService.exportToExcel(salesData, 'Reporte de Ventas');
        const excelFileName = `ventas_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        
        // Notify user
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'ventas', excelFileName);
        }
        
        return res.send(excelBuffer);

      case 'pdf':
        const htmlContent = reportsService.generateHTMLReport(
          'Reporte de Ventas', 
          salesData, 
          'sales'
        );
        const pdfBuffer = await reportsService.generatePDFReport(htmlContent);
        const pdfFileName = `ventas_${new Date().toISOString().split('T')[0]}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
        
        // Notify user
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'ventas', pdfFileName);
        }
        
        return res.send(pdfBuffer);

      case 'html':
        const htmlReport = reportsService.generateHTMLReport(
          'Reporte de Ventas', 
          salesData, 
          'sales'
        );
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlReport);

      default:
        // JSON format
        res.json({
          success: true,
          data: salesData,
          summary: {
            totalSales: salesData.length,
            totalRevenue: salesData.reduce((sum, sale) => sum + sale.salePrice, 0),
            totalProfit: salesData.reduce((sum, sale) => sum + sale.profit, 0),
            totalCommissions: salesData.reduce((sum, sale) => sum + sale.commission, 0),
            averageOrderValue: salesData.length > 0 ? 
              salesData.reduce((sum, sale) => sum + sale.salePrice, 0) / salesData.length : 0
          },
          filters,
          generatedAt: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte de ventas'
    });
  }
});

/**
 * Generate products report
 * GET /api/reports/products
 */
router.get('/products', async (req, res) => {
  try {
    const filters: ReportFilters = {};
    
    if (req.query.userId) {
      filters.userId = parseInt(req.query.userId as string);
    }
    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    const format = req.query.format as string || 'json';
    const productsData = await reportsService.generateProductReport(filters);

    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        const excelBuffer = await reportsService.exportToExcel(productsData, 'Reporte de Productos');
        const excelFileName = `productos_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'productos', excelFileName);
        }
        
        return res.send(excelBuffer);

      case 'pdf':
        const htmlContent = reportsService.generateHTMLReport(
          'Reporte de Productos', 
          productsData, 
          'products'
        );
        const pdfBuffer = await reportsService.generatePDFReport(htmlContent);
        const pdfFileName = `productos_${new Date().toISOString().split('T')[0]}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'productos', pdfFileName);
        }
        
        return res.send(pdfBuffer);

      case 'html':
        const htmlReport = reportsService.generateHTMLReport(
          'Reporte de Productos', 
          productsData, 
          'products'
        );
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlReport);

      default:
        res.json({
          success: true,
          data: productsData,
          summary: {
            totalProducts: productsData.length,
            activeProducts: productsData.filter(p => p.status === 'PUBLISHED').length,
            totalSales: productsData.reduce((sum, product) => sum + product.sales, 0),
            totalProfit: productsData.reduce((sum, product) => sum + product.profit, 0)
          },
          filters,
          generatedAt: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error generating products report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte de productos'
    });
  }
});

/**
 * Generate user performance report
 * GET /api/reports/users
 */
router.get('/users', async (req, res) => {
  try {
    const format = req.query.format as string || 'json';
    const usersData = await reportsService.generateUserPerformanceReport();

    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        const excelBuffer = await reportsService.exportToExcel(usersData, 'Performance de Usuarios');
        const excelFileName = `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'usuarios', excelFileName);
        }
        
        return res.send(excelBuffer);

      case 'pdf':
        const htmlContent = reportsService.generateHTMLReport(
          'Performance de Usuarios', 
          usersData, 
          'users'
        );
        const pdfBuffer = await reportsService.generatePDFReport(htmlContent);
        const pdfFileName = `usuarios_${new Date().toISOString().split('T')[0]}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'usuarios', pdfFileName);
        }
        
        return res.send(pdfBuffer);

      case 'html':
        const htmlReport = reportsService.generateHTMLReport(
          'Performance de Usuarios', 
          usersData, 
          'users'
        );
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlReport);

      default:
        res.json({
          success: true,
          data: usersData,
          summary: {
            totalUsers: usersData.length,
            activeUsers: usersData.filter(u => u.totalSales > 0).length,
            totalRevenue: usersData.reduce((sum, user) => sum + user.totalRevenue, 0),
            totalCommissions: usersData.reduce((sum, user) => sum + user.totalCommissions, 0),
            averageConversion: usersData.reduce((sum, user) => sum + user.conversionRate, 0) / usersData.length
          },
          generatedAt: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error generating users report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte de usuarios'
    });
  }
});

/**
 * Generate marketplace analytics
 * GET /api/reports/marketplace-analytics
 */
router.get('/marketplace-analytics', async (req, res) => {
  try {
    const format = req.query.format as string || 'json';
    const analyticsData = await reportsService.generateMarketplaceAnalytics();

    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        const excelBuffer = await reportsService.exportToExcel(analyticsData, 'Analytics de Marketplaces');
        const excelFileName = `marketplaces_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'marketplaces', excelFileName);
        }
        
        return res.send(excelBuffer);

      case 'json':
      default:
        res.json({
          success: true,
          data: analyticsData,
          summary: {
            totalMarketplaces: analyticsData.length,
            totalProducts: analyticsData.reduce((sum, mp) => sum + mp.totalProducts, 0),
            totalSales: analyticsData.reduce((sum, mp) => sum + mp.totalSales, 0),
            totalRevenue: analyticsData.reduce((sum, mp) => sum + mp.revenue, 0)
          },
          generatedAt: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error generating marketplace analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar analytics de marketplaces'
    });
  }
});

/**
 * Generate executive dashboard report
 * GET /api/reports/executive
 */
router.get('/executive', async (req, res) => {
  try {
    const format = req.query.format as string || 'json';
    const executiveData = await reportsService.generateExecutiveReport();

    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        // For executive report, create multiple sheets
        const summaryData = [executiveData.summary];
        const excelBuffer = await reportsService.exportToExcel(summaryData, 'Resumen Ejecutivo');
        const excelFileName = `ejecutivo_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${excelFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'ejecutivo', excelFileName);
        }
        
        return res.send(excelBuffer);

      case 'pdf':
        const htmlContent = reportsService.generateHTMLReport(
          'Reporte Ejecutivo', 
          executiveData, 
          'executive'
        );
        const pdfBuffer = await reportsService.generatePDFReport(htmlContent);
        const pdfFileName = `ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
        
        if (req.user?.userId) {
          await reportsService.notifyReportGeneration(req.user.userId, 'ejecutivo', pdfFileName);
        }
        
        return res.send(pdfBuffer);

      case 'html':
        const htmlReport = reportsService.generateHTMLReport(
          'Reporte Ejecutivo', 
          executiveData, 
          'executive'
        );
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlReport);

      default:
        res.json({
          success: true,
          data: executiveData,
          generatedAt: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Error generating executive report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el reporte ejecutivo'
    });
  }
});

/**
 * Get available report types and their parameters
 * GET /api/reports/types
 */
router.get('/types', (req, res) => {
  res.json({
    success: true,
    reportTypes: [
      {
        type: 'sales',
        name: 'Reporte de Ventas',
        description: 'Detalle de todas las ventas con métricas de rendimiento',
        formats: ['json', 'excel', 'pdf', 'html'],
        filters: [
          { name: 'startDate', type: 'date', description: 'Fecha de inicio' },
          { name: 'endDate', type: 'date', description: 'Fecha de fin' },
          { name: 'userId', type: 'number', description: 'ID del usuario' },
          { name: 'marketplace', type: 'string', description: 'Marketplace (ebay, mercadolibre, amazon)' },
          { name: 'status', type: 'string', description: 'Estado de la venta' }
        ]
      },
      {
        type: 'products',
        name: 'Reporte de Productos',
        description: 'Performance y métricas de todos los productos',
        formats: ['json', 'excel', 'pdf', 'html'],
        filters: [
          { name: 'userId', type: 'number', description: 'ID del usuario' },
          { name: 'status', type: 'string', description: 'Estado del producto' }
        ]
      },
      {
        type: 'users',
        name: 'Performance de Usuarios',
        description: 'Métricas de rendimiento por usuario',
        formats: ['json', 'excel', 'pdf', 'html'],
        filters: []
      },
      {
        type: 'marketplace-analytics',
        name: 'Analytics de Marketplaces',
        description: 'Análisis comparativo de rendimiento por marketplace',
        formats: ['json', 'excel'],
        filters: []
      },
      {
        type: 'executive',
        name: 'Reporte Ejecutivo',
        description: 'Dashboard completo con KPIs y métricas clave',
        formats: ['json', 'pdf', 'html'],
        filters: []
      }
    ]
  });
});

/**
 * Schedule automatic report generation
 * POST /api/reports/schedule
 */
router.post('/schedule', async (req, res) => {
  try {
    const { reportType, format, filters, schedule, email } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    // TODO: Implement report scheduling with job system
    // This would integrate with the job service to schedule recurring reports

    res.json({
      success: true,
      message: 'Reporte programado exitosamente',
      scheduledReport: {
        id: Date.now(), // Temporary ID
        userId,
        reportType,
        format,
        filters,
        schedule,
        email,
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error scheduling report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al programar el reporte'
    });
  }
});

/**
 * Get report generation history
 * GET /api/reports/history
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // TODO: Implement report history tracking
    // This would require a reports_history table to track generated reports

    res.json({
      success: true,
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        pages: 0
      },
      message: 'Historial de reportes (pendiente de implementación)'
    });
  } catch (error) {
    console.error('Error getting report history:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el historial de reportes'
    });
  }
});

export default router;