import { useState, useEffect } from 'react';
import { Product, OrderListItem, DashboardStats, StoreSettings, PublicUser, JobPriceListItem, JobEntry, UserRole } from '../types';
import { authHeaders, parseJsonOrThrow } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';

interface UseAdminDataParams {
  isLoggedIn: boolean;
  token: string;
  role: UserRole | '';
  onUnauthorized: () => void;
}

const DEFAULT_SETTINGS: StoreSettings = {
  lateToleranceHours: 4,
  pendingExpiryHours: 2,
  operatingHours: {
    monday: { open: '09:00', close: '22:00' },
    tuesday: { open: '09:00', close: '22:00' },
    wednesday: { open: '09:00', close: '22:00' },
    thursday: { open: '09:00', close: '22:00' },
    friday: { open: '09:00', close: '22:00' },
    saturday: { open: '09:00', close: '22:00' },
    sunday: { open: '09:00', close: '22:00' },
  },
  footer: {
    description: '',
    address: '',
    instagramHandle: '',
    instagramUrl: '',
    whatsappText: '',
    copyrightText: '',
  },
  runningText: [],
};

export function useAdminData({ isLoggedIn, token, role, onUnauthorized }: UseAdminDataParams) {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
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
  const { withLoading } = useLoading();

  // Narrow refresh for just the Overview stats - the only cached value that
  // an order write can change without already being returned by that write's
  // own response (stats is a server-computed aggregate over db.orders, see
  // server.ts's GET /api/stats). Used after order mutations instead of a full
  // fetchAdminData() so a status/payment/penalty change doesn't also
  // re-download products/job-prices/job-entries/users/settings.
  const fetchStats = async () => {
    if (role !== 'owner') return;
    try {
      const res = await fetch('/api/stats', { headers: authHeaders(token) });
      const data = await parseJsonOrThrow(res, 'Failed to fetch stats');
      setStats(data);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Unauthorized')) {
        onUnauthorized();
      }
    }
  };

  // Narrow refresh for just the orders list - polled periodically below
  // instead of on every mutation. Since mutation hooks no longer call the
  // full fetchAdminData() as a side effect, a brand-new customer order
  // (placed via the public portal, not any admin action) needs its own way
  // to surface without the admin having to notice and click "Refresh Data"
  // manually - a flat-rate poll of this one lightweight endpoint is far
  // cheaper than the old "refetch everything on every admin write" pattern.
  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders', { headers: authHeaders(token) });
      const data = await parseJsonOrThrow(res, 'Failed to fetch orders');
      setOrders(data);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Unauthorized')) {
        onUnauthorized();
      }
    }
  };

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const headers = authHeaders(token);

      // Fetch Orders (owner + karyawan)
      await fetchOrders();

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
      await fetchStats();
      if (role === 'owner') {
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

  // Fetch all admin data once on login. Mutation hooks patch their own slice
  // of state directly from each write's response instead of re-calling this -
  // fetchAdminData now only runs here and from the manual "Refresh Data"
  // button, both already wrapped in their own withLoading scope.
  useEffect(() => {
    if (isLoggedIn && token) {
      withLoading(fetchAdminData);
    }
  }, [isLoggedIn, token]);

  // Keep the orders list eventually-fresh without polling everything else -
  // see fetchOrders' comment above. 60s bounds the worst case ("how stale can
  // a new order be before it's visible") to something reasonable for a
  // walk-in pickup workflow, at a flat, predictable request rate.
  const ORDERS_POLL_INTERVAL_MS = 60000;
  useEffect(() => {
    if (!isLoggedIn || !token) return;
    const interval = setInterval(fetchOrders, ORDERS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
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
    fetchStats,
  };
}
