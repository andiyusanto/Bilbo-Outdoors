import { Clock, DollarSign, Calendar } from 'lucide-react';
import { Order, Product, DashboardStats } from '../../types';

interface OverviewTabProps {
  stats: DashboardStats;
  orders: Order[];
  products: Product[];
}

export default function OverviewTab({ stats, orders, products }: OverviewTabProps) {
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

  return (
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
  );
}
