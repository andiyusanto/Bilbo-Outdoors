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

export type OrderStatus = 'Pending' | 'Approved/Paid' | 'Item Picked Up' | 'Item Returned/Completed';

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
  idCardBase64: string; // rent guarantee KTP/SIM
  status: OrderStatus;
  createdAt: string;
  returnedAt?: string; // ISO datetime, set once when status transitions into 'Item Returned/Completed'
  lateDays?: number;
  lateFee?: number;
}

// Public-safe projection of Order for the customer-facing confirmation page -
// Omit-based so any future Order field is included by default unless excluded here.
export type PublicOrder = Omit<Order, 'idCardBase64'>;

export interface DashboardStats {
  activeRentalsCount: number;
  totalRevenue: number;
  dueTodayCount: number;
}

export interface Theme {
  id: string;
  name: string;
  primary: string;       // Hex color code, e.g., '#FFB800'
  primaryHover: string;  // Hex color code, e.g., '#E5A500'
  primaryRgb: string;    // CSS RGB format, e.g., '255, 184, 0'
  description: string;   // e.g., 'Sunset Gold'
}

