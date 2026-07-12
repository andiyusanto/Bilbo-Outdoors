import { Check, Phone } from 'lucide-react';
import { Order } from '../../types';
import QRISCode from '../QRISCode';

interface OrderSuccessScreenProps {
  completedOrder: Order;
  onReset: () => void;
}

// Generate WhatsApp message and redirect link
const triggerWhatsAppRedirect = (order: Order) => {
  const formattedTotal = order.totalPrice.toLocaleString('id-ID');
  const itemLines = order.items.map(it => {
    return `- ${it.productName} (x${it.quantity})`;
  }).join('\n');

  const message = `Halo Bilbo Outdoors, saya ingin mengonfirmasi sewa alat camping berikut:

*Detail Penyewa:*
Nama: ${order.customerName}
WhatsApp: ${order.customerWhatsApp}
Periode: ${order.startDate} s/d ${order.endDate} (${order.rentDuration} Hari)

*Peralatan Yang Disewa:*
${itemLines}

*Total Pembayaran:* Rp ${formattedTotal}

Saya sudah melakukan pembayaran. Mohon dikonfirmasi pesanannya untuk pengambilan barang. Terima kasih!`;

  const encodedMessage = encodeURIComponent(message);
  window.open(`https://wa.me/628113706666?text=${encodedMessage}`, '_blank');
};

export default function OrderSuccessScreen({ completedOrder, onReset }: OrderSuccessScreenProps) {
  return (
    <section className="bg-white border-4 border-black p-8 md:p-12 rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-8 max-w-3xl mx-auto">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-brand text-black border-2 border-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(0,0,0,1)]">
          <Check className="w-8 h-8 stroke-[3]" />
        </div>
        <h2 className="text-3xl font-display font-black text-black uppercase tracking-tighter">PESANAN BERHASIL DIKIRIM!</h2>
        <div className="bg-emerald-100 text-emerald-800 border-2 border-emerald-800 inline-block px-4 py-1.5 text-xs font-mono font-black uppercase tracking-wider">
          ID PESANAN: {completedOrder.id}
        </div>
        <p className="text-xs font-bold text-zinc-600 max-w-md mx-auto leading-relaxed uppercase">
          Silakan lakukan pembayaran sesuai instruksi di bawah ini, kemudian kirim bukti transfer Anda dengan menekan tombol konfirmasi WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* QRIS Placeholder Component */}
        <QRISCode amount={completedOrder.totalPrice} />

        {/* Bank Details & Next Step */}
        <div className="space-y-6">
          <div className="bg-white border-2 border-black p-6 rounded-none space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <h3 className="text-xs font-black uppercase text-black tracking-widest border-b-2 border-brand pb-2">TRANSFER BANK TERARAH</h3>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Nama Bank</p>
                <p className="text-xs font-black text-black uppercase mt-0.5">BCA (Bank Central Asia)</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Nomor Rekening</p>
                <p className="text-xl font-black text-black font-mono tracking-wider mt-0.5">1234 - 5678 - 90</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Atas Nama (A/N)</p>
                <p className="text-xs font-black text-black uppercase mt-0.5">BILBO OUTDOORS</p>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-black pt-4 text-[11px] text-zinc-700 font-semibold uppercase leading-normal">
              <p>🔹 Mohon sertakan catatan transfer: <strong>BO - {completedOrder.customerName}</strong></p>
              <p className="mt-1">🔹 Simpan tangkapan layar bukti transfer Anda untuk verifikasi.</p>
            </div>
          </div>

          {/* Order Invoice Summary */}
          <div className="border-2 border-black p-5 rounded-none space-y-3 bg-zinc-50 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <h4 className="text-[10px] font-black uppercase text-black tracking-widest border-b border-black pb-1">RINGKASAN INVOICE</h4>
            <div className="text-xs space-y-2 text-zinc-800 uppercase font-bold">
              <div className="flex justify-between">
                <span>Durasi Sewa ({completedOrder.rentDuration} Hari):</span>
                <strong className="text-black font-mono">{completedOrder.startDate} s/d {completedOrder.endDate}</strong>
              </div>
              <div className="flex justify-between">
                <span>Nama Penyewa:</span>
                <strong className="text-black">{completedOrder.customerName}</strong>
              </div>
              <div className="flex justify-between border-t border-black pt-2 font-black text-black text-sm">
                <span>Jumlah Pembayaran:</span>
                <span className="text-black bg-brand px-2 py-0.5 border border-black">Rp {completedOrder.totalPrice.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => triggerWhatsAppRedirect(completedOrder)}
            className="w-full py-4 bg-black hover:bg-brand hover:text-black text-white font-black text-sm rounded-none border-2 border-black shadow-[4px_4px_0px_var(--brand-color)] transition-colors uppercase tracking-widest flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>Konfirmasi via WhatsApp</span>
          </button>

          <button
            onClick={onReset}
            className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
          >
            Kembali ke Katalog
          </button>
        </div>
      </div>
    </section>
  );
}
