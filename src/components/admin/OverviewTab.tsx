import { useState } from 'react';
import { Clock, DollarSign, Calendar, ChevronDown } from 'lucide-react';
import { OrderListItem, Product, DashboardStats } from '../../types';
import { getDefaultDateRange, getTodayDateString } from '../../lib/date';
import { getAmountPaid, getRemainingBalance } from '../../pricing';
import DateInput from '../DateInput';

interface OverviewTabProps {
  stats: DashboardStats;
  orders: OrderListItem[];
  products: Product[];
}

export default function OverviewTab({ orders, products }: OverviewTabProps) {
  const [overviewDateFrom, setOverviewDateFrom] = useState<string>(() => getDefaultDateRange().from);
  const [overviewDateTo, setOverviewDateTo] = useState<string>(() => getDefaultDateRange().to);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Every KPI/chart below is derived from this, not the raw `orders` prop, so
  // the Dari/Sampai range (by order.createdAt, i.e. Tanggal Pemesanan - same
  // field Manajemen Order filters by and expireStaleOrders in server.ts uses)
  // governs everything on this tab. Date-portion via plain string split, not
  // `new Date(...)`, matching lib/date.ts's getTodayDateString convention.
  const dateFilteredOrders = orders.filter(o => {
    const orderDate = o.createdAt.split('T')[0];
    return (!overviewDateFrom || orderDate >= overviewDateFrom) &&
      (!overviewDateTo || orderDate <= overviewDateTo);
  });

  // Mirrors GET /api/stats' formulas (server.ts) exactly, but computed
  // client-side from dateFilteredOrders so it can respect the date range -
  // the server endpoint has no date params and stays all-time.
  const todayStr = getTodayDateString();
  const activeRentalsCount = dateFilteredOrders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;
  const finishedOrPaidOrders = dateFilteredOrders.filter(o => o.status !== 'Pending' && o.status !== 'Expired');
  // Cash actually collected (amountPaid), not accrued totalPrice+lateFee - a
  // partially-paid order should only count what's actually been received.
  const totalRevenue = finishedOrPaidOrders.reduce((sum, o) => sum + getAmountPaid(o), 0);
  // Piutang - total still owed across the same order set.
  const totalOutstanding = finishedOrPaidOrders.reduce((sum, o) => sum + getRemainingBalance(o), 0);
  const dueTodayCount = dateFilteredOrders.filter(o => (o.status === 'Item Picked Up' || o.status === 'Approved/Paid') && (o.endDate <= todayStr)).length;

  // Calculate some analytics values for visual dashboard charts - also tracks
  // a per-product breakdown within each category, so clicking a category row
  // can reveal exactly which items made up that count.
  const categoryOrderStats = () => {
    const counts: Record<string, { total: number; items: Record<string, number> }> = {};
    dateFilteredOrders.forEach(o => {
      o.items.forEach(it => {
        const prod = products.find(p => p.id === it.productId);
        const cat = prod?.category || 'CAMP SUPPORT';
        if (!counts[cat]) counts[cat] = { total: 0, items: {} };
        counts[cat].total += it.quantity;
        counts[cat].items[it.productName] = (counts[cat].items[it.productName] || 0) + it.quantity;
      });
    });
    return Object.entries(counts).map(([name, { total, items }]) => ({
      name,
      value: total,
      items: Object.entries(items)
        .map(([productName, quantity]) => ({ productName, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
    }));
  };

  const orderStatsByStatus = {
    pending: dateFilteredOrders.filter(o => o.status === 'Pending').length,
    approved: dateFilteredOrders.filter(o => o.status === 'Approved/Paid').length,
    pickedUp: dateFilteredOrders.filter(o => o.status === 'Item Picked Up').length,
    completed: dateFilteredOrders.filter(o => o.status === 'Item Returned/Completed').length,
    expired: dateFilteredOrders.filter(o => o.status === 'Expired').length,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-black pb-4">
        <div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">STATISTIK PENYEWAAN</h2>
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Ringkasan transaksi dan inventaris Bilbo Outdoors saat ini.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2 sm:mt-0">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider shrink-0">Tanggal Pemesanan:</span>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Dari</label>
            <DateInput
              value={overviewDateFrom}
              onChange={setOverviewDateFrom}
              className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Sampai</label>
            <DateInput
              value={overviewDateTo}
              onChange={setOverviewDateTo}
              className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
            />
          </div>
          <div className="text-xs text-zinc-600 font-mono font-black uppercase bg-brand/15 px-3 py-1 border border-black">
            LIVE UPDATES
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="w-12 h-12 bg-zinc-100 text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <Clock className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sewa Aktif</p>
            <p className="text-2xl font-display font-black text-black mt-0.5">{activeRentalsCount} Transaksi</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Approved & Picked Up</p>
          </div>
        </div>

        <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="w-12 h-12 bg-brand text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <DollarSign className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total Omset</p>
            <p className="text-2xl font-display font-black text-black mt-0.5">Rp {totalRevenue.toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Kas Yang Sudah Diterima</p>
          </div>
        </div>

        <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="w-12 h-12 bg-amber-100 text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <DollarSign className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Piutang</p>
            <p className="text-2xl font-display font-black text-black mt-0.5">Rp {totalOutstanding.toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Sisa Belum Dibayar</p>
          </div>
        </div>

        <div className="bg-white border-2 border-black p-5 rounded-none flex items-center space-x-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-black text-brand border-l border-b border-black px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider">DUE TODAY</div>
          <div className="w-12 h-12 bg-zinc-100 text-black border-2 border-black rounded-none flex items-center justify-center shrink-0 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
            <Calendar className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jatuh Tempo Hari Ini</p>
            <p className="text-2xl font-display font-black text-black mt-0.5">{dueTodayCount} Barang</p>
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
                <span className="font-mono">{orderStatsByStatus.pending} ({dateFilteredOrders.length ? Math.round((orderStatsByStatus.pending / dateFilteredOrders.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${dateFilteredOrders.length ? (orderStatsByStatus.pending / dateFilteredOrders.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Progress Bar 2 */}
            <div>
              <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-brand border border-black rounded-none mr-2"></span>Approved / Paid</span>
                <span className="font-mono">{orderStatsByStatus.approved} ({dateFilteredOrders.length ? Math.round((orderStatsByStatus.approved / dateFilteredOrders.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                <div className="bg-brand h-full transition-all duration-500" style={{ width: `${dateFilteredOrders.length ? (orderStatsByStatus.approved / dateFilteredOrders.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Progress Bar 3 */}
            <div>
              <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-black rounded-none mr-2"></span>Item Picked Up</span>
                <span className="font-mono">{orderStatsByStatus.pickedUp} ({dateFilteredOrders.length ? Math.round((orderStatsByStatus.pickedUp / dateFilteredOrders.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                <div className="bg-black h-full transition-all duration-500" style={{ width: `${dateFilteredOrders.length ? (orderStatsByStatus.pickedUp / dateFilteredOrders.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Progress Bar 4 */}
            <div>
              <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-zinc-400 border border-black rounded-none mr-2"></span>Returned / Completed</span>
                <span className="font-mono">{orderStatsByStatus.completed} ({dateFilteredOrders.length ? Math.round((orderStatsByStatus.completed / dateFilteredOrders.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                <div className="bg-zinc-400 h-full transition-all duration-500" style={{ width: `${dateFilteredOrders.length ? (orderStatsByStatus.completed / dateFilteredOrders.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Progress Bar 5 */}
            <div>
              <div className="flex justify-between text-xs font-black text-zinc-700 mb-1 uppercase">
                <span className="flex items-center"><span className="w-2.5 h-2.5 bg-red-500 border border-black rounded-none mr-2"></span>Expired</span>
                <span className="font-mono">{orderStatsByStatus.expired} ({dateFilteredOrders.length ? Math.round((orderStatsByStatus.expired / dateFilteredOrders.length) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-zinc-100 h-3 rounded-none overflow-hidden border border-black">
                <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${dateFilteredOrders.length ? (orderStatsByStatus.expired / dateFilteredOrders.length) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Popular categories visual representation */}
        <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <h3 className="font-display font-black text-black text-sm mb-4 uppercase tracking-wide border-b-2 border-brand pb-2">Peralatan Terlaris Disewa</h3>
          {categoryOrderStats().length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Belum ada data barang disewa.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {categoryOrderStats().sort((a,b) => b.value - a.value).slice(0, 4).map((cat, i) => {
                const isExpanded = expandedCategory === cat.name;
                return (
                  <div key={i}>
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(isExpanded ? null : cat.name)}
                      className="w-full flex items-center justify-between uppercase font-bold text-xs text-zinc-800 py-1.5 cursor-pointer hover:text-black"
                    >
                      <div className="flex items-center">
                        <span className="text-xs font-mono font-black text-zinc-500 mr-2.5">0{i+1}</span>
                        <span>{cat.name}</span>
                        <ChevronDown className={`w-3.5 h-3.5 ml-1.5 text-zinc-400 stroke-[2.5] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                      <span className="text-xs font-black text-black bg-brand/20 border border-black px-2.5 py-0.5 rounded-none font-mono">{cat.value} Unit</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-7 mb-2 space-y-1.5 border-l-2 border-zinc-200 pl-3">
                        {cat.items.map((item, j) => (
                          <div key={j} className="flex items-center justify-between normal-case text-[10px] text-zinc-600 font-semibold">
                            <span>{item.productName}</span>
                            <span className="font-mono font-black text-zinc-800">{item.quantity} Unit</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
