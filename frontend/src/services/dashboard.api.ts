import { api } from './api';

export interface DashboardStats {
  products: {
    total: number;
    pending: number;
    approved: number;
    published: number;
  };
  sales: {
    totalSales: number;
    pendingSales: number;
    completedSales: number;
    cancelledSales: number;
    totalRevenue: number;
    totalCommissions: number;
  };
  commissions: {
    totalEarned: number;
    pendingPayout: number;
    totalCommissions: number;
    thisMonthEarnings: number;
  };
}

export interface RecentActivity {
  activities: Array<{
    id: number;
    action: string;
    description: string;
    createdAt: string;
    user: {
      id: number;
      username: string;
      email: string;
    } | null;
  }>;
}

export type DashboardEnvironment = 'production' | 'sandbox' | 'all';

export const dashboardApi = {
  async getStats(environment: DashboardEnvironment = 'production'): Promise<DashboardStats> {
    const response = await api.get('/api/dashboard/stats', { params: { environment } });
    return response.data;
  },

  async getRecentActivity(limit = 10): Promise<RecentActivity> {
    const response = await api.get(`/api/dashboard/recent-activity?limit=${limit}`);
    return response.data;
  },

  async getSalesChart(days = 30, environment: DashboardEnvironment = 'production') {
    const response = await api.get('/api/dashboard/charts/sales', { params: { days, environment } });
    return response.data;
  },
};