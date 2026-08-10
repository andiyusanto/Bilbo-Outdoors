import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom';
import {
  RefreshCw,
  LogOut,
  Package,
  FileText,
  ShoppingBag,
  Settings,
  ClipboardList,
  CheckSquare,
  Users,
  KeyRound,
  Tags,
  BookOpen,
} from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminData } from '../hooks/useAdminData';
import { useOrderActions } from '../hooks/useOrderActions';
import { useProductActions } from '../hooks/useProductActions';
import { useSettingsActions } from '../hooks/useSettingsActions';
import { useJobPriceActions } from '../hooks/useJobPriceActions';
import { useUserActions } from '../hooks/useUserActions';
import { useJobEntryActions } from '../hooks/useJobEntryActions';
import { useApprovalActions } from '../hooks/useApprovalActions';
import { useChangePassword } from '../hooks/useChangePassword';
import AdminLoginScreen from './admin/AdminLoginScreen';
import OverviewTab from './admin/OverviewTab';
import OrdersTab from './admin/OrdersTab';
import InventoryTab from './admin/InventoryTab';
import SettingsTab from './admin/SettingsTab';
import UserTab from './admin/UserTab';
import OperationalTab from './admin/OperationalTab';
import OperationalItemsTab from './admin/OperationalItemsTab';
import ApprovalTab from './admin/ApprovalTab';
import GuideTab from './admin/GuideTab';
import ChangePasswordModal from './admin/ChangePasswordModal';
import bilboIcon from '../assets/bilbo-icon.webp';

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `flex items-center justify-center md:justify-start space-x-2.5 px-4 py-3 border-2 transition-all cursor-pointer rounded-none grow md:grow-0 uppercase tracking-wider text-xs font-black ${
    isActive
      ? 'bg-brand text-black border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]'
      : 'bg-white text-zinc-500 hover:text-black border-zinc-200 hover:bg-zinc-50'
  }`;

export default function AdminPanel() {
  const auth = useAdminAuth();
  const isOwner = auth.role === 'owner';
  const defaultRoute = isOwner ? '/admin/overview' : '/admin/operational';

  const handleLogout = () => {
    auth.handleLogout();
    orderActions.setSelectedOrder(null);
  };

  const data = useAdminData({
    isLoggedIn: auth.isLoggedIn,
    token: auth.token,
    role: auth.role,
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

  const settingsActions = useSettingsActions({
    token: auth.token,
    setSettings: data.setSettings,
  });

  const jobPriceActions = useJobPriceActions({
    token: auth.token,
    fetchAdminData: data.fetchAdminData,
  });

  const userActions = useUserActions({
    token: auth.token,
    fetchAdminData: data.fetchAdminData,
    setUsers: data.setUsers,
  });

  const jobEntryActions = useJobEntryActions({
    token: auth.token,
    fetchAdminData: data.fetchAdminData,
  });

  const approvalActions = useApprovalActions({
    token: auth.token,
    fetchAdminData: data.fetchAdminData,
  });

  const passwordActions = useChangePassword(auth.token, auth.updateSessionToken);

  if (!auth.isLoggedIn) {
    return (
      <AdminLoginScreen
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
          <img src={bilboIcon} alt="" className="w-10 h-10" />
          <div>
            <h1 className="font-display font-black tracking-tighter text-lg uppercase text-white">Bilbo Outdoors Admin</h1>
            <p className="text-[9px] text-brand font-mono tracking-widest uppercase font-bold">Surabaya Basecamp</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={data.fetchAdminData}
            title="Refresh Data"
            className="p-2 bg-zinc-900 border border-zinc-800 text-white hover:bg-brand hover:text-black transition-all cursor-pointer rounded-none"
          >
            <RefreshCw className={`w-4 h-4 ${data.isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => passwordActions.setShowModal(true)}
            title="Ganti Password"
            className="p-2 bg-zinc-900 border border-zinc-800 text-white hover:bg-brand hover:text-black transition-all cursor-pointer rounded-none"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">{auth.displayName || 'Staff Admin Portal'}</p>
            <p className="text-[9px] text-zinc-400 font-mono font-bold uppercase">{isOwner ? 'Owner/Master' : 'Karyawan'}</p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center text-xs font-black uppercase tracking-widest bg-zinc-900 hover:bg-brand hover:text-black border border-zinc-800 text-zinc-300 px-3 py-2 transition-colors cursor-pointer rounded-none"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Logout
          </button>

          <Link
            to="/"
            className="text-xs font-black uppercase tracking-widest bg-brand hover:bg-white text-black px-4 py-2.5 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all cursor-pointer rounded-none"
          >
            Portal Client
          </Link>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-zinc-50 border-r-2 border-black flex flex-row md:flex-col p-4 space-y-0 md:space-y-3 space-x-3 md:space-x-0 overflow-x-auto md:overflow-x-visible shrink-0">
          {isOwner && (
            <NavLink to="/admin/overview" className={NAV_LINK_CLASS}>
              <Package className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Overview</span>
            </NavLink>
          )}

          <NavLink to="/admin/orders" className={NAV_LINK_CLASS}>
            <FileText className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Manajemen Order</span>
            {data.orders.filter(o => o.status === 'Pending').length > 0 && (
              <span className="ml-auto bg-red-600 text-white font-mono font-black text-[10px] w-5 h-5 rounded-none flex items-center justify-center border border-black animate-bounce">
                {data.orders.filter(o => o.status === 'Pending').length}
              </span>
            )}
          </NavLink>

          <NavLink to="/admin/inventory" className={NAV_LINK_CLASS}>
            <ShoppingBag className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Manajemen Stok</span>
          </NavLink>

          <NavLink to="/admin/operational" className={NAV_LINK_CLASS}>
            <ClipboardList className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Operational</span>
          </NavLink>

          {isOwner && (
            <NavLink to="/admin/approval" className={NAV_LINK_CLASS}>
              <CheckSquare className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Approval</span>
              {data.jobEntries.filter(e => e.status === 'Pending').length > 0 && (
                <span className="ml-auto bg-red-600 text-white font-mono font-black text-[10px] w-5 h-5 rounded-none flex items-center justify-center border border-black animate-bounce">
                  {data.jobEntries.filter(e => e.status === 'Pending').length}
                </span>
              )}
            </NavLink>
          )}

          {isOwner && (
            <NavLink to="/admin/operational-items" className={NAV_LINK_CLASS}>
              <Tags className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Item Operasional</span>
            </NavLink>
          )}

          {isOwner && (
            <NavLink to="/admin/settings" className={NAV_LINK_CLASS}>
              <Settings className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Pengaturan</span>
            </NavLink>
          )}

          {isOwner && (
            <NavLink to="/admin/users" className={NAV_LINK_CLASS}>
              <Users className="w-4 h-4 text-black stroke-[2.5]" />
              <span>User</span>
            </NavLink>
          )}

          <NavLink to="/admin/panduan" className={NAV_LINK_CLASS}>
            <BookOpen className="w-4 h-4 text-black stroke-[2.5]" />
            <span>Panduan</span>
          </NavLink>
        </aside>

        {/* Workspace */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Routes>
            <Route index element={<Navigate to={defaultRoute} replace />} />
            {isOwner && (
              <Route
                path="overview"
                element={<OverviewTab stats={data.stats} orders={data.orders} products={data.products} />}
              />
            )}
            <Route
              path="orders"
              element={<OrdersTab orders={data.orders} products={data.products} orderActions={orderActions} />}
            />
            <Route
              path="inventory"
              element={<InventoryTab products={data.products} productActions={productActions} />}
            />
            <Route
              path="operational"
              element={<OperationalTab jobEntries={data.jobEntries} jobPriceList={data.jobPriceList} jobEntryActions={jobEntryActions} />}
            />
            {isOwner && (
              <Route
                path="approval"
                element={<ApprovalTab jobEntries={data.jobEntries} approvalActions={approvalActions} />}
              />
            )}
            {isOwner && (
              <Route
                path="operational-items"
                element={<OperationalItemsTab jobPriceList={data.jobPriceList} jobPriceActions={jobPriceActions} products={data.products} />}
              />
            )}
            {isOwner && (
              <Route
                path="settings"
                element={<SettingsTab settings={data.settings} settingsActions={settingsActions} />}
              />
            )}
            {isOwner && (
              <Route
                path="users"
                element={<UserTab users={data.users} userActions={userActions} currentDisplayName={auth.displayName} />}
              />
            )}
            <Route path="panduan" element={<GuideTab />} />
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </main>
      </div>

      {passwordActions.showModal && (
        <ChangePasswordModal passwordActions={passwordActions} />
      )}
    </div>
  );
}
