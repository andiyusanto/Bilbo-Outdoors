import { useState } from 'react';
import { Search, ChevronRight, FileSpreadsheet, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { OrderListItem, OrderStatus, Product, StoreSettings } from '../../types';
import { useOrderActions } from '../../hooks/useOrderActions';
import { useOrderEditActions } from '../../hooks/useOrderEditActions';
import { formatDateLabel, formatDateTimeLabel, getDefaultDateRange, localDateFromInstant } from '../../lib/date';
import { getAmountPaid, getRemainingBalance, getPenaltyTotal } from '../../pricing';
import OrderDetailPanel from './OrderDetailPanel';
import DateInput from '../DateInput';

const CSV_COLUMNS = ['No. Order', 'Nama Penyewa', 'WhatsApp', 'Tanggal Pemesanan', 'Tanggal Mulai', 'Tanggal Selesai', 'Durasi (Hari)', 'Total Biaya (Rp)', 'Denda (Rp)', 'Hari Terlambat', 'Denda Kerusakan/Kehilangan (Rp)', 'Sudah Dibayar (Rp)', 'Sisa Pembayaran (Rp)', 'Status'] as const;

// Excel/CSV requires quoting any field containing a comma, quote, or newline -
// and doubling internal quotes - or the file silently misparses into the wrong
// number of columns.
function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function ordersToCsv(orders: OrderListItem[]): string {
  const rows = orders.map(o => [
    o.id,
    o.customerName,
    o.customerWhatsApp,
    formatDateLabel(localDateFromInstant(o.createdAt)),
    formatDateLabel(o.startDate),
    formatDateLabel(o.endDate),
    o.rentDuration,
    o.totalPrice,
    o.lateFee || 0,
    o.lateDays || 0,
    getPenaltyTotal(o),
    getAmountPaid(o),
    getRemainingBalance(o),
    o.status,
  ]);
  // Leading BOM so Excel (especially on Windows) detects UTF-8 instead of
  // misreading accented characters via its legacy ANSI CSV assumption.
  return String.fromCharCode(0xFEFF) + [CSV_COLUMNS, ...rows].map(row => row.map(csvField).join(',')).join('\r\n');
}

type SortColumn = 'createdAt' | 'startDate' | 'status';

// Status isn't naturally alphabetical - rank by the app's own workflow
// sequence (same order StatusFlow uses in GuideTab.tsx) so sorting is
// actually useful, with Expired ranked last as the branch case.
const STATUS_SORT_ORDER: Record<OrderStatus, number> = {
  'Pending': 0,
  'Approved/Paid': 1,
  'Item Picked Up': 2,
  'Item Returned/Completed': 3,
  'Expired': 4,
};

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-zinc-500 stroke-[2.5] inline" />;
  return direction === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-black stroke-[3] inline" />
    : <ChevronDown className="w-3.5 h-3.5 ml-1 text-black stroke-[3] inline" />;
}

interface OrdersTabProps {
  orders: OrderListItem[];
  products: Product[];
  settings: StoreSettings;
  orderActions: ReturnType<typeof useOrderActions>;
  orderEditActions: ReturnType<typeof useOrderEditActions>;
  isOwner: boolean;
}

export default function OrdersTab({ orders, products, settings, orderActions, orderEditActions, isOwner }: OrdersTabProps) {
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');
  const [orderDateFrom, setOrderDateFrom] = useState<string>(() => getDefaultDateRange().from);
  const [orderDateTo, setOrderDateTo] = useState<string>(() => getDefaultDateRange().to);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // 3-state cycle per column: click = asc, click again = desc, click again =
  // back to default (insertion) order. Clicking a different column resets to
  // that column ascending. Only one column sorted at a time.
  const handleSort = (col: SortColumn) => {
    if (sortColumn !== col) {
      setSortColumn(col);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    setSortColumn(null);
    setSortDirection('asc');
  };

  const {
    selectedOrder,
    showLateCalc,
    customReturnDateTime,
    setCustomReturnDateTime,
    lateCalculationResult,
    handleOpenOrderDetail,
    handleUpdateOrderStatus,
    handleUpdatePayment,
    handleAddPenalty,
    handleRemovePenalty,
    handleUploadPersonalPhoto,
    handleDeleteOrder,
    handleRemoveLateFee,
    handleCalculateLateFees,
    handleApplyLateFeesAndComplete,
    openLateCalc,
    closeOrderDetail,
  } = orderActions;

  const { closeEditOrder } = orderEditActions;

  // Closing the whole detail panel must also reset any in-progress order
  // edit - otherwise reopening a different order could show the previous
  // order's stale edit form still open.
  const handleCloseOrderDetail = () => {
    closeOrderDetail();
    closeEditOrder();
  };

  // Order Search and Filtering
  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerWhatsApp.includes(orderSearch) ||
      o.id.toLowerCase().includes(orderSearch.toLowerCase());
    const matchesStatus = orderStatusFilter === 'All' || o.status === orderStatusFilter;
    // Filters by when the order was placed (createdAt), not the rental period -
    // matches the "Tanggal Pemesanan" column below, so "orders from this month"
    // means the same thing everywhere in the app. createdAt is a full UTC ISO
    // datetime; take its LOCAL date portion (localDateFromInstant, same
    // convention as getTodayDateString/getDefaultDateRange in lib/date.ts) -
    // a plain string split on the raw ISO text would take the UTC date instead,
    // off by one day for any order placed between local midnight and 07:00 WIB.
    const orderDate = localDateFromInstant(o.createdAt);
    const matchesDateFrom = !orderDateFrom || orderDate >= orderDateFrom;
    const matchesDateTo = !orderDateTo || orderDate <= orderDateTo;
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedOrders = [...filteredOrders];
  if (sortColumn) {
    sortedOrders.sort((a, b) => {
      const cmp = sortColumn === 'status'
        ? STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]
        : a[sortColumn].localeCompare(b[sortColumn]);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  // Exports exactly what's currently on screen (sortedOrders), not the full
  // unfiltered orders list - so search/status/date filters and the active
  // column sort narrow/order the export too.
  const handleDownloadCsv = () => {
    const csv = ordersToCsv(sortedOrders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateSuffix = orderDateFrom || orderDateTo ? `_${orderDateFrom || 'awal'}_sd_${orderDateTo || 'akhir'}` : '';
    const link = document.createElement('a');
    link.href = url;
    link.download = `pesanan-bilbo-outdoors${dateSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">MANAJEMEN ORDER MASUK</h2>
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Kelola konfirmasi pembayaran, pengambilan barang, denda keterlambatan, dan pengembalian.</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-black absolute left-3 top-3.5 stroke-[2.5]" />
          <input
            type="text"
            placeholder="Cari nama / WhatsApp..."
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 text-xs bg-white border-2 border-black rounded-none focus:bg-brand/10 focus:outline-none w-full sm:w-48 font-black tracking-wider"
          />
        </div>

        <select
          value={orderStatusFilter}
          onChange={(e) => setOrderStatusFilter(e.target.value)}
          aria-label="Filter Status Pesanan"
          className="bg-white border-2 border-black rounded-none px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
        >
          <option value="All">SEMUA STATUS</option>
          <option value="Pending">PENDING</option>
          <option value="Approved/Paid">APPROVED/PAID</option>
          <option value="Item Picked Up">ITEM PICKED UP</option>
          <option value="Item Returned/Completed">RETURNED/COMPLETED</option>
          <option value="Expired">EXPIRED</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Dari</label>
          <DateInput
            value={orderDateFrom}
            onChange={setOrderDateFrom}
            className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Sampai</label>
          <DateInput
            value={orderDateTo}
            onChange={setOrderDateTo}
            className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>

        <button
          onClick={handleDownloadCsv}
          disabled={filteredOrders.length === 0}
          title="Unduh daftar pesanan yang sedang ditampilkan (sesuai filter aktif) sebagai file Excel/CSV"
          className="sm:ml-auto bg-zinc-100 hover:bg-black hover:text-brand text-black font-black text-xs px-4 py-2.5 rounded-none border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all cursor-pointer inline-flex items-center justify-center uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2 stroke-[2.5]" />
          Unduh Excel
        </button>
      </div>

      {/* Order List Table */}
      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b-2 border-black">
                <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Penyewa / WhatsApp</th>
                <th
                  onClick={() => handleSort('createdAt')}
                  className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100"
                >
                  <span className="inline-flex items-center">Tanggal Pemesanan<SortIcon active={sortColumn === 'createdAt'} direction={sortDirection} /></span>
                </th>
                <th
                  onClick={() => handleSort('startDate')}
                  className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100"
                >
                  <span className="inline-flex items-center">Tanggal Sewa<SortIcon active={sortColumn === 'startDate'} direction={sortDirection} /></span>
                </th>
                <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Durasi</th>
                <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Total Biaya</th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100"
                >
                  <span className="inline-flex items-center">Status<SortIcon active={sortColumn === 'status'} direction={sortDirection} /></span>
                </th>
                <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider">Diubah Terakhir Oleh</th>
                <th className="px-5 py-3.5 text-[10px] font-black text-black uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-xs text-zinc-500 font-bold uppercase tracking-wider">
                    Belum ada pesanan penyewaan camping yang cocok.
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-brand/5 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-black text-black text-xs uppercase">{order.customerName}</p>
                      <p className="text-[10px] text-zinc-500 font-mono font-bold mt-0.5">{order.customerWhatsApp}</p>
                      <p className="text-[10px] text-zinc-600 font-mono font-black mt-0.5">{order.id}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-800 font-bold uppercase font-mono">
                      {formatDateLabel(localDateFromInstant(order.createdAt))}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-zinc-800 font-bold uppercase">
                        <span>{formatDateLabel(order.startDate)}</span>
                        <span className="text-zinc-400 mx-1.5 font-mono">s/d</span>
                        <span>{formatDateLabel(order.endDate)}</span>
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
                      {getPenaltyTotal(order) > 0 ? (
                        <p className="text-[9px] font-black text-red-700 bg-red-50 border border-red-500 inline-block px-1.5 py-0.5 mt-1 uppercase">
                          + RUSAK/HILANG: Rp {getPenaltyTotal(order).toLocaleString('id-ID')}
                        </p>
                      ) : null}
                      {getRemainingBalance(order) > 0 ? (
                        <p className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-500 inline-block px-1.5 py-0.5 mt-1 uppercase">
                          SISA: Rp {getRemainingBalance(order).toLocaleString('id-ID')}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-1 text-[9px] font-black uppercase tracking-wider border-2 border-black rounded-none ${
                        order.status === 'Pending' ? 'bg-amber-400 text-black' :
                        order.status === 'Approved/Paid' ? 'bg-brand text-black' :
                        order.status === 'Item Picked Up' ? 'bg-black text-white' :
                        order.status === 'Expired' ? 'bg-red-100 text-red-700' :
                        'bg-zinc-200 text-zinc-800'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {order.statusHistory && order.statusHistory.length > 0 ? (
                        <>
                          <p className="text-xs font-black text-black uppercase">
                            {order.statusHistory[order.statusHistory.length - 1].changedByName}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono font-bold mt-0.5">
                            {formatDateTimeLabel(order.statusHistory[order.statusHistory.length - 1].changedAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-[10px] text-zinc-400 font-bold uppercase">&mdash;</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => { closeEditOrder(); handleOpenOrderDetail(order.id); }}
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
        <OrderDetailPanel
          order={selectedOrder}
          products={products}
          settings={settings}
          onClose={handleCloseOrderDetail}
          onUpdateStatus={handleUpdateOrderStatus}
          onUpdatePayment={handleUpdatePayment}
          onAddPenalty={handleAddPenalty}
          onRemovePenalty={handleRemovePenalty}
          onUploadPersonalPhoto={handleUploadPersonalPhoto}
          onDeleteOrder={handleDeleteOrder}
          onRemoveLateFee={handleRemoveLateFee}
          isOwner={isOwner}
          showLateCalc={showLateCalc}
          onOpenLateCalc={openLateCalc}
          customReturnDateTime={customReturnDateTime}
          onCustomReturnDateTimeChange={setCustomReturnDateTime}
          onCalculateLateFees={handleCalculateLateFees}
          lateCalculationResult={lateCalculationResult}
          onApplyLateFeesAndComplete={handleApplyLateFeesAndComplete}
          orderEditActions={orderEditActions}
        />
      )}
    </div>
  );
}
