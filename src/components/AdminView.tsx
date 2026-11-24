import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Lock,
  LogOut,
  PackagePlus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { callRetailApi, formatINR } from '../api';
import { CATEGORIES, type CategoryName, type Invoice, type Product, type PromoCodeInfo } from '../types';

interface AdminViewProps {
  onInventoryChanged: () => void;
}

interface DailyReport {
  date: string;
  transaction_count: number;
  gross_sales: number;
  total_discounts: number;
  total_gst: number;
  net_revenue: number;
}

export function AdminView({ onInventoryChanged }: AdminViewProps) {
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Invoice[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [promoCodes, setPromoCodes] = useState<PromoCodeInfo[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add Product Form State
  const [newId, setNewId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<CategoryName>('Electronics');
  const [newPrice, setNewPrice] = useState<string>('');
  const [newStock, setNewStock] = useState<string>('');
  const [newSku, setNewSku] = useState<string>('');

  // Add Promo Form State
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [promoPctInput, setPromoPctInput] = useState<string>('');
  const [promoDescInput, setPromoDescInput] = useState<string>('');

  // Inline restock / price edit
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [editPrice, setEditPrice] = useState<Record<string, string>>({});

  const loadAdminWorkspace = useCallback(async () => {
    if (!authenticated) return;
    try {
      const [prodRes, txRes, repRes, promoRes] = await Promise.all([
        callRetailApi<{ products: Product[] }>({
          action: 'products',
          query: searchQuery,
          lowStockOnly,
          page: 1,
          limit: 25,
        }),
        callRetailApi<{ transactions: Invoice[] }>({
          action: 'admin_action',
          username,
          password,
          op: 'recent_transactions',
        }),
        callRetailApi<{ report: DailyReport }>({
          action: 'admin_action',
          username,
          password,
          op: 'daily_report',
        }),
        callRetailApi<{ promoCodes: PromoCodeInfo[] }>({
          action: 'admin_action',
          username,
          password,
          op: 'list_promos',
        }),
      ]);
      setProducts(prodRes.products);
      setTransactions(txRes.transactions);
      setDailyReport(repRes.report);
      setPromoCodes(promoRes.promoCodes);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }, [authenticated, searchQuery, lowStockOnly, username, password]);

  useEffect(() => {
    loadAdminWorkspace();
  }, [loadAdminWorkspace]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      await callRetailApi({
        action: 'admin_login',
        username,
        password,
      });
      setAuthenticated(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await callRetailApi<{ product: Product }>({
        action: 'admin_action',
        username,
        password,
        op: 'add',
        product: {
          product_id: newId,
          name: newName,
          category: newCategory,
          price: Number(newPrice),
          stock: Number(newStock),
          sku: newSku,
        },
      });
      setStatusMessage(`Added ${res.product.product_id} (${res.product.name}).`);
      setNewId('');
      setNewName('');
      setNewPrice('');
      setNewStock('');
      setNewSku('');
      await loadAdminWorkspace();
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add product');
    }
  };

  const handleRestock = async (productId: string, overrideQty?: number) => {
    const qty = overrideQty ?? Number(restockQty[productId] || 10);
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await callRetailApi<{ product: Product }>({
        action: 'admin_action',
        username,
        password,
        op: 'restock',
        product_id: productId,
        quantity: qty,
      });
      setStatusMessage(`Restocked ${res.product.product_id} to ${res.product.stock} units.`);
      setRestockQty((prev) => ({ ...prev, [productId]: '' }));
      await loadAdminWorkspace();
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Restock failed');
    }
  };

  const handlePriceUpdate = async (product: Product) => {
    const raw = editPrice[product.product_id];
    if (!raw) return;
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await callRetailApi<{ product: Product }>({
        action: 'admin_action',
        username,
        password,
        op: 'update',
        product: {
          product_id: product.product_id,
          price: Number(raw),
        },
      });
      setStatusMessage(`Updated ${res.product.product_id} price to ${formatINR(res.product.price)}.`);
      setEditPrice((prev) => ({ ...prev, [product.product_id]: '' }));
      await loadAdminWorkspace();
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Price update failed');
    }
  };

  const handleDelete = async (productId: string) => {
    setActionError(null);
    setStatusMessage(null);
    try {
      await callRetailApi({
        action: 'admin_action',
        username,
        password,
        op: 'delete',
        product_id: productId,
      });
      setStatusMessage(`Deleted product ${productId}.`);
      await loadAdminWorkspace();
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleTogglePromo = async (code: string) => {
    setActionError(null);
    try {
      const res = await callRetailApi<{ promoCodes: PromoCodeInfo[] }>({
        action: 'admin_action',
        username,
        password,
        op: 'toggle_promo',
        promo: { code },
      });
      setPromoCodes(res.promoCodes);
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle promo code');
    }
  };

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setStatusMessage(null);
    try {
      const res = await callRetailApi<{ promoCodes: PromoCodeInfo[] }>({
        action: 'admin_action',
        username,
        password,
        op: 'add_promo',
        promo: {
          code: promoCodeInput,
          discount_percent: Number(promoPctInput),
          description: promoDescInput,
        },
      });
      setPromoCodes(res.promoCodes);
      setStatusMessage(`Added promo code ${promoCodeInput.toUpperCase()}.`);
      setPromoCodeInput('');
      setPromoPctInput('');
      setPromoDescInput('');
      onInventoryChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create promo code');
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-slate-700" />
          <h2 className="text-base font-semibold text-slate-900">Store Manager Login</h2>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          Sign in to manage inventory, promo codes, and daily sales. Default credentials:{' '}
          <span className="font-mono text-slate-800">admin</span> /{' '}
          <span className="font-mono text-slate-800">Admin@123</span>
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter manager password"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {authError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-2 px-4 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors"
          >
            {authLoading ? 'Verifying...' : 'Sign In to Admin Panel'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Admin Control Panel</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Signed in as <span className="font-mono text-slate-800">{username}</span> · Manage
            catalog, restock low inventory, and configure promo codes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAdminWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthenticated(false);
              setPassword('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {statusMessage}
        </div>
      )}
      {actionError && (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
          {actionError}
        </div>
      )}

      {/* Daily Sales Summary */}
      {dailyReport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Today&apos;s Date</div>
            <div className="text-lg font-semibold font-mono text-slate-900 mt-1">
              {dailyReport.date}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Daily Transactions</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {dailyReport.transaction_count}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Daily Discounts</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {formatINR(dailyReport.total_discounts)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-500">Daily Net Revenue (incl. GST)</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {formatINR(dailyReport.net_revenue)}
            </div>
          </div>
        </div>
      )}

      {/* Add New Product & Promo Code Management */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleAddProduct}
          className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Add New Product</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="ID (e.g. PRD-1001)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
            />
            <input
              type="text"
              required
              placeholder="Product Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-md sm:col-span-2"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as CategoryName)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              placeholder="Price (₹)"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
            />
            <input
              type="number"
              required
              min="0"
              placeholder="Stock"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              required
              placeholder="Unique SKU (e.g. SKU-ELEC-1001)"
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-md w-64"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Save Product
            </button>
          </div>
        </form>

        {/* Promo Codes Manager */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Promo Codes</h3>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {promoCodes.map((promo) => (
              <div key={promo.code} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold text-slate-900">{promo.code}</span>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span className="font-mono text-slate-700">{promo.discount_percent}% off</span>
                  <div className="text-slate-400">{promo.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePromo(promo.code)}
                  className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                    promo.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {promo.is_active ? 'Active' : 'Paused'}
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddPromo} className="pt-3 border-t border-slate-200 grid grid-cols-3 gap-2">
            <input
              type="text"
              required
              placeholder="Code (FESTIVE15)"
              value={promoCodeInput}
              onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
              className="px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-200 rounded"
            />
            <input
              type="number"
              required
              min="1"
              max="90"
              placeholder="% Off"
              value={promoPctInput}
              onChange={(e) => setPromoPctInput(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
            >
              Add Code
            </button>
            <input
              type="text"
              placeholder="Short description (optional)"
              value={promoDescInput}
              onChange={(e) => setPromoDescInput(e.target.value)}
              className="col-span-3 px-2.5 py-1.5 text-xs border border-slate-200 rounded"
            />
          </form>
        </div>
      </div>

      {/* Inventory Administration Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Inventory Management</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Update prices, quick-restock low items, or delete products
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              Low stock only (&le; 10)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by ID, name, or SKU..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-60"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="py-2 px-4">ID</th>
                <th className="py-2 px-4">Product</th>
                <th className="py-2 px-4 text-right">Stock</th>
                <th className="py-2 px-4 text-right">Price</th>
                <th className="py-2 px-4">Restock</th>
                <th className="py-2 px-4">Update Price</th>
                <th className="py-2 px-4 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.product_id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{p.product_id}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.category}</div>
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono text-xs tabular-nums ${
                      p.stock <= 10 ? 'text-amber-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    {p.stock}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-medium">
                    {formatINR(p.price)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRestock(p.product_id, 25)}
                        className="px-2 py-1 text-xs font-mono border border-slate-200 rounded hover:bg-slate-900 hover:text-white transition-colors"
                      >
                        +25
                      </button>
                      <input
                        type="number"
                        min="1"
                        placeholder="+qty"
                        value={restockQty[p.product_id] ?? ''}
                        onChange={(e) =>
                          setRestockQty((prev) => ({
                            ...prev,
                            [p.product_id]: e.target.value,
                          }))
                        }
                        className="w-16 px-2 py-1 text-xs font-mono border border-slate-200 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => handleRestock(p.product_id)}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-900 hover:text-white transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder={String(p.price)}
                        value={editPrice[p.product_id] ?? ''}
                        onChange={(e) =>
                          setEditPrice((prev) => ({
                            ...prev,
                            [p.product_id]: e.target.value,
                          }))
                        }
                        className="w-20 px-2 py-1 text-xs font-mono border border-slate-200 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => handlePriceUpdate(p)}
                        className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-900 hover:text-white transition-colors"
                      >
                        Set
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(p.product_id)}
                      aria-label={`Delete ${p.product_id}`}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Recent Customer Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No transactions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                  <th className="py-2 px-4">Bill Ref</th>
                  <th className="py-2 px-4">Customer</th>
                  <th className="py-2 px-4">Payment</th>
                  <th className="py-2 px-4">Timestamp</th>
                  <th className="py-2 px-4 text-right">Discount</th>
                  <th className="py-2 px-4 text-right">Final Amount</th>
                  <th className="py-2 px-4 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.bill_ref}>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-900 font-medium">
                      {tx.bill_ref}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{tx.customer_name}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{tx.payment_method}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">
                      {tx.created_at}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700">
                      {formatINR(tx.discount_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-semibold">
                      {formatINR(tx.final_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <a
                        href={`/api/invoices/${tx.bill_ref}/pdf`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 underline decoration-slate-300"
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
