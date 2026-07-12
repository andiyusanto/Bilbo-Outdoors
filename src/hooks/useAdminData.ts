import { useState, useEffect } from 'react';
import { Product, Order, DashboardStats } from '../types';
import { authHeaders, parseJsonOrThrow } from '../lib/api';

interface UseAdminDataParams {
  isLoggedIn: boolean;
  token: string;
  onUnauthorized: () => void;
}

export function useAdminData({ isLoggedIn, token, onUnauthorized }: UseAdminDataParams) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activeRentalsCount: 0,
    totalRevenue: 0,
    dueTodayCount: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const headers = authHeaders(token);

      // Fetch Orders
      const ordersRes = await fetch('/api/orders', { headers });
      const ordersData = await parseJsonOrThrow(ordersRes, 'Failed to fetch orders');
      setOrders(ordersData);

      // Fetch Products
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();
      setProducts(productsData);

      // Fetch Stats
      const statsRes = await fetch('/api/stats', { headers });
      const statsData = await parseJsonOrThrow(statsRes, 'Failed to fetch stats');
      setStats(statsData);

    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Unauthorized')) {
        onUnauthorized();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all admin data
  useEffect(() => {
    if (isLoggedIn && token) {
      fetchAdminData();
    }
  }, [isLoggedIn, token]);

  return {
    orders,
    setOrders,
    products,
    setProducts,
    stats,
    isLoading,
    fetchAdminData,
  };
}
