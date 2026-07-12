import { Phone, UserCheck, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Order, OrderStatus } from '../../types';

interface LateCalculationResult {
  lateDays: number;
  lateFee: number;
  breakdown: any[];
  actualReturnDate: string;
}

interface OrderDetailPanelProps {
  order: Order;
  onClose: () => void;
  onUpdateStatus: (orderId: string, newStatus: OrderStatus) => void;
  showLateCalc: boolean;
  onOpenLateCalc: () => void;
  customReturnDate: string;
  onCustomReturnDateChange: (date: string) => void;
  onCalculateLateFees: () => void;
  lateCalculationResult: LateCalculationResult | null;
  onApplyLateFeesAndComplete: () => void;
}

export default function OrderDetailPanel({
  order,
  onClose,
  onUpdateStatus,
  showLateCalc,
  onOpenLateCalc,
  customReturnDate,
  onCustomReturnDateChange,
  onCalculateLateFees,
  lateCalculationResult,
  onApplyLateFeesAndComplete,
}: OrderDetailPanelProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end transition-opacity">
      <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl relative overflow-hidden">

        {/* Detail Header */}
        <div className="bg-black text-white p-5 flex justify-between items-center border-b-4 border-black">
          <div>
            <span className="text-[9px] bg-brand text-black font-mono px-2 py-0.5 border border-black font-black uppercase tracking-wider">DETAIL PESANAN</span>
            <h3 className="font-display font-black text-lg mt-1 uppercase tracking-tight">{order.customerName}</h3>
          </div>
          <button
            onClick={onClose}
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
                  {order.customerWhatsApp}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Dibuat Pada</p>
                <p className="text-xs text-black font-bold mt-1 uppercase">
                  {new Date(order.createdAt).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="border-t-2 border-black pt-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Jadwal Sewa</p>
                <p className="text-xs text-black mt-1 font-black uppercase">
                  {order.startDate} s/d {order.endDate}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Total Durasi</p>
                <p className="text-xs text-black mt-1 font-black font-mono">
                  {order.rentDuration} HARI
                </p>
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div>
            <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2.5">Rincian Peralatan Rented</h4>
            <div className="border-2 border-black rounded-none overflow-hidden divide-y-2 divide-black bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              {order.items.map((item, index) => (
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
              <span>Biaya Rental Pokok ({order.rentDuration} Hari):</span>
              <span className="font-mono text-black font-black">
                Rp {order.totalPrice.toLocaleString('id-ID')}
              </span>
            </div>

            {order.lateFee && order.lateFee > 0 ? (
              <div className="flex justify-between items-baseline border-t-2 border-black pt-3 font-bold text-xs uppercase text-red-600">
                <span>Denda Terlambat ({order.lateDays} Hari):</span>
                <span className="font-mono font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-none">
                  Rp {order.lateFee.toLocaleString('id-ID')}
                </span>
              </div>
            ) : null}

            <div className="border-t-2 border-dashed border-black pt-3 flex justify-between items-baseline">
              <span className="text-xs font-black text-black uppercase tracking-wider">Total Invoice:</span>
              <span className="text-lg font-black text-black font-mono">
                Rp {((order.totalPrice || 0) + (order.lateFee || 0)).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Photo ID Card Guarantee Render */}
          <div>
            <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2 flex items-center">
              <UserCheck className="w-4 h-4 mr-1.5 text-black stroke-[2.5]" />
              Kartu Identitas Jaminan (KTP / SIM)
            </h4>
            {order.idCardBase64 ? (
              <div className="border-2 border-black rounded-none overflow-hidden bg-zinc-50 p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <img
                  src={order.idCardBase64}
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

            {order.status === 'Pending' && (
              <button
                onClick={() => onUpdateStatus(order.id, 'Approved/Paid')}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
              >
                Konfirmasi Pembayaran (Setujui Sewa)
              </button>
            )}

            {order.status === 'Approved/Paid' && (
              <button
                onClick={() => onUpdateStatus(order.id, 'Item Picked Up')}
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
              >
                Barang Diambil (Diserahkan ke Penyewa)
              </button>
            )}

            {(order.status === 'Item Picked Up' || order.status === 'Approved/Paid') && (
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
                    onClick={onOpenLateCalc}
                    className="flex-1 py-2.5 bg-white border-2 border-black text-black hover:bg-black hover:text-brand font-black text-xs rounded-none transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Kalkulator Denda
                  </button>

                  <button
                    onClick={() => onUpdateStatus(order.id, 'Item Returned/Completed')}
                    className="flex-1 py-2.5 bg-black hover:bg-red-600 text-white font-black text-xs border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    Tanpa Denda
                  </button>
                </div>
              </div>
            )}

            {order.status === 'Item Returned/Completed' && (
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
                    onChange={(e) => onCustomReturnDateChange(e.target.value)}
                    className="bg-white border-2 border-black px-3 py-2 text-xs font-bold uppercase rounded-none focus:outline-none flex-1"
                  />
                  <button
                    onClick={onCalculateLateFees}
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
                        onClick={onApplyLateFeesAndComplete}
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
  );
}
