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

  // Shared shape behind every fetch* below: GET a URL, hand the parsed body
  // to a setter, and on failure log + (for authenticated requests) trigger
  // onUnauthorized on a 401 - factored out since all 7 admin-data fetches
  // repeated this identically. `auth: false` is only for /api/products,
  // the one public endpoint in this set (no headers, no 401 handling).
  const fetchResource = async <T,>(
    url: string,
    setter: (data: T) => void,
    errorLabel: string,
    options?: { auth?: boolean }
  ) => {
    const auth = options?.auth ?? true;
    try {
      const res = auth ? await fetch(url, { headers: authHeaders(token) }) : await fetch(url);
      const data = auth ? await parseJsonOrThrow(res, errorLabel) : await res.json();
      setter(data);
    } catch (err: any) {
      console.error(err);
      if (auth && err.message.includes('Unauthorized')) {
        onUnauthorized();
      }
    }
  };

  // Narrow refresh for just the Overview stats - the only cached value that
  // an order write can change without already being returned by that write's
  // own response (stats is a server-computed aggregate over db.orders, see
  // server.ts's GET /api/stats). Used after order mutations instead of a full
  // fetchAdminData() so a status/payment/penalty change doesn't also
  // re-download products/job-prices/job-entries/users/settings.
  const fetchStats = async () => {
    if (role !== 'owner') return;
    await fetchResource<DashboardStats>('/api/stats', setStats, 'Failed to fetch stats');
  };

  // Narrow refresh for just the orders list - polled periodically below
  // instead of on every mutation. Since mutation hooks no longer call the
  // full fetchAdminData() as a side effect, a brand-new customer order
  // (placed via the public portal, not any admin action) needs its own way
  // to surface without the admin having to notice and click "Refresh Data"
  // manually - a flat-rate poll of this one lightweight endpoint is far
  // cheaper than the old "refetch everything on every admin write" pattern.
  const fetchOrders = async () => fetchResource<OrderListItem[]>('/api/orders', setOrders, 'Failed to fetch orders');

  const fetchProducts = async () => fetchResource<Product[]>('/api/products', setProducts, 'Failed to fetch products', { auth: false });

  const fetchJobPriceList = async () => fetchResource<JobPriceListItem[]>('/api/job-prices', setJobPriceList, 'Failed to fetch job prices');

  // Owner + karyawan (server filters to own entries for karyawan).
  const fetchJobEntries = async () => fetchResource<JobEntry[]>('/api/job-entries', setJobEntries, 'Failed to fetch job entries');

  // Owner-only - never fetched as karyawan, avoids a spurious 403 being
  // mistaken for an expired session.
  const fetchSettings = async () => {
    if (role !== 'owner') return;
    await fetchResource<StoreSettings>('/api/settings', setSettings, 'Failed to fetch settings');
  };

  const fetchUsers = async () => {
    if (role !== 'owner') return;
    await fetchResource<PublicUser[]>('/api/users', setUsers, 'Failed to fetch users');
  };

  // Fetches everything the admin panel needs in one shot (login, manual
  // "Refresh Data"). Each entity above is independent of the others, so they
  // run concurrently rather than as a sequential waterfall - awaiting them
  // one at a time was turning N cheap requests into N stacked latencies
  // (measured ~37s total in production for a login that should take a few
  // seconds). Every fetch* function already catches and logs its own errors
  // (including calling onUnauthorized on a 401), so there's nothing left for
  // this function to catch - it just waits for all of them and clears the
  // loading flag.
  const fetchAdminData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchOrders(),
      fetchProducts(),
      fetchJobPriceList(),
      fetchJobEntries(),
      fetchStats(),
      fetchSettings(),
      fetchUsers(),
    ]);
    setIsLoading(false);
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
