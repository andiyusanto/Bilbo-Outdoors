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
export const BANK_OPTIONS = [
  { code: '014', name: 'Bank Central Asia (BCA)' },
  { code: '002', name: 'Bank Rakyat Indonesia (BRI)' },
  { code: '009', name: 'Bank Negara Indonesia (BNI)' },
  { code: '008', name: 'Bank Mandiri' },
  { code: '451', name: 'Bank Syariah Indonesia (BSI)' },
  { code: '013', name: 'Bank Permata' },
  { code: '022', name: 'Bank CIMB Niaga' },
  { code: '011', name: 'Bank Danamon' },
];

export const WALLET_OPTIONS = [
  { code: 'ovo', name: 'OVO' },
  { code: 'dana', name: 'DANA' },
  { code: 'gopay', name: 'GoPay' },
];

export function getBankName(code: string | undefined): string | undefined {
  return BANK_OPTIONS.find(b => b.code === code)?.name;
}

export function getWalletName(code: string | undefined): string | undefined {
  return WALLET_OPTIONS.find(w => w.code === code)?.name;
}
