import React from 'react';

interface QRISCodeProps {
  amount?: number;
  className?: string;
}

export default function QRISCode({ amount, className = '' }: QRISCodeProps) {
  return (
    <div className={`flex flex-col items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100 ${className}`}>
      {/* QRIS Logo Header */}
      <div className="w-full flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
        <div className="flex items-center space-x-1">
          <span className="font-display font-black text-xl tracking-tight text-gray-900">QRIS</span>
          <span className="text-[9px] bg-red-600 text-white font-bold px-1 rounded">GPN</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-gray-500 font-mono">NMID: ID102026113706</span>
        </div>
      </div>

      {/* QR Code Graphic (Stylized SVG) */}
      <div className="relative p-3 bg-gray-50 rounded-xl border border-gray-200">
        <svg
          width="180"
          height="180"
          viewBox="0 0 100 100"
          className="text-gray-900"
          fill="currentColor"
        >
          {/* Position detection markers */}
          <rect x="0" y="0" width="25" height="25" fill="black" />
          <rect x="3" y="3" width="19" height="19" fill="white" />
          <rect x="6" y="6" width="13" height="13" fill="black" />

          <rect x="75" y="0" width="25" height="25" fill="black" />
          <rect x="78" y="3" width="19" height="19" fill="white" />
          <rect x="81" y="6" width="13" height="13" fill="black" />

          <rect x="0" y="75" width="25" height="25" fill="black" />
          <rect x="3" y="78" width="19" height="19" fill="white" />
          <rect x="6" y="81" width="13" height="13" fill="black" />

          {/* Center brand mark block */}
          <rect x="42" y="42" width="16" height="16" fill="var(--brand-color)" rx="3" />
          <circle cx="50" cy="50" r="4" fill="black" />

          {/* Random QR pattern blocks for authenticity */}
          <rect x="30" y="5" width="8" height="4" />
          <rect x="45" y="0" width="12" height="6" />
          <rect x="62" y="8" width="5" height="10" />
          <rect x="35" y="15" width="10" height="4" />
          <rect x="30" y="25" width="6" height="8" />
          <rect x="45" y="22" width="15" height="5" />
          <rect x="65" y="25" width="5" height="15" />
          
          <rect x="5" y="32" width="15" height="6" />
          <rect x="0" y="45" width="10" height="8" />
          <rect x="15" y="42" width="8" height="12" />
          <rect x="28" y="40" width="10" height="6" />
          
          <rect x="62" y="45" width="12" height="6" />
          <rect x="80" y="35" width="15" height="8" />
          <rect x="85" y="48" width="10" height="10" />
          <rect x="75" y="62" width="8" height="8" />

          <rect x="5" y="62" width="12" height="5" />
          <rect x="20" y="60" width="15" height="10" />
          <rect x="42" y="65" width="18" height="6" />
          
          <rect x="30" y="78" width="10" height="12" />
          <rect x="45" y="85" width="18" height="5" />
          <rect x="68" y="78" width="5" height="15" />
          <rect x="80" y="78" width="15" height="6" />
          <rect x="85" y="88" width="10" height="8" />
        </svg>
      </div>

      <p className="mt-4 font-display font-bold text-gray-950 text-sm tracking-wide text-center">
        A/N BILBO OUTDOORS
      </p>
      {amount && (
        <p className="mt-1 text-sm font-mono text-gray-600 bg-gray-100 px-3 py-1 rounded-full font-semibold">
          Total: Rp {amount.toLocaleString('id-ID')}
        </p>
      )}
      <p className="mt-2 text-[11px] text-gray-400 text-center leading-relaxed">
        Scan QRIS di atas melalui GoPay, OVO, Dana, LinkAja, ShopeePay, atau Mobile Banking Anda.
      </p>
    </div>
  );
}
