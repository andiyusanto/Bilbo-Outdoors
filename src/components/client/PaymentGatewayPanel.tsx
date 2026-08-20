import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, ChevronDown, Copy, Phone, Clock } from 'lucide-react';
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

// Distinguishes a permanently-stuck payment reference (WuzzPay code
// REFERENCE_STUCK, see server.ts's /charge route) from an ordinary transient
// failure, so the caller can skip the pointless auto-retry - retrying can
// never succeed once this order's reference is stuck, since the
// Idempotency-Key is deterministically the order id.
class ChargeError extends Error {
  stuck: boolean;
  constructor(message: string, stuck: boolean) {
    super(message);
    this.stuck = stuck;
  }
}

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

// Per-channel "how to pay" steps - WuzzPay's docs (and their merchant
// dashboard) don't provide any customer-facing payment tutorial at all, only
// merchant/developer API integration docs (checked exhaustively, same as the
// webhook-signature research earlier), so these are written for this app.
// Verified against current published steps (WebSearch, 2026-08-20) rather
// than guessed from memory - see Sources in the commit this shipped in.
const QRIS_STEPS = [
  'Buka aplikasi e-wallet atau Mobile Banking Anda (GoPay, OVO, DANA, ShopeePay, LinkAja, atau bank apa pun yang mendukung QRIS).',
  'Cari dan pilih menu "Scan" atau "Bayar dengan QR" - beberapa aplikasi juga punya tombol simbol QR di menu utama.',
  'Arahkan kamera ke kode QR di atas hingga terbaca.',
  'Periksa nama merchant (BILBO OUTDOORS) dan nominal pembayaran - biasanya sudah terisi otomatis, tapi pastikan sesuai.',
  'Konfirmasi dan masukkan PIN atau verifikasi sidik jari/wajah untuk menyelesaikan pembayaran.',
];

// Bank-specific VA menu names, per bank's own current app - these differ
// meaningfully enough between banks (BRIVA vs Virtual Account Billing vs
// Multi Payment, etc.) that one generic script would be actively wrong for
// several of them. Only banks with verified current steps get their own
// entry; VA_STEPS_GENERIC below covers the rest (BSI/Permata/CIMB/Danamon).
const VA_STEPS_BY_BANK: Record<string, string[]> = {
  '014': [ // BCA
    'Buka aplikasi BCA mobile, login, lalu pada menu utama pilih m-Transfer.',
    'Pilih Transfer -> Ke Bank Lain (Virtual Account BCA tampil otomatis jika nomornya dikenali, atau masukkan kode bank + nomor VA di atas secara manual).',
    'Periksa nama merchant dan nominal yang muncul - harus sesuai dengan yang tertera di halaman ini.',
    'Tekan OK/Kirim, lalu masukkan PIN m-BCA untuk konfirmasi.',
  ],
  '002': [ // BRI
    'Buka aplikasi BRImo dan login.',
    'Pilih menu Pembayaran, lalu pilih BRIVA.',
    'Masukkan nomor Virtual Account di atas - nominal tagihan akan muncul otomatis.',
    'Tekan Konfirmasi, masukkan PIN BRImo, lalu tekan Kirim.',
  ],
  '009': [ // BNI
    'Buka BNI Mobile Banking dan login dengan User ID/password Anda.',
    'Pilih menu Transfer, lalu pilih Virtual Account Billing dan rekening sumber dana.',
    'Masukkan nomor Virtual Account di atas pada input baru.',
    'Periksa tagihan yang muncul di layar konfirmasi, lalu masukkan password transaksi untuk menyelesaikan.',
  ],
  '008': [ // Mandiri
    'Buka aplikasi Livin’ by Mandiri dan login.',
    'Pilih menu Bayar, lalu pilih Buat Pembayaran Baru -> Multipayment.',
    'Pilih penyedia jasa terkait, lalu masukkan nomor Virtual Account di atas.',
    'Periksa nominal tagihan yang muncul otomatis, lalu masukkan MPIN untuk konfirmasi.',
  ],
};
const VA_STEPS_GENERIC = [
  'Buka aplikasi Mobile Banking dari bank Anda, atau kunjungi ATM terdekat.',
  'Cari menu Transfer -> Virtual Account (atau "Ke Rekening/Bank Lain" jika menu Virtual Account tidak tersedia terpisah).',
  'Masukkan nomor Virtual Account di atas.',
  'Periksa nama merchant dan nominal pembayaran yang muncul otomatis - harus sesuai dengan yang tertera di halaman ini.',
  'Masukkan PIN/password untuk konfirmasi, lalu simpan bukti transfer sebagai referensi.',
];

const EMONEY_STEPS = [
  'Tekan tombol "Buka Aplikasi Pembayaran" di atas jika tersedia - Anda akan diarahkan langsung ke aplikasi e-wallet Anda untuk meninjau transaksi ini.',
  'Jika tidak diarahkan otomatis, buka aplikasi e-wallet Anda secara manual dan login jika diminta.',
  'Periksa nama merchant (BILBO OUTDOORS) dan nominal pembayaran sebelum melanjutkan.',
  'Konfirmasi dengan PIN atau verifikasi sidik jari/wajah untuk menyelesaikan pembayaran.',
];

function PaymentSteps({ method, bankCode }: { method: MethodTab; bankCode?: string }) {
  const [open, setOpen] = useState(false);
  const steps = method === 'qris' ? QRIS_STEPS
    : method === 'emoney' ? EMONEY_STEPS
    : (bankCode && VA_STEPS_BY_BANK[bankCode]) || VA_STEPS_GENERIC;
  return (
    <div className="border-t-2 border-zinc-100 pt-3 mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] font-black uppercase text-zinc-600 hover:text-black cursor-pointer"
      >
        <span>Cara Bayar</span>
        <ChevronDown className={`w-3.5 h-3.5 stroke-[2.5] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="mt-2.5 space-y-2 list-decimal list-inside">
          {steps.map((step, i) => (
            <li key={i} className="text-[11px] text-zinc-600 font-semibold normal-case leading-relaxed">{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

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
        <PaymentSteps method="va" bankCode={instruction.bank_code} />
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
        <div className="w-full">
          <PaymentSteps method="qris" />
        </div>
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
      <PaymentSteps method="emoney" />
    </div>
  );
}

export default function PaymentGatewayPanel({ order, token, onSettled }: PaymentGatewayPanelProps) {
  const [methodTab, setMethodTab] = useState<MethodTab>('qris');
  const [selectedBank, setSelectedBank] = useState(BANK_OPTIONS[0].code);
  const [selectedWallet, setSelectedWallet] = useState(WALLET_OPTIONS[0].code);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState('');
  const [referenceStuck, setReferenceStuck] = useState(false);
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
    const data = await res.json();
    if (!res.ok) {
      throw new ChargeError(data.error || 'Gagal membuat instruksi pembayaran.', data.code === 'REFERENCE_STUCK');
    }
    return data;
  };

  const handleCharge = async () => {
    setCharging(true);
    setChargeError('');
    setReferenceStuck(false);
    setExpired(false);
    try {
      const data = await chargeRequest();
      setInstruction(data.paymentInstruction ?? null);
    } catch (firstErr: any) {
      if (firstErr instanceof ChargeError && firstErr.stuck) {
        setReferenceStuck(true);
        setCharging(false);
        return;
      }
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
      } catch (secondErr: any) {
        if (secondErr instanceof ChargeError && secondErr.stuck) {
          setReferenceStuck(true);
        } else {
          setChargeError(secondErr.message || 'Gagal membuat instruksi pembayaran.');
        }
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

  if (referenceStuck) {
    return (
      <div className="bg-red-50 border-2 border-red-600 p-8 rounded-none text-center space-y-3">
        <h3 className="text-sm font-display font-black text-red-800 uppercase tracking-tight">Pesanan Ini Tidak Bisa Dibuatkan Pembayaran Lagi</h3>
        <p className="text-xs font-bold text-red-700 normal-case leading-relaxed">
          Percobaan pembayaran sebelumnya untuk pesanan ini gagal secara permanen di sistem gateway kami, dan tidak
          bisa dicoba ulang. Silakan buat pesanan baru dari katalog untuk melanjutkan.
        </p>
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
