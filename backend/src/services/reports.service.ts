import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { notificationService } from './notification.service';

const prisma = new PrismaClient();

// Types for reports
export interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  marketplace?: string;
  status?: string;
  productCategory?: string;
}

export interface SalesReportData {
  id: number;
  orderId: string;
  productTitle: string;
  marketplace: string;
  salePrice: number;
  cost: number;
  profit: number;
  commission: number;
  date: Date;
  status: string;
  userId: number;
  username: string;
}

export interface ProductReportData {
  id: number;
  title: string;
  status: string;
  marketplace: string;
  price: number;
  stock: number;
  views: number;
  sales: number;
  profit: number;
  createdAt: Date;
  lastUpdated: Date;
}

export interface UserPerformanceData {
  userId: number;
  username: string;
  totalProducts: number;
  activeProducts: number;
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  totalCommissions: number;
  avgOrderValue: number;
  conversionRate: number;
  topMarketplace: string;
  lastActivity: Date;
}

export interface MarketplaceAnalytics {
  marketplace: string;
  totalProducts: number;
  activeListings: number;
  totalSales: number;
  revenue: number;
  averagePrice: number;
  conversionRate: number;
  topCategories: string[];
  monthlyTrend: Array<{
    month: string;
    sales: number;
    revenue: number;
  }>;
}

export interface ExecutiveReportData {
  summary: {
    totalUsers: number;
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
    totalProfit: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  marketplaceBreakdown: MarketplaceAnalytics[];
  topPerformers: UserPerformanceData[];
  monthlyTrends: Array<{
    month: string;
    users: number;
    products: number;
    sales: number;
    revenue: number;
  }>;
  alerts: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

class ReportsService {
  /**
   * Generate sales report data
   */
  async generateSalesReport(filters: ReportFilters): Promise<SalesReportData[]> {
    try {
      const whereClause: any = {};

      if (filters.startDate && filters.endDate) {
        whereClause.createdAt = {
          gte: filters.startDate,
          lte: filters.endDate
        };
      }

      if (filters.userId) {
        whereClause.userId = filters.userId;
      }

      if (filters.marketplace) {
        whereClause.marketplace = filters.marketplace;
      }

      if (filters.status) {
        whereClause.status = filters.status;
      }

      const sales = await prisma.sale.findMany({
        where: whereClause,
        include: {
          product: {
            select: {
              title: true
            }
          },
          user: {
            select: {
              username: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return sales.map(sale => ({
        id: sale.id,
        orderId: sale.orderId,
        productTitle: sale.product?.title || 'Unknown Product',
        marketplace: sale.marketplace,
        salePrice: sale.salePrice,
        cost: sale.aliexpressCost,
        profit: sale.grossProfit,
        commission: sale.commissionAmount,
        date: sale.createdAt,
        status: sale.status,
        userId: sale.userId,
        username: sale.user?.username || 'Unknown User'
      }));
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating sales report', { error });
      throw new Error('Failed to generate sales report');
    }
  }

  /**
   * Generate product performance report
   */
  async generateProductReport(filters: ReportFilters): Promise<ProductReportData[]> {
    try {
      const whereClause: any = {};

      if (filters.userId) {
        whereClause.userId = filters.userId;
      }

      if (filters.status) {
        whereClause.status = filters.status;
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          sales: {
            select: {
              salePrice: true,
              grossProfit: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return products.map(product => {
        const totalSales = product.sales.length;
        const totalRevenue = product.sales.reduce((sum, sale) => sum + sale.salePrice, 0);
        const totalProfit = product.sales.reduce((sum, sale) => sum + sale.grossProfit, 0);

        return {
          id: product.id,
          title: product.title,
          status: product.status,
          marketplace: 'Multiple', // This would need to be calculated based on listings
          price: product.suggestedPrice,
          stock: 100, // This would come from inventory data
          views: 0, // This would need to be tracked separately
          sales: totalSales,
          profit: totalProfit,
          createdAt: product.createdAt,
          lastUpdated: product.updatedAt
        };
      });
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating product report', { error });
      throw new Error('Failed to generate product report');
    }
  }

  /**
   * Generate user performance report
   */
  async generateUserPerformanceReport(): Promise<UserPerformanceData[]> {
    try {
      const users = await prisma.user.findMany({
        include: {
          products: {
            select: {
              id: true,
              status: true
            }
          },
          sales: {
            select: {
              salePrice: true,
              grossProfit: true,
              commissionAmount: true,
              marketplace: true
            }
          }
        }
      });

      return users.map(user => {
        const totalProducts = user.products.length;
        const activeProducts = user.products.filter(p => p.status === 'PUBLISHED').length;
        const totalSales = user.sales.length;
        const totalRevenue = user.sales.reduce((sum, sale) => sum + sale.salePrice, 0);
        const totalProfit = user.sales.reduce((sum, sale) => sum + sale.grossProfit, 0);
        const totalCommissions = user.sales.reduce((sum, sale) => sum + sale.commissionAmount, 0);
        const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
        const conversionRate = totalProducts > 0 ? (totalSales / totalProducts) * 100 : 0;

        // Calculate top marketplace
        const marketplaceCounts: { [key: string]: number } = {};
        user.sales.forEach(sale => {
          marketplaceCounts[sale.marketplace] = (marketplaceCounts[sale.marketplace] || 0) + 1;
        });
        const topMarketplace = Object.keys(marketplaceCounts).reduce((a, b) => 
          marketplaceCounts[a] > marketplaceCounts[b] ? a : b, 'None'
        );

        return {
          userId: user.id,
          username: user.username,
          totalProducts,
          activeProducts,
          totalSales,
          totalRevenue,
          totalProfit,
          totalCommissions,
          avgOrderValue,
          conversionRate,
          topMarketplace,
          lastActivity: user.lastLoginAt || user.updatedAt
        };
      });
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating user performance report', { error });
      throw new Error('Failed to generate user performance report');
    }
  }

  /**
   * Generate marketplace analytics
   */
  async generateMarketplaceAnalytics(): Promise<MarketplaceAnalytics[]> {
    try {
      // Get sales data grouped by marketplace
      const marketplaces = ['ebay', 'mercadolibre', 'amazon'];
      const analytics: MarketplaceAnalytics[] = [];

      for (const marketplace of marketplaces) {
        const sales = await prisma.sale.findMany({
          where: { marketplace },
          include: {
            product: {
              select: {
                title: true,
                suggestedPrice: true
              }
            }
          }
        });

        const products = await prisma.product.findMany({
          where: {
            // This would need marketplace-specific filtering
          }
        });

        const totalSales = sales.length;
        const revenue = sales.reduce((sum, sale) => sum + sale.salePrice, 0);
        const averagePrice = totalSales > 0 ? revenue / totalSales : 0;
        const conversionRate = products.length > 0 ? (totalSales / products.length) * 100 : 0;

        // Calculate monthly trends (last 6 months)
        const monthlyTrend = await this.calculateMonthlyTrends(marketplace);

        analytics.push({
          marketplace,
          totalProducts: products.length,
          activeListings: products.filter(p => p.status === 'PUBLISHED').length,
          totalSales,
          revenue,
          averagePrice,
          conversionRate,
          topCategories: ['Electronics', 'Fashion', 'Home'], // This would be calculated
          monthlyTrend
        });
      }

      return analytics;
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating marketplace analytics', { error });
      throw new Error('Failed to generate marketplace analytics');
    }
  }

  /**
   * Calculate monthly trends for marketplace
   */
  private async calculateMonthlyTrends(marketplace: string): Promise<Array<{ month: string; sales: number; revenue: number; }>> {
    const trends = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      
      const sales = await prisma.sale.findMany({
        where: {
          marketplace,
          createdAt: {
            gte: date,
            lt: nextMonth
          }
        }
      });

      const totalSales = sales.length;
      const revenue = sales.reduce((sum, sale) => sum + sale.salePrice, 0);

      trends.push({
        month: date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short' }),
        sales: totalSales,
        revenue
      });
    }

    return trends;
  }

  /**
   * Generate executive dashboard report
   */
  async generateExecutiveReport(): Promise<ExecutiveReportData> {
    try {
      // Summary statistics
      const totalUsers = await prisma.user.count();
      const totalProducts = await prisma.product.count();
      const totalSales = await prisma.sale.count();
      
      const revenueData = await prisma.sale.aggregate({
        _sum: {
          salePrice: true,
          grossProfit: true
        }
      });

      const totalRevenue = revenueData._sum.salePrice || 0;
      const totalProfit = revenueData._sum.grossProfit || 0;
      const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const conversionRate = totalProducts > 0 ? (totalSales / totalProducts) * 100 : 0;

      // Get marketplace breakdown
      const marketplaceBreakdown = await this.generateMarketplaceAnalytics();

      // Get top performers
      const topPerformers = await this.generateUserPerformanceReport();
      topPerformers.sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Calculate monthly trends
      const monthlyTrends = [];
      const now = new Date();
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        
        const monthUsers = await prisma.user.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth
            }
          }
        });

        const monthProducts = await prisma.product.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth
            }
          }
        });

        const monthSales = await prisma.sale.findMany({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth
            }
          },
          select: {
            salePrice: true
          }
        });

        monthlyTrends.push({
          month: date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short' }),
          users: monthUsers,
          products: monthProducts,
          sales: monthSales.length,
          revenue: monthSales.reduce((sum, sale) => sum + sale.salePrice, 0)
        });
      }

      // Generate alerts
      const alerts = [];

      // Low conversion rate alert
      if (conversionRate < 5) {
        alerts.push({
          type: 'conversion',
          message: `Tasa de conversión baja: ${conversionRate.toFixed(1)}%`,
          severity: 'medium' as const
        });
      }

      // Inactive users alert
      const inactiveUsers = await prisma.user.count({
        where: {
          lastLoginAt: {
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
          }
        }
      });

      if (inactiveUsers > totalUsers * 0.3) {
        alerts.push({
          type: 'users',
          message: `${inactiveUsers} usuarios inactivos por más de 30 días`,
          severity: 'medium' as const
        });
      }

      return {
        summary: {
          totalUsers,
          totalProducts,
          totalSales,
          totalRevenue,
          totalProfit,
          avgOrderValue,
          conversionRate
        },
        marketplaceBreakdown,
        topPerformers: topPerformers.slice(0, 10),
        monthlyTrends,
        alerts
      };
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating executive report', { error });
      throw new Error('Failed to generate executive report');
    }
  }

  /**
   * Export data to Excel format
   */
  async exportToExcel(data: any[], sheetName: string = 'Report'): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);
      
      // Add headers
      if (data.length > 0) {
        const keys = Object.keys(data[0]);
        worksheet.columns = keys.map(key => ({
          header: key,
          key: key,
          width: Math.min(
            Math.max(key.length, ...data.map(row => String(row[key] || '').length)) + 2,
            50
          )
        }));

        // Add rows
        data.forEach(row => {
          worksheet.addRow(row);
        });

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      }
      
      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error exporting to Excel', { error });
      throw new Error('Failed to export to Excel');
    }
  }

  /**
   * Generate PDF report (HTML to PDF conversion)
   */
  async generatePDFReport(htmlContent: string): Promise<Buffer> {
    try {
      // For now, we'll use a simple HTML to PDF approach
      // In production, you might want to use Puppeteer or similar
      
      // This is a placeholder - in a real implementation,
      // you would use Puppeteer to convert HTML to PDF
      const htmlToPdfBuffer = Buffer.from(htmlContent, 'utf-8');
      
      return htmlToPdfBuffer;
    } catch (error) {
      const { logger } = await import('../config/logger');
      logger.error('Error generating PDF', { error });
      throw new Error('Failed to generate PDF');
    }
  }

  /**
   * Generate HTML template for reports
   */
  generateHTMLReport(title: string, data: any, type: 'sales' | 'products' | 'users' | 'executive'): string {
    const currentDate = new Date().toLocaleDateString('es-ES');
    
    let tableHTML = '';
    
    switch (type) {
      case 'sales':
        tableHTML = this.generateSalesTableHTML(data as SalesReportData[]);
        break;
      case 'products':
        tableHTML = this.generateProductsTableHTML(data as ProductReportData[]);
        break;
      case 'users':
        tableHTML = this.generateUsersTableHTML(data as UserPerformanceData[]);
        break;
      case 'executive':
        tableHTML = this.generateExecutiveTableHTML(data as ExecutiveReportData);
        break;
    }

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            background-color: #f8f9fa;
          }
          .header {
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
          }
          .header p {
            margin: 10px 0 0 0;
            font-size: 1.1em;
            opacity: 0.9;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 14px;
          }
          th, td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
          }
          th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #495057;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
          }
          tr:hover {
            background-color: #f8f9fa;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .summary-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid #007bff;
          }
          .summary-card h3 {
            margin: 0 0 10px 0;
            color: #6c757d;
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 600;
          }
          .summary-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .status {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
          }
          .status.active { background-color: #d4edda; color: #155724; }
          .status.pending { background-color: #fff3cd; color: #856404; }
          .status.failed { background-color: #f8d7da; color: #721c24; }
          .currency {
            color: #28a745;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Ivan Reseller</h1>
          <p>${title} - Generado el ${currentDate}</p>
        </div>
        
        <div class="content">
          ${tableHTML}
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Ivan Reseller - Sistema de Gestión Dropshipping</p>
          <p>Reporte generado automáticamente</p>
        </div>
      </body>
      </html>
    `;
  }

  private generateSalesTableHTML(sales: SalesReportData[]): string {
    if (sales.length === 0) {
      return '<p>No se encontraron ventas para los filtros seleccionados.</p>';
    }

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.salePrice, 0);
    const totalProfit = sales.reduce((sum, sale) => sum + sale.profit, 0);
    const totalCommissions = sales.reduce((sum, sale) => sum + sale.commission, 0);

    return `
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Ventas</h3>
          <div class="value">${sales.length}</div>
        </div>
        <div class="summary-card">
          <h3>Ingresos Totales</h3>
          <div class="value currency">$${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Ganancia Total</h3>
          <div class="value currency">$${totalProfit.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Comisiones</h3>
          <div class="value currency">$${totalCommissions.toLocaleString()}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>ID Orden</th>
            <th>Producto</th>
            <th>Marketplace</th>
            <th>Precio Venta</th>
            <th>Costo</th>
            <th>Ganancia</th>
            <th>Comisión</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>
          ${sales.map(sale => `
            <tr>
              <td>${sale.orderId}</td>
              <td>${sale.productTitle}</td>
              <td>${sale.marketplace}</td>
              <td class="currency">$${sale.salePrice.toLocaleString()}</td>
              <td class="currency">$${sale.cost.toLocaleString()}</td>
              <td class="currency">$${sale.profit.toLocaleString()}</td>
              <td class="currency">$${sale.commission.toLocaleString()}</td>
              <td>${sale.date.toLocaleDateString('es-ES')}</td>
              <td><span class="status ${sale.status.toLowerCase()}">${sale.status}</span></td>
              <td>${sale.username}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private generateProductsTableHTML(products: ProductReportData[]): string {
    if (products.length === 0) {
      return '<p>No se encontraron productos para los filtros seleccionados.</p>';
    }

    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.status === 'PUBLISHED').length;
    const totalSales = products.reduce((sum, product) => sum + product.sales, 0);
    const totalProfit = products.reduce((sum, product) => sum + product.profit, 0);

    return `
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Productos</h3>
          <div class="value">${totalProducts}</div>
        </div>
        <div class="summary-card">
          <h3>Productos Activos</h3>
          <div class="value">${activeProducts}</div>
        </div>
        <div class="summary-card">
          <h3>Ventas Totales</h3>
          <div class="value">${totalSales}</div>
        </div>
        <div class="summary-card">
          <h3>Ganancia Total</h3>
          <div class="value currency">$${totalProfit.toLocaleString()}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Título</th>
            <th>Estado</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Ventas</th>
            <th>Ganancia</th>
            <th>Creado</th>
            <th>Actualizado</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(product => `
            <tr>
              <td>${product.id}</td>
              <td>${product.title}</td>
              <td><span class="status ${product.status.toLowerCase()}">${product.status}</span></td>
              <td class="currency">$${product.price.toLocaleString()}</td>
              <td>${product.stock}</td>
              <td>${product.sales}</td>
              <td class="currency">$${product.profit.toLocaleString()}</td>
              <td>${product.createdAt.toLocaleDateString('es-ES')}</td>
              <td>${product.lastUpdated.toLocaleDateString('es-ES')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private generateUsersTableHTML(users: UserPerformanceData[]): string {
    if (users.length === 0) {
      return '<p>No se encontraron usuarios.</p>';
    }

    const totalUsers = users.length;
    const totalRevenue = users.reduce((sum, user) => sum + user.totalRevenue, 0);
    const totalCommissions = users.reduce((sum, user) => sum + user.totalCommissions, 0);
    const avgConversion = users.reduce((sum, user) => sum + user.conversionRate, 0) / users.length;

    return `
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Usuarios</h3>
          <div class="value">${totalUsers}</div>
        </div>
        <div class="summary-card">
          <h3>Ingresos Totales</h3>
          <div class="value currency">$${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Comisiones Totales</h3>
          <div class="value currency">$${totalCommissions.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Conversión Promedio</h3>
          <div class="value">${avgConversion.toFixed(1)}%</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Productos</th>
            <th>Activos</th>
            <th>Ventas</th>
            <th>Ingresos</th>
            <th>Comisiones</th>
            <th>Valor Promedio</th>
            <th>Conversión</th>
            <th>Top Marketplace</th>
            <th>Última Actividad</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => `
            <tr>
              <td>${user.username}</td>
              <td>${user.totalProducts}</td>
              <td>${user.activeProducts}</td>
              <td>${user.totalSales}</td>
              <td class="currency">$${user.totalRevenue.toLocaleString()}</td>
              <td class="currency">$${user.totalCommissions.toLocaleString()}</td>
              <td class="currency">$${user.avgOrderValue.toLocaleString()}</td>
              <td>${user.conversionRate.toFixed(1)}%</td>
              <td>${user.topMarketplace}</td>
              <td>${user.lastActivity.toLocaleDateString('es-ES')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private generateExecutiveTableHTML(report: ExecutiveReportData): string {
    return `
      <h2>Resumen Ejecutivo</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Usuarios</h3>
          <div class="value">${report.summary.totalUsers}</div>
        </div>
        <div class="summary-card">
          <h3>Total Productos</h3>
          <div class="value">${report.summary.totalProducts}</div>
        </div>
        <div class="summary-card">
          <h3>Total Ventas</h3>
          <div class="value">${report.summary.totalSales}</div>
        </div>
        <div class="summary-card">
          <h3>Ingresos</h3>
          <div class="value currency">$${report.summary.totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Ganancia</h3>
          <div class="value currency">$${report.summary.totalProfit.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h3>Valor Promedio</h3>
          <div class="value currency">$${report.summary.avgOrderValue.toLocaleString()}</div>
        </div>
      </div>

      <h3>Top Performers</h3>
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Productos</th>
            <th>Ventas</th>
            <th>Ingresos</th>
            <th>Conversión</th>
          </tr>
        </thead>
        <tbody>
          ${report.topPerformers.slice(0, 5).map(user => `
            <tr>
              <td>${user.username}</td>
              <td>${user.totalProducts}</td>
              <td>${user.totalSales}</td>
              <td class="currency">$${user.totalRevenue.toLocaleString()}</td>
              <td>${user.conversionRate.toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${report.alerts.length > 0 ? `
        <h3>Alertas del Sistema</h3>
        <div>
          ${report.alerts.map(alert => `
            <div class="status ${alert.severity}" style="margin-bottom: 10px; padding: 10px;">
              <strong>${alert.type.toUpperCase()}:</strong> ${alert.message}
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  /**
   * Send notification when report is generated
   */
  async notifyReportGeneration(userId: number, reportType: string, fileName: string): Promise<void> {
    notificationService.sendToUser(userId, {
      type: 'USER_ACTION',
      title: 'Reporte Generado',
      message: `Tu reporte de ${reportType} ha sido generado exitosamente: ${fileName}`,
      priority: 'NORMAL',
      category: 'USER',
      data: {
        reportType,
        fileName,
        timestamp: new Date()
      },
      actions: [
        {
          id: 'download',
          label: 'Descargar',
          url: `/api/reports/download/${fileName}`,
          variant: 'primary'
        }
      ]
    });
  }
}

export { ReportsService };
export default new ReportsService();