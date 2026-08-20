import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Phone, Clock } from 'lucide-react';
import { PublicOrder } from '../../types';
import { parseJsonOrThrow } from '../../lib/api';
import { formatDateTimeLabel } from '../../lib/date';

// Bank Virtual Account codes - standard numeric interbank codes, NOT the
// letter codes ("BCA"/"BRI"/...) shown on WuzzPay's own "Bank List" doc page
// (docs.wuzzpay.com/bank-list). Confirmed empirically against the sandbox
// (Stage 2 of the payment gateway plan): a letter code was rejected
// downstream by WuzzPay's provider (espay) with "Data tidak ditemukan = Bank
// Code", while the numeric code from their own /v1/va/static example
// (014 = BCA) succeeded. Their docs are internally inconsistent on this
// parameter; these are the values that actually work.
const BANK_OPTIONS = [
  { code: '014', name: 'Bank Central Asia (BCA)' },
  { code: '002', name: 'Bank Rakyat Indonesia (BRI)' },
  { code: '009', name: 'Bank Negara Indonesia (BNI)' },
  { code: '008', name: 'Bank Mandiri' },
  { code: '451', name: 'Bank Syariah Indonesia (BSI)' },
  { code: '013', name: 'Bank Permata' },
  { code: '022', name: 'Bank CIMB Niaga' },
  { code: '011', name: 'Bank Danamon' },
];

const WALLET_OPTIONS = [
  { code: 'ovo', name: 'OVO' },
  { code: 'dana', name: 'DANA' },
  { code: 'gopay', name: 'GoPay' },
];

const POLL_INTERVAL_MS = 5000;

// Copies `value` to the clipboard and briefly confirms with a checkmark -
// used on the VA number and transfer amount, both of which a customer needs
// to paste into their banking app rather than retype by hand.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - no-op, the value
      // is still selectable/copyable by hand.
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-black cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-600" /> : <Copy className="w-3.5 h-3.5 stroke-[2.5]" />}
      {copied ? 'Tersalin' : 'Salin'}
    </button>
  );
}

interface PaymentGatewayPanelProps {
  order: PublicOrder;
  token: string;
  onSettled: () => void; // called once the poll confirms Approved/Paid, so the parent can refresh the full order
}

type MethodTab = 'qris' | 'va' | 'emoney';

// Generic instruction renderer - the exact field names for the qris/emoney
// response shapes aren't confirmed in WuzzPay's docs (only a VA example is
// published), so these branches read defensively and fall back to a raw
// key/value dump rather than silently showing nothing. Verify against a real
// sandbox response before considering this final (Stage 2 of the plan).
function PaymentInstructionDisplay({ instruction }: { instruction: Record<string, any> }) {
  const method = instruction.method;

  if (method === 'virtual_account') {
    const bank = BANK_OPTIONS.find(b => b.code === instruction.bank_code);
    const amount = Number(instruction.total_amount ?? instruction.amount);
    return (
      <div className="bg-white border-2 border-black p-6 rounded-none space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <h3 className="text-xs font-black uppercase text-black tracking-widest border-b-2 border-brand pb-2">TRANSFER VIRTUAL ACCOUNT</h3>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase">Bank</p>
            <p className="text-xs font-black text-black uppercase mt-0.5">{bank?.name ?? instruction.bank_code}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase">Nomor Virtual Account</p>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xl font-black text-black font-mono tracking-wider">{instruction.va_number}</p>
              <CopyButton value={String(instruction.va_number)} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase">Jumlah Transfer</p>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-sm font-black text-black font-mono">Rp {amount.toLocaleString('id-ID')}</p>
              <CopyButton value={String(amount)} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (method === 'qris') {
    const qrValue = instruction.qr_string ?? instruction.qris_string ?? instruction.qr_content;
    const qrImageUrl = instruction.qr_image_url ?? instruction.qr_url;
    return (
      <div className="flex flex-col items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-full flex justify-between items-center border-b border-gray-100 pb-3 mb-4">
          <span className="font-display font-black text-xl tracking-tight text-gray-900">QRIS</span>
          <span className="text-[9px] bg-red-600 text-white font-bold px-1 rounded">GPN</span>
        </div>
        {qrValue ? (
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <QRCodeSVG value={String(qrValue)} size={180} />
          </div>
        ) : qrImageUrl ? (
          <img src={String(qrImageUrl)} alt="QRIS" className="w-[180px] h-[180px] object-contain" />
        ) : (
          <p className="text-xs text-zinc-500 font-bold uppercase text-center py-8">Kode QRIS belum tersedia. Silakan hubungi kami.</p>
        )}
        <p className="mt-4 font-display font-bold text-gray-950 text-sm tracking-wide text-center">A/N BILBO OUTDOORS</p>
        <p className="mt-1 text-sm font-mono text-gray-600 bg-gray-100 px-3 py-1 rounded-full font-semibold">
          Total: Rp {Number(instruction.total_amount ?? instruction.amount).toLocaleString('id-ID')}
        </p>
      </div>
    );
  }

  // emoney - shape entirely unconfirmed (deep link, redirect URL, or a code to
  // enter manually are all plausible). Any URL-shaped field becomes a button;
  // otherwise the raw fields are shown so the customer/admin can still act on it.
  const urlField = Object.entries(instruction).find(([key, value]) => typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('link')));
  return (
    <div className="bg-white border-2 border-black p-6 rounded-none space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <h3 className="text-xs font-black uppercase text-black tracking-widest border-b-2 border-brand pb-2">PEMBAYARAN E-WALLET</h3>
      {urlField ? (
        <a
          href={String(urlField[1])}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 bg-black hover:bg-brand hover:text-black text-white text-center font-black text-xs rounded-none border-2 border-black uppercase tracking-widest"
        >
          Buka Aplikasi Pembayaran
        </a>
      ) : (
        <div className="space-y-1.5">
          {Object.entries(instruction).filter(([k]) => k !== 'method').map(([key, value]) => (
            <div key={key} className="flex justify-between text-[11px] font-bold uppercase">
              <span className="text-zinc-500">{key}</span>
              <span className="text-black font-mono">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaymentGatewayPanel({ order, token, onSettled }: PaymentGatewayPanelProps) {
  const [methodTab, setMethodTab] = useState<MethodTab>('qris');
  const [selectedBank, setSelectedBank] = useState(BANK_OPTIONS[0].code);
  const [selectedWallet, setSelectedWallet] = useState(WALLET_OPTIONS[0].code);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState('');
  const [instruction, setInstruction] = useState<Record<string, any> | null>(order.paymentInstruction ?? null);
  const [expired, setExpired] = useState(false);
  const [settled, setSettled] = useState(order.status !== 'Pending');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const expiresAt = instruction?.expires_at as string | undefined;

  const stopPolling = () => {
    stoppedRef.current = true;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const checkExpiry = () => {
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      setExpired(true);
      stopPolling();
    }
  };

  useEffect(() => {
    checkExpiry();
    if (!instruction || settled) return;
    stoppedRef.current = false;

    // Self-rescheduling setTimeout, not setInterval - a poll only fires
    // POLL_INTERVAL_MS after the PREVIOUS one actually finished, never
    // overlapping it. A server-side incident (2026-08-20) traced back to this
    // being a plain setInterval: when a poll took longer than the interval
    // (a slow WuzzPay response), the next tick fired anyway, and overlapping
    // requests piled up server-side behind a shared lock.
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/confirm/${token}/payment-status`);
        const data = await parseJsonOrThrow(res);
        if (data.status === 'Approved/Paid') {
          setSettled(true);
          stopPolling();
          onSettled();
          return;
        }
      } catch {
        // transient poll failure - just try again next tick, no need to surface
      }
      checkExpiry();
      if (!stoppedRef.current) {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruction, settled, token]);

  const chargeRequest = async () => {
    const body: { productId: MethodTab; bankCode?: string } = { productId: methodTab };
    if (methodTab === 'va') body.bankCode = selectedBank;
    if (methodTab === 'emoney') body.bankCode = selectedWallet;
    const res = await fetch(`/api/orders/confirm/${token}/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parseJsonOrThrow(res, 'Gagal membuat instruksi pembayaran.');
  };

  const handleCharge = async () => {
    setCharging(true);
    setChargeError('');
    setExpired(false);
    try {
      const data = await chargeRequest();
      setInstruction(data.paymentInstruction ?? null);
    } catch {
      // Auto-retry once, silently, before ever showing an error - confirmed
      // empirically (2026-08-20) that a charge failure here is typically a
      // transient provider-side hiccup: an identical replayed request
      // succeeded immediately with no code change needed. A customer
      // shouldn't be stuck reading a dead-end error for something that
      // resolves itself a couple seconds later.
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const data = await chargeRequest();
        setInstruction(data.paymentInstruction ?? null);
      } catch (err: any) {
        setChargeError(err.message || 'Gagal membuat instruksi pembayaran.');
      }
    } finally {
      setCharging(false);
    }
  };

  if (settled) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-700 p-8 rounded-none text-center space-y-3">
        <div className="w-14 h-14 bg-emerald-600 text-white border-2 border-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_rgba(0,0,0,1)]">
          <Check className="w-7 h-7 stroke-[3]" />
        </div>
        <h3 className="text-xl font-display font-black text-emerald-800 uppercase tracking-tight">Pembayaran Diterima!</h3>
        <p className="text-xs font-bold text-emerald-700 uppercase">Pesanan Anda sedang kami proses. Terima kasih!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!instruction ? (
        <div className="bg-white border-2 border-black p-6 rounded-none space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <h3 className="text-xs font-black uppercase text-black tracking-widest border-b-2 border-brand pb-2">PILIH METODE PEMBAYARAN</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['qris', 'va', 'emoney'] as MethodTab[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethodTab(m)}
                className={`py-2.5 text-[11px] font-black uppercase tracking-wider border-2 border-black rounded-none cursor-pointer ${methodTab === m ? 'bg-black text-brand' : 'bg-white text-black hover:bg-zinc-100'}`}
              >
                {m === 'qris' ? 'QRIS' : m === 'va' ? 'Transfer Bank' : 'E-Wallet'}
              </button>
            ))}
          </div>

          {methodTab === 'va' && (
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-black uppercase rounded-none focus:outline-none cursor-pointer"
            >
              {BANK_OPTIONS.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          )}

          {methodTab === 'emoney' && (
            <select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-black uppercase rounded-none focus:outline-none cursor-pointer"
            >
              {WALLET_OPTIONS.map((w) => (
                <option key={w.code} value={w.code}>{w.name}</option>
              ))}
            </select>
          )}

          {chargeError && (
            <p className="text-[11px] font-bold text-red-600 uppercase">{chargeError}</p>
          )}

          <button
            type="button"
            onClick={handleCharge}
            disabled={charging}
            className="w-full py-4 bg-black hover:bg-brand hover:text-black text-white font-black text-sm rounded-none border-2 border-black shadow-[4px_4px_0px_var(--brand-color)] transition-colors uppercase tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {charging ? 'Memproses...' : chargeError ? 'Coba Lagi' : 'Buat Pembayaran'}
          </button>
        </div>
      ) : expired ? (
        <div className="bg-red-50 border-2 border-red-600 p-6 rounded-none space-y-3 text-center">
          <p className="text-xs font-black text-red-700 uppercase">Instruksi pembayaran sudah kedaluwarsa.</p>
          <button
            type="button"
            onClick={() => { setInstruction(null); setExpired(false); }}
            className="py-2.5 px-6 bg-black hover:bg-brand hover:text-black text-white font-black text-xs rounded-none border-2 border-black uppercase tracking-widest cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <PaymentInstructionDisplay instruction={instruction} />
          {expiresAt && (
            <p className="text-[10px] text-zinc-500 font-bold uppercase text-center flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Bayar sebelum {formatDateTimeLabel(expiresAt)}
            </p>
          )}
          <p className="text-[10px] text-zinc-400 font-bold uppercase text-center italic">
            Menunggu konfirmasi pembayaran otomatis...
          </p>
        </div>
      )}

      <a
        href={`https://wa.me/628113706666?text=${encodeURIComponent(`Halo Bilbo Outdoors, saya sudah bayar untuk pesanan ${order.id} tapi belum terverifikasi otomatis. Mohon dicek. Terima kasih!`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 bg-white hover:bg-zinc-100 text-black font-bold text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-widest flex items-center justify-center space-x-2 cursor-pointer"
      >
        <Phone className="w-4 h-4" />
        <span>Sudah Bayar Tapi Belum Terverifikasi?</span>
      </a>
    </div>
  );
}
