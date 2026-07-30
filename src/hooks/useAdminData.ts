import { useState, useEffect } from 'react';
import { Product, Order, DashboardStats, StoreSettings } from '../types';
import { authHeaders, parseJsonOrThrow } from '../lib/api';

interface UseAdminDataParams {
  isLoggedIn: boolean;
  token: string;
  onUnauthorized: () => void;
}

const DEFAULT_SETTINGS: StoreSettings = {
  lateToleranceHours: 4,
  operatingHours: {
    monday: { open: '09:00', close: '22:00' },
    tuesday: { open: '09:00', close: '22:00' },
    wednesday: { open: '09:00', close: '22:00' },
    thursday: { open: '09:00', close: '22:00' },
    friday: { open: '09:00', close: '22:00' },
    saturday: { open: '09:00', close: '22:00' },
    sunday: { open: '09:00', close: '22:00' },
  },
};

export function useAdminData({ isLoggedIn, token, onUnauthorized }: UseAdminDataParams) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activeRentalsCount: 0,
    totalRevenue: 0,
    dueTodayCount: 0,
  });
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
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

      // Fetch Settings
      const settingsRes = await fetch('/api/settings', { headers });
      const settingsData = await parseJsonOrThrow(settingsRes, 'Failed to fetch settings');
      setSettings(settingsData);

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
    settings,
    setSettings,
    isLoading,
    fetchAdminData,
  };
}
