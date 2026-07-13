import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PublicOrder } from '../../types';
import { parseJsonOrThrow } from '../../lib/api';
import OrderSuccessScreen from './OrderSuccessScreen';

export default function OrderConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Tautan pesanan tidak valid.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/orders/confirm/${token}`);
        const data = await parseJsonOrThrow(res, 'Pesanan tidak ditemukan.');
        setOrder(data);
      } catch (err: any) {
        setError(err.message || 'Pesanan tidak ditemukan.');
      } finally {
        setLoading(false);
      }
    })();
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <OrderSuccessScreen completedOrder={order} onReset={() => navigate('/')} />
    </div>
  );
}
