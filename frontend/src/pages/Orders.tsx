/**
 * My Orders - Post-sale dropshipping orders
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, RefreshCw, ArrowRight } from 'lucide-react';
import api from '@/services/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatCurrencySimple } from '@/utils/currency';
import type { Order } from '@/services/orders.api';

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Order[]>('/api/orders');
      setOrders(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Orders</h1>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 text-red-700 bg-red-50 rounded-lg">{error}</div>
      )}

      {orders.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-gray-50 rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>No orders yet</p>
          <p className="text-sm mt-2">Orders will appear here after checkout</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono">{order.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm">{order.title}</td>
                  <td className="px-6 py-4">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-6 py-4 text-sm">{formatCurrencySimple(order.price, order.currency)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      View <ArrowRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
