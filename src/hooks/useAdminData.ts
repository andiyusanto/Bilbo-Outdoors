import { useState, useEffect } from 'react';
import { Product, Order, DashboardStats, StoreSettings, PublicUser, JobPriceListItem, JobEntry, UserRole } from '../types';
import { authHeaders, parseJsonOrThrow } from '../lib/api';

interface UseAdminDataParams {
  isLoggedIn: boolean;
  token: string;
  role: UserRole | '';
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

export function useAdminData({ isLoggedIn, token, role, onUnauthorized }: UseAdminDataParams) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activeRentalsCount: 0,
    totalRevenue: 0,
    dueTodayCount: 0,
  });
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [jobPriceList, setJobPriceList] = useState<JobPriceListItem[]>([]);
  const [jobEntries, setJobEntries] = useState<JobEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const headers = authHeaders(token);

      // Fetch Orders (owner + karyawan)
      const ordersRes = await fetch('/api/orders', { headers });
      const ordersData = await parseJsonOrThrow(ordersRes, 'Failed to fetch orders');
      setOrders(ordersData);

      // Fetch Products (public)
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();
      setProducts(productsData);

      // Fetch Job Price List (owner + karyawan - karyawan needs it for the Operational form)
      const jobPricesRes = await fetch('/api/job-prices', { headers });
      const jobPricesData = await parseJsonOrThrow(jobPricesRes, 'Failed to fetch job prices');
      setJobPriceList(jobPricesData);

      // Fetch Job Entries (owner + karyawan - server filters to own entries for karyawan)
      const jobEntriesRes = await fetch('/api/job-entries', { headers });
      const jobEntriesData = await parseJsonOrThrow(jobEntriesRes, 'Failed to fetch job entries');
      setJobEntries(jobEntriesData);

      // Owner-only data - never fetched as karyawan, avoids a spurious 403
      // being mistaken for an expired session (see onUnauthorized below).
      if (role === 'owner') {
        const statsRes = await fetch('/api/stats', { headers });
        const statsData = await parseJsonOrThrow(statsRes, 'Failed to fetch stats');
        setStats(statsData);

        const settingsRes = await fetch('/api/settings', { headers });
        const settingsData = await parseJsonOrThrow(settingsRes, 'Failed to fetch settings');
        setSettings(settingsData);

        const usersRes = await fetch('/api/users', { headers });
        const usersData = await parseJsonOrThrow(usersRes, 'Failed to fetch users');
        setUsers(usersData);
      }

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
    users,
    setUsers,
    jobPriceList,
    setJobPriceList,
    jobEntries,
    setJobEntries,
    isLoading,
    fetchAdminData,
  };
}
