import { createPortal } from 'react-dom';
import { Order, OrderStatus, Product, FooterSettings } from '../../types';
import { formatDateLabel, formatDateTimeLabel } from '../../lib/date';
import { calculateRentalCost } from '../../pricing';
import bilboLogoWide from '../../assets/bilbo-logo-wide.webp';

interface OrderResiPrintProps {
  order: Order;
  products: Product[];
  storeFooter: FooterSettings;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  'Pending': 'PENDING - BELUM DIBAYAR',
  'Approved/Paid': 'LUNAS - MENUNGGU PENGAMBILAN',
  'Item Picked Up': 'LUNAS - BARANG SUDAH DIAMBIL',
  'Item Returned/Completed': 'SELESAI - BARANG SUDAH KEMBALI',
  'Expired': 'KEDALUWARSA - BELUM DIBAYAR',
};

export default function OrderResiPrint({ order, products, storeFooter }: OrderResiPrintProps) {
  const totalInvoice = (order.totalPrice || 0) + (order.lateFee || 0);

  // Portaled to a direct sibling of #root under <body>, not rendered inline
  // where OrderDetailPanel mounts it - so it sits outside the whole app's DOM
  // subtree and stays in normal document flow for print. See index.css's
  // @media print block (hides #root, not this) for why that matters: a resi
  // with enough items to span multiple pages needs normal flow to paginate
  // correctly, which an element nested deep inside the app (and therefore
  // needing position:absolute to reach the page's top-left) can't do.
  return createPortal(
    <div id="print-resi" className="hidden print:block p-8 text-black bg-white text-xs font-bold leading-relaxed">
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-4">
        <div className="flex items-center gap-3">
          <img src={bilboLogoWide} alt="Bilbo Outdoors" className="h-8 w-auto" />
        </div>
        <div className="text-right">
          <p className="text-lg font-black uppercase tracking-tight">Resi Sewa</p>
          <p className="font-mono font-black">No: {order.id}</p>
          <p className="font-mono text-[10px] font-black">Dicetak: {formatDateTimeLabel(new Date())}</p>
        </div>
      </div>

      <p className="text-[10px] mb-4">
        {storeFooter.address}
        {storeFooter.whatsappText ? ` — ${storeFooter.whatsappText}` : ''}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4 border-2 border-black p-3">
        <div>
          <p className="font-black uppercase text-[10px]">Penyewa</p>
          <p className="font-black">{order.customerName}</p>
          <p className="font-black">{order.customerWhatsApp}</p>
        </div>
        <div className="text-right">
          <p className="font-black uppercase text-[10px]">Status</p>
          <p className="font-black">{STATUS_LABELS[order.status]}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 border-2 border-black p-3">
        <div>
          <p className="font-black uppercase text-[10px]">Jadwal Sewa</p>
          <p className="font-black">{formatDateLabel(order.startDate)} s/d {formatDateLabel(order.endDate)}</p>
        </div>
        <div className="text-right">
          <p className="font-black uppercase text-[10px]">Total Durasi</p>
          <p className="font-black">{order.rentDuration} Hari</p>
        </div>
      </div>

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-black text-[10px] uppercase font-black">
            <th className="text-left py-1.5">Item</th>
            <th className="text-right py-1.5">Qty</th>
            <th className="text-right py-1.5">Harga</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId);
            const attrLine = product && (product.varian || product.size || product.color)
              ? [
                  product.varian && `Varian: ${product.varian}`,
                  product.size && `Ukuran: ${product.size}`,
                  product.color && `Warna: ${product.color}`,
                ].filter(Boolean).join(' • ')
              : null;
            const priceLabel = item.ratesSnapshot
              ? `Rp ${calculateRentalCost(item.ratesSnapshot, order.rentDuration).toLocaleString('id-ID')}`
              : item.legacyPricePerDay !== undefined
              ? `Rp ${item.legacyPricePerDay.toLocaleString('id-ID')}/hari`
              : '-';
            return (
              <tr key={index} className="border-b border-black">
                <td className="py-1.5">
                  <p className="font-black">{item.productName}</p>
                  {attrLine && <p className="text-[10px] font-bold">{attrLine}</p>}
                </td>
                <td className="text-right py-1.5 font-black">{item.quantity}</td>
                <td className="text-right py-1.5 font-mono font-black">{priceLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-2 border-black p-3 mb-6 space-y-1.5 font-black">
        <div className="flex justify-between">
          <span>Biaya Rental Pokok ({order.rentDuration} Hari)</span>
          <span className="font-mono">Rp {order.totalPrice.toLocaleString('id-ID')}</span>
        </div>
        {order.lateFee && order.lateFee > 0 ? (
          <div className="flex justify-between">
            <span>Denda Terlambat ({order.lateDays} Hari)</span>
            <span className="font-mono">Rp {order.lateFee.toLocaleString('id-ID')}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t-2 border-black pt-1.5 text-sm">
          <span>Total Invoice</span>
          <span className="font-mono">Rp {totalInvoice.toLocaleString('id-ID')}</span>
        </div>
        {order.pickupIdType && (
          <p className="text-[10px] pt-1">Jaminan diberikan saat pengambilan: {order.pickupIdType}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8 mt-12 text-center text-[10px] font-black">
        <div>
          <div className="border-t-2 border-black pt-1.5 mx-6">Tanda Tangan Penyewa</div>
        </div>
        <div>
          <div className="border-t-2 border-black pt-1.5 mx-6">Tanda Tangan Staff</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
