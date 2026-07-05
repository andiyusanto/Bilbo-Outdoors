import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  MapPin, 
  Instagram, 
  Phone, 
  ShoppingBag, 
  Check, 
  AlertCircle, 
  Upload, 
  FileText, 
  ChevronRight, 
  Info,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Product, Order } from '../types';
import QRISCode from './QRISCode';

interface ClientPortalProps {
  onAdminToggle: () => void;
  themeId: string;
  setThemeId: (id: string) => void;
}

export default function ClientPortal({ onAdminToggle, themeId, setThemeId }: ClientPortalProps) {
  // Products and Database State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);

  // Booking details state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [rentDuration, setRentDuration] = useState<number>(0);
  
  // Cart state: Record of productId -> quantity selected
  const [cart, setCart] = useState<Record<string, number>>({});
  
  // Real-time stock checked details from the backend
  const [stockDetails, setStockDetails] = useState<Record<string, { remaining: number; allocated: number }>>({});
  const [checkingStock, setCheckingStock] = useState<boolean>(false);

  // Checkout Form State
  const [customerName, setCustomerName] = useState<string>('');
  const [customerWhatsApp, setCustomerWhatsApp] = useState<string>('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardBase64, setIdCardBase64] = useState<string>('');
  const [checkoutError, setCheckoutError] = useState<string>('');
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

  // Successfully submitted order state
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // Category filter state
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  // Categories list
  const categories = [
    'ALL',
    'TENT & SHELTER',
    'SLEEPING SYSTEM',
    'CARRIER & BACKPACK',
    'COOKING GEAR',
    'LIGHTING & POWER',
    'HIKING ESSENTIALS',
    'CAMP SUPPORT'
  ];

  // Load products initially
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Recalculate duration when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end >= start) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive rent days
        setRentDuration(days);
        // Automatically check remaining inventory stock whenever date changes
        checkInventoryStock(startDate, endDate);
      } else {
        setRentDuration(0);
        setStockDetails({});
      }
    } else {
      setRentDuration(0);
      setStockDetails({});
    }
  }, [startDate, endDate]);

  // Check database stock in real-time
  const checkInventoryStock = async (startStr: string, endStr: string) => {
    setCheckingStock(true);
    try {
      const res = await fetch('/api/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: startStr, endDate: endStr })
      });
      const data = await res.json();
      if (res.ok && data.details) {
        const stockMap: Record<string, { remaining: number; allocated: number }> = {};
        data.details.forEach((item: any) => {
          stockMap[item.productId] = {
            remaining: item.remaining,
            allocated: item.allocated
          };
        });
        setStockDetails(stockMap);

        // Adjust cart if any quantity exceeds new available stock
        setCart(prev => {
          const updated = { ...prev };
          let changed = false;
          Object.keys(updated).forEach(pId => {
            const avail = stockMap[pId]?.remaining ?? 999;
            if (updated[pId] > avail) {
              if (avail <= 0) {
                delete updated[pId];
              } else {
                updated[pId] = avail;
              }
              changed = true;
            }
          });
          return changed ? updated : prev;
        });
      }
    } catch (err) {
      console.error('Error checking stock:', err);
    } finally {
      setCheckingStock(false);
    }
  };

  // Convert uploaded image file (ID/SIM card) to base64 for backend upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdCardFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdCardBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateCart = (productId: string, quantity: number) => {
    if (!startDate || !endDate) {
      alert('Silakan pilih Tanggal Mulai & Tanggal Selesai sewa terlebih dahulu!');
      return;
    }

    const available = stockDetails[productId]?.remaining ?? 0;
    const clampedQty = Math.max(0, Math.min(quantity, available));

    setCart(prev => {
      const updated = { ...prev };
      if (clampedQty === 0) {
        delete updated[productId];
      } else {
        updated[productId] = clampedQty;
      }
      return updated;
    });
  };

  // Pricing helper
  const calculateItemCost = (product: Product, quantity: number) => {
    if (rentDuration <= 0) return 0;
    let singleItemCost = 0;
    for (let day = 1; day <= rentDuration; day++) {
      if (day > 5) {
        singleItemCost += (product.price + product.incrementalPriceAfter5Days);
      } else {
        singleItemCost += product.price;
      }
    }
    return singleItemCost * quantity;
  };

  const getCartTotal = () => {
    let total = 0;
    Object.entries(cart).forEach(([pId, qty]) => {
      const prod = products.find(p => p.id === pId);
      if (prod) {
        total += calculateItemCost(prod, qty as number);
      }
    });
    return total;
  };

  const handleCheckout = async (e: React.FormEvent) => {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pesanan');
      }

      setCompletedOrder(data);
      setCart({}); // clear cart
    } catch (err: any) {
      setCheckoutError(err.message || 'Terjadi kesalahan sistem saat memproses pemesanan.');
    } finally {
      setSubmittingOrder(false);
    }
  };

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

  // Filter products by active category selection
  const filteredProducts = products.filter(p => {
    return activeCategory === 'ALL' || p.category === activeCategory;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12 pb-24">
      
      {/* 1. HERO SECTION */}
      <section className="bg-white border-4 border-black text-black p-8 md:p-12 relative overflow-hidden flex flex-col justify-between min-h-[380px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        {/* Editorial Pattern Background */}
        <div className="absolute inset-0 bg-brand/5 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:32px_32px] opacity-10 pointer-events-none"></div>

        {/* Top Badges & Meta Info */}
        <div className="flex flex-wrap justify-between items-center gap-3 relative z-10">
          <div className="flex items-center space-x-2 bg-black text-brand border-2 border-black px-4 py-1.5 font-mono text-[10px] tracking-widest uppercase font-black">
            <span className="w-2 h-2 bg-brand rounded-none animate-pulse"></span>
            <span>SYSTEM ONLINE & READY</span>
          </div>
          
          <div className="flex items-center bg-brand border-2 border-black px-4 py-1.5 text-xs text-black font-black uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <MapPin className="w-3.5 h-3.5 mr-1.5 text-black stroke-[3]" />
            <span>SURABAYA, IDN</span>
          </div>
        </div>

        {/* Main Brand & Copy */}
        <div className="my-8 max-w-3xl relative z-10">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black tracking-tighter text-black leading-none uppercase">
            RENT QUALITY<br/>OUTDOOR GEAR
          </h1>
          <p className="text-zinc-700 text-xs sm:text-sm font-semibold max-w-2xl mt-4 leading-relaxed uppercase">
            Professional outdoor equipment rental based in the heart of Surabaya. Sterilized, high-quality, mountain-tested premium gears with express digital check-out.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a 
              href="https://instagram.com/bilbooutdoors" 
              target="_blank" 
              rel="referrer"
              className="inline-flex items-center text-xs font-black uppercase tracking-widest bg-white hover:bg-brand border-2 border-black px-5 py-3 text-black transition-all shadow-[4px_4px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              <Instagram className="w-4 h-4 mr-2 text-black stroke-[2.5]" />
              @bilbooutdoors
            </a>

            <a 
              href="https://wa.me/628113706666" 
              target="_blank" 
              className="inline-flex items-center text-xs font-black uppercase tracking-widest bg-black hover:bg-brand text-white hover:text-black border-2 border-black px-6 py-3 transition-all shadow-[4px_4px_0px_var(--brand-color)] cursor-pointer"
            >
              <Phone className="w-4 h-4 mr-2" />
              WhatsApp Admin
            </a>
          </div>
        </div>

        {/* Dynamic Warning Alert banner */}
        <div className="bg-brand/10 border-2 border-black p-4 rounded-none relative z-10 flex items-start space-x-3 text-xs text-black max-w-xl shadow-[3px_3px_0px_rgba(0,0,0,1)]">
          <Info className="w-4.5 h-4.5 text-black shrink-0 mt-0.5 stroke-[3]" />
          <p className="leading-normal font-bold uppercase tracking-wide text-[11px]">
            <strong>SISTEM DISKON OTOMATIS:</strong> KHUSUS KATEGORI TENDA & SHELTER, TEMUKAN POTONGAN HARGA <strong>+10K/HARI</strong> SETELAH PENYEMAAN 5 HARI BERTURUT-TURUT!
          </p>
        </div>
      </section>

      {completedOrder ? (
        /* 4. SUCCESS PAYMENT SCREEN */
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
                onClick={() => setCompletedOrder(null)}
                className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest cursor-pointer"
              >
                Kembali ke Katalog
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* 2. CATALOG & BOOKING MAIN AREA */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT SIDE: Datepicker, Catalog & Equipment List */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Rent Date picker Card */}
            <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4">
              <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight">
                <Calendar className="w-5 h-5 mr-2 text-black stroke-[3]" />
                PILIH TANGGAL PENYEWAAN
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Mulai Sewa</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white cursor-pointer uppercase text-black"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Selesai Sewa</label>
                  <input
                    type="date"
                    required
                    min={startDate || new Date().toISOString().split('T')[0]}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white cursor-pointer uppercase text-black"
                  />
                </div>
              </div>

              {rentDuration > 0 ? (
                <div className="bg-black text-white px-4 py-3.5 rounded-none flex justify-between items-center text-xs font-bold font-mono tracking-widest uppercase border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,0.15)]">
                  <span>DURASI SEWA DIHITUNG:</span>
                  <span className="text-black bg-brand px-3 py-1 font-black text-sm border border-black">{rentDuration} HARI</span>
                </div>
              ) : (
                <p className="text-xs text-amber-600 font-bold uppercase tracking-wide">🚨 SILAKAN PILIH RENTANG TANGGAL SEWA UNTUK MELIHAT KETERSEDIAAN STOK AKTUAL DAN MULAI MEMESAN.</p>
              )}
            </div>

            {/* Category Filter Tabs */}
            <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 space-x-2 scrollbar-thin scrollbar-thumb-zinc-300">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-none text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 shrink-0 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
                    activeCategory === cat 
                      ? 'bg-brand text-black border-black font-black' 
                      : 'bg-white text-zinc-500 hover:text-black border-black hover:bg-zinc-50'
                  }`}
                >
                  {cat.replace('&', '/')}
                </button>
              ))}
            </div>

            {/* Equipment Grid */}
            {loadingProducts ? (
              <div className="py-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 italic">
                Memuat katalog alat camping Bilbo Outdoors...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 bg-white border-2 border-black rounded-none">
                Tidak ada produk di kategori ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredProducts.map((prod) => {
                  const selectedQty = cart[prod.id] || 0;
                  const availableInfo = stockDetails[prod.id];
                  const hasDates = startDate && endDate;
                  const isOutOfStock = hasDates && availableInfo && availableInfo.remaining <= 0;
                  
                  return (
                    <div 
                      key={prod.id} 
                      className={`bg-white border-2 p-5 rounded-none transition-all flex flex-col justify-between space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_rgba(0,0,0,1)] ${
                        selectedQty > 0 ? 'border-black ring-2 ring-brand' : 'border-black'
                      }`}
                    >
                      <div>
                        {/* Header info */}
                        <div className="flex justify-between items-start gap-2 border-b border-black pb-2">
                          <span className="text-[9px] font-mono font-black bg-black text-white px-2 py-0.5 rounded-none uppercase">
                            {prod.category}
                          </span>
                          
                          {/* Stock status indicator */}
                          {hasDates && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-none uppercase border ${
                              isOutOfStock 
                                ? 'bg-red-100 text-red-800 border-red-800' 
                                : 'bg-emerald-100 text-emerald-800 border-emerald-800'
                            }`}>
                              {isOutOfStock ? 'STOK HABIS' : `Tersisa: ${availableInfo?.remaining ?? prod.stock} unit`}
                            </span>
                          )}
                        </div>

                        <h4 className="font-display font-black text-base text-black mt-3 uppercase tracking-tight">{prod.name}</h4>
                        {prod.description && (
                          <p className="text-[11px] text-zinc-600 mt-1 line-clamp-3 uppercase font-semibold leading-relaxed">{prod.description}</p>
                        )}
                      </div>

                      {/* Pricing and cart controller */}
                      <div className="border-t border-black pt-3.5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Sewa / Hari</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="bg-brand px-2 py-0.5 text-xs font-black border border-black shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                              {Math.round(prod.price/1000)}K / HARI
                            </span>
                          </div>
                          {prod.incrementalPriceAfter5Days > 0 && (
                            <p className="text-[9px] text-zinc-600 font-black mt-1 uppercase">
                              {`>5 HARI: +${(prod.incrementalPriceAfter5Days/1000)}K/HARI`}
                            </p>
                          )}
                        </div>

                        {/* Cart count updater buttons */}
                        <div className="flex items-center space-x-1">
                          {selectedQty > 0 ? (
                            <div className="flex items-center space-x-1 border-2 border-black bg-zinc-50 p-1 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                              <button
                                onClick={() => handleUpdateCart(prod.id, selectedQty - 1)}
                                className="w-7 h-7 bg-white hover:bg-zinc-100 rounded-none border border-black text-xs font-black transition-all text-black cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-black text-black font-mono w-6 text-center">
                                {selectedQty}
                              </span>
                              <button
                                onClick={() => handleUpdateCart(prod.id, selectedQty + 1)}
                                disabled={isOutOfStock || selectedQty >= (availableInfo?.remaining ?? prod.stock)}
                                className="w-7 h-7 bg-white hover:bg-zinc-100 rounded-none border border-black text-xs font-black transition-all text-black disabled:opacity-45 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleUpdateCart(prod.id, 1)}
                              disabled={isOutOfStock}
                              className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-none border-2 transition-all cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
                                isOutOfStock
                                  ? 'bg-zinc-100 text-zinc-400 border-zinc-300 cursor-not-allowed shadow-none'
                                  : 'bg-brand hover:bg-black hover:text-white border-black text-black font-black'
                              }`}
                            >
                              {isOutOfStock ? 'Stok Kosong' : 'Pilih Alat'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Cart Summary & Checkout form */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Cart summary box */}
            <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-6 space-y-5">
              <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight border-b-4 border-brand pb-2">
                <ShoppingBag className="w-5 h-5 mr-2 text-black stroke-[3]" />
                CURRENT SELECTION
              </h3>

              {Object.keys(cart).length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-400 font-bold uppercase tracking-wider">
                  Belum ada alat camping dipilih. Pilih di katalog sebelah kiri.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cart item rows */}
                  <div className="divide-y divide-black/10 border-b border-black pb-4 max-h-60 overflow-y-auto pr-1">
                    {Object.entries(cart).map(([pId, qty]) => {
                      const prod = products.find(p => p.id === pId);
                      if (!prod) return null;
                      const cost = calculateItemCost(prod, qty as number);
                      return (
                        <div key={pId} className="py-3 flex justify-between items-start text-xs text-zinc-800 uppercase font-semibold">
                          <div>
                            <span className="font-black text-black">{prod.name}</span>
                            <span className="text-zinc-400 mx-1.5">x</span>
                            <span className="font-black text-black font-mono bg-brand/20 border border-black px-1.5 py-0.5">{qty} Unit</span>
                            <p className="text-[10px] text-zinc-500 mt-1 font-mono font-bold">
                              {rentDuration} Hari sewa
                            </p>
                          </div>
                          <span className="font-black text-black font-mono">
                            Rp {cost.toLocaleString('id-ID')}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total price box */}
                  <div className="flex justify-between items-baseline font-display text-black">
                    <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Total Biaya Sewa:</span>
                    <span className="text-2xl font-black text-black bg-brand border-2 border-black px-3 py-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      Rp {getCartTotal().toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Checkout Form */}
            <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-6 space-y-5">
              <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight border-b-4 border-brand pb-2">
                <FileText className="w-5 h-5 mr-2 text-black stroke-[3]" />
                FORMULIR PENYEWA
              </h3>

              {checkoutError && (
                <div className="bg-red-50 border-2 border-red-500 text-red-800 text-xs p-3 rounded-none flex items-start font-bold uppercase">
                  <AlertCircle className="w-4.5 h-4.5 mr-2 shrink-0 text-red-600 stroke-[3]" />
                  <span>{checkoutError}</span>
                </div>
              )}

              <form onSubmit={handleCheckout} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-black uppercase tracking-wider">Nama Lengkap Anda</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white uppercase text-black"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-black uppercase tracking-wider">No. WhatsApp Aktif</label>
                  <input
                    type="tel"
                    required
                    value={customerWhatsApp}
                    onChange={(e) => setCustomerWhatsApp(e.target.value)}
                    placeholder="Contoh: 08123456789"
                    className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white uppercase text-black"
                  />
                </div>

                {/* ID Card file uploader */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                    Upload Foto Jaminan (KTP / SIM)
                  </label>
                  
                  <div className="border-2 border-dashed border-black rounded-none hover:bg-brand/5 transition-all bg-zinc-50 relative overflow-hidden">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    
                    {idCardBase64 ? (
                      <div className="p-3 text-center">
                        <img 
                          src={idCardBase64} 
                          alt="ID Card guarantee thumbnail" 
                          referrerPolicy="no-referrer"
                          className="mx-auto max-h-32 rounded-none object-contain border border-black"
                        />
                        <p className="text-[10px] text-zinc-500 font-mono mt-2 truncate max-w-xs mx-auto font-bold uppercase">
                          {idCardFile?.name} (Siap Diunggah)
                        </p>
                      </div>
                    ) : (
                      <div className="py-6 text-center space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-zinc-600 stroke-[2.5]" />
                        <p className="text-xs font-black text-black uppercase tracking-wider">Tarik gambar / Klik di sini</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase leading-normal px-2">KTP atau SIM sebagai jaminan rental fisik</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warning note */}
                <div className="flex p-3 bg-zinc-50 border-2 border-black rounded-none space-x-2.5 text-[10px] text-zinc-700 leading-normal uppercase font-bold">
                  <ShieldAlert className="w-4 h-4 text-black shrink-0 stroke-[2.5]" />
                  <p>Kartu identitas Anda diunggah dengan aman ke server enkripsi Bilbo Outdoors dan hanya digunakan untuk kepentingan administrasi jaminan.</p>
                </div>

                <button
                  type="submit"
                  disabled={submittingOrder || Object.keys(cart).length === 0}
                  className="w-full flex justify-center py-4 px-4 border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] text-xs font-black uppercase tracking-widest bg-black text-brand hover:bg-brand hover:text-black transition-colors focus:outline-none mt-6 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingOrder ? 'Memproses Pesanan...' : 'Kirim Pemesanan & Bayar'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Decorative Marquee Ticker Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-12 bg-brand border-t-2 border-black flex items-center px-10 overflow-hidden whitespace-nowrap z-30 shadow-[0_-2px_8px_rgba(0,0,0,0.15)]">
        <div className="flex gap-20 text-[11px] font-black uppercase tracking-[0.2em] animate-marquee text-black">
          <span>Tent & Shelter</span>
          <span>Sleeping Systems</span>
          <span>Carrier & Backpack</span>
          <span>Cooking Gear</span>
          <span>Lighting & Power</span>
          <span>Hiking Essentials</span>
          <span>Camp Support</span>
          <span>Tent & Shelter</span>
          <span>Sleeping Systems</span>
          <span>Carrier & Backpack</span>
          <span>Cooking Gear</span>
          <span>Lighting & Power</span>
          <span>Hiking Essentials</span>
          <span>Camp Support</span>
        </div>
      </div>

    </div>
  );
}
