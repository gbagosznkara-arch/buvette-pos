export type Role = 'owner' | 'manager';

export type ProductFormat =
  | 'bouteille'
  | 'canette'
  | 'sachet'
  | 'verre'
  | 'pack'
  | 'casier'
  | 'autre';

export type PaymentMethod = 'cash' | 'mobile' | 'mixed' | 'credit';

export type SaleStatus = 'paid' | 'held' | 'cancelled' | 'refunded';

export type StockMovementType =
  | 'entry'
  | 'sale'
  | 'breakage'
  | 'correction'
  | 'consignment_out'
  | 'consignment_in';

export type ConsignmentDirection = 'out' | 'in';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string;
  active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
}

export interface MobileOperator {
  id: string;
  name: string;
  code: string;
  color: string;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category_id: string | null;
  format: ProductFormat;
  sell_price: number;
  stock: number;
  alert_threshold: number;
  icon: string;
  active: boolean;
  allow_consignment: boolean;
  consignment_amount: number;
  created_at: string;
  updated_at: string;
}

export interface ProductCost {
  id: string;
  product_id: string;
  buy_price: number;
}

export interface SaleItem {
  id?: string;
  sale_id?: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  discount: number;
}

export interface Sale {
  id?: string;
  device_id: string;
  device_sale_id: string;
  manager_id?: string;
  total: number;
  payment_method: PaymentMethod;
  cash_amount: number;
  mobile_amount: number;
  operator_id: string | null;
  mobile_number: string;
  change_given: number;
  customer_name: string;
  status: SaleStatus;
  cancel_reason: string;
  created_at: string;
  synced_at?: string | null;
  items?: SaleItem[];
  sale_items?: {
    id?: string;
    sale_id?: string;
    product_id: string | null;
    product_name: string;
    qty: number;
    unit_price: number;
    discount: number;
  }[];
}

export interface Expense {
  id?: string;
  device_id: string;
  device_expense_id: string;
  manager_id?: string;
  amount: number;
  reason: string;
  category: string;
  created_at: string;
  synced_at?: string | null;
}

export interface StockMovement {
  id?: string;
  device_id: string;
  device_mvmt_id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  reason: string;
  manager_id?: string;
  created_at: string;
  synced_at?: string | null;
}

export interface Consignment {
  id?: string;
  device_id: string;
  device_consignment_id: string;
  product_id: string;
  direction: ConsignmentDirection;
  quantity: number;
  amount: number;
  manager_id?: string;
  created_at: string;
  synced_at?: string | null;
}

export interface CashSession {
  id?: string;
  device_id: string;
  device_session_id: string;
  manager_id?: string;
  total_sales: number;
  total_cash: number;
  total_mobile: number;
  operator_breakdown: Record<string, number>;
  sales_count: number;
  discounts: number;
  refunds: number;
  expenses_total: number;
  expected_cash: number;
  counted_cash: number;
  cash_difference: number;
  consignment_out: number;
  consignment_in: number;
  comment: string;
  status: 'closed' | 'validated';
  created_at: string;
  synced_at?: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}
