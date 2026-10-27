// Shared bank/e-wallet code -> display name lookups for WuzzPay's VA/e-money
// channels - single source of truth for both the customer-facing payment
// picker (PaymentGatewayPanel) and the admin's read-only gateway info display
// (OrderDetailPanel), so a new bank/wallet only ever needs adding here.
//
// Bank codes are the standard numeric interbank codes, NOT the letter codes
// ("BCA"/"BRI"/...) shown on WuzzPay's own "Bank List" doc page
// (docs.wuzzpay.com/bank-list). Confirmed empirically against the sandbox
// (Stage 2 of the payment gateway plan): a letter code was rejected
// downstream by WuzzPay's provider (espay) with "Data tidak ditemukan = Bank
// Code", while the numeric code from their own /v1/va/static example
// (014 = BCA) succeeded. Their docs are internally inconsistent on this
// parameter; these are the values that actually work.
// Order matches the owner's preferred display sequence (2026-10-26), not
// alphabetical or code order. BSI and Danamon are flagged `disabled: true`
// (temporary, 2026-10-26) rather than removed - still visible in the picker
// so customers know they're coming, matching the same "visible but
// disabled" pattern used for the emoney channel. Remove the `disabled` flag
// once they're confirmed working again; `/charge` also hard-rejects these
// two bank codes server-side regardless (see server.ts).
export const BANK_OPTIONS = [
  { code: '002', name: 'Bank Rakyat Indonesia (BRI)' },
  { code: '008', name: 'Bank Mandiri' },
  { code: '014', name: 'Bank Central Asia (BCA)' },
  { code: '009', name: 'Bank Negara Indonesia (BNI)' },
  { code: '022', name: 'Bank CIMB Niaga' },
  { code: '013', name: 'Bank Permata' },
  { code: '451', name: 'Bank Syariah Indonesia (BSI)', disabled: true },
  { code: '011', name: 'Bank Danamon', disabled: true },
];

export const WALLET_OPTIONS = [
  { code: 'ovo', name: 'OVO' },
  { code: 'dana', name: 'DANA' },
  { code: 'gopay', name: 'GoPay' },
];

// Exact admin-fee rate card from WuzzPay support (2026-10-27, superseding
// the 2026-10-26 estimate ranges - WuzzPay's own charge response never
// populates a real fee, see PaymentGatewayPanel's own comment, so this is
// sourced from their emailed rate card, not the API). Flat per transaction,
// same for every bank except BCA. This fee is merchant-absorbed (the
// "charge to buyer" toggle on WuzzPay's dashboard stays off, per the
// owner's explicit instruction) - it never changes what the customer
// transfers, so any UI using this is informational only, never added to a
// total shown to the customer.
export const VA_FEE_FLAT: Record<string, number> = {
  '002': 3500, // BRI
  '008': 3500, // Mandiri
  '014': 5000, // BCA
  '009': 3500, // BNI
  '022': 3500, // CIMB Niaga
  '013': 3500, // Permata
  '451': 3500, // BSI (temporarily disabled, see BANK_OPTIONS)
  '011': 3500, // Danamon (temporarily disabled, see BANK_OPTIONS)
};

// QRIS admin fee is tiered by amount, not flat (WuzzPay rate card,
// 2026-10-27): Rp 500 flat for a transaction <= Rp 100.000, 0.7% of the
// amount above that. Returns a human-readable label, not a raw number,
// since the 0.7% tier is computed from the actual charge amount.
export function getQrisFeeLabel(amount: number): string {
  if (amount <= 100000) return 'Rp 500';
  return `Rp ${Math.round(amount * 0.007).toLocaleString('id-ID')} (0,7%)`;
}

// E-wallet admin fee by provider, percentage of amount (WuzzPay rate card,
// 2026-10-27) - channel itself is still disabled (see BANK_OPTIONS'
// emoney-equivalent gate in PaymentGatewayPanel/server.ts), kept here for
// when it's re-enabled.
export const WALLET_FEE_PERCENT: Record<string, number> = {
  ovo: 3,
  dana: 2,
  gopay: 4,
};

export function getBankName(code: string | undefined): string | undefined {
  return BANK_OPTIONS.find(b => b.code === code)?.name;
}

export function getWalletName(code: string | undefined): string | undefined {
  return WALLET_OPTIONS.find(w => w.code === code)?.name;
}
