import { useCallback, useEffect, useState } from 'react';
import {
  Barcode,
  Download,
  Minus,
  PackagePlus,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { callRetailApi, formatINR } from '../api';
import {
  CATEGORIES,
  type CartEntry,
  type CategoryName,
  type CheckoutPreview,
  type Invoice,
  type PaymentMethod,
  type Product,
  type PromoCodeInfo,
} from '../types';

interface PosViewProps {
  promoCodes: PromoCodeInfo[];
  onOrderCompleted: () => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Card', 'Cash'];

export function PosView({ promoCodes, onOrderCompleted }: PosViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [quickCode, setQuickCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [promoCode, setPromoCode] = useState<string>('');
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);

  // Add Product to Catalog modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newProductId, setNewProductId] = useState<string>('');
  const [newProductName, setNewProductName] = useState<string>('');
  const [newProductCategory, setNewProductCategory] = useState<CategoryName>('Electronics');
  const [newProductPrice, setNewProductPrice] = useState<string>('');
  const [newProductStock, setNewProductStock] = useState<string>('25');
  const [newProductSku, setNewProductSku] = useState<string>('');
  const [addingProduct, setAddingProduct] = useState<boolean>(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<Product | null>(null);

  const limit = 20;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRetailApi<{ products: Product[]; total: number }>({
        action: 'products',
        query,
        category,
        page,
        limit,
      });
      setProducts(data.products);
      setTotalProducts(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inventory');
    } finally {
      setLoading(false);
    }
  }, [query, category, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const refreshPreview = useCallback(async (items: CartEntry[], code: string) => {
    if (items.length === 0) {
      setPreview(null);
      setCheckoutError(null);
      return;
    }
    try {
      setCheckoutError(null);
      const data = await callRetailApi<CheckoutPreview>({
        action: 'preview_checkout',
        items: items.map((entry) => ({
          product_id: entry.product.product_id,
          quantity: entry.quantity,
        })),
        promo_code: code.trim() || null,
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setCheckoutError(err instanceof Error ? err.message : 'Discount validation failed');
    }
  }, []);

  useEffect(() => {
    refreshPreview(cart, promoCode);
  }, [cart, promoCode, refreshPreview]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      setCheckoutError(`'${product.name}' is currently out of stock.`);
      return;
    }
    setCheckoutError(null);
    setCart((prev) => {
      const existing = prev.find((e) => e.product.product_id === product.product_id);
      if (existing) {
        if (existing.quantity + 1 > product.stock) {
          setCheckoutError(
            `Insufficient stock for '${product.name}': only ${product.stock} available.`,
          );
          return prev;
        }
        return prev.map((e) =>
          e.product.product_id === product.product_id
            ? { ...e, quantity: e.quantity + 1 }
            : e,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleQuickScanAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    setCheckoutError(null);
    try {
      const res = await callRetailApi<{ product: Product }>({
        action: 'quick_find',
        code: quickCode.trim(),
      });
      addToCart(res.product);
      setQuickCode('');
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Product code not found');
    }
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((e) => e.product.product_id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((e) => {
        if (e.product.product_id !== productId) return e;
        if (nextQty > e.product.stock) {
          setCheckoutError(
            `Maximum available stock for '${e.product.name}' is ${e.product.stock}.`,
          );
          return e;
        }
        setCheckoutError(null);
        return { ...e, quantity: nextQty };
      }),
    );
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  const openAddProductModal = async () => {
    const initialCat: CategoryName =
      category !== 'All' && CATEGORIES.includes(category as CategoryName)
        ? (category as CategoryName)
        : 'Electronics';
    setNewProductCategory(initialCat);
    setNewProductName('');
    setNewProductPrice('');
    setNewProductStock('25');
    setAddProductError(null);
    setShowAddModal(true);

    try {
      const suggestion = await callRetailApi<{ product_id: string; sku: string }>({
        action: 'suggest_product_ids',
        category: initialCat,
      });
      setNewProductId(suggestion.product_id);
      setNewProductSku(suggestion.sku);
    } catch {
      // User can still type manually if suggestion fails
    }
  };

  const handleAddCategoryChange = async (nextCategory: CategoryName) => {
    setNewProductCategory(nextCategory);
    try {
      const suggestion = await callRetailApi<{ product_id: string; sku: string }>({
        action: 'suggest_product_ids',
        category: nextCategory,
      });
      setNewProductSku(suggestion.sku);
    } catch {
      // Ignore suggestion fetch failure
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingProduct(true);
    setAddProductError(null);
    try {
      const res = await callRetailApi<{ product: Product }>({
        action: 'add_product',
        product: {
          product_id: newProductId.trim(),
          name: newProductName.trim(),
          category: newProductCategory,
          price: Number(newProductPrice),
          stock: Number(newProductStock),
          sku: newProductSku.trim(),
        },
      });
      setRecentlyAdded(res.product);
      setShowAddModal(false);
      setPage(1);
      setQuery('');
      setSearchInput('');
      await loadProducts();
      onOrderCompleted();
    } catch (err) {
      setAddProductError(err instanceof Error ? err.message : 'Unable to add product');
    } finally {
      setAddingProduct(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const result = await callRetailApi<{ invoice: Invoice }>({
        action: 'checkout',
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim(),
        payment_method: paymentMethod,
        promo_code: promoCode.trim() || null,
        items: cart.map((entry) => ({
          product_id: entry.product.product_id,
          quantity: entry.quantity,
        })),
      });
      setCompletedInvoice(result.invoice);
      setCart([]);
      setPromoCode('');
      setCustomerName('');
      setCustomerPhone('');
      await loadProducts();
      onOrderCompleted();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
  const rawSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left 8 cols: Product Catalog & Quick Barcode/SKU Entry */}
      <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Store Catalog</h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Showing {products.length} of {totalProducts.toLocaleString('en-IN')} items
                {category !== 'All' ? ` · ${category}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search name, ID, or SKU..."
                    className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md w-56 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Search
                </button>
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setQuery('');
                      setPage(1);
                    }}
                    className="px-2.5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Clear
                  </button>
                )}
              </form>

              <button
                type="button"
                onClick={openAddProductModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-900 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Add Product
              </button>
            </div>
          </div>

          {recentlyAdded && (
            <div className="px-3.5 py-2.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md flex flex-wrap items-center justify-between gap-2">
              <span>
                Added <strong>{recentlyAdded.name}</strong> ({recentlyAdded.product_id}) at{' '}
                <span className="font-mono">{formatINR(recentlyAdded.price)}</span> to the catalog.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addToCart(recentlyAdded)}
                  className="px-2.5 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  onClick={() => setRecentlyAdded(null)}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
              {['All', ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    category === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickScanAdd} className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <Barcode className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={quickCode}
                  onChange={(e) => setQuickCode(e.target.value)}
                  placeholder="Quick add ID/SKU (PRD-0001)"
                  className="pl-8 pr-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <button
                type="submit"
                className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Quick Add
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Product Name</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Stock</th>
                <th className="py-2.5 px-4 text-right">Price</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={6} className="py-3 px-4">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-slate-500">
                    No products matched your filter. Try clearing the search term.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const lowStock = product.stock <= 10;
                  return (
                    <tr
                      key={product.product_id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {product.product_id}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{product.sku}</div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {product.category}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap ${
                          product.stock === 0
                            ? 'text-red-600 font-semibold'
                            : lowStock
                              ? 'text-amber-600 font-medium'
                              : 'text-slate-700'
                        }`}
                      >
                        {product.stock === 0 ? 'Out of stock' : `${product.stock} units`}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {formatINR(product.price)}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={product.stock === 0}
                          onClick={() => addToCart(product)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Right 4 cols: Billing Cart */}
      <div className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-slate-700" />
            <h2 className="text-base font-semibold text-slate-900">Billing Counter</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 tabular-nums">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} items
            </span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Select items or scan an ID/SKU to start billing.
              <div className="text-xs text-slate-400 mt-1">
                Orders over ₹1,000 get an automatic 5% discount when no promo code is used.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
              {cart.map((entry) => (
                <div
                  key={entry.product.product_id}
                  className="py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {entry.product.name}
                    </div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      {entry.product.product_id} · {formatINR(entry.product.price)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center border border-slate-200 rounded-md">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => updateCartQty(entry.product.product_id, entry.quantity - 1)}
                        className="p-1.5 text-slate-600 hover:bg-slate-50"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-xs font-mono tabular-nums">
                        {entry.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => updateCartQty(entry.product.product_id, entry.quantity + 1)}
                        className="p-1.5 text-slate-600 hover:bg-slate-50"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => updateCartQty(entry.product.product_id, 0)}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-1.5 text-xs font-medium rounded transition-colors ${
                      paymentMethod === method
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Promo Code (One discount per order)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="SAVE10, SAVE20, WELCOME5"
                  className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                {promoCode && (
                  <button
                    type="button"
                    onClick={() => setPromoCode('')}
                    className="px-2.5 py-2 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-slate-500">
                {promoCodes.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPromoCode(p.code)}
                    className="underline decoration-slate-300 hover:text-slate-900 font-mono"
                  >
                    {p.code} ({p.discount_percent}%)
                  </button>
                ))}
              </div>
            </div>
          </div>

          {checkoutError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {checkoutError}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">
                {formatINR(preview ? preview.subtotal : rawSubtotal)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>
                {preview?.discount.discount_amount ? preview.discount.description : 'Discount'}
              </span>
              <span className="font-mono tabular-nums text-emerald-700">
                - {formatINR(preview ? preview.discount.discount_amount : 0)}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST ({preview ? `${(preview.gst_rate * 100).toFixed(0)}%` : '18%'})</span>
              <span className="font-mono tabular-nums">
                {formatINR(preview ? preview.gst_amount : 0)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-semibold text-slate-900">
              <span>Final Payable</span>
              <span className="font-mono tabular-nums">
                {formatINR(preview ? preview.final_amount : 0)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || submitting || Boolean(checkoutError)}
            onClick={handleCheckout}
            className="w-full py-2.5 px-4 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {submitting ? 'Processing Bill...' : 'Complete Checkout & Generate Invoice'}
          </button>
        </div>
      </div>

      {/* Generated Invoice Modal */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  Tax Invoice Generated
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">Bill Ref:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {completedInvoice.bill_ref}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Customer:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {completedInvoice.customer_name}
                    {completedInvoice.customer_phone ? ` (${completedInvoice.customer_phone})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Paid via:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {completedInvoice.payment_method}
                  </span>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedInvoice.items.map((line) => (
                    <tr key={line.product_id}>
                      <td className="py-2">
                        <div className="font-medium text-slate-900">{line.product_name}</div>
                        <div className="text-xs font-mono text-slate-400">{line.product_id}</div>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{line.quantity}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatINR(line.unit_price)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums font-medium">
                        {formatINR(line.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatINR(completedInvoice.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    Discount{' '}
                    {completedInvoice.promo_code
                      ? `(${completedInvoice.promo_code} ${completedInvoice.discount_percent}%)`
                      : completedInvoice.discount_amount > 0
                        ? `(Auto ${completedInvoice.discount_percent}%)`
                        : ''}
                  </span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    - {formatINR(completedInvoice.discount_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST ({(completedInvoice.gst_rate * 100).toFixed(0)}%)</span>
                  <span className="font-mono tabular-nums">
                    {formatINR(completedInvoice.gst_amount)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-semibold text-slate-900">
                  <span>Final Payable Amount</span>
                  <span className="font-mono tabular-nums">
                    {formatINR(completedInvoice.final_amount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <a
                href={`/api/invoices/${completedInvoice.bill_ref}/pdf`}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF Invoice
              </a>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add New Product to Catalog Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-slate-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  Add Item to Store Catalog
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => handleAddCategoryChange(e.target.value as CategoryName)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product ID
                  </label>
                  <input
                    type="text"
                    required
                    value={newProductId}
                    onChange={(e) => setNewProductId(e.target.value.toUpperCase())}
                    placeholder="PRD-1001"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="499.00"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={newProductStock}
                    onChange={(e) => setNewProductStock(e.target.value)}
                    placeholder="25"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    required
                    value={newProductSku}
                    onChange={(e) => setNewProductSku(e.target.value.toUpperCase())}
                    placeholder="SKU-ELEC-0201"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              {addProductError && (
                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  {addProductError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingProduct}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-40"
                >
                  {addingProduct ? 'Saving...' : 'Save to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
