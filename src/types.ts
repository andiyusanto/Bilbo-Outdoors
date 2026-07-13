export interface Product {
  id: string;
  name: string;
  category: 'TENT & SHELTER' | 'SLEEPING SYSTEM' | 'CARRIER & BACKPACK' | 'COOKING GEAR' | 'LIGHTING & POWER' | 'HIKING ESSENTIALS' | 'CAMP SUPPORT' | string;
  price: number; // Daily rate in IDR, e.g., 35000
  incrementalPriceAfter5Days: number; // e.g. 10000 for tents, 0 for others
  discountMinDays: number; // day threshold after which the discount applies, e.g. 5
  stock: number; // Max total inventory
  description?: string;
  image?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  pricePerDay: number;
  incrementalPrice: number;
  discountThresholdDays: number; // snapshotted from Product.discountMinDays at booking time - never re-read live
}

export type OrderStatus = 'Pending' | 'Approved/Paid' | 'Item Picked Up' | 'Item Returned/Completed';

export interface Order {
  id: string;
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
  lateDays?: number;
  lateFee?: number;
}

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

