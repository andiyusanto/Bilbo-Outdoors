import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, ChevronDown, Copy, Phone, Clock } from 'lucide-react';
import { PublicOrder } from '../../types';
import { parseJsonOrThrow } from '../../lib/api';
import { formatDateTimeLabel } from '../../lib/date';
import { BANK_OPTIONS, WALLET_OPTIONS, VA_FEE_FLAT, getQrisFeeLabel, WALLET_FEE_PERCENT } from '../../lib/paymentChannels';

const POLL_INTERVAL_MS = 5000;

// Banks reject a VA transfer below this amount (confirmed against
// WuzzPay/Winpay's own minimum for virtual account channels) - QRIS has no
// such floor, so a customer trying to pay a small DP is steered there
// instead of hitting a bank-side rejection after already picking VA.
const VA_MINIMUM_AMOUNT = 10000;

// Distinguishes a permanently-stuck payment reference (WuzzPay code
// REFERENCE_STUCK, see server.ts's /charge route) from an ordinary transient
// failure, so the caller can skip the pointless auto-retry - retrying the
// SAME product+bank can never succeed once that exact combination's
// reference is stuck, since the partner_reference sent to WuzzPay is
// deterministic per order+product+bank (2026-10-26 fix, corrected same day -
// first attempt only changed the Idempotency-Key header, but WuzzPay's
// TRX008 dedup turned out to be keyed on partner_reference itself; see
// server.ts). A DIFFERENT product OR a different bank on the same channel
// is unaffected, since each now gets its own partner_reference.
class ChargeError extends Error {
  stuck: boolean;
  constructor(message: string, stuck: boolean) {
    super(message);
    this.stuck = stuck;
  }
}

// One channel attempted on this order - mirrors server.ts's WuzzpayAttempt
// (src/types.ts). The client tracks every attempt made this session so
// switching back to a previously-tried channel re-displays its existing
// instruction instead of re-charging, and so the poll can check the status
// of specifically whichever attempt is currently on screen.
interface ClientWuzzpayAttempt {
  productId: MethodTab;
  bankCode?: string;
  transactionId: string;
  paymentInstruction: Record<string, any>;
  chargedAmount: number;
  lastStatus?: string;
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
  pendingExpiryHours: number; // from GET /api/payment-config - how long an unpaid order (cash included) is held before auto-expiry, see expireStaleOrders in server.ts
}

type MethodTab = 'qris' | 'va' | 'emoney' | 'cash';

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

// Admin-fee label shown inside "Cara Bayar" - merchant-absorbed (see
// VA_FEE_FLAT's own comment), so always framed as informational, never as
// something added to what the customer transfers.
function PaymentStepsFeeNote({ method, bankCode, amount }: { method: MethodTab; bankCode?: string; amount?: number }) {
  const label = method === 'va' && bankCode ? (VA_FEE_FLAT[bankCode] !== undefined ? `Rp ${VA_FEE_FLAT[bankCode].toLocaleString('id-ID')}` : undefined)
    : method === 'qris' && amount !== undefined ? getQrisFeeLabel(amount)
    : method === 'emoney' && bankCode ? (WALLET_FEE_PERCENT[bankCode] !== undefined ? `${WALLET_FEE_PERCENT[bankCode]}%` : undefined)
    : undefined;
  return (
    <p className="text-[11px] text-zinc-600 font-semibold normal-case leading-relaxed mt-2">
      {label
        ? `Biaya admin: ${label} - ditanggung Bilbo Outdoors, bukan tambahan untuk Anda.`
        : 'Kemungkinan ada biaya admin sesuai kebijakan bank/penyedia, ditanggung Bilbo Outdoors.'}
    </p>
  );
}

// Defaults open (2026-10-27) - the admin-fee note and payment steps should
// be visible immediately, not hidden behind a click, now that there's
// fee information customers may want to see right away.
function PaymentSteps({ method, bankCode, amount }: { method: MethodTab; bankCode?: string; amount?: number }) {
  const [open, setOpen] = useState(true);
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
        <>
          <ol className="mt-2.5 space-y-2 list-decimal list-inside">
            {steps.map((step, i) => (
              <li key={i} className="text-[11px] text-zinc-600 font-semibold normal-case leading-relaxed">{step}</li>
            ))}
          </ol>
          <PaymentStepsFeeNote method={method} bankCode={bankCode} amount={amount} />
        </>
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
        <PaymentSteps method="va" bankCode={instruction.bank_code} amount={amount} />
      </div>
    );
  }

  if (method === 'qris') {
    const qrValue = instruction.qr_string ?? instruction.qris_string ?? instruction.qr_content;
    const qrImageUrl = instruction.qr_image_url ?? instruction.qr_url;
    const qrisAmount = Number(instruction.total_amount ?? instruction.amount);
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
          Total: Rp {qrisAmount.toLocaleString('id-ID')}
        </p>
        <div className="w-full">
          <PaymentSteps method="qris" amount={qrisAmount} />
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
      <PaymentSteps method="emoney" bankCode={typeof instruction.wallet === 'string' ? instruction.wallet : undefined} />
    </div>
  );
}

export default function PaymentGatewayPanel({ order, token, onSettled, pendingExpiryHours }: PaymentGatewayPanelProps) {
  // TEMPORARY internal testing gate (owner-requested, mirrors
  // PAYMENT_GATEWAY_TEST_TRIGGER_NAME server-side in server.ts's /charge
  // route): most WuzzPay channels are still broken/unprovisioned, so the
  // online methods stay disabled for real customers until the order's full
  // name is exactly this trigger string. Cash-on-pickup is deliberately
  // exempt (see the /cash route's comment) since it never touches WuzzPay.
  // Client-side disabling is a UX courtesy, not the real security boundary -
  // /charge independently re-checks this server-side regardless.
  const isTestOrder = order.customerName === 'TESTING_PAYMENT';
  const [methodTab, setMethodTab] = useState<MethodTab>(isTestOrder ? 'qris' : 'cash');
  const [selectedBank, setSelectedBank] = useState(BANK_OPTIONS[0].code);
  const [selectedWallet, setSelectedWallet] = useState(WALLET_OPTIONS[0].code);
  // Owner's Syarat & Ketentuan allows a minimum 50% DP - online payment only
  // (cash amount is always decided in person by staff, unaffected by this).
  // Defaults to full payment; server re-validates this exact range regardless
  // of what's sent here (see the /charge route) - this is UX only.
  const [payAmountInput, setPayAmountInput] = useState(String(order.totalPrice));
  const minDpAmount = Math.ceil(order.totalPrice * 0.5);
  const payAmountValue = Number(payAmountInput);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState('');
  // Every channel attempted on this order so far (2026-10-26, multi-channel
  // support) - a customer can try QRIS, then switch to a different channel,
  // without losing the order. Seeded from the order prop (survives a
  // reload while Pending - see PublicOrder's comment on why this field
  // specifically is exposed) and appended to from each /charge response.
  const [attempts, setAttempts] = useState<ClientWuzzpayAttempt[]>(order.wuzzpayAttempts ?? []);
  // Amount is locked to whatever the first channel on this order already
  // requested, once there is one - the server enforces this regardless, but
  // reading it here keeps the UI (and its validity check below) honest
  // about it instead of still gating on the now-irrelevant free-form input.
  const lockedAmount = attempts.length > 0 ? attempts[0].chargedAmount : undefined;
  const isPayAmountValid = lockedAmount !== undefined || (payAmountInput !== '' && Number.isInteger(payAmountValue) && payAmountValue >= minDpAmount && payAmountValue <= order.totalPrice);
  // VA-specific floor (see VA_MINIMUM_AMOUNT) - checked against whichever
  // amount is actually about to be charged, locked or freely-picked.
  const currentChargeAmount = lockedAmount ?? payAmountValue;
  const isVaBelowMinimum = methodTab === 'va' && Number.isFinite(currentChargeAmount) && currentChargeAmount < VA_MINIMUM_AMOUNT;
  // Which attempt's instruction is currently on screen - undefined means
  // "show the method picker". Index into `attempts` rather than a copy, so
  // it always reflects that attempt's latest known lastStatus.
  const [currentAttemptIndex, setCurrentAttemptIndex] = useState<number | undefined>(
    attempts.length > 0 ? attempts.length - 1 : undefined
  );
  const instruction = currentAttemptIndex !== undefined ? attempts[currentAttemptIndex]?.paymentInstruction ?? null : null;
  const chargedAmount = currentAttemptIndex !== undefined ? attempts[currentAttemptIndex]?.chargedAmount : undefined;
  const [expired, setExpired] = useState(false);
  const [settled, setSettled] = useState(order.status !== 'Pending');
  const [cashConfirming, setCashConfirming] = useState(false);
  const [cashError, setCashError] = useState('');
  // Survives a reload - if the customer already picked cash on a previous
  // visit (order.paymentMethod persisted server-side), re-enter that state
  // directly instead of showing the method picker again.
  const [cashSelected, setCashSelected] = useState(order.paymentMethod === 'cash' && order.status === 'Pending');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const expiresAt = instruction?.expires_at as string | undefined;
  // Customer-facing only - shown instead of expiresAt (WuzzPay's own
  // payment_instruction expiry, which we don't control and isn't guaranteed
  // to line up with pendingExpiryHours). 30 minutes earlier than the
  // booking's own expiry gives a safety margin against a slow settlement
  // callback landing right at the edge (owner decision, 2026-08-22) - display
  // only, doesn't change how expireStaleOrders actually enforces expiry in
  // server.ts, and doesn't affect the "instruction expired" check below,
  // which still uses the real expiresAt.
  const onlinePaymentDeadline = new Date(new Date(order.createdAt).getTime() + Math.max(0, pendingExpiryHours - 0.5) * 60 * 60 * 1000);

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
        // WuzzPay's own reported outcome for whichever attempt is currently
        // on screen - distinct from the client-clock-based expiresAt check
        // in checkExpiry() below. Without this, a definitively failed/
        // expired payment (which can happen well before the instruction's
        // own expires_at) left the customer staring at "Menunggu
        // konfirmasi..." forever with no indication anything went wrong.
        // Reuses the exact same terminal UI/recovery flow as the time-based
        // expiry: resetting to the method picker and trying a (possibly
        // different) channel always resolves correctly on its own.
        const current = currentAttemptIndex !== undefined ? attempts[currentAttemptIndex] : undefined;
        const currentStatus = current
          ? (data.attempts as { productId: string; bankCode?: string; lastStatus?: string }[] | undefined)
              ?.find(a => a.productId === current.productId && (current.productId === 'qris' || a.bankCode === current.bankCode))
              ?.lastStatus
          : undefined;
        if (currentStatus === 'failed' || currentStatus === 'expired') {
          setExpired(true);
          stopPolling();
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
    const body: { productId: MethodTab; bankCode?: string; amount?: number } = { productId: methodTab, amount: lockedAmount ?? payAmountValue };
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
    return data as { wuzzpayAttempts?: ClientWuzzpayAttempt[] };
  };

  // Applies a successful /charge (or "already-live") response: stores the
  // full attempts list and points currentAttemptIndex at whichever one
  // matches what was just requested, so the instruction display picks it up.
  const applyChargeResponse = (data: { wuzzpayAttempts?: ClientWuzzpayAttempt[] }, productId: MethodTab, bankCode?: string) => {
    const list = data.wuzzpayAttempts ?? [];
    setAttempts(list);
    let foundIndex: number | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].productId === productId && (productId === 'qris' || list[i].bankCode === bankCode)) { foundIndex = i; break; }
    }
    setCurrentAttemptIndex(foundIndex);
  };

  const handleCharge = async () => {
    setCharging(true);
    setChargeError('');
    setExpired(false);
    const bankCode = methodTab === 'va' ? selectedBank : methodTab === 'emoney' ? selectedWallet : undefined;
    try {
      const data = await chargeRequest();
      applyChargeResponse(data, methodTab, bankCode);
    } catch (firstErr: any) {
      if (firstErr instanceof ChargeError && firstErr.stuck) {
        setChargeError('Metode ini sudah tidak bisa dicoba lagi untuk pesanan ini. Silakan pilih metode pembayaran lain.');
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
        applyChargeResponse(data, methodTab, bankCode);
      } catch (secondErr: any) {
        if (secondErr instanceof ChargeError && secondErr.stuck) {
          setChargeError('Metode ini sudah tidak bisa dicoba lagi untuk pesanan ini. Silakan pilih metode pembayaran lain.');
        } else {
          setChargeError(secondErr.message || 'Gagal membuat instruksi pembayaran.');
        }
      }
    } finally {
      setCharging(false);
    }
  };

  const handleCashConfirm = async () => {
    setCashConfirming(true);
    setCashError('');
    try {
      const res = await fetch(`/api/orders/confirm/${token}/cash`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan pilihan bayar tunai.');
      }
      setCashSelected(true);
    } catch (err: any) {
      setCashError(err.message || 'Gagal menyimpan pilihan bayar tunai.');
    } finally {
      setCashConfirming(false);
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

  if (cashSelected) {
    // Cash orders have no WuzzPay payment_instruction, so they're never
    // exempt from expireStaleOrders' plain createdAt-based rule (see
    // server.ts) - this deadline is the real one that applies here.
    const cashDeadline = new Date(new Date(order.createdAt).getTime() + pendingExpiryHours * 60 * 60 * 1000);
    return (
      <div className="bg-white border-2 border-black p-6 rounded-none space-y-3 text-center shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <h3 className="text-sm font-display font-black text-black uppercase tracking-tight">Bayar Tunai Saat Pengambilan</h3>
        <p className="text-xs font-bold text-zinc-600 normal-case leading-relaxed">
          Silakan datang ke toko kami dan siapkan uang tunai sejumlah{' '}
          <strong className="text-black">Rp {order.totalPrice.toLocaleString('id-ID')}</strong> saat mengambil
          barang. Staf kami akan mengonfirmasi pembayaran Anda saat itu.
        </p>
        <p className="text-[10px] text-zinc-500 font-bold uppercase flex items-center justify-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Bayar sebelum {formatDateTimeLabel(cashDeadline.toISOString())}, atau pesanan otomatis dibatalkan
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!instruction ? (
        <div className="bg-white border-2 border-black p-6 rounded-none space-y-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <h3 className="text-xs font-black uppercase text-black tracking-widest border-b-2 border-brand pb-2">PILIH METODE PEMBAYARAN</h3>
          <div className="bg-amber-50 border-2 border-amber-600 p-3 rounded-none flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-bold normal-case leading-relaxed">
              Silakan pilih metode pembayaran yang tersedia, lakukan pembayaran maksimal {pendingExpiryHours} jam
              semenjak booking ini dibuat. Booking akan otomatis expired jika tidak dibayar melebihi batas waktu
              yang telah ditentukan, dan item yang dipilih akan kembali dibuka untuk umum.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['qris', 'va', 'emoney', 'cash'] as MethodTab[]).map((m) => {
              // emoney (E-Wallet) stays visible but permanently disabled
              // (2026-10-26) - WuzzPay confirmed this product isn't
              // provisioned/enabled on our merchant account yet (matches
              // dana/ovo test charges both failing provider-side), but it's
              // expected to go live soon, so the tab stays as a preview
              // rather than disappearing. /charge also hard-rejects it
              // server-side regardless - remove this `m === 'emoney' ||`
              // once WuzzPay confirms it's active.
              const isDisabled = m === 'emoney' || (m !== 'cash' && !isTestOrder);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={isDisabled}
                  title={isDisabled ? (m === 'emoney' ? 'E-Wallet akan segera tersedia' : 'Metode ini akan segera tersedia') : undefined}
                  onClick={() => { setMethodTab(m); setChargeError(''); setCashError(''); }}
                  className={`py-2.5 text-[11px] font-black uppercase tracking-wider border-2 border-black rounded-none ${
                    isDisabled
                      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                      : `cursor-pointer ${methodTab === m ? 'bg-black text-brand' : 'bg-white text-black hover:bg-zinc-100'}`
                  }`}
                >
                  {m === 'qris' ? 'QRIS' : m === 'va' ? 'Transfer Bank' : m === 'emoney' ? 'E-Wallet' : 'Bayar Tunai'}
                </button>
              );
            })}
          </div>
          {!isTestOrder && (
            <p className="text-[10px] text-zinc-400 font-semibold normal-case text-center">
              QRIS, Transfer Bank, dan E-Wallet akan segera tersedia. Untuk saat ini, silakan pilih Bayar Tunai.
            </p>
          )}

          {methodTab === 'va' && (
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-white border-2 border-black px-3 py-2.5 text-xs font-black uppercase rounded-none focus:outline-none cursor-pointer"
            >
              {BANK_OPTIONS.map((b) => (
                <option key={b.code} value={b.code} disabled={b.disabled}>
                  {b.name}{b.disabled ? ' (Segera Tersedia)' : ''}
                </option>
              ))}
            </select>
          )}

          {isVaBelowMinimum && (
            <p className="text-[10px] font-bold text-red-600 uppercase normal-case leading-relaxed">
              Minimal transfer Virtual Account adalah Rp {VA_MINIMUM_AMOUNT.toLocaleString('id-ID')}. Untuk nominal
              di bawah itu, silakan gunakan QRIS.
            </p>
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

          {methodTab === 'cash' && (
            <p className="text-[11px] text-zinc-600 font-semibold normal-case leading-relaxed bg-zinc-50 border border-zinc-200 p-3">
              Bayar langsung di toko kami saat mengambil barang. Siapkan uang tunai sejumlah{' '}
              <strong className="text-black">Rp {order.totalPrice.toLocaleString('id-ID')}</strong> saat kedatangan.
            </p>
          )}

          {methodTab !== 'cash' && lockedAmount !== undefined && (
            // A channel was already attempted on this order - the amount is
            // locked to match it (server enforces this regardless), so a
            // second channel is just an alternative way to pay the SAME
            // amount, not a chance to change how much is being paid now.
            <div className="bg-zinc-50 border border-zinc-200 p-3 space-y-1">
              <p className="text-[10px] text-zinc-500 font-bold uppercase">Jumlah Yang Dibayar Sekarang</p>
              <p className="text-sm font-black text-black">Rp {lockedAmount.toLocaleString('id-ID')}</p>
              {lockedAmount < order.totalPrice && (
                <p className="text-[10px] text-zinc-600 font-semibold normal-case">
                  Sisa yang dibayar saat pengambilan barang: <strong className="text-black">Rp {(order.totalPrice - lockedAmount).toLocaleString('id-ID')}</strong>
                </p>
              )}
            </div>
          )}

          {methodTab !== 'cash' && lockedAmount === undefined && (
            <div className="bg-zinc-50 border border-zinc-200 p-3 space-y-2">
              <p className="text-[10px] text-zinc-500 font-bold uppercase">Jumlah Yang Dibayar Sekarang</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayAmountInput(String(order.totalPrice))}
                  className={`py-2 text-[10px] font-black uppercase tracking-wide border-2 border-black rounded-none cursor-pointer ${
                    payAmountValue === order.totalPrice ? 'bg-black text-brand' : 'bg-white text-black hover:bg-zinc-100'
                  }`}
                >
                  Bayar Penuh
                </button>
                <button
                  type="button"
                  onClick={() => setPayAmountInput(String(minDpAmount))}
                  className={`py-2 text-[10px] font-black uppercase tracking-wide border-2 border-black rounded-none cursor-pointer ${
                    payAmountValue === minDpAmount ? 'bg-black text-brand' : 'bg-white text-black hover:bg-zinc-100'
                  }`}
                >
                  Bayar DP Min. 50%
                </button>
              </div>
              <input
                type="number"
                min={minDpAmount}
                max={order.totalPrice}
                value={payAmountInput}
                onChange={(e) => setPayAmountInput(e.target.value)}
                className="w-full bg-white border-2 border-black px-3 py-2 text-xs font-black rounded-none focus:outline-none"
              />
              {!isPayAmountValid ? (
                <p className="text-[10px] font-bold text-red-600 uppercase">
                  Jumlah tidak valid. Minimal Rp {minDpAmount.toLocaleString('id-ID')} (DP 50%), maksimal Rp {order.totalPrice.toLocaleString('id-ID')}.
                </p>
              ) : payAmountValue < order.totalPrice ? (
                <p className="text-[10px] text-zinc-600 font-semibold normal-case">
                  Sisa yang dibayar saat pengambilan barang: <strong className="text-black">Rp {(order.totalPrice - payAmountValue).toLocaleString('id-ID')}</strong>
                </p>
              ) : null}
            </div>
          )}

          {(methodTab === 'cash' ? cashError : chargeError) && (
            <p className="text-[11px] font-bold text-red-600 uppercase">{methodTab === 'cash' ? cashError : chargeError}</p>
          )}

          <button
            type="button"
            onClick={methodTab === 'cash' ? handleCashConfirm : handleCharge}
            disabled={methodTab === 'cash' ? cashConfirming : (charging || !isPayAmountValid || isVaBelowMinimum)}
            className="w-full py-4 bg-black hover:bg-brand hover:text-black text-white font-black text-sm rounded-none border-2 border-black shadow-[4px_4px_0px_var(--brand-color)] transition-colors uppercase tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {methodTab === 'cash'
              ? (cashConfirming ? 'Memproses...' : 'Konfirmasi Bayar Tunai')
              : (charging ? 'Memproses...' : chargeError ? 'Coba Lagi' : 'Buat Pembayaran')}
          </button>
        </div>
      ) : expired ? (
        <div className="bg-red-50 border-2 border-red-600 p-6 rounded-none space-y-3 text-center">
          <p className="text-xs font-black text-red-700 uppercase">Pembayaran gagal atau instruksi sudah kedaluwarsa.</p>
          <button
            type="button"
            onClick={() => { setCurrentAttemptIndex(undefined); setExpired(false); }}
            className="py-2.5 px-6 bg-black hover:bg-brand hover:text-black text-white font-black text-xs rounded-none border-2 border-black uppercase tracking-widest cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <PaymentInstructionDisplay instruction={instruction} />
          {typeof chargedAmount === 'number' && chargedAmount < order.totalPrice && (
            <p className="text-[10px] text-zinc-600 font-semibold normal-case text-center bg-zinc-50 border border-zinc-200 p-2">
              Ini adalah pembayaran DP. Sisa yang dibayar saat pengambilan barang:{' '}
              <strong className="text-black">Rp {(order.totalPrice - chargedAmount).toLocaleString('id-ID')}</strong>
            </p>
          )}
          <button
            type="button"
            onClick={() => setCurrentAttemptIndex(undefined)}
            className="w-full py-2 text-[10px] font-bold text-zinc-500 hover:text-black uppercase tracking-wide underline cursor-pointer"
          >
            Pilih Metode Lain
          </button>
          <p className="text-[10px] text-zinc-500 font-bold uppercase text-center flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Bayar sebelum {formatDateTimeLabel(onlinePaymentDeadline.toISOString())}
          </p>
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
