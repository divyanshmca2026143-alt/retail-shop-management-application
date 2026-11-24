import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateInvoicePdf } from './pdf.ts';

export const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Grocery',
  'Stationery',
  'Home Appliances',
] as const;

export type CategoryName = (typeof CATEGORIES)[number];
export type PaymentMethod = 'Cash' | 'UPI' | 'Card';

export interface Product {
  product_id: string;
  name: string;
  category: CategoryName;
  price: number;
  stock: number;
  sku: string;
  updated_at: string;
}

export interface PromoCode {
  code: string;
  discount_percent: number;
  description: string;
  is_active: boolean;
}

export interface AdminRecord {
  username: string;
  password_hash: string;
  role: string;
  last_login: string | null;
}

export interface InvoiceLine {
  product_id: string;
  product_name: string;
  category: CategoryName;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface InvoiceRecord {
  bill_ref: string;
  customer_name: string;
  customer_phone: string;
  payment_method: PaymentMethod;
  created_at: string;
  items: InvoiceLine[];
  subtotal: number;
  discount_type: 'PROMO' | 'AUTO' | 'NONE';
  promo_code: string | null;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  final_amount: number;
}

interface StoreState {
  products: Product[];
  promo_codes: PromoCode[];
  admins: AdminRecord[];
  transactions: InvoiceRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'retail_store.json');
export const INVOICES_DIR = path.join(process.cwd(), 'invoices');
const GST_RATE = 0.18;
const AUTO_DISCOUNT_THRESHOLD = 1000;
const AUTO_DISCOUNT_PERCENT = 5;

function hashPassword(password: string, salt?: string): string {
  const saltHex = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, saltHex, 120_000, 32, 'sha256').toString('hex');
  return `${saltHex}$${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 2 || !password) return false;
  const [saltHex, expectedHex] = parts;
  const candidateHex = hashPassword(password, saltHex).split('$')[1];
  const a = Buffer.from(candidateHex, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const CATALOG_BLUEPRINTS: Record<
  CategoryName,
  {
    skuPrefix: string;
    brands: string[];
    items: string[];
    variants: string[];
    minPrice: number;
    maxPrice: number;
  }
> = {
  Electronics: {
    skuPrefix: 'ELEC',
    brands: ['Sony', 'Samsung', 'Logitech', 'Anker', 'JBL', 'Dell', 'TP-Link', 'Lenovo', 'boAt', 'Philips'],
    items: [
      'Wireless Mouse', 'Mechanical Keyboard', 'Bluetooth Earbuds', 'USB-C Hub',
      'Portable SSD 1TB', 'Smart LED Bulb', 'Webcam 1080p', 'Power Bank 20000mAh',
      'HDMI 2.1 Cable', 'Noise-Cancelling Headphones', 'Wi-Fi 6 Router', '24-inch IPS Monitor',
      'Surge Protector', 'Wireless Charger Pad', 'Bluetooth Speaker', 'Gaming Headset',
      'Laptop Cooling Pad', 'Memory Card 128GB', 'Smartwatch Band', 'Ethernet Switch 8-Port',
    ],
    variants: ['Pro', 'Lite', 'Max', 'Plus', 'Studio', 'Core', 'Ultra', 'Compact', 'Air', 'Edition'],
    minPrice: 299,
    maxPrice: 24999,
  },
  Clothing: {
    skuPrefix: 'CLTH',
    brands: ['Levis', 'Allen Solly', 'Raymond', 'Van Heusen', 'Nike', 'Puma', 'Fabindia', 'Wrangler', 'Peter England', 'US Polo'],
    items: [
      'Oxford Cotton Shirt', 'Slim Fit Chinos', 'Crewneck T-Shirt', 'Denim Jeans',
      'Fleece Hoodie', 'Polo Collar Tee', 'Kurta Tunic', 'Running Shorts',
      'Knitted Sweater', 'Formal Trousers', 'Windbreaker Jacket', 'Linen Casual Shirt',
      'Track Pants', 'Canvas Belt', 'Cotton Socks Pack', 'Graphic Sweatshirt',
      'Tailored Blazer', 'Cargo Joggers', 'Thermal Innerwear', 'Sports Cap',
    ],
    variants: ['Navy S', 'Charcoal M', 'Olive L', 'Ivory XL', 'Indigo M', 'Slate L', 'Crimson S', 'Sandstone M', 'Black L', 'Forest XL'],
    minPrice: 249,
    maxPrice: 5499,
  },
  Grocery: {
    skuPrefix: 'GROC',
    brands: ['Tata', 'Aashirvaad', 'Fortune', 'Amul', 'Organic India', 'MTR', 'Dabur', 'Saffola', '24 Mantra', 'Britannia'],
    items: [
      'Basmati Rice', 'Whole Wheat Atta', 'Mustard Oil', 'Toor Dal',
      'Roasted Almonds', 'Assam Leaf Tea', 'Filter Coffee Powder', 'Wildflower Honey',
      'Rolled Oats', 'Turmeric Powder', 'Red Chilli Flakes', 'Pure Ghee',
      'Peanut Butter', 'Multigrain Biscuits', 'Dark Chocolate Bar', 'Chia Seeds',
      'Poha Flattened Rice', 'Himalayan Pink Salt', 'Apple Cider Vinegar', 'Green Tea Bags',
    ],
    variants: ['250g', '500g', '1kg', '2kg', '5kg', '200ml', '500ml', '1L', 'Family Pack', 'Value Jar'],
    minPrice: 45,
    maxPrice: 1490,
  },
  Stationery: {
    skuPrefix: 'STAT',
    brands: ['Classmate', 'Parker', 'Camlin', 'Faber-Castell', 'Cello', 'JK Copier', 'Pidilite', 'Staedtler', 'Kokuyo', 'Post-it'],
    items: [
      'Ruled Spiral Notebook', 'Gel Ink Pen Set', 'A4 Printer Paper Ream', 'Highlighter Pack',
      'Sticky Notes Cube', 'Scientific Calculator', 'Acrylic Paint Set', 'Mechanical Pencil',
      'Heavy-Duty Stapler', 'Document Binder', 'Whiteboard Marker Set', 'Geometry Box',
      'Desk Organizer Tray', 'Correction Tape', 'Graph Pad A4', 'Fountain Pen',
      'Paper Clips Box', 'Glue Stick Pack', 'Lamination Pouches', 'Index Dividers',
    ],
    variants: ['Pack of 5', 'Pack of 10', 'Single Unit', '500 Sheets', '200 Pages', 'Fine Tip', 'Medium Tip', 'Assorted', 'Executive', 'Student Pack'],
    minPrice: 25,
    maxPrice: 1850,
  },
  'Home Appliances': {
    skuPrefix: 'HAPP',
    brands: ['Philips', 'Bajaj', 'Prestige', 'Havells', 'LG', 'IFB', 'Morphy Richards', 'Crompton', 'Usha', 'Voltas'],
    items: [
      'Electric Kettle', 'Mixer Grinder', 'Steam Iron', 'Induction Cooktop',
      'Air Fryer', 'Toaster 2-Slice', 'Ceiling Fan', 'Tower Air Cooler',
      'Vacuum Cleaner', 'Water Purifier Filter', 'Hand Blender', 'Room Heater',
      'Rice Cooker', 'Coffee Maker', 'Sandwich Griller', 'Table Fan',
      'LED Desk Lamp', 'Garment Steamer', 'Microwave Bowl Set', 'Juicer Extractor',
    ],
    variants: ['750W', '1000W', '1200W', '1500W', '2000W', '1.5L', '2.0L', '4.5L', 'Compact', 'Heavy Duty'],
    minPrice: 499,
    maxPrice: 18999,
  },
};

function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function createInitialState(): StoreState {
  const rng = createSeededRng(2026);
  const products: Product[] = [];
  const timestamp = nowTimestamp();
  let globalIdx = 1;

  for (const category of CATEGORIES) {
    const bp = CATALOG_BLUEPRINTS[category];
    let perCat = 0;

    for (let itemIdx = 0; itemIdx < bp.items.length; itemIdx++) {
      for (let brandIdx = 0; brandIdx < bp.brands.length; brandIdx++) {
        perCat++;
        const variant = bp.variants[(itemIdx + brandIdx) % bp.variants.length];
        const product_id = `PRD-${String(globalIdx).padStart(4, '0')}`;
        const sku = `SKU-${bp.skuPrefix}-${String(perCat).padStart(4, '0')}`;
        const name = `${bp.brands[brandIdx]} ${bp.items[itemIdx]} (${variant})`;

        const raw = bp.minPrice + rng() * (bp.maxPrice - bp.minPrice);
        const price = Math.max(15, raw > 100 ? Math.round(raw / 5) * 5 - 1 : Math.round(raw));
        const stock =
          perCat % 17 === 0
            ? Math.floor(2 + rng() * 7)
            : Math.floor(15 + rng() * 140);

        products.push({
          product_id,
          name,
          category,
          price,
          stock,
          sku,
          updated_at: timestamp,
        });
        globalIdx++;
      }
    }
  }

  const defaultUser = process.env.RETAIL_ADMIN_USER?.trim() || 'admin';
  const defaultPass = process.env.RETAIL_ADMIN_PASS || 'Admin@123';

  const promo_codes: PromoCode[] = [
    { code: 'SAVE10', discount_percent: 10, description: 'Flat 10% off entire cart', is_active: true },
    { code: 'SAVE20', discount_percent: 20, description: 'Flat 20% off entire cart', is_active: true },
    { code: 'WELCOME5', discount_percent: 5, description: 'Welcome 5% discount', is_active: true },
  ];

  // Create 5 realistic starter transactions so Analytics & Invoices are immediately useful
  const starterSpecs: Array<{
    customer: string;
    phone: string;
    payment: PaymentMethod;
    promo: string | null;
    picks: Array<[string, number]>;
  }> = [
    { customer: 'Ananya Verma', phone: '9876543210', payment: 'UPI', promo: 'SAVE10', picks: [['PRD-0001', 1], ['PRD-0604', 2]] },
    { customer: 'Rohan Kulkarni', phone: '9820112233', payment: 'Card', promo: null, picks: [['PRD-0205', 2], ['PRD-0402', 3]] },
    { customer: 'Meera Nair', phone: '9845001122', payment: 'UPI', promo: 'WELCOME5', picks: [['PRD-0802', 1]] },
    { customer: 'Siddharth Rao', phone: '9911223344', payment: 'Cash', promo: null, picks: [['PRD-0410', 4], ['PRD-0612', 3]] },
    { customer: 'Priya Deshmukh', phone: '9765432109', payment: 'Card', promo: 'SAVE20', picks: [['PRD-0014', 1], ['PRD-0218', 1]] },
  ];

  const transactions: InvoiceRecord[] = [];
  const productMap = new Map(products.map((p) => [p.product_id, p]));

  starterSpecs.forEach((spec, idx) => {
    const lines: InvoiceLine[] = [];
    for (const [pid, qty] of spec.picks) {
      const prod = productMap.get(pid);
      if (!prod || prod.stock < qty) continue;
      prod.stock -= qty;
      lines.push({
        product_id: prod.product_id,
        product_name: prod.name,
        category: prod.category,
        unit_price: prod.price,
        quantity: qty,
        line_total: Number((prod.price * qty).toFixed(2)),
      });
    }
    if (lines.length === 0) return;

    const subtotal = Number(lines.reduce((s, l) => s + l.line_total, 0).toFixed(2));
    const promo = spec.promo ? promo_codes.find((c) => c.code === spec.promo) : null;
    let discount_type: 'PROMO' | 'AUTO' | 'NONE' = 'NONE';
    let discount_percent = 0;
    let discount_amount = 0;

    if (promo) {
      discount_type = 'PROMO';
      discount_percent = promo.discount_percent;
      discount_amount = Number((subtotal * (discount_percent / 100)).toFixed(2));
    } else if (subtotal > AUTO_DISCOUNT_THRESHOLD) {
      discount_type = 'AUTO';
      discount_percent = AUTO_DISCOUNT_PERCENT;
      discount_amount = Number((subtotal * (discount_percent / 100)).toFixed(2));
    }

    const taxable_amount = Number(Math.max(0, subtotal - discount_amount).toFixed(2));
    const gst_amount = Number((taxable_amount * GST_RATE).toFixed(2));
    const final_amount = Number((taxable_amount + gst_amount).toFixed(2));
    const dateStamp = timestamp.slice(0, 10).replace(/-/g, '');
    const bill_ref = `INV-${dateStamp}-100${idx + 1}`;

    const invoice: InvoiceRecord = {
      bill_ref,
      customer_name: spec.customer,
      customer_phone: spec.phone,
      payment_method: spec.payment,
      created_at: timestamp,
      items: lines,
      subtotal,
      discount_type,
      promo_code: promo ? promo.code : null,
      discount_percent,
      discount_amount,
      taxable_amount,
      gst_rate: GST_RATE,
      gst_amount,
      final_amount,
    };

    generateInvoicePdf(invoice, INVOICES_DIR);
    transactions.unshift(invoice);
  });

  return {
    products,
    promo_codes,
    admins: [
      {
        username: defaultUser,
        password_hash: hashPassword(defaultPass),
        role: 'superadmin',
        last_login: null,
      },
    ],
    transactions,
  };
}

class RetailStore {
  private state: StoreState;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      this.state = JSON.parse(raw) as StoreState;
    } else {
      this.state = createInitialState();
      this.save();
    }
  }

  private save(): void {
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf8');
    fs.renameSync(tmp, STORE_PATH);
  }

  private evaluateDiscount(subtotal: number, promoInput?: string | null) {
    if (subtotal <= 0) {
      return {
        discount_type: 'NONE' as const,
        promo_code: null,
        discount_percent: 0,
        discount_amount: 0,
        description: 'No discount applicable',
      };
    }

    const cleanCode = promoInput?.trim().toUpperCase() || null;
    if (cleanCode) {
      const promo = this.state.promo_codes.find(
        (p) => p.code.toUpperCase() === cleanCode && p.is_active,
      );
      if (!promo) {
        throw new Error(`Promo code '${cleanCode}' is invalid or inactive.`);
      }
      const amount = Number((subtotal * (promo.discount_percent / 100)).toFixed(2));
      return {
        discount_type: 'PROMO' as const,
        promo_code: promo.code,
        discount_percent: promo.discount_percent,
        discount_amount: amount,
        description: `Promo ${promo.code} (${promo.discount_percent}% off)`,
      };
    }

    if (subtotal > AUTO_DISCOUNT_THRESHOLD) {
      const amount = Number((subtotal * (AUTO_DISCOUNT_PERCENT / 100)).toFixed(2));
      return {
        discount_type: 'AUTO' as const,
        promo_code: null,
        discount_percent: AUTO_DISCOUNT_PERCENT,
        discount_amount: amount,
        description: `Automatic ${AUTO_DISCOUNT_PERCENT}% off (orders over ₹1,000)`,
      };
    }

    return {
      discount_type: 'NONE' as const,
      promo_code: null,
      discount_percent: 0,
      discount_amount: 0,
      description: 'No discount applied',
    };
  }

  private authenticateAdmin(username: string, password: string): AdminRecord {
    const cleanUser = String(username || '').trim();
    const admin = this.state.admins.find((a) => a.username === cleanUser);
    if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) {
      throw new Error('Invalid administrator username or password.');
    }
    admin.last_login = nowTimestamp();
    this.save();
    return admin;
  }

  public getOverview() {
    const today = nowTimestamp().slice(0, 10);
    const month = today.slice(0, 7);

    const categoryCounts: Record<string, number> = {};
    for (const cat of CATEGORIES) categoryCounts[cat] = 0;
    let lowStockCount = 0;
    for (const p of this.state.products) {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      if (p.stock <= 10) lowStockCount++;
    }

    let daily_revenue = 0;
    let monthly_revenue = 0;
    let total_revenue = 0;
    let total_discounts = 0;

    for (const tx of this.state.transactions) {
      if (tx.created_at.startsWith(today)) daily_revenue += tx.final_amount;
      if (tx.created_at.startsWith(month)) monthly_revenue += tx.final_amount;
      total_revenue += tx.final_amount;
      total_discounts += tx.discount_amount;
    }

    const total_transactions = this.state.transactions.length;
    return {
      totalProducts: this.state.products.length,
      categoryCounts,
      lowStockCount,
      promoCodes: this.state.promo_codes.filter((p) => p.is_active),
      salesSummary: {
        daily_revenue: Number(daily_revenue.toFixed(2)),
        monthly_revenue: Number(monthly_revenue.toFixed(2)),
        total_revenue: Number(total_revenue.toFixed(2)),
        total_transactions,
        total_discounts: Number(total_discounts.toFixed(2)),
        average_order_value:
          total_transactions > 0 ? Number((total_revenue / total_transactions).toFixed(2)) : 0,
        generated_at: nowTimestamp(),
      },
    };
  }

  public listProducts(params: {
    query?: string;
    category?: string;
    lowStockOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const q = (params.query || '').trim().toLowerCase();
    const cat = (params.category || '').trim();
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit || 20)));

    let filtered = this.state.products;
    if (cat && cat !== 'All') {
      filtered = filtered.filter((p) => p.category === cat);
    }
    if (params.lowStockOnly) {
      filtered = filtered.filter((p) => p.stock <= 10);
    }
    if (q) {
      filtered = filtered.filter(
        (p) =>
          p.product_id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      );
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    return {
      products: filtered.slice(start, start + limit),
      total,
      page,
      limit,
    };
  }

  public findExactProduct(code: string): Product {
    const clean = code.trim().toUpperCase();
    const found = this.state.products.find(
      (p) => p.product_id.toUpperCase() === clean || p.sku.toUpperCase() === clean,
    );
    if (!found) {
      throw new Error(`No product matched ID or SKU '${clean}'.`);
    }
    return found;
  }

  public previewCheckout(items: Array<{ product_id: string; quantity: number }>, promoCode?: string | null) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Shopping cart is empty.');
    }

    let subtotal = 0;
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for '${item.product_id}'.`);
      }
      const product = this.state.products.find(
        (p) => p.product_id.toUpperCase() === String(item.product_id).trim().toUpperCase(),
      );
      if (!product) {
        throw new Error(`Product '${item.product_id}' was not found.`);
      }
      if (qty > product.stock) {
        throw new Error(
          `Insufficient stock for '${product.name}': requested ${qty}, available ${product.stock}.`,
        );
      }
      subtotal += product.price * qty;
    }

    subtotal = Number(subtotal.toFixed(2));
    const discount = this.evaluateDiscount(subtotal, promoCode);
    const taxable_amount = Number(Math.max(0, subtotal - discount.discount_amount).toFixed(2));
    const gst_amount = Number((taxable_amount * GST_RATE).toFixed(2));
    const final_amount = Number((taxable_amount + gst_amount).toFixed(2));

    return {
      subtotal,
      discount,
      taxable_amount,
      gst_rate: GST_RATE,
      gst_amount,
      final_amount,
    };
  }

  public finalizeCheckout(params: {
    items: Array<{ product_id: string; quantity: number }>;
    customer_name?: string;
    customer_phone?: string;
    payment_method?: PaymentMethod;
    promo_code?: string | null;
  }): InvoiceRecord {
    const preview = this.previewCheckout(params.items, params.promo_code);
    const lines: InvoiceLine[] = [];

    for (const reqItem of params.items) {
      const product = this.state.products.find(
        (p) => p.product_id.toUpperCase() === String(reqItem.product_id).trim().toUpperCase(),
      )!;
      const qty = Number(reqItem.quantity);
      product.stock -= qty;
      product.updated_at = nowTimestamp();
      lines.push({
        product_id: product.product_id,
        product_name: product.name,
        category: product.category,
        unit_price: product.price,
        quantity: qty,
        line_total: Number((product.price * qty).toFixed(2)),
      });
    }

    const created_at = nowTimestamp();
    const stamp = created_at.replace(/[-: ]/g, '').slice(0, 14);
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const bill_ref = `INV-${stamp.slice(0, 8)}-${stamp.slice(8)}-${suffix}`;

    const invoice: InvoiceRecord = {
      bill_ref,
      customer_name: (params.customer_name || '').trim() || 'Walk-in Customer',
      customer_phone: (params.customer_phone || '').trim(),
      payment_method: params.payment_method || 'UPI',
      created_at,
      items: lines,
      subtotal: preview.subtotal,
      discount_type: preview.discount.discount_type,
      promo_code: preview.discount.promo_code,
      discount_percent: preview.discount.discount_percent,
      discount_amount: preview.discount.discount_amount,
      taxable_amount: preview.taxable_amount,
      gst_rate: GST_RATE,
      gst_amount: preview.gst_amount,
      final_amount: preview.final_amount,
    };

    generateInvoicePdf(invoice, INVOICES_DIR);
    this.state.transactions.unshift(invoice);
    this.save();
    return invoice;
  }

  public listInvoices(query?: string) {
    const q = (query || '').trim().toLowerCase();
    const list = q
      ? this.state.transactions.filter(
          (tx) =>
            tx.bill_ref.toLowerCase().includes(q) ||
            tx.customer_name.toLowerCase().includes(q) ||
            tx.customer_phone.toLowerCase().includes(q),
        )
      : this.state.transactions;
    return list.slice(0, 100);
  }

  public getInvoice(billRef: string): InvoiceRecord | null {
    const clean = billRef.trim().toUpperCase();
    return this.state.transactions.find((t) => t.bill_ref.toUpperCase() === clean) || null;
  }

  public getAnalytics() {
    const overview = this.getOverview();
    const bestMap = new Map<
      string,
      { product_id: string; product_name: string; category_name: string; units_sold: number; revenue: number }
    >();
    const catMap = new Map<string, { category_name: string; units_sold: number; revenue: number }>();
    const paymentBreakdown: Record<PaymentMethod, { count: number; amount: number }> = {
      UPI: { count: 0, amount: 0 },
      Card: { count: 0, amount: 0 },
      Cash: { count: 0, amount: 0 },
    };

    for (const cat of CATEGORIES) {
      catMap.set(cat, { category_name: cat, units_sold: 0, revenue: 0 });
    }

    for (const tx of this.state.transactions) {
      const pm = tx.payment_method || 'UPI';
      paymentBreakdown[pm].count += 1;
      paymentBreakdown[pm].amount = Number((paymentBreakdown[pm].amount + tx.final_amount).toFixed(2));

      for (const line of tx.items) {
        const prevProd = bestMap.get(line.product_id) || {
          product_id: line.product_id,
          product_name: line.product_name,
          category_name: line.category,
          units_sold: 0,
          revenue: 0,
        };
        prevProd.units_sold += line.quantity;
        prevProd.revenue = Number((prevProd.revenue + line.line_total).toFixed(2));
        bestMap.set(line.product_id, prevProd);

        const prevCat = catMap.get(line.category);
        if (prevCat) {
          prevCat.units_sold += line.quantity;
          prevCat.revenue = Number((prevCat.revenue + line.line_total).toFixed(2));
        }
      }
    }

    const bestSellers = Array.from(bestMap.values())
      .sort((a, b) => b.units_sold - a.units_sold || b.revenue - a.revenue)
      .slice(0, 10);

    const categorySales = Array.from(catMap.values()).sort((a, b) => b.revenue - a.revenue);
    const lowStock = this.state.products
      .filter((p) => p.stock <= 10)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 40);

    return {
      summary: overview.salesSummary,
      bestSellers,
      categorySales,
      lowStock,
      paymentBreakdown,
    };
  }

  public suggestNextProductIds(category: CategoryName = 'Electronics'): {
    product_id: string;
    sku: string;
  } {
    let maxNum = this.state.products.length;
    for (const p of this.state.products) {
      const m = /^PRD-(\d+)$/i.exec(p.product_id);
      if (m) {
        const n = Number(m[1]);
        if (n > maxNum) maxNum = n;
      }
    }
    const nextId = `PRD-${String(maxNum + 1).padStart(4, '0')}`;

    const prefix = CATALOG_BLUEPRINTS[category]?.skuPrefix || 'ITEM';
    let maxSku = 0;
    const skuRe = new RegExp(`^SKU-${prefix}-(\\d+)$`, 'i');
    for (const p of this.state.products) {
      const m = skuRe.exec(p.sku);
      if (m) {
        const n = Number(m[1]);
        if (n > maxSku) maxSku = n;
      }
    }
    const nextSku = `SKU-${prefix}-${String(maxSku + 1).padStart(4, '0')}`;
    return { product_id: nextId, sku: nextSku };
  }

  public addProduct(p?: Partial<Product>): Product {
    if (!p?.product_id || !p.name || !p.category || !p.sku) {
      throw new Error('Product ID, name, category, and SKU are required.');
    }
    const pid = p.product_id.trim().toUpperCase();
    const sku = p.sku.trim().toUpperCase();
    const price = Number(p.price);
    const stock = Number(p.stock);
    if (!CATEGORIES.includes(p.category as CategoryName)) {
      throw new Error(`Invalid category '${p.category}'.`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Price must be greater than zero.');
    }
    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error('Stock must be a non-negative integer.');
    }
    if (this.state.products.some((item) => item.product_id.toUpperCase() === pid)) {
      throw new Error(`Duplicate Product ID '${pid}' already exists.`);
    }
    if (this.state.products.some((item) => item.sku.toUpperCase() === sku)) {
      throw new Error(`Duplicate SKU '${sku}' is already in use.`);
    }
    const created: Product = {
      product_id: pid,
      name: p.name.trim(),
      category: p.category as CategoryName,
      price: Number(price.toFixed(2)),
      stock,
      sku,
      updated_at: nowTimestamp(),
    };
    this.state.products.unshift(created);
    this.save();
    return created;
  }

  public adminLogin(username: string, password: string) {
    const admin = this.authenticateAdmin(username, password);
    return { username: admin.username, role: admin.role, last_login: admin.last_login };
  }

  public handleAdminAction(payload: {
    username: string;
    password: string;
    op: string;
    product?: Partial<Product>;
    product_id?: string;
    quantity?: number;
    date?: string;
    promo?: { code: string; discount_percent?: number; description?: string };
  }) {
    this.authenticateAdmin(payload.username, payload.password);

    switch (payload.op) {
      case 'add': {
        return { product: this.addProduct(payload.product) };
      }

      case 'update': {
        const p = payload.product;
        if (!p?.product_id) throw new Error('Product ID is required.');
        const target = this.state.products.find(
          (item) => item.product_id.toUpperCase() === p.product_id!.trim().toUpperCase(),
        );
        if (!target) throw new Error(`Product '${p.product_id}' not found.`);
        if (p.name !== undefined) {
          if (!p.name.trim()) throw new Error('Product name cannot be empty.');
          target.name = p.name.trim();
        }
        if (p.price !== undefined) {
          const price = Number(p.price);
          if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be positive.');
          target.price = Number(price.toFixed(2));
        }
        if (p.stock !== undefined) {
          const stock = Number(p.stock);
          if (!Number.isInteger(stock) || stock < 0) throw new Error('Stock cannot be negative.');
          target.stock = stock;
        }
        target.updated_at = nowTimestamp();
        this.save();
        return { product: target };
      }

      case 'restock': {
        const qty = Number(payload.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error('Restock quantity must be a positive whole number.');
        }
        const target = this.state.products.find(
          (item) => item.product_id.toUpperCase() === String(payload.product_id).trim().toUpperCase(),
        );
        if (!target) throw new Error(`Product '${payload.product_id}' not found.`);
        target.stock += qty;
        target.updated_at = nowTimestamp();
        this.save();
        return { product: target };
      }

      case 'delete': {
        const pid = String(payload.product_id || '').trim().toUpperCase();
        const idx = this.state.products.findIndex((item) => item.product_id.toUpperCase() === pid);
        if (idx === -1) throw new Error(`Product '${pid}' not found.`);
        this.state.products.splice(idx, 1);
        this.save();
        return { deleted: pid };
      }

      case 'daily_report': {
        const dateStr = (payload.date || nowTimestamp().slice(0, 10)).trim();
        const txs = this.state.transactions.filter((tx) => tx.created_at.startsWith(dateStr));
        const gross_sales = txs.reduce((s, t) => s + t.subtotal, 0);
        const total_discounts = txs.reduce((s, t) => s + t.discount_amount, 0);
        const total_gst = txs.reduce((s, t) => s + t.gst_amount, 0);
        const net_revenue = txs.reduce((s, t) => s + t.final_amount, 0);
        return {
          report: {
            date: dateStr,
            transaction_count: txs.length,
            gross_sales: Number(gross_sales.toFixed(2)),
            total_discounts: Number(total_discounts.toFixed(2)),
            total_gst: Number(total_gst.toFixed(2)),
            net_revenue: Number(net_revenue.toFixed(2)),
          },
        };
      }

      case 'recent_transactions': {
        return { transactions: this.state.transactions.slice(0, 25) };
      }

      case 'list_promos': {
        return { promoCodes: this.state.promo_codes };
      }

      case 'toggle_promo': {
        const code = String(payload.promo?.code || '').trim().toUpperCase();
        const promo = this.state.promo_codes.find((p) => p.code.toUpperCase() === code);
        if (!promo) throw new Error(`Promo code '${code}' not found.`);
        promo.is_active = !promo.is_active;
        this.save();
        return { promoCodes: this.state.promo_codes };
      }

      case 'add_promo': {
        const code = String(payload.promo?.code || '').trim().toUpperCase();
        const pct = Number(payload.promo?.discount_percent);
        const desc = String(payload.promo?.description || '').trim() || `Flat ${pct}% discount`;
        if (!code || code.length < 3) throw new Error('Promo code must be at least 3 characters.');
        if (!Number.isFinite(pct) || pct <= 0 || pct > 90) {
          throw new Error('Discount percent must be between 1 and 90.');
        }
        if (this.state.promo_codes.some((p) => p.code === code)) {
          throw new Error(`Promo code '${code}' already exists.`);
        }
        this.state.promo_codes.push({
          code,
          discount_percent: pct,
          description: desc,
          is_active: true,
        });
        this.save();
        return { promoCodes: this.state.promo_codes };
      }

      default:
        throw new Error(`Unsupported admin operation: ${payload.op}`);
    }
  }
}

export const retailStore = new RetailStore();
