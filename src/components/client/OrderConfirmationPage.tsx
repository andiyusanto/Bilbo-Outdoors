import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, Phone } from 'lucide-react';
import { PublicOrder } from '../../types';
import { parseJsonOrThrow } from '../../lib/api';
import { formatDateLabel } from '../../lib/date';
import OrderSuccessScreen from './OrderSuccessScreen';
import PaymentGatewayPanel from './PaymentGatewayPanel';
import { useLoading } from '../../contexts/LoadingContext';

// Customer-facing summary for a status reached AFTER Pending - reopening this
// same confirmation link (it's the one sent in their WhatsApp booking
// message) must read as "here's what happened", never "please pay", however
// long ago that happened.
const POST_PENDING_STATUS_MESSAGE: Partial<Record<PublicOrder['status'], string>> = {
  'Approved/Paid': 'Pembayaran Anda sudah kami konfirmasi. Silakan datang ke toko sesuai jadwal sewa untuk mengambil barang.',
  'Item Picked Up': 'Barang sudah Anda ambil. Selamat berpetualang bersama Bilbo Outdoors!',
  'Item Returned/Completed': 'Sewa Anda sudah selesai. Terima kasih telah menyewa di Bilbo Outdoors!',
};

export default function OrderConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [paymentGatewayEnabled, setPaymentGatewayEnabled] = useState(false);
  const [pendingExpiryHours, setPendingExpiryHours] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { withLoading } = useLoading();

  const refetchOrder = () => {
    if (!token) return;
    fetch(`/api/orders/confirm/${token}`)
      .then(res => parseJsonOrThrow(res, 'Pesanan tidak ditemukan.'))
      .then(setOrder)
      .catch(() => {});
  };

  useEffect(() => {
    if (!token) {
      setError('Tautan pesanan tidak valid.');
      setLoading(false);
      return;
    }

    withLoading(async () => {
      try {
        const [orderRes, configRes] = await Promise.all([
          fetch(`/api/orders/confirm/${token}`),
          fetch('/api/payment-config'),
        ]);
        const orderData = await parseJsonOrThrow(orderRes, 'Pesanan tidak ditemukan.');
        setOrder(orderData);
        // Config fetch failing just means the legacy manual flow is used -
        // never blocks the customer from seeing their order confirmation.
        const configData = await configRes.json().catch(() => ({ enabled: false }));
        setPaymentGatewayEnabled(Boolean(configData.enabled));
        if (typeof configData.pendingExpiryHours === 'number') {
          setPendingExpiryHours(configData.pendingExpiryHours);
        }
      } catch (err: any) {
        setError(err.message || 'Pesanan tidak ditemukan.');
      } finally {
        setLoading(false);
      }
    });
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 italic">
        Memuat detail pesanan Anda...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-white border-4 border-black p-8 md:p-12 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] text-center space-y-4">
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tighter">Pesanan Tidak Ditemukan</h2>
          <p className="text-xs font-bold text-zinc-600 max-w-md mx-auto leading-relaxed uppercase">
            {error || 'Tautan pesanan ini tidak valid atau sudah kedaluwarsa.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="py-3 px-6 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
          >
            Kembali ke Katalog
          </button>
        </div>
      </div>
    );
  }

  // Expired: never show payment instructions for a booking that no longer
  // holds stock - a customer who genuinely paid needs manual staff recovery
  // (see OrderDetailPanel's own Zona Berbahaya recovery path), not a bank
  // transfer to re-pay for a slot that's already been released.
  if (order.status === 'Expired') {
    const whatsappMessage = encodeURIComponent(
      `Halo Bilbo Outdoors, pesanan saya (${order.id}) tertulis kedaluwarsa namun saya sudah melakukan pembayaran. Mohon dibantu verifikasi. Terima kasih!`
    );
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <section className="bg-white border-4 border-black p-8 md:p-12 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] text-center space-y-5">
          <div className="w-16 h-16 bg-red-100 text-red-700 border-2 border-red-700 flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <AlertTriangle className="w-8 h-8 stroke-[3]" />
          </div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tighter">Pesanan Kedaluwarsa</h2>
          <p className="text-xs font-bold text-zinc-600 max-w-md mx-auto leading-relaxed uppercase">
            Pesanan ini tidak dibayar dalam batas waktu yang ditentukan, sehingga stok yang dipesan sudah dibuka
            kembali untuk umum. Jika Anda sudah melakukan pembayaran, silakan hubungi kami via WhatsApp untuk
            verifikasi manual.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <button
              onClick={() => window.open(`https://wa.me/628113706666?text=${whatsappMessage}`, '_blank')}
              className="w-full py-4 bg-black hover:bg-brand hover:text-black text-white font-black text-sm rounded-none border-2 border-black shadow-[4px_4px_0px_var(--brand-color)] transition-colors uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              <span>Hubungi Kami via WhatsApp</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
            >
              Pesan Ulang
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Any other status past Pending (Approved/Paid, Item Picked Up, Item
  // Returned/Completed) - the order has already progressed, so reopening
  // this link must show what actually happened, never stale "please pay"
  // instructions. Previously this fell into the same branch as the gateway
  // kill-switch below, which meant a fully paid, already-picked-up order
  // still told the customer to transfer money to a placeholder bank account.
  if (order.status !== 'Pending') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <section className="bg-white border-4 border-black p-8 md:p-12 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-brand text-black border-2 border-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(0,0,0,1)]">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <h2 className="text-2xl font-display font-black text-black uppercase tracking-tighter">Pesanan Sudah Dikonfirmasi</h2>
            <div className="bg-emerald-100 text-emerald-800 border-2 border-emerald-800 inline-block px-4 py-1.5 text-xs font-mono font-black uppercase tracking-wider">
              ID PESANAN: {order.id}
            </div>
            <p className="text-xs font-bold text-zinc-600 max-w-md mx-auto leading-relaxed uppercase">
              {POST_PENDING_STATUS_MESSAGE[order.status] || 'Pesanan ini sudah diproses lebih lanjut oleh staf kami.'}
            </p>
          </div>

          <div className="border-2 border-black p-5 rounded-none space-y-3 bg-zinc-50 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <h4 className="text-[10px] font-black uppercase text-black tracking-widest border-b border-black pb-1">RINGKASAN INVOICE</h4>
            <div className="text-xs space-y-2 text-zinc-800 uppercase font-bold">
              <div className="flex justify-between">
                <span>Durasi Sewa ({order.rentDuration} Hari):</span>
                <strong className="text-black font-mono">{formatDateLabel(order.startDate)} s/d {formatDateLabel(order.endDate)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Nama Penyewa:</span>
                <strong className="text-black">{order.customerName}</strong>
              </div>
              <div className="flex justify-between border-t border-black pt-2 font-black text-black text-sm">
                <span>Jumlah Pembayaran:</span>
                <span className="text-black bg-brand px-2 py-0.5 border border-black">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
          >
            Kembali ke Katalog
          </button>
        </section>
      </div>
    );
  }

  // Gateway not configured at all yet, order still genuinely Pending - the
  // exact legacy manual QRIS-mock/WhatsApp flow, untouched (this is the
  // production kill-switch: unsetting WUZZPAY_API_KEY reverts every customer
  // to this instantly).
  //
  // Owner decision (2026-08-20): once the gateway IS configured, this real
  // payment page now replaces the legacy fake page for EVERY customer, not
  // just test orders - PaymentGatewayPanel itself disables the online
  // methods (qris/va/emoney) unless the order matches the internal testing
  // trigger name (most WuzzPay channels are still broken/unprovisioned), but
  // cash-on-pickup stays usable for everyone since it never touches WuzzPay.
  if (!paymentGatewayEnabled) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <OrderSuccessScreen completedOrder={order} onReset={() => navigate('/')} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <section className="bg-white border-4 border-black p-8 md:p-12 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-8 max-w-3xl mx-auto">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-brand text-black border-2 border-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <h2 className="text-3xl font-display font-black text-black uppercase tracking-tighter">PESANAN BERHASIL!</h2>
          <div className="bg-emerald-100 text-emerald-800 border-2 border-emerald-800 inline-block px-4 py-1.5 text-xs font-mono font-black uppercase tracking-wider">
            ID PESANAN: {order.id}
          </div>
        </div>

        <div className="border-2 border-black p-5 rounded-none space-y-3 bg-zinc-50 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
          <h4 className="text-[10px] font-black uppercase text-black tracking-widest border-b border-black pb-1">RINGKASAN INVOICE</h4>
          <div className="text-xs space-y-2 text-zinc-800 uppercase font-bold">
            <div className="flex justify-between">
              <span>Durasi Sewa ({order.rentDuration} Hari):</span>
              <strong className="text-black font-mono">{formatDateLabel(order.startDate)} s/d {formatDateLabel(order.endDate)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Nama Penyewa:</span>
              <strong className="text-black">{order.customerName}</strong>
            </div>
            <div className="flex justify-between border-t border-black pt-2 font-black text-black text-sm">
              <span>Jumlah Pembayaran:</span>
              <span className="text-black bg-brand px-2 py-0.5 border border-black">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>

        <PaymentGatewayPanel order={order} token={token!} onSettled={refetchOrder} pendingExpiryHours={pendingExpiryHours} />

        <button
          onClick={() => navigate('/')}
          className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
        >
          Kembali ke Katalog
        </button>
      </section>
    </div>
  );
}
