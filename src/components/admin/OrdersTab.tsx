import { useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { Order } from '../../types';
import { useOrderActions } from '../../hooks/useOrderActions';
import OrderDetailPanel from './OrderDetailPanel';

interface OrdersTabProps {
  orders: Order[];
  orderActions: ReturnType<typeof useOrderActions>;
}

export default function OrdersTab({ orders, orderActions }: OrdersTabProps) {
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');

  const {
    selectedOrder,
    setSelectedOrder,
    showLateCalc,
    customReturnDate,
    setCustomReturnDate,
    lateCalculationResult,
    handleUpdateOrderStatus,
    handleCalculateLateFees,
    handleApplyLateFeesAndComplete,
    openLateCalc,
    closeOrderDetail,
  } = orderActions;

  // Order Search and Filtering
  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      o.customerName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customerWhatsApp.includes(orderSearch);
    const matchesStatus = orderStatusFilter === 'All' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
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
        <OrderDetailPanel
          order={selectedOrder}
          onClose={closeOrderDetail}
          onUpdateStatus={handleUpdateOrderStatus}
          showLateCalc={showLateCalc}
          onOpenLateCalc={openLateCalc}
          customReturnDate={customReturnDate}
          onCustomReturnDateChange={setCustomReturnDate}
          onCalculateLateFees={handleCalculateLateFees}
          lateCalculationResult={lateCalculationResult}
          onApplyLateFeesAndComplete={handleApplyLateFeesAndComplete}
        />
      )}
    </div>
  );
}
