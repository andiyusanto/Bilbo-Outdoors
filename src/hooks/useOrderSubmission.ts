import { useState, FormEvent, Dispatch, SetStateAction } from 'react';
import { Order } from '../types';
import { JSON_HEADERS, parseJsonOrThrow } from '../lib/api';

interface UseOrderSubmissionParams {
  cart: Record<string, number>;
  setCart: Dispatch<SetStateAction<Record<string, number>>>;
  customerName: string;
  customerWhatsApp: string;
  startDate: string;
  endDate: string;
  rentDuration: number;
  idCardBase64: string;
}

export function useOrderSubmission({
  cart,
  setCart,
  customerName,
  customerWhatsApp,
  startDate,
  endDate,
  rentDuration,
  idCardBase64,
}: UseOrderSubmissionParams) {
  const [checkoutError, setCheckoutError] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setCheckoutError('');

    if (Object.keys(cart).length === 0) {
      setCheckoutError('Keranjang Anda kosong. Silakan pilih alat camping terlebih dahulu.');
      return;
    }

    if (!customerName || !customerWhatsApp) {
      setCheckoutError('Silakan isi Nama dan No. WhatsApp Anda.');
      return;
    }

    if (!startDate || !endDate || rentDuration <= 0) {
      setCheckoutError('Pilihan tanggal sewa tidak valid.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const orderItems = Object.entries(cart).map(([productId, quantity]) => ({
        productId,
        quantity
      }));

      const payload = {
        customerName,
        customerWhatsApp,
        startDate,
        endDate,
        items: orderItems,
        idCardBase64
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(payload)
      });

      const data = await parseJsonOrThrow(res, 'Gagal mengirim pesanan');

      setCompletedOrder(data);
      setCart({}); // clear cart
    } catch (err: any) {
      setCheckoutError(err.message || 'Terjadi kesalahan sistem saat memproses pemesanan.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return {
    checkoutError,
    submittingOrder,
    completedOrder,
    setCompletedOrder,
    handleCheckout,
  };
}
