import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { PublicOrder } from '../../types';
import { parseJsonOrThrow } from '../../lib/api';
import { formatDateLabel } from '../../lib/date';
import OrderSuccessScreen from './OrderSuccessScreen';
import PaymentGatewayPanel from './PaymentGatewayPanel';
import { useLoading } from '../../contexts/LoadingContext';

export default function OrderConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [paymentGatewayEnabled, setPaymentGatewayEnabled] = useState(false);
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

  // Gateway not configured yet - the exact legacy manual QRIS-mock/WhatsApp
  // flow, untouched. Also the fallback if the customer's own order status is
  // already past Pending (e.g. an admin manually confirmed it already), since
  // there's nothing left to charge or poll for at that point.
  //
  // TEMPORARY internal testing gate (owner-requested, 2026-08-19, mirrors the
  // identical check server-side in server.ts's /charge route - see
  // PAYMENT_GATEWAY_TEST_TRIGGER_NAME there): most WuzzPay channels are still
  // broken/unprovisioned, so the real flow stays invisible to real customers
  // until the order's full name is exactly this trigger string. Remove this
  // once the feature is ready for a real rollout.
  const isPaymentGatewayTestOrder = order.customerName === 'TESTING_PAYMENT';
  if (!paymentGatewayEnabled || !isPaymentGatewayTestOrder || order.status !== 'Pending') {
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

        <PaymentGatewayPanel order={order} token={token!} onSettled={refetchOrder} />

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
