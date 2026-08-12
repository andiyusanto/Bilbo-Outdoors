import { useState } from 'react';
import { Phone, UserCheck, AlertTriangle, CheckCircle, Clock, Printer } from 'lucide-react';
import { Order, OrderStatus, Product, StoreSettings } from '../../types';
import { formatDateLabel, formatDateTimeLabel } from '../../lib/date';
import { calculateRentalCost } from '../../pricing';
import DateInput from '../DateInput';
import OrderResiPrint from './OrderResiPrint';

const PICKUP_ID_TYPE_OPTIONS = ['KTP', 'SIM', 'KTA', 'KIP', 'Kartu Pelajar', 'Lainnya'];

interface LateCalculationResult {
  lateDays: number;
  lateFee: number;
  breakdown: any[];
  deadline: string;
}

interface OrderDetailPanelProps {
  order: Order;
  products: Product[];
  settings: StoreSettings;
  onClose: () => void;
  onUpdateStatus: (orderId: string, newStatus: OrderStatus, pickupIdType?: string, amountPaid?: number) => void;
  onUpdatePayment: (orderId: string, amountPaid: number) => void;
  showLateCalc: boolean;
  onOpenLateCalc: () => void;
  customReturnDateTime: string;
  onCustomReturnDateTimeChange: (dateTime: string) => void;
  onCalculateLateFees: () => void;
  lateCalculationResult: LateCalculationResult | null;
  onApplyLateFeesAndComplete: () => void;
}

export default function OrderDetailPanel({
  order,
  products,
  settings,
  onClose,
  onUpdateStatus,
  onUpdatePayment,
  showLateCalc,
  onOpenLateCalc,
  customReturnDateTime,
  onCustomReturnDateTimeChange,
  onCalculateLateFees,
  lateCalculationResult,
  onApplyLateFeesAndComplete,
}: OrderDetailPanelProps) {
  const [showPickupConfirm, setShowPickupConfirm] = useState(false);
  const [pickupIdTypeSelect, setPickupIdTypeSelect] = useState('');
  const [pickupIdTypeCustom, setPickupIdTypeCustom] = useState('');

  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState(String(order.totalPrice));
  const [showEditPayment, setShowEditPayment] = useState(false);
  const [editPaymentInput, setEditPaymentInput] = useState(String(order.amountPaid ?? 0));

  const resolvedPickupIdType = pickupIdTypeSelect === 'Lainnya' ? pickupIdTypeCustom.trim() : pickupIdTypeSelect;
  const canConfirmPickup = pickupIdTypeSelect !== '' && (pickupIdTypeSelect !== 'Lainnya' || pickupIdTypeCustom.trim() !== '');

  const handleConfirmPickup = () => {
    onUpdateStatus(order.id, 'Item Picked Up', resolvedPickupIdType);
    setShowPickupConfirm(false);
    setPickupIdTypeSelect('');
    setPickupIdTypeCustom('');
  };

  const handleConfirmPayment = () => {
    onUpdateStatus(order.id, 'Approved/Paid', undefined, Number(paymentAmountInput));
    setShowPaymentConfirm(false);
  };

  const handleSaveEditPayment = () => {
    onUpdatePayment(order.id, Number(editPaymentInput));
    setShowEditPayment(false);
  };

  const totalInvoice = (order.totalPrice || 0) + (order.lateFee || 0);
  const remainingBalance = totalInvoice - (order.amountPaid || 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end transition-opacity">
      <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl relative overflow-hidden">

        {/* Detail Header */}
        <div className="bg-black text-white p-5 flex justify-between items-center border-b-4 border-black">
          <div>
            <span className="text-[9px] bg-brand text-black font-mono px-2 py-0.5 border border-black font-black uppercase tracking-wider">DETAIL PESANAN</span>
            <h3 className="font-display font-black text-lg mt-1 uppercase tracking-tight">{order.customerName}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center text-white hover:text-black bg-transparent hover:bg-brand text-xs font-black font-mono border-2 border-white px-4 py-2 transition-all cursor-pointer rounded-none"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              CETAK RESI
            </button>
            <button
              onClick={onClose}
              className="text-black hover:text-white bg-brand hover:bg-black text-xs font-black font-mono border-2 border-black px-4 py-2 transition-all cursor-pointer rounded-none"
            >
              TUTUP
            </button>
          </div>
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
                  {formatDateTimeLabel(order.createdAt)}
                </p>
              </div>
            </div>

            <div className="border-t-2 border-black pt-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Jadwal Sewa</p>
                <p className="text-xs text-black mt-1 font-black uppercase">
                  {formatDateLabel(order.startDate)} s/d {formatDateLabel(order.endDate)}
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
              {order.items.map((item, index) => {
                // Live lookup, not snapshotted - varian/size/color are pure catalog
                // metadata (like the product's own display on the public page),
                // not price-relevant, so no order-time integrity concern here.
                const product = products.find((p) => p.id === item.productId);
                const attrLine = product && (product.varian || product.size || product.color)
                  ? [
                      product.varian && `Varian: ${product.varian}`,
                      product.size && `Ukuran: ${product.size}`,
                      product.color && `Warna: ${product.color}`,
                    ].filter(Boolean).join('   •   ')
                  : null;
                return (
                  <div key={index} className="p-3.5 flex items-center justify-between hover:bg-brand/5">
                    <div>
                      <p className="text-xs font-black text-black uppercase">{item.productName}</p>
                      {attrLine && (
                        <p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">{attrLine}</p>
                      )}
                      <p className="text-[10px] text-zinc-600 font-bold uppercase mt-1">
                        {item.ratesSnapshot ? (
                          `${order.rentDuration} Hari: Rp ${calculateRentalCost(item.ratesSnapshot, order.rentDuration).toLocaleString('id-ID')}`
                        ) : item.legacyPricePerDay !== undefined ? (
                          `Rp ${item.legacyPricePerDay.toLocaleString('id-ID')}/hari${(item.legacyIncrementalPrice ?? 0) > 0 ? ` (-Rp ${(item.legacyIncrementalPrice ?? 0).toLocaleString('id-ID')}/hari diskon setelah ${item.legacyDiscountThresholdDays ?? 5} hari)` : ''}`
                        ) : null}
                      </p>
                    </div>
                    <span className="text-xs font-black bg-brand/10 border-2 border-black px-2.5 py-1 rounded-none font-mono text-black">
                      {item.quantity} UNIT
                    </span>
                  </div>
                );
              })}
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
                Rp {totalInvoice.toLocaleString('id-ID')}
              </span>
            </div>

            {order.amountPaid !== undefined && (
              <div className="border-t-2 border-black pt-3 space-y-2">
                <div className="flex justify-between items-baseline font-bold text-xs uppercase text-zinc-700">
                  <span className="flex items-center gap-1.5">
                    Sudah Dibayar:
                    {!showEditPayment && (
                      <button
                        type="button"
                        onClick={() => { setEditPaymentInput(String(order.amountPaid ?? 0)); setShowEditPayment(true); }}
                        className="text-[9px] font-black text-zinc-400 hover:text-black underline cursor-pointer normal-case"
                      >
                        Edit
                      </button>
                    )}
                  </span>
                  <span className="font-mono text-black font-black">
                    Rp {(order.amountPaid || 0).toLocaleString('id-ID')}
                  </span>
                </div>

                {showEditPayment && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      max={totalInvoice}
                      value={editPaymentInput}
                      onChange={(e) => setEditPaymentInput(e.target.value)}
                      className="flex-1 bg-white border-2 border-black px-3 py-1.5 text-xs font-bold rounded-none focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPayment(false)}
                      className="px-3 py-1.5 bg-white border-2 border-black text-black hover:bg-zinc-100 font-black text-[10px] rounded-none uppercase tracking-wider cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditPayment}
                      className="px-3 py-1.5 bg-black hover:bg-brand hover:text-black text-brand font-black text-[10px] border-2 border-black rounded-none uppercase tracking-wider cursor-pointer"
                    >
                      Simpan
                    </button>
                  </div>
                )}

                {remainingBalance > 0 ? (
                  <div className="flex justify-between items-baseline font-bold text-xs uppercase text-red-600">
                    <span>Sisa Pembayaran:</span>
                    <span className="font-mono font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-none">
                      Rp {remainingBalance.toLocaleString('id-ID')}
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] font-black text-emerald-600 uppercase">Lunas</p>
                )}
              </div>
            )}
          </div>

          {/* Personal Photo Render */}
          <div>
            <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2 flex items-center">
              <UserCheck className="w-4 h-4 mr-1.5 text-black stroke-[2.5]" />
              Foto Diri Penyewa (Verifikasi Jaminan)
            </h4>
            {order.personalPhotoBase64 ? (
              <div className="border-2 border-black rounded-none overflow-hidden bg-zinc-50 p-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <img
                  src={order.personalPhotoBase64}
                  alt="Foto diri penyewa"
                  className="w-full max-h-56 object-contain rounded-none"
                />
                <p className="text-[9px] text-zinc-500 font-bold uppercase text-center mt-2">Diupload oleh pelanggan saat pemesanan.</p>
              </div>
            ) : (
              <div className="border-2 border-dashed border-black rounded-none py-6 text-center text-xs text-zinc-400 font-bold uppercase">
                Tidak ada foto diunggah (verifikasi langsung di toko).
              </div>
            )}
            {order.pickupIdType && (
              <p className="text-[10px] font-black text-black uppercase mt-2">
                Jaminan Diberikan Saat Pengambilan: <span className="text-emerald-600">{order.pickupIdType}</span>
              </p>
            )}
          </div>

          {/* Action buttons (Advance workflow states) */}
          <div className="border-t-2 border-black pt-5 space-y-3">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Alur Kerja Sewa</h4>

            {order.status === 'Expired' && (
              <div className="bg-red-50 border-2 border-red-500 text-red-800 text-xs p-3 rounded-none flex items-start uppercase font-bold">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                <span className="normal-case">Pesanan ini sudah kedaluwarsa (tidak dibayar dalam 2 jam) dan berhenti menahan stok. Jika penyewa ternyata sudah membayar, Anda tetap bisa menyetujuinya di bawah ini selama stok masih tersedia.</span>
              </div>
            )}

            {(order.status === 'Pending' || order.status === 'Expired') && !showPaymentConfirm && (
              <button
                onClick={() => { setPaymentAmountInput(String(order.totalPrice)); setShowPaymentConfirm(true); }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
              >
                Konfirmasi Pembayaran (Setujui Sewa)
              </button>
            )}

            {(order.status === 'Pending' || order.status === 'Expired') && showPaymentConfirm && (
              <div className="border-2 border-black rounded-none p-4 bg-zinc-50 space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <p className="text-xs font-black text-black uppercase tracking-wide">Jumlah Dibayar Sekarang (Rp)</p>
                <input
                  type="number"
                  min={0}
                  max={order.totalPrice}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-black rounded-none focus:outline-none"
                />
                <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed">
                  Total tagihan Rp {order.totalPrice.toLocaleString('id-ID')} sudah terisi otomatis. Jika penyewa hanya membayar sebagian (DP), ubah nominal ini sesuai yang sudah diterima &mdash; sisanya bisa dilunasi saat barang diambil atau dikembalikan.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPaymentConfirm(false)}
                    className="flex-1 py-2.5 bg-white border-2 border-black text-black hover:bg-zinc-100 font-black text-xs rounded-none transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    disabled={paymentAmountInput === '' || Number(paymentAmountInput) < 0 || Number(paymentAmountInput) > order.totalPrice}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Konfirmasi Pembayaran
                  </button>
                </div>
              </div>
            )}

            {order.status === 'Approved/Paid' && !showPickupConfirm && (
              <button
                onClick={() => setShowPickupConfirm(true)}
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] rounded-none transition-all uppercase tracking-widest cursor-pointer"
              >
                Barang Diambil (Diserahkan ke Penyewa)
              </button>
            )}

            {order.status === 'Approved/Paid' && showPickupConfirm && (
              <div className="border-2 border-black rounded-none p-4 bg-zinc-50 space-y-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <p className="text-xs font-black text-black uppercase tracking-wide">Jaminan yang Diberikan</p>
                <select
                  value={pickupIdTypeSelect}
                  onChange={(e) => setPickupIdTypeSelect(e.target.value)}
                  className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-black uppercase rounded-none focus:outline-none cursor-pointer"
                >
                  <option value="">Pilih jenis kartu identitas...</option>
                  {PICKUP_ID_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>

                {pickupIdTypeSelect === 'Lainnya' && (
                  <input
                    type="text"
                    value={pickupIdTypeCustom}
                    onChange={(e) => setPickupIdTypeCustom(e.target.value)}
                    placeholder="Sebutkan jenis kartu identitas"
                    className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-bold rounded-none focus:outline-none"
                  />
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowPickupConfirm(false); setPickupIdTypeSelect(''); setPickupIdTypeCustom(''); }}
                    className="flex-1 py-2.5 bg-white border-2 border-black text-black hover:bg-zinc-100 font-black text-xs rounded-none transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleConfirmPickup}
                    disabled={!canConfirmPickup}
                    className="flex-1 py-2.5 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Konfirmasi & Serahkan Barang
                  </button>
                </div>
              </div>
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
                  Pilih Tanggal & Jam Pengembalian Aktual
                </label>
                <div className="flex gap-2">
                  <DateInput
                    type="datetime-local"
                    value={customReturnDateTime}
                    onChange={onCustomReturnDateTimeChange}
                    wrapperClassName="flex-1"
                    className="w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold uppercase rounded-none focus:outline-none"
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

                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide">
                    Batas Waktu Pengembalian: {formatDateTimeLabel(lateCalculationResult.deadline)}
                  </p>

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

      <OrderResiPrint order={order} products={products} storeFooter={settings.footer} />
    </div>
  );
}
