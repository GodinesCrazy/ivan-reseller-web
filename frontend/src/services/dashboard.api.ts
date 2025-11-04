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

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  async getRecentActivity(limit = 10): Promise<RecentActivity> {
    const response = await api.get(`/dashboard/recent-activity?limit=${limit}`);
    return response.data;
  },

  async getSalesChart(days = 30) {
    const response = await api.get(`/dashboard/charts/sales?days=${days}`);
    return response.data;
  },
};