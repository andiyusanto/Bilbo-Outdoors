import { useState } from 'react';
import { MapPin, Instagram, Phone } from 'lucide-react';
import { Product } from '../types';
import { useProducts } from '../hooks/useProducts';
import { useAvailability } from '../hooks/useAvailability';
import { useIdCardUpload } from '../hooks/useIdCardUpload';
import { useOrderSubmission } from '../hooks/useOrderSubmission';
import DateRangePicker from './client/DateRangePicker';
import CategoryFilterTabs from './client/CategoryFilterTabs';
import EquipmentGrid from './client/EquipmentGrid';
import CartSummary from './client/CartSummary';
import CheckoutForm from './client/CheckoutForm';
import OrderSuccessScreen from './client/OrderSuccessScreen';
import DiscountCarousel from './client/DiscountCarousel';

interface ClientPortalProps {
  onAdminToggle: () => void;
  themeId: string;
  setThemeId: (id: string) => void;
}

export default function ClientPortal({ onAdminToggle, themeId, setThemeId }: ClientPortalProps) {
  // Products and Database State
  const { products, loadingProducts } = useProducts();

  // Cart state: Record of productId -> quantity selected
  const [cart, setCart] = useState<Record<string, number>>({});

  // Booking details & real-time stock availability
  const { startDate, setStartDate, endDate, setEndDate, rentDuration, stockDetails } = useAvailability(setCart);

  // Checkout Form State
  const [customerName, setCustomerName] = useState<string>('');
  const [customerWhatsApp, setCustomerWhatsApp] = useState<string>('');
  const { idCardFile, idCardBase64, handleFileChange } = useIdCardUpload();

  const {
    checkoutError,
    submittingOrder,
    completedOrder,
    setCompletedOrder,
    handleCheckout,
  } = useOrderSubmission({
    cart,
    setCart,
    customerName,
    customerWhatsApp,
    startDate,
    endDate,
    rentDuration,
    idCardBase64,
  });

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
      if (day > product.discountMinDays) {
        singleItemCost += (product.price - product.incrementalPriceAfter5Days);
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

        {/* Dynamic Warning Alert banner / discount carousel */}
        <DiscountCarousel products={products} categoryOrder={categories.filter(c => c !== 'ALL')} />
      </section>

      {completedOrder ? (
        /* 4. SUCCESS PAYMENT SCREEN */
        <OrderSuccessScreen completedOrder={completedOrder} onReset={() => setCompletedOrder(null)} />
      ) : (
        /* 2. CATALOG & BOOKING MAIN AREA */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT SIDE: Datepicker, Catalog & Equipment List */}
          <div className="lg:col-span-8 space-y-8">

            <DateRangePicker
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              rentDuration={rentDuration}
            />

            <CategoryFilterTabs
              categories={categories}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
            />

            <EquipmentGrid
              loadingProducts={loadingProducts}
              filteredProducts={filteredProducts}
              cart={cart}
              stockDetails={stockDetails}
              startDate={startDate}
              endDate={endDate}
              onUpdateCart={handleUpdateCart}
            />
          </div>

          {/* RIGHT SIDE: Cart Summary & Checkout form */}
          <div className="lg:col-span-4 space-y-6">
            <CartSummary
              cart={cart}
              products={products}
              rentDuration={rentDuration}
              calculateItemCost={calculateItemCost}
              getCartTotal={getCartTotal}
            />

            <CheckoutForm
              customerName={customerName}
              setCustomerName={setCustomerName}
              customerWhatsApp={customerWhatsApp}
              setCustomerWhatsApp={setCustomerWhatsApp}
              idCardFile={idCardFile}
              idCardBase64={idCardBase64}
              onFileChange={handleFileChange}
              checkoutError={checkoutError}
              submittingOrder={submittingOrder}
              cartIsEmpty={Object.keys(cart).length === 0}
              onSubmit={handleCheckout}
            />
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
