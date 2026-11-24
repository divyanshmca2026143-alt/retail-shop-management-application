export type CategoryName =
  | 'Electronics'
  | 'Clothing'
  | 'Grocery'
  | 'Stationery'
  | 'Home Appliances';

export type PaymentMethod = 'UPI' | 'Card' | 'Cash';

export const CATEGORIES: CategoryName[] = [
  'Electronics',
  'Clothing',
  'Grocery',
  'Stationery',
  'Home Appliances',
];

export interface Product {
  product_id: string;
  name: string;
  category: CategoryName;
  price: number;
  stock: number;
  sku: string;
  updated_at?: string;
}

export interface CartEntry {
  product: Product;
  quantity: number;
}

export interface DiscountResult {
  discount_type: 'PROMO' | 'AUTO' | 'NONE';
  promo_code: string | null;
  discount_percent: number;
  discount_amount: number;
  description: string;
}

export interface CheckoutPreview {
  subtotal: number;
  discount: DiscountResult;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  final_amount: number;
}

export interface InvoiceLine {
  product_id: string;
  product_name: string;
  category: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Invoice {
  bill_ref: string;
  customer_name: string;
  customer_phone?: string;
  payment_method: PaymentMethod;
  created_at: string;
  items: InvoiceLine[];
  subtotal: number;
  discount_type: string;
  promo_code: string | null;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  final_amount: number;
}

export interface SalesSummary {
  daily_revenue: number;
  monthly_revenue: number;
  total_revenue: number;
  total_transactions: number;
  total_discounts: number;
  average_order_value: number;
  generated_at: string;
}

export interface PromoCodeInfo {
  code: string;
  discount_percent: number;
  description: string;
  is_active: boolean;
}

export interface OverviewData {
  totalProducts: number;
  categoryCounts: Record<string, number>;
  salesSummary: SalesSummary;
  lowStockCount: number;
  promoCodes: PromoCodeInfo[];
}

export interface AnalyticsData {
  summary: SalesSummary;
  bestSellers: Array<{
    product_id: string;
    product_name: string;
    category_name: string;
    units_sold: number;
    revenue: number;
  }>;
  categorySales: Array<{
    category_name: string;
    units_sold: number;
    revenue: number;
  }>;
  lowStock: Product[];
  paymentBreakdown: Record<PaymentMethod, { count: number; amount: number }>;
}
