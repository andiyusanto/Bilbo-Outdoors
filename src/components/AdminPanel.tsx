import { useState } from 'react';
import {
  Palette,
  RefreshCw,
  LogOut,
  Package,
  FileText,
  ShoppingBag,
} from 'lucide-react';
import { THEMES } from '../themes';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminData } from '../hooks/useAdminData';
import { useOrderActions } from '../hooks/useOrderActions';
import { useProductActions } from '../hooks/useProductActions';
import AdminLoginScreen from './admin/AdminLoginScreen';
import OverviewTab from './admin/OverviewTab';
import OrdersTab from './admin/OrdersTab';
import InventoryTab from './admin/InventoryTab';

interface AdminPanelProps {
  onClose: () => void;
  themeId: string;
  setThemeId: (id: string) => void;
}

export default function AdminPanel({ onClose, themeId, setThemeId }: AdminPanelProps) {
  const auth = useAdminAuth();

  const handleLogout = () => {
    auth.handleLogout();
    orderActions.setSelectedOrder(null);
  };

  const data = useAdminData({
    isLoggedIn: auth.isLoggedIn,
    token: auth.token,
    onUnauthorized: handleLogout,
  });

  const orderActions = useOrderActions({
    token: auth.token,
    setOrders: data.setOrders,
    fetchAdminData: data.fetchAdminData,
  });

  const productActions = useProductActions({
    token: auth.token,
    fetchAdminData: data.fetchAdminData,
    setProducts: data.setProducts,
  });

  // UI Control State
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory'>('overview');

  if (!auth.isLoggedIn) {
    return (
      <AdminLoginScreen
        onClose={onClose}
        usernameInput={auth.usernameInput}
        setUsernameInput={auth.setUsernameInput}
        passwordInput={auth.passwordInput}
        setPasswordInput={auth.setPasswordInput}
        loginError={auth.loginError}
        handleLogin={auth.handleLogin}
      />
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
            onClick={data.fetchAdminData}
            title="Refresh Data"
            className="p-2 bg-zinc-900 border border-zinc-800 text-white hover:bg-brand hover:text-black transition-all cursor-pointer rounded-none"
          >
            <RefreshCw className={`w-4 h-4 ${data.isLoading ? 'animate-spin' : ''}`} />
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
            {data.orders.filter(o => o.status === 'Pending').length > 0 && (
              <span className="ml-auto bg-red-600 text-white font-mono font-black text-[10px] w-5 h-5 rounded-none flex items-center justify-center border border-black animate-bounce">
                {data.orders.filter(o => o.status === 'Pending').length}
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
          {activeTab === 'overview' && (
            <OverviewTab stats={data.stats} orders={data.orders} products={data.products} />
          )}

          {activeTab === 'orders' && (
            <OrdersTab orders={data.orders} orderActions={orderActions} />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab products={data.products} productActions={productActions} />
          )}
        </main>
      </div>
    </div>
  );
}
