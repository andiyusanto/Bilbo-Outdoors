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

// Estimated admin-fee range per bank, from the owner's own WuzzPay contract
// (2026-10-26, confirmed directly, not from the API - WuzzPay's charge
// response never populates a real fee, see PaymentGatewayPanel's own
// comment). A range, not an exact figure, since the owner doesn't have a
// precise per-transaction number - shown as an estimate, not a guarantee.
// This fee is merchant-absorbed (the "charge to buyer" toggle on WuzzPay's
// dashboard stays off) - it never changes what the customer transfers, so
// any UI using this is informational only, never added to a total.
export const VA_FEE_ESTIMATE: Record<string, string> = {
  '002': 'Rp 2.500–3.000', // BRI
  '008': 'Rp 2.500–3.000', // Mandiri
  '014': 'Rp 4.000–5.000', // BCA
};

export function getBankName(code: string | undefined): string | undefined {
  return BANK_OPTIONS.find(b => b.code === code)?.name;
}

export function getWalletName(code: string | undefined): string | undefined {
  return WALLET_OPTIONS.find(w => w.code === code)?.name;
}
