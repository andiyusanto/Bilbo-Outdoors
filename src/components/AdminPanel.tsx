import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Calendar, 
  ShoppingBag, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  ChevronRight, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  FileText, 
  ArrowLeft, 
  LogOut, 
  Package, 
  User, 
  Phone, 
  RefreshCw, 
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { Product, Order, OrderStatus, DashboardStats } from '../types';
import { THEMES } from '../themes';
import { Palette } from 'lucide-react';

interface AdminPanelProps {
  onClose: () => void;
  themeId: string;
  setThemeId: (id: string) => void;
}

export default function AdminPanel({ onClose, themeId, setThemeId }: AdminPanelProps) {
  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // Core Data State
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activeRentalsCount: 0,
    totalRevenue: 0,
    dueTodayCount: 0,
  });

  // UI Control State
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory'>('overview');
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Late Fee Calculation Modal/State
  const [showLateCalc, setShowLateCalc] = useState<boolean>(false);
  const [customReturnDate, setCustomReturnDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [lateCalculationResult, setLateCalculationResult] = useState<{
    lateDays: number;
    lateFee: number;
    breakdown: any[];
    actualReturnDate: string;
  } | null>(null);

  // Product CRUD State
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: '',
    category: 'TENT & SHELTER',
    price: 0,
    incrementalPriceAfter5Days: 0,
    stock: 5,
    description: '',
    image: '',
  });

  // Load existing token
  useEffect(() => {
    const savedToken = localStorage.getItem('bilbo_admin_token');
    if (savedToken) {
      setToken(savedToken);
      setIsLoggedIn(true);
    }
  }, []);

  // Fetch all admin data
  useEffect(() => {
    if (isLoggedIn && token) {
      fetchAdminData();
    }
  }, [isLoggedIn, token]);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch Orders
      const ordersRes = await fetch('/api/orders', { headers });
      const ordersData = await ordersRes.json();
      if (!ordersRes.ok) throw new Error(ordersData.error || 'Failed to fetch orders');
      setOrders(ordersData);

      // Fetch Products
      const productsRes = await fetch('/api/products');
      const productsData = await productsRes.json();
      setProducts(productsData);

      // Fetch Stats
      const statsRes = await fetch('/api/stats', { headers });
      const statsData = await statsRes.json();
      if (!statsRes.ok) throw new Error(statsData.error || 'Failed to fetch stats');
      setStats(statsData);

    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Unauthorized')) {
        handleLogout();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }
      localStorage.setItem('bilbo_admin_token', data.token);
      setToken(data.token);
      setIsLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message || 'Error logging in');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bilbo_admin_token');
    setToken('');
    setIsLoggedIn(false);
    setSelectedOrder(null);
  };

  // Order Operations
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const updatedOrder = await res.json();
      if (!res.ok) throw new Error(updatedOrder.error);
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updatedOrder);
      }
      
      // Refresh dashboard stats
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal memperbarui status: ${err.message}`);
    }
  };

  const handleCalculateLateFees = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/calculate-late`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ returnDate: customReturnDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLateCalculationResult(data);
    } catch (err: any) {
      alert(`Gagal menghitung denda: ${err.message}`);
    }
  };

  const handleApplyLateFeesAndComplete = async () => {
    if (!selectedOrder || !lateCalculationResult) return;
    try {
      // 1. Double check order is returned
      await handleUpdateOrderStatus(selectedOrder.id, 'Item Returned/Completed');
      setShowLateCalc(false);
      setLateCalculationResult(null);
      alert('Denda berhasil dihitung dan pesanan diselesaikan!');
    } catch (err: any) {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  };

  // Product Operations (CRUD)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(productFormData)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(editingProduct ? 'Alat camping berhasil diperbarui!' : 'Alat camping baru berhasil ditambahkan!');
      setShowProductModal(false);
      setEditingProduct(null);
      setProductFormData({
        name: '',
        category: 'TENT & SHELTER',
        price: 0,
        incrementalPriceAfter5Days: 0,
        stock: 5,
        description: '',
        image: ''
      });
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menyimpan produk: ${err.message}`);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus alat camping ini?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Alat camping berhasil dihapus!');
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menghapus produk: ${err.message}`);
    }
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    const newStock = Math.max(0, product.stock + delta);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ stock: newStock })
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error);
      setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
    } catch (err: any) {
      alert(`Gagal mengubah stok: ${err.message}`);
    }
  };

  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductFormData({
      name: '',
      category: 'TENT & SHELTER',
      price: 0,
      incrementalPriceAfter5Days: 0,
      stock: 5,
      description: '',
      image: ''
    });
    setShowProductModal(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name,
      category: product.category,
      price: product.price,
      incrementalPriceAfter5Days: product.incrementalPriceAfter5Days,
      stock: product.stock,
      description: product.description || '',
      image: product.image || ''
    });
    setShowProductModal(true);
  };

  // Order Search and Filtering
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerWhatsApp.includes(orderSearch);
    const matchesStatus = orderStatusFilter === 'All' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate some analytics values for visual dashboard charts
  const categoryOrderStats = () => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      o.items.forEach(it => {
        const prod = products.find(p => p.id === it.productId);
        const cat = prod?.category || 'CAMP SUPPORT';
        counts[cat] = (counts[cat] || 0) + it.quantity;
      });
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };

  const orderStatsByStatus = {
    pending: orders.filter(o => o.status === 'Pending').length,
    approved: orders.filter(o => o.status === 'Approved/Paid').length,
    pickedUp: orders.filter(o => o.status === 'Item Picked Up').length,
    completed: orders.filter(o => o.status === 'Item Returned/Completed').length,
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-6 lg:px-8">
        <div className="absolute top-6 left-6">
          <button 
            onClick={onClose}
            className="flex items-center text-xs font-black text-black uppercase tracking-widest hover:bg-black hover:text-brand border-2 border-black px-4 py-2 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all rounded-none cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5 stroke-[2.5]" />
            Kembali ke Portal Rental
          </button>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-brand text-black border-2 border-black flex items-center justify-center font-display font-black text-xl rounded-none shadow-[3px_3px_0px_rgba(0,0,0,1)]">
              BO
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-display font-black tracking-tighter text-black uppercase">
            Staff Admin Login
          </h2>
          <p className="mt-2 text-center text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
            BILBO OUTDOORS SURABAYA
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 border-4 border-black rounded-none shadow-[6px_6px_0px_rgba(0,0,0,1)]">
            {loginError && (
              <div className="mb-4 bg-red-50 border-2 border-red-500 text-red-800 text-xs p-3 rounded-none flex items-start uppercase font-bold">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-red-600 stroke-[2.5]" />
                <span>{loginError}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                  Username
                </label>
                <div className="mt-1 relative">
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="admin"
                    className="block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white text-black uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white text-black uppercase"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex justify-center py-3.5 px-4 border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] text-xs font-black bg-black text-brand hover:bg-brand hover:text-black focus:outline-none transition-colors mt-6 uppercase tracking-widest cursor-pointer"
              >
                <Lock className="w-4 h-4 mr-2" />
                Masuk Sistem Admin
              </button>
            </form>

            <div className="mt-6 border-t border-zinc-200 pt-4 text-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Credentials Default: <strong className="text-zinc-600">admin</strong> / <strong className="text-zinc-600">bilbooutdoor2026</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Admin Navbar */}
      <header className="bg-black text-white px-6 py-4 border-b-4 border-black flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-brand text-black border-2 border-black flex items-center justify-center font-display font-black text-sm rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            BO
          </div>
          <div>
            <h1 className="font-display font-black tracking-tighter text-lg uppercase text-white">Bilbo Outdoors Admin</h1>
            <p className="text-[9px] text-brand font-mono tracking-widest uppercase font-bold">Surabaya Basecamp</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Theme Selector Dropdown */}
          <div className="relative flex items-center">
            <Palette className="w-3.5 h-3.5 text-zinc-450 absolute left-2.5 pointer-events-none stroke-[2.5]" />
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              className="appearance-none bg-zinc-950 text-white text-[9px] font-black uppercase tracking-widest pl-8 pr-7 py-2 border border-zinc-800 rounded-none hover:bg-zinc-900 focus:outline-none cursor-pointer transition-all"
              title="Ganti Tema Visual (Staff)"
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchAdminData}
            title="Refresh Data"
            className="p-2 bg-zinc-900 border border-zinc-800 text-white hover:bg-brand hover:text-black transition-all cursor-pointer rounded-none"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">Staff Admin Portal</p>
            <p className="text-[9px] text-zinc-400 font-mono font-bold uppercase">Session Live</p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center text-xs font-black uppercase tracking-widest bg-zinc-900 hover:bg-brand hover:text-black border border-zinc-800 text-zinc-300 px-3 py-2 transition-colors cursor-pointer rounded-none"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Logout
          </button>

          <button
            onClick={onClose}
            className="text-xs font-black uppercase tracking-widest bg-brand hover:bg-white text-black px-4 py-2.5 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all cursor-pointer rounded-none"
          >
            Portal Client
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-zinc-50 border-r-2 border-black flex flex-row md:flex-col p-4 space-y-0 md:space-y-3 space-x-3 md:space-x-0 overflow-x-auto md:overflow-x-visible shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center justify-center md:justify-start space-x-2.5 px-4 py-3 border-2 transition-all cursor-pointer rounded-none grow md:grow-0 uppercase tracking-wider text-xs font-black ${
              activeTab === 'overview' 
                ? 'bg-brand text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]' 
                : 'bg-white text-zinc-500 hover:text-black border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <Package className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center justify-center md:justify-start space-x-2.5 px-4 py-3 border-2 transition-all cursor-pointer rounded-none grow md:grow-0 uppercase tracking-wider text-xs font-black ${
              activeTab === 'orders' 
                ? 'bg-brand text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]' 
                : 'bg-white text-zinc-500 hover:text-black border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <FileText className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Manajemen Order</span>
            {orders.filter(o => o.status === 'Pending').length > 0 && (
              <span className="ml-auto bg-red-600 text-white font-mono font-black text-[10px] w-5 h-5 rounded-none flex items-center justify-center border border-black animate-bounce">
                {orders.filter(o => o.status === 'Pending').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center justify-center md:justify-start space-x-2.5 px-4 py-3 border-2 transition-all cursor-pointer rounded-none grow md:grow-0 uppercase tracking-wider text-xs font-black ${
              activeTab === 'inventory' 
                ? 'bg-brand text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]' 
                : 'bg-white text-zinc-500 hover:text-black border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Manajemen Stok</span>
          </button>
        </aside>

        {/* Workspace */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-black pb-4">
                <div>
                  <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">STATISTIK PENYEWAAN</h2>
                  <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Ringkasan transaksi dan inventaris Bilbo Outdoors saat ini.</p>
                </div>
                <div className="text-xs text-zinc-500 font-mono font-black uppercase mt-1 sm:mt-0 bg-brand/15 px-3 py-1 border border-black">
                  LIVE UPDATES
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  <div className="w-12 h-12 bg-zinc-100 text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <Clock className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sewa Aktif</p>
                    <p className="text-2xl font-display font-black text-black mt-0.5">{stats.activeRentalsCount} Transaksi</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Approved & Picked Up</p>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  <div className="w-12 h-12 bg-brand text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <DollarSign className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Omset</p>
                    <p className="text-2xl font-display font-black text-black mt-0.5">Rp {stats.totalRevenue.toLocaleString('id-ID')}</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Termasuk Denda Late-Return</p>
                  </div>
                </div>

                <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-black text-brand border-l border-b border-black px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider">DUE TODAY</div>
                  <div className="w-12 h-12 bg-zinc-100 text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <Calendar className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Jatuh Tempo Hari Ini</p>
                    <p className="text-2xl font-display font-black text-black mt-0.5">{stats.dueTodayCount} Barang</p>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Harus Dikembalikan</p>
                  </div>
                </div>
              </div>

              {/* Dashboard Content Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Custom Progress Bar Chart representing order statuses */}
                <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  <h3 className="font-display font-black text-black text-sm mb-5 uppercase tracking-wide border-b-2 border-brand pb-2">Distribusi Status Pesanan</h3>
                  <div className="space-y-4">
                    {/* Progress Bar 1 */}
                    <div>
                      <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                        <span className="flex items-center"><span className="w-2.5 h-2.5 bg-amber-400 border border-black rounded-none mr-2"></span>Pending</span>
                        <span className="font-mono">{orderStatsByStatus.pending} ({orders.length ? Math.round((orderStatsByStatus.pending / orders.length) * 100) : 0}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                        <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${orders.length ? (orderStatsByStatus.pending / orders.length) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    {/* Progress Bar 2 */}
                    <div>
                      <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                        <span className="flex items-center"><span className="w-2.5 h-2.5 bg-brand border border-black rounded-none mr-2"></span>Approved / Paid</span>
                        <span className="font-mono">{orderStatsByStatus.approved} ({orders.length ? Math.round((orderStatsByStatus.approved / orders.length) * 100) : 0}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                        <div className="bg-brand h-full transition-all duration-500" style={{ width: `${orders.length ? (orderStatsByStatus.approved / orders.length) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    {/* Progress Bar 3 */}
                    <div>
                      <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                        <span className="flex items-center"><span className="w-2.5 h-2.5 bg-black rounded-none mr-2"></span>Item Picked Up</span>
                        <span className="font-mono">{orderStatsByStatus.pickedUp} ({orders.length ? Math.round((orderStatsByStatus.pickedUp / orders.length) * 100) : 0}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                        <div className="bg-black h-full transition-all duration-500" style={{ width: `${orders.length ? (orderStatsByStatus.pickedUp / orders.length) * 100 : 0}%` }}></div>
                      </div>
                    </div>

                    {/* Progress Bar 4 */}
                    <div>
                      <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                        <span className="flex items-center"><span className="w-2.5 h-2.5 bg-zinc-400 border border-black rounded-none mr-2"></span>Returned / Completed</span>
                        <span className="font-mono">{orderStatsByStatus.completed} ({orders.length ? Math.round((orderStatsByStatus.completed / orders.length) * 100) : 0}%)</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                        <div className="bg-zinc-400 h-full transition-all duration-500" style={{ width: `${orders.length ? (orderStatsByStatus.completed / orders.length) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Popular categories visual representation */}
                <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  <h3 className="font-display font-black text-black text-sm mb-4 uppercase tracking-wide border-b-2 border-brand pb-2">Peralatan Terlaris Disewa</h3>
                  {categoryOrderStats().length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center">
                      <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Belum ada data barang disewa.</p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {categoryOrderStats().sort((a,b) => b.value - a.value).slice(0, 4).map((cat, i) => (
                        <div key={i} className="flex items-center justify-between uppercase font-bold text-xs text-zinc-800">
                          <div className="flex items-center">
                            <span className="text-xs font-mono font-black text-zinc-400 mr-2.5">0{i+1}</span>
                            <span>{cat.name}</span>
                          </div>
                          <span className="text-xs font-black text-black bg-brand/20 border border-black px-2.5 py-0.5 rounded-none font-mono">{cat.value} Unit</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b-2 border-black pb-4">
                <div>
                  <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">MANAJEMEN ORDER MASUK</h2>
                  <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Kelola konfirmasi pembayaran, pengambilan barang, denda keterlambatan, dan pengembalian.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-black absolute left-3 top-3.5 stroke-[2.5]" />
                    <input
                      type="text"
                      placeholder="CARI NAMA / WHATSAPP..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-9 pr-4 py-2.5 text-xs bg-white border-2 border-black rounded-none focus:bg-brand/10 focus:outline-none w-full sm:w-48 font-black uppercase tracking-wider"
                    />
                  </div>

                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="bg-white border-2 border-black rounded-none px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
                  >
                    <option value="All">SEMUA STATUS</option>
                    <option value="Pending">PENDING</option>
                    <option value="Approved/Paid">APPROVED/PAID</option>
                    <option value="Item Picked Up">ITEM PICKED UP</option>
                    <option value="Item Returned/Completed">RETURNED/COMPLETED</option>
                  </select>
                </div>
              </div>

              {/* Order List Table */}
              <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b-2 border-black">
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Penyewa / WhatsApp</th>
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Tanggal Sewa</th>
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Durasi</th>
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Total Biaya</th>
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-xs text-zinc-500 font-bold uppercase tracking-wider">
                            Belum ada pesanan penyewaan camping yang cocok.
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-brand/5 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-black text-black text-xs uppercase">{order.customerName}</p>
                              <p className="text-[10px] text-zinc-500 font-mono font-bold mt-0.5">{order.customerWhatsApp}</p>
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-xs text-zinc-800 font-bold uppercase">
                                <span>{order.startDate}</span>
                                <span className="text-zinc-400 mx-1.5 font-mono">s/d</span>
                                <span>{order.endDate}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs font-mono font-black text-black">
                              {order.rentDuration} HARI
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-xs font-black text-black font-mono">
                                Rp {order.totalPrice.toLocaleString('id-ID')}
                              </p>
                              {order.lateFee && order.lateFee > 0 ? (
                                <p className="text-[9px] font-black text-red-700 bg-red-50 border border-red-500 inline-block px-1.5 py-0.5 mt-1 uppercase">
                                  + DENDA: Rp {order.lateFee.toLocaleString('id-ID')} ({order.lateDays} hari)
                                </p>
                              ) : null}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2 py-1 text-[9px] font-black uppercase tracking-wider border-2 border-black rounded-none ${
                                order.status === 'Pending' ? 'bg-amber-400 text-black' :
                                order.status === 'Approved/Paid' ? 'bg-brand text-black' :
                                order.status === 'Item Picked Up' ? 'bg-black text-white' :
                                'bg-zinc-200 text-zinc-800'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="text-xs font-black uppercase tracking-widest text-black hover:bg-black hover:text-brand bg-zinc-100 px-3 py-2 rounded-none border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all cursor-pointer inline-flex items-center"
                              >
                                Detail Order
                                <ChevronRight className="w-3.5 h-3.5 ml-1 stroke-[2.5]" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Detail Side Sheet / Modal */}
              {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-end transition-opacity">
                  <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl relative overflow-hidden">
                    
                    {/* Detail Header */}
                    <div className="bg-black text-white p-5 flex justify-between items-center border-b-4 border-black">
                      <div>
                        <span className="text-[9px] bg-brand text-black font-mono px-2 py-0.5 border border-black font-black uppercase tracking-wider">DETAIL PESANAN</span>
                        <h3 className="font-display font-black text-lg mt-1 uppercase tracking-tight">{selectedOrder.customerName}</h3>
                      </div>
                      <button 
                        onClick={() => { setSelectedOrder(null); setShowLateCalc(false); setLateCalculationResult(null); }}
                        className="text-black hover:text-white bg-brand hover:bg-black text-xs font-black font-mono border-2 border-black px-4 py-2 transition-all cursor-pointer rounded-none"
                      >
                        TUTUP
                      </button>
                    </div>

                    {/* Detail Body */}
                    <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-white text-black">
                      
                      {/* Customer & Booking Dates */}
                      <div className="bg-zinc-50 border-2 border-black p-4 rounded-none space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">No. WhatsApp</p>
                            <p className="text-xs font-black text-black mt-1 flex items-center">
                              <Phone className="w-3.5 h-3.5 mr-1.5 text-black stroke-[2.5]" />
                              {selectedOrder.customerWhatsApp}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Dibuat Pada</p>
                            <p className="text-xs text-black font-bold mt-1 uppercase">
                              {new Date(selectedOrder.createdAt).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="border-t-2 border-black pt-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Jadwal Sewa</p>
                            <p className="text-xs text-black mt-1 font-black uppercase">
                              {selectedOrder.startDate} s/d {selectedOrder.endDate}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Total Durasi</p>
                            <p className="text-xs text-black mt-1 font-black font-mono">
                              {selectedOrder.rentDuration} HARI
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Item Details */}
                      <div>
                        <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2.5">Rincian Peralatan Rented</h4>
                        <div className="border-2 border-black rounded-none overflow-hidden divide-y-2 divide-black bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                          {selectedOrder.items.map((item, index) => (
                            <div key={index} className="p-3.5 flex items-center justify-between hover:bg-brand/5">
                              <div>
                                <p className="text-xs font-black text-black uppercase">{item.productName}</p>
                                <p className="text-[10px] text-zinc-600 font-bold uppercase mt-1">
                                  Rp {item.pricePerDay.toLocaleString('id-ID')}/hari 
                                  {item.incrementalPrice > 0 ? ` (+Rp ${item.incrementalPrice.toLocaleString('id-ID')}/hari setelah 5 hari)` : ''}
                                </p>
                              </div>
                              <span className="text-xs font-black bg-brand/10 border-2 border-black px-2.5 py-1 rounded-none font-mono text-black">
                                {item.quantity} UNIT
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Payment Detail Status bar */}
                      <div className="border-2 border-black p-4 rounded-none space-y-4 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                        <div className="flex justify-between items-baseline font-bold text-xs uppercase text-zinc-700">
                          <span>Biaya Rental Pokok ({selectedOrder.rentDuration} Hari):</span>
                          <span className="font-mono text-black font-black">
                            Rp {selectedOrder.totalPrice.toLocaleString('id-ID')}
                          </span>
                        </div>

                        {selectedOrder.lateFee && selectedOrder.lateFee > 0 ? (
                          <div className="flex justify-between items-baseline border-t-2 border-black pt-3 font-bold text-xs uppercase text-red-600">
                            <span>Denda Terlambat ({selectedOrder.lateDays} Hari):</span>
                            <span className="font-mono font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-none">
                              Rp {selectedOrder.lateFee.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : null}

                        <div className="border-t-2 border-dashed border-black pt-3 flex justify-between items-baseline">
                          <span className="text-xs font-black text-black uppercase tracking-wider">Total Invoice:</span>
                          <span className="text-lg font-black text-black font-mono">
                            Rp {((selectedOrder.totalPrice || 0) + (selectedOrder.lateFee || 0)).toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>

                      {/* Photo ID Card Guarantee Render */}
                      <div>
                        <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2 flex items-center">
                          <UserCheck className="w-4 h-4 mr-1.5 text-black stroke-[2.5]" />
                          Kartu Identitas Jaminan (KTP / SIM)
                        </h4>
                        {selectedOrder.idCardBase64 ? (
                          <div className="border-2 border-black rounded-none overflow-hidden bg-zinc-50 p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <img 
                              src={selectedOrder.idCardBase64} 
                              alt="Jaminan Identitas KTP/SIM" 
                              className="w-full max-h-56 object-contain rounded-none"
                            />
                            <p className="text-[9px] text-zinc-500 font-bold uppercase text-center mt-2">Diupload oleh pelanggan sebagai jaminan sewa.</p>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-black rounded-none py-6 text-center text-xs text-zinc-400 font-bold uppercase">
                            Tidak ada KTP diupload (Jaminan fisik langsung di toko).
                          </div>
                        )}
                      </div>

                      {/* Action buttons (Advance workflow states) */}
                      <div className="border-t-2 border-black pt-5 space-y-3">
                        <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Alur Kerja Sewa</h4>
                        
                        {selectedOrder.status === 'Pending' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'Approved/Paid')}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
                          >
                            Konfirmasi Pembayaran (Setujui Sewa)
                          </button>
                        )}

                        {selectedOrder.status === 'Approved/Paid' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'Item Picked Up')}
                            className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
                          >
                            Barang Diambil (Diserahkan ke Penyewa)
                          </button>
                        )}

                        {(selectedOrder.status === 'Item Picked Up' || selectedOrder.status === 'Approved/Paid') && (
                          <div className="border-2 border-black rounded-none p-4 bg-zinc-50 space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-start">
                              <AlertTriangle className="w-4 h-4 text-red-600 mr-2 shrink-0 mt-0.5 stroke-[2.5]" />
                              <div>
                                <p className="text-xs font-black text-black uppercase tracking-wide">Alat Dikembalikan & Cek Denda</p>
                                <p className="text-[10px] text-zinc-600 font-bold uppercase mt-1">Gunakan kalkulator denda keterlambatan jika penyewa telat mengembalikan.</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setShowLateCalc(true);
                                  setLateCalculationResult(null);
                                }}
                                className="flex-1 py-2.5 bg-white border-2 border-black text-black hover:bg-black hover:text-brand font-black text-xs rounded-none transition-all uppercase tracking-wider cursor-pointer"
                              >
                                Kalkulator Denda
                              </button>
                              
                              <button
                                onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'Item Returned/Completed')}
                                className="flex-1 py-2.5 bg-black hover:bg-red-600 text-white font-black text-xs border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-colors uppercase tracking-wider cursor-pointer"
                              >
                                Tanpa Denda
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedOrder.status === 'Item Returned/Completed' && (
                          <div className="bg-zinc-100 border-2 border-black text-black rounded-none p-4 text-center text-xs font-black uppercase tracking-wider flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <CheckCircle className="w-4 h-4 mr-1.5 text-emerald-600 stroke-[2.5]" />
                            Transaksi Selesai & Peralatan Kembali
                          </div>
                        )}
                      </div>

                      {/* LATE RETURN CALCULATOR PANEL */}
                      {showLateCalc && (
                        <div className="border-2 border-black bg-red-50 p-4 rounded-none space-y-4 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                          <h5 className="text-xs font-black text-red-800 uppercase tracking-wider flex items-center">
                            <Clock className="w-4 h-4 mr-2 text-red-600 stroke-[2.5]" />
                            Late Return Calculator
                          </h5>

                          <div className="space-y-2">
                            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                              Pilih Tanggal Pengembalian Aktual
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={customReturnDate}
                                onChange={(e) => setCustomReturnDate(e.target.value)}
                                className="bg-white border-2 border-black px-3 py-2 text-xs font-bold uppercase rounded-none focus:outline-none flex-1"
                              />
                              <button
                                onClick={handleCalculateLateFees}
                                className="bg-red-600 hover:bg-black text-white font-black text-xs border-2 border-black px-5 py-2 rounded-none transition-colors uppercase tracking-widest cursor-pointer"
                              >
                                Hitung
                              </button>
                            </div>
                          </div>

                          {lateCalculationResult && (
                            <div className="bg-white border-2 border-black p-3 rounded-none text-xs space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                              <div className="flex justify-between font-black border-b-2 border-zinc-100 pb-2 text-black uppercase">
                                <span>Keterlambatan:</span>
                                <span className="text-red-700 font-mono font-black">{lateCalculationResult.lateDays} HARI</span>
                              </div>

                              {lateCalculationResult.lateDays > 0 ? (
                                <>
                                  <div className="space-y-2 divide-y border-zinc-100">
                                    {lateCalculationResult.breakdown.map((item: any, idx: number) => (
                                      <div key={idx} className="pt-2 flex justify-between text-[11px] font-bold uppercase">
                                        <div>
                                          <p className="font-black text-black">{item.productName} (x{item.quantity})</p>
                                          <p className="text-[10px] text-zinc-400 font-mono">{item.dailyRateBreakdown}</p>
                                        </div>
                                        <span className="font-black text-black font-mono">Rp {item.itemTotalLateCost.toLocaleString('id-ID')}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="border-t-2 border-black pt-2.5 flex justify-between font-black text-red-700 bg-red-50 border-2 border-red-200 px-3 py-2 rounded-none">
                                    <span>TOTAL DENDA:</span>
                                    <span className="font-mono">Rp {lateCalculationResult.lateFee.toLocaleString('id-ID')}</span>
                                  </div>

                                  <button
                                    onClick={handleApplyLateFeesAndComplete}
                                    className="w-full py-3 bg-red-600 hover:bg-black text-white font-black text-xs border-2 border-black rounded-none shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-colors uppercase tracking-widest cursor-pointer"
                                  >
                                    Terapkan Denda & Selesaikan Sewa
                                  </button>
                                </>
                              ) : (
                                <p className="text-[11px] text-emerald-600 font-black uppercase text-center py-2">Tidak telat mengembalikan! Tidak ada denda.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INVENTORY TAB */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">KELOLA ALAT CAMPING</h2>
                  <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Sesuaikan persediaan fisik, harga sewa, dan jenis peralatan outdoor.</p>
                </div>

                <button
                  onClick={openAddProductModal}
                  className="bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all flex items-center self-start sm:self-auto uppercase tracking-widest cursor-pointer"
                >
                  <Plus className="w-4 h-4 mr-2 stroke-[3]" />
                  Tambah Alat Camping
                </button>
              </div>

              {/* Grid of Products */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-xs text-zinc-400 font-bold uppercase border-2 border-black bg-zinc-50">
                    Stok alat camping kosong.
                  </div>
                ) : (
                  products.map((prod) => (
                    <div key={prod.id} className="bg-white border-2 border-black p-5 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4 flex flex-col justify-between">
                      <div>
                        {/* Title and category */}
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-mono font-black bg-brand/20 text-black px-2 py-0.5 border border-black uppercase">
                            {prod.category}
                          </span>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => openEditProductModal(prod)}
                              title="Edit"
                              className="p-1.5 hover:bg-brand/20 border border-transparent hover:border-black rounded-none text-zinc-500 hover:text-black transition-all cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod.id)}
                              title="Hapus"
                              className="p-1.5 hover:bg-red-500 hover:text-white border border-transparent hover:border-black rounded-none text-zinc-500 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>

                        <h3 className="font-display font-black text-sm text-black uppercase mt-3">{prod.name}</h3>
                        {prod.description && (
                          <p className="text-[11px] text-zinc-600 font-bold uppercase mt-1.5 line-clamp-2">{prod.description}</p>
                        )}
                      </div>

                      {/* Financial info & stock controls */}
                      <div className="border-t-2 border-black pt-3.5 space-y-3">
                        <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase">
                          <span>Sewa Pokok:</span>
                          <strong className="text-black font-mono font-black">Rp {prod.price.toLocaleString('id-ID')}/hari</strong>
                        </div>

                        {prod.incrementalPriceAfter5Days > 0 ? (
                          <div className="flex justify-between text-xs font-bold text-red-600 uppercase">
                            <span>Sewa {'>'}5 hari:</span>
                            <strong className="font-mono font-black">Rp {(prod.price + prod.incrementalPriceAfter5Days).toLocaleString('id-ID')}/hari</strong>
                          </div>
                        ) : null}

                        {/* Physical Stock Controls */}
                        <div className="flex justify-between items-center bg-zinc-50 px-3 py-2 border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                          <span className="text-xs font-black text-black uppercase tracking-wider">Stok Inventaris:</span>
                          <div className="flex items-center space-x-2.5">
                            <button
                              onClick={() => handleAdjustStock(prod, -1)}
                              className="w-7 h-7 border-2 border-black bg-white hover:bg-brand font-black text-xs flex items-center justify-center transition-all cursor-pointer rounded-none"
                            >
                              -
                            </button>
                            <span className="text-xs font-mono font-black text-black w-6 text-center">{prod.stock}</span>
                            <button
                              onClick={() => handleAdjustStock(prod, 1)}
                              className="w-7 h-7 border-2 border-black bg-white hover:bg-brand font-black text-xs flex items-center justify-center transition-all cursor-pointer rounded-none"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add / Edit Product Modal */}
              {showProductModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
                    <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
                      <h3 className="font-display font-black text-sm uppercase tracking-wider">
                        {editingProduct ? 'EDIT ALAT CAMPING' : 'TAMBAH ALAT CAMPING BARU'}
                      </h3>
                      <button 
                        onClick={() => setShowProductModal(false)}
                        className="text-brand hover:text-white font-mono font-black text-xs uppercase"
                      >
                        CLOSE
                      </button>
                    </div>

                    <form onSubmit={handleSaveProduct} className="p-5 space-y-4 bg-white text-black">
                      <div>
                        <label className="block text-xs font-black text-black uppercase">Nama Alat</label>
                        <input
                          type="text"
                          required
                          value={productFormData.name}
                          onChange={(e) => setProductFormData({...productFormData, name: e.target.value})}
                          placeholder="CONTOH: COMPASS UL 2P"
                          className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-black text-black uppercase">Kategori</label>
                        <select
                          value={productFormData.category}
                          onChange={(e) => setProductFormData({...productFormData, category: e.target.value})}
                          className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
                        >
                          <option value="TENT & SHELTER">TENT & SHELTER</option>
                          <option value="SLEEPING SYSTEM">SLEEPING SYSTEM</option>
                          <option value="CARRIER & BACKPACK">CARRIER & BACKPACK</option>
                          <option value="COOKING GEAR">COOKING GEAR</option>
                          <option value="LIGHTING & POWER">LIGHTING & POWER</option>
                          <option value="HIKING ESSENTIALS">HIKING ESSENTIALS</option>
                          <option value="CAMP SUPPORT">CAMP SUPPORT</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-black text-black uppercase">Sewa Pokok (/Hari)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={productFormData.price}
                            onChange={(e) => setProductFormData({...productFormData, price: Number(e.target.value)})}
                            className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-black uppercase">Naik Setlah 5 Hari</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={productFormData.incrementalPriceAfter5Days}
                            onChange={(e) => setProductFormData({...productFormData, incrementalPriceAfter5Days: Number(e.target.value)})}
                            className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-black text-black uppercase">Stok Awal</label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={productFormData.stock}
                            onChange={(e) => setProductFormData({...productFormData, stock: Number(e.target.value)})}
                            className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-black uppercase">Gambar (Opsional URL)</label>
                          <input
                            type="text"
                            value={productFormData.image}
                            onChange={(e) => setProductFormData({...productFormData, image: e.target.value})}
                            placeholder="https://..."
                            className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-black uppercase">Deskripsi</label>
                        <textarea
                          rows={2}
                          value={productFormData.description}
                          onChange={(e) => setProductFormData({...productFormData, description: e.target.value})}
                          placeholder="SPESIFIKASI BERAT, KAPASITAS, DLL."
                          className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none"
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
                      >
                        Simpan Alat Camping
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
