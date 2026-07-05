import React, { useState, useEffect } from 'react';
import { Shield, Compass, Instagram, MapPin, Palette } from 'lucide-react';
import ClientPortal from './components/ClientPortal';
import AdminPanel from './components/AdminPanel';
import { THEMES } from './themes';
import { Theme } from './types';

export default function App() {
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [themeId, setThemeId] = useState<string>(() => {
    return localStorage.getItem('bilbo-outdoor-theme') || 'sunset-ochre';
  });

  const activeTheme = THEMES.find(t => t.id === themeId) || THEMES[0];

  useEffect(() => {
    localStorage.setItem('bilbo-outdoor-theme', themeId);
    // Apply theme variables to document element
    const root = document.documentElement;
    root.style.setProperty('--brand-color', activeTheme.primary);
    root.style.setProperty('--brand-color-hover', activeTheme.primaryHover);
    root.style.setProperty('--brand-color-rgb', activeTheme.primaryRgb);
  }, [themeId, activeTheme]);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-brand selection:text-black">
      
      {/* Global Header */}
      {!isAdminView && (
        <header className="bg-white border-b-2 border-black sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
            
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="bg-brand text-black flex items-center justify-center font-display font-black text-sm px-3 py-1 border-2 border-black uppercase shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                BO
              </div>
              <div>
                <span className="font-display font-black tracking-tighter text-black text-xl sm:text-2xl uppercase">
                  BILBO OUTDOORS
                </span>
                <p className="text-[9px] text-zinc-500 font-mono tracking-widest font-black -mt-1 uppercase">CAMPING EQUIPMENT RENTAL • SURABAYA, IDN</p>
              </div>
            </div>

            {/* Navigation / Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Theme Picker */}
              <div className="relative flex items-center">
                <Palette className="w-4 h-4 text-black absolute left-3 pointer-events-none stroke-[2.5]" />
                <select
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value)}
                  className="appearance-none bg-white text-black text-[10px] font-black uppercase tracking-widest pl-9 pr-8 py-2 border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] focus:outline-none cursor-pointer transition-all"
                  title="Ganti Tema Visual"
                >
                  {THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="hidden sm:flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-black bg-brand px-3.5 py-1.5 border-2 border-black">
                <MapPin className="w-3.5 h-3.5 text-black stroke-[3]" />
                <span>SURABAYA, IDN</span>
              </div>

              <div className="h-6 w-0.5 bg-black hidden md:block"></div>

              <button
                onClick={() => setIsAdminView(true)}
                className="flex items-center text-xs font-black uppercase tracking-widest text-white bg-black hover:bg-brand hover:text-black px-4 py-2.5 border-2 border-black transition-colors duration-200 cursor-pointer shadow-[3px_3px_0px_var(--brand-color)]"
              >
                <Shield className="w-3.5 h-3.5 mr-1.5 text-brand" />
                Staff Admin
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-1">
        {isAdminView ? (
          <AdminPanel 
            onClose={() => setIsAdminView(false)} 
            themeId={themeId} 
            setThemeId={setThemeId} 
          />
        ) : (
          <ClientPortal 
            onAdminToggle={() => setIsAdminView(true)} 
            themeId={themeId} 
            setThemeId={setThemeId} 
          />
        )}
      </div>

      {/* Global Footer */}
      {!isAdminView && (
        <footer className="bg-black text-white py-16 px-6 border-t-2 border-black shrink-0">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
            
            {/* Branding & Contact */}
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="bg-brand text-black px-3.5 py-1.5 font-display font-black text-lg border-2 border-black uppercase shadow-[2px_2px_0px_rgba(255,255,255,1)]">
                  BO
                </div>
                <h3 className="font-display font-black tracking-tighter text-xl uppercase text-brand">BILBO OUTDOORS</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
                Penyedia sewa alat kemah, trekking, dan hiking terlengkap dan tepercaya di kota Surabaya. Kami memastikan petualangan Anda aman dengan alat berkualitas terbaik.
              </p>
            </div>

            {/* Location & Opening Hours */}
            <div className="space-y-4 text-xs">
              <h4 className="font-display font-black tracking-widest text-brand uppercase text-xs border-b border-zinc-800 pb-2">Surabaya Basecamp</h4>
              <div className="space-y-2 text-zinc-300">
                <p className="leading-relaxed">
                  Jl. Ngagel Jaya Tengah No. 12, Pucang Sewu, Kec. Gubeng, Kota Surabaya, Jawa Timur 60283
                </p>
                <p className="font-black text-white tracking-wider font-mono">JAM OPERASIONAL: 08:00 - 22:00 WIB</p>
              </div>
            </div>

            {/* Quick Links & Instagram */}
            <div className="space-y-4 text-xs">
              <h4 className="font-display font-black tracking-widest text-brand uppercase text-xs border-b border-zinc-800 pb-2">Ikuti Kami</h4>
              <div className="space-y-2">
                <a 
                  href="https://instagram.com/bilbooutdoors" 
                  target="_blank" 
                  rel="referrer"
                  className="flex items-center text-zinc-300 hover:text-white transition-colors uppercase font-bold tracking-wider"
                >
                  <Instagram className="w-4 h-4 mr-2 text-brand" />
                  @bilbooutdoors (INSTAGRAM)
                </a>
                <p className="text-[10px] text-zinc-500 font-mono uppercase font-bold">Narahubung Cepat WA: 0811-370-6666</p>
              </div>
            </div>

          </div>

          <div className="max-w-7xl mx-auto border-t border-zinc-900 mt-12 pt-8 text-center text-[10px] text-zinc-500 font-mono uppercase tracking-widest leading-relaxed">
            <p>© 2026 Bilbo Outdoors Surabaya. All rights reserved. Hubungi kami untuk petualangan seru Anda!</p>
          </div>
        </footer>
      )}

    </div>
  );
}
