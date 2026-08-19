// Cumulative rental price table: day1Price..day5Price are TOTAL cost to rent for
// that many days (not per-day rates, and not an arithmetic progression - each is
// independently set per the owner's price list). extraDayRate is a flat amount
// ADDED per day beyond day 5 (day6 total = day5Price + extraDayRate, etc.).
export interface DayRateTable {
  day1Price: number;
  day2Price: number;
  day3Price: number;
  day4Price: number;
  day5Price: number;
  extraDayRate: number;
}

export interface Product {
  id: string;
  name: string;
  category: 'TENT & SHELTER' | 'SLEEPING SYSTEM' | 'CARRIER & BACKPACK' | 'COOKING GEAR' | 'LIGHTING & POWER' | 'HIKING ESSENTIALS' | 'CAMP SUPPORT' | 'APPAREL & PERSONAL GEAR' | string;
  rates: DayRateTable;
  readinessHours: number; // hours after actual return before stock counts as available again (0 = immediately)
  stock: number; // Max total inventory
  description?: string;
  image?: string;
  varian?: string;
  size?: string;
  color?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  ratesSnapshot?: DayRateTable; // snapshotted from Product.rates at booking time - never re-read live. Undefined only on pre-migration historical rows.
  // Legacy bridge fields for orders placed before the pricing-schema migration.
  // Never written by new order creation - delete these + their call sites once no
  // pre-migration order can still be open (see server.ts calculate-late).
  legacyPricePerDay?: number;
  legacyIncrementalPrice?: number;
  legacyDiscountThresholdDays?: number;
}

export type OrderStatus = 'Pending' | 'Approved/Paid' | 'Item Picked Up' | 'Item Returned/Completed' | 'Expired';

export interface Order {
  id: string;
  confirmationToken?: string; // random, unguessable, generated once at creation; absent on legacy pre-feature orders
  customerName: string;
  customerWhatsApp: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rentDuration: number; // calculated days
  items: OrderItem[];
  totalPrice: number;
  personalPhotoBase64: string; // customer's own photo (face-to-torso or full body), rental guarantee/identity verification
  status: OrderStatus;
  createdAt: string;
  returnedAt?: string; // ISO datetime, set once when status transitions into 'Item Returned/Completed'
  pickedUpAt?: string; // ISO datetime, set once when status transitions into 'Item Picked Up' - anchors the late-fee deadline (pickedUpAt + rentDuration*24h), see calculate-late in server.ts
  pickupIdType?: string; // type of physical ID card left as collateral in person (KTP/SIM/KTA/KIP/Kartu Pelajar/etc.), admin-entered at the Approved/Paid -> Item Picked Up transition
  lateDays?: number;
  lateFee?: number;
  amountPaid?: number; // total collected so far; undefined/0 while still Pending. remainingBalance is always derived (totalPrice + (lateFee||0)) - amountPaid, never stored.
  statusHistory?: StatusHistoryEntry[]; // audit trail of staff-driven status transitions only - order creation (initial Pending) is not an entry, since that's the customer, not staff
  penalties?: PenaltyEntry[]; // damage/loss charges assessed at return, admin-entered per incident; folded into the invoice total alongside lateFee (see src/pricing.ts)
  // --- WuzzPay payment gateway fields (see server.ts's wuzzpayRequest/verifyAndSettleOrderPayment) ---
  paymentMethod?: 'qris' | 'va' | 'emoney'; // chosen product_id at charge time
  paymentChannel?: string; // bank_code (va) or wallet code (emoney), e.g. "014" or "ovo" - unused for qris
  paymentInstruction?: Record<string, unknown>; // raw payment_instruction object from POST /v1/charge (va_number/qr string/expires_at/...), stored so the confirmation page can re-render on reload without re-charging
  wuzzpayTransactionId?: string; // WuzzPay's own transaction id - used to poll GET /v1/transactions/{id}. Admin/internal only, never sent to the public confirm/:token projection.
  wuzzpayProvider?: string; // used_provider echoed back from /v1/charge, for admin debugging. Admin/internal only.
  wuzzpayLastStatus?: string; // last known raw status string from WuzzPay, for admin debugging. Admin/internal only.
}

export interface StatusHistoryEntry {
  status: OrderStatus; // for a real status transition this IS the new status; for a non-transition action (see `action`) this is just the status the order was already in
  action?: string; // overrides the displayed label, e.g. "Item/Tanggal Diubah" - absent for ordinary status transitions, which continue to display `status`
  changedAt: string; // ISO datetime
  changedByUserId: string; // AppUser.id, or 'system' for expireStaleOrders' auto-expiry transition
  changedByName: string; // snapshot of AppUser.displayName at the time, or 'Sistem (Otomatis)' for the system sentinel
}

export interface PenaltyEntry {
  id: string;
  type: 'Kerusakan' | 'Kehilangan';
  productId: string;
  productName: string; // snapshot, same reasoning as OrderItem.productName
  description: string; // staff-entered reason, e.g. "sobek di bagian atap" - required, admin-visible only (not printed on the resi)
  amount: number; // staff-entered Rupiah
  createdAt: string;
}

// Public-safe projection of Order for the customer-facing confirmation page -
// Omit-based so any future Order field is included by default unless excluded here.
// statusHistory (staff display names) and penalties (internal damage/loss
// notes, explicitly admin-only - see PenaltyEntry.description) must never
// reach this unauthenticated endpoint. wuzzpayTransactionId/wuzzpayLastStatus
// are internal gateway debugging fields with no customer-facing purpose - the
// customer's own polling response is a separate, intentionally narrow object
// (see GET /api/orders/confirm/:token/payment-status), not this projection.
export type PublicOrder = Omit<Order, 'personalPhotoBase64' | 'statusHistory' | 'penalties' | 'wuzzpayTransactionId' | 'wuzzpayLastStatus'>;

// List-view projection - the orders array fetched on login/refresh never
// needs personalPhotoBase64 (only OrderDetailPanel does, via a dedicated
// single-order fetch - see handleOpenOrderDetail). Keeps the list payload
// from scaling with every order's photo forever.
export type OrderListItem = Omit<Order, 'personalPhotoBase64'>;

export interface DashboardStats {
  activeRentalsCount: number;
  totalRevenue: number; // cash actually collected (sum of amountPaid), not accrued totalPrice
  totalOutstanding: number; // sum of remaining unpaid balance across confirmed/active orders ("Piutang")
  dueTodayCount: number;
}

export interface DayHours {
  open: string; // "HH:mm", 24h
  close: string; // "HH:mm", 24h
}

export interface WeeklyHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface FooterSettings {
  description: string;
  address: string;
  instagramHandle: string; // display text, e.g. "@bilbooutdoors (Instagram)"
  instagramUrl: string;
  whatsappText: string; // full line, e.g. "Narahubung Cepat WA: 0811-370-6666"
  copyrightText: string; // full bottom line
}

export interface StoreSettings {
  lateToleranceHours: number; // grace period past closing time before a late fee starts
  pendingExpiryHours: number; // an unpaid Pending order auto-flips to Expired after this many hours (see expireStaleOrders, server.ts)
  operatingHours: WeeklyHours;
  footer: FooterSettings;
  runningText: string[]; // marquee phrases, in order - free text, not limited to category names (can hold promo/discount announcements etc.)
}

export type UserRole = 'owner' | 'karyawan';

export interface AppUser {
  id: string;
  username: string;
  passwordHash: string; // scrypt digest, hex - see src/auth.ts
  passwordSalt: string; // per-user random salt, hex
  role: UserRole;
  displayName: string;
  active: boolean; // default true - read as `!== false` everywhere, never `!user.active`, so rows written before this field existed are never misread as inactive
  sessionToken?: string; // current active session token; absent when logged out
  createdAt: string;
}

// Public-safe projection of AppUser - never send hash/salt/token to the client.
export type PublicUser = Omit<AppUser, 'passwordHash' | 'passwordSalt' | 'sessionToken'>;

export interface JobPriceListItem {
  id: string;
  itemName: string;
  cleaningPrice?: number; // undefined where this service doesn't apply to this item
  laundryPrice?: number;
  inventarisPrice?: number;
  active: boolean; // default true - read as `!== false` everywhere, never `!item.active`, so rows written before this field existed are never misread as inactive
  productIds?: string[]; // Product.id[] this row was derived from at creation time; absent on legacy freeform rows; provenance only, not a live FK - itemName (snapshotted onto JobEntry) remains the sole operative field for pricing lookups
}

export type JobType = 'CLEANING' | 'LAUNDRY' | 'INVENTARIS';

export interface JobEntry {
  id: string;
  employeeUserId: string;
  employeeName: string; // snapshot of AppUser.displayName at entry time, same reasoning as OrderItem.productName
  entryDate: string; // YYYY-MM-DD
  itemName: string; // snapshot of JobPriceListItem.itemName, not a live FK
  jobType: JobType;
  unitPrice: number; // snapshot of the matching price at entry time
  quantity: number;
  total: number; // unitPrice * quantity
  status: 'Pending' | 'Paid' | 'Rejected';
  paymentDate?: string; // owner-entered, set on the Paid transition
  rejectionReason?: string; // owner-entered, set on the Rejected transition
  rejectedAt?: string; // ISO datetime, set on the Rejected transition
  createdAt: string;
}

export interface Theme {
  id: string;
  name: string;
  primary: string;       // Hex color code, e.g., '#FFB800'
  primaryHover: string;  // Hex color code, e.g., '#E5A500'
  primaryRgb: string;    // CSS RGB format, e.g., '255, 184, 0'
  description: string;   // e.g., 'Sunset Gold'
}

