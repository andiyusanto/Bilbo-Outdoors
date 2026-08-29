import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, Compass, Instagram, MapPin } from 'lucide-react';
import ClientPortal from './components/ClientPortal';
import OrderConfirmationPage from './components/client/OrderConfirmationPage';
import { THEMES } from './themes';
import { Theme, FooterSettings, WeeklyHours } from './types';
import { summarizeOperatingHours } from './lib/operatingHours';
import bilboLogoWide from './assets/bilbo-logo-wide.webp';
import bilboIcon from './assets/bilbo-icon.webp';
import { LoadingProvider } from './contexts/LoadingContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoadingOverlay from './components/LoadingOverlay';

// Matches the site's original hardcoded footer/marquee text - used as the
// initial render before GET /api/store-info resolves (and if it ever fails),
// so there's no flash of empty content. Mirrors db/defaultSettings.ts's
// values without importing it directly - src/ never imports from db/, that
// boundary is server-only code vs. the client bundle.
const FALLBACK_FOOTER: FooterSettings = {
  description: 'Penyedia sewa alat kemah, trekking, dan hiking terlengkap dan tepercaya di kota Surabaya. Kami memastikan petualangan Anda aman dengan alat berkualitas terbaik.',
  address: 'Jl. Ngagel Jaya Tengah No. 12, Pucang Sewu, Kec. Gubeng, Kota Surabaya, Jawa Timur 60283',
  instagramHandle: '@bilbooutdoors (INSTAGRAM)',
  instagramUrl: 'https://instagram.com/bilbooutdoors',
  whatsappText: 'Narahubung Cepat WA: 0811-370-6666',
  copyrightText: '© 2026 Bilbo Outdoors Surabaya. All rights reserved. Hubungi kami untuk petualangan seru Anda!',
};
const FALLBACK_OPERATING_HOURS: WeeklyHours = {
  monday: { open: '12:00', close: '22:00' },
  tuesday: { open: '09:00', close: '22:00' },
  wednesday: { open: '09:00', close: '22:00' },
  thursday: { open: '09:00', close: '22:00' },
  friday: { open: '09:00', close: '22:00' },
  saturday: { open: '09:00', close: '22:00' },
  sunday: { open: '12:00', close: '22:00' },
};
const FALLBACK_RUNNING_TEXT = [
  'Tent & Shelter', 'Sleeping Systems', 'Carrier & Backpack', 'Cooking Gear',
  'Lighting & Power', 'Hiking Essentials', 'Camp Support', 'Apparel & Personal Gear',
];
// Shown in the checkout page's Syarat & Ketentuan popup before GET
// /api/store-info resolves (or if it ever fails) - kept intentionally short
// and generic here, unlike the other fallbacks above which mirror real
// content exactly, since the real text is expected to always be configured
// via Pengaturan by the time this ever matters in practice.
const FALLBACK_TERMS = 'Syarat & ketentuan belum tersedia. Silakan hubungi kami jika ada pertanyaan sebelum melanjutkan pemesanan.';

// Lazy-loaded: the admin dashboard (all its tabs/hooks) has no reason to be
// in the bundle every client visitor downloads on first paint.
const AdminPanel = lazy(() => import('./components/AdminPanel'));

export default function App() {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');
  // Theme is fixed to Sunset Ochre - the theme switcher has been removed.
  const activeTheme = THEMES.find(t => t.id === 'sunset-ochre') || THEMES[0];

  const [footer, setFooter] = useState<FooterSettings>(FALLBACK_FOOTER);
  const [operatingHours, setOperatingHours] = useState<WeeklyHours>(FALLBACK_OPERATING_HOURS);
  const [runningText, setRunningText] = useState<string[]>(FALLBACK_RUNNING_TEXT);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(FALLBACK_TERMS);

  useEffect(() => {
    fetch('/api/store-info')
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((info) => {
        // Only override a fallback if the server actually sent that piece -
        // guards against a settings row that predates one of these fields
        // (shouldn't happen once server.ts's own JSON-file/Postgres fallbacks
        // are in place, but a crash-prone footer render is worse than a stale one).
        if (info.footer) setFooter(info.footer);
        if (info.operatingHours) setOperatingHours(info.operatingHours);
        if (Array.isArray(info.runningText)) setRunningText(info.runningText);
        if (info.termsAndConditions) setTermsAndConditions(info.termsAndConditions);
      })
      .catch(() => {}); // keep the fallback values - footer stays functional either way
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-color', activeTheme.primary);
    root.style.setProperty('--brand-color-hover', activeTheme.primaryHover);
    root.style.setProperty('--brand-color-rgb', activeTheme.primaryRgb);
  }, [activeTheme]);

  return (
    <LoadingProvider>
    <NotificationProvider>
    <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-brand selection:text-black">

      {/* Global Header */}
      {!isAdminRoute && (
        <header className="bg-white border-b-2 border-black sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
            
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img src={bilboLogoWide} alt="Bilbo Outdoors" width={240} height={131} className="h-9 sm:h-11 w-auto" />
              <p className="text-[9px] text-zinc-500 font-mono tracking-widest font-black uppercase border-l-2 border-black pl-3">CAMPING EQUIPMENT<br/>RENTAL • SURABAYA, IDN</p>
            </div>

            {/* Navigation / Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="hidden sm:flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-black bg-brand px-3.5 py-1.5 border-2 border-black">
                <MapPin className="w-3.5 h-3.5 text-black stroke-[3]" />
                <span>SURABAYA, IDN</span>
              </div>

              <div className="h-6 w-0.5 bg-black hidden md:block"></div>

              <Link
                to="/admin/overview"
                className="flex items-center text-xs font-black uppercase tracking-widest text-white bg-black hover:bg-brand hover:text-black px-4 py-2.5 border-2 border-black transition-colors duration-200 cursor-pointer shadow-[3px_3px_0px_var(--brand-color)]"
              >
                <Shield className="w-3.5 h-3.5 mr-1.5 text-brand" />
                Staff Admin
              </Link>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-1">
        <Routes>
          <Route
            path="/"
            element={<ClientPortal onAdminToggle={() => {}} runningText={runningText} termsAndConditions={termsAndConditions} />}
          />
          <Route path="/pesanan/:token" element={<OrderConfirmationPage />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<LoadingOverlay show={true} />}>
                <AdminPanel />
              </Suspense>
            }
          />
        </Routes>
      </div>

      {/* Global Footer */}
      {!isAdminRoute && (
        <footer className="bg-black text-white py-16 px-6 border-t-2 border-black shrink-0">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
            
            {/* Branding & Contact */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <img src={bilboIcon} alt="" width={36} height={36} loading="lazy" className="h-9 w-9" />
                <h3 className="font-display font-black tracking-tighter text-xl uppercase text-brand">BILBO OUTDOORS</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
                {footer.description}
              </p>
            </div>

            {/* Location & Opening Hours */}
            <div className="space-y-4 text-xs">
              <h4 className="font-display font-black tracking-widest text-brand uppercase text-xs border-b border-zinc-800 pb-2">Surabaya Basecamp</h4>
              <div className="space-y-2 text-zinc-300">
                <p className="leading-relaxed">
                  {footer.address}
                </p>
                {summarizeOperatingHours(operatingHours).map((line) => (
                  <p key={line} className="font-black text-white tracking-wider font-mono">{line}</p>
                ))}
              </div>
            </div>

            {/* Quick Links & Instagram */}
            <div className="space-y-4 text-xs">
              <h4 className="font-display font-black tracking-widest text-brand uppercase text-xs border-b border-zinc-800 pb-2">Ikuti Kami</h4>
              <div className="space-y-2">
                <a
                  href={footer.instagramUrl}
                  target="_blank"
                  rel="referrer"
                  className="flex items-center text-zinc-300 hover:text-white transition-colors uppercase font-bold tracking-wider"
                >
                  <Instagram className="w-4 h-4 mr-2 text-brand" />
                  {footer.instagramHandle}
                </a>
                <p className="text-[10px] text-zinc-400 font-mono uppercase font-bold">{footer.whatsappText}</p>
              </div>
            </div>

          </div>

          <div className="max-w-7xl mx-auto border-t border-zinc-900 mt-12 pt-8 text-center text-[10px] text-zinc-400 font-mono uppercase tracking-widest leading-relaxed">
            <p>{footer.copyrightText}</p>
          </div>
        </footer>
      )}

    </div>
    </NotificationProvider>
    </LoadingProvider>
  );
}
