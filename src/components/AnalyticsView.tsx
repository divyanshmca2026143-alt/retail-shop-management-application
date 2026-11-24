import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { callRetailApi, formatINR } from '../api';
import type { AnalyticsData, PaymentMethod } from '../types';

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callRetailApi<AnalyticsData>({ action: 'analytics' });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">
        {error || 'No analytics data available.'}
      </div>
    );
  }

  const maxCategoryRevenue = Math.max(1, ...data.categorySales.map((row) => row.revenue));
  const methods: PaymentMethod[] = ['UPI', 'Card', 'Cash'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Sales Analytics & Inventory Health
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live store performance · Updated {data.summary.generated_at}
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white text-slate-700 rounded-md hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Daily Revenue</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {formatINR(data.summary.daily_revenue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Monthly Revenue</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {formatINR(data.summary.monthly_revenue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Transactions</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {data.summary.total_transactions.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums mt-1">
            Avg ticket {formatINR(data.summary.average_order_value)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Discounts Provided</div>
          <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {formatINR(data.summary.total_discounts)}
          </div>
        </div>
      </div>

      {/* Payment Breakdown Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {methods.map((method) => {
          const entry = data.paymentBreakdown[method] || { count: 0, amount: 0 };
          return (
            <div key={method} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">{method} Collections</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatINR(entry.amount)}
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500">
                {entry.count} bills
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category-Wise Sales */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">Category-Wise Sales</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Gross sales and units sold across all 5 store departments
          </p>

          <div className="space-y-4">
            {data.categorySales.map((cat) => {
              const pct = Math.round((cat.revenue / maxCategoryRevenue) * 100);
              return (
                <div key={cat.category_name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{cat.category_name}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {cat.units_sold} units · {formatINR(cat.revenue)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-slate-900 transition-all duration-300"
                      style={{ width: `${cat.revenue > 0 ? Math.max(4, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Best-Selling Products */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Best-Selling Products</h3>
            <p className="text-xs text-slate-500 mt-0.5">Ranked by cumulative units sold</p>
          </div>
          {data.bestSellers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Complete a checkout in POS & Checkout to populate best-seller rankings.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                  <th className="py-2 px-4">Product</th>
                  <th className="py-2 px-4 text-right">Units</th>
                  <th className="py-2 px-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.bestSellers.map((item) => (
                  <tr key={item.product_id}>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{item.product_name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {item.product_id} · {item.category_name}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {item.units_sold}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                      {formatINR(item.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Low-Stock Alerts */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Low-Stock Products (10 units or fewer)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Items needing restock in the Admin Panel
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-amber-700 font-medium">
            {data.lowStock.length} flagged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="py-2 px-4">Product ID</th>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">SKU</th>
                <th className="py-2 px-4 text-right">Available Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lowStock.map((prod) => (
                <tr key={prod.product_id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-600">
                    {prod.product_id}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{prod.name}</td>
                  <td className="py-2.5 px-4 text-xs text-slate-600">{prod.category}</td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{prod.sku}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-amber-700 tabular-nums">
                    {prod.stock} units
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
