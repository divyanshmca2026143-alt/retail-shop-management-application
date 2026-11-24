import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, Search, X } from 'lucide-react';
import { callRetailApi, formatINR } from '../api';
import type { Invoice } from '../types';

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selected, setSelected] = useState<Invoice | null>(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callRetailApi<{ invoices: Invoice[] }>({
        action: 'invoices',
        query,
      });
      setInvoices(res.invoices);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invoices & Order History</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Search bills by reference ID, customer name, or mobile number
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search INV-..., customer, phone..."
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Bill Reference</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Payment</th>
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4 text-right">Discount</th>
                <th className="py-2.5 px-4 text-right">Final Amount</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="py-3 px-4">
                      <div className="h-4 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center text-slate-500">
                    No matching invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.bill_ref} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">
                      {inv.bill_ref}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{inv.customer_name}</div>
                      {inv.customer_phone && (
                        <div className="text-xs font-mono text-slate-400">
                          {inv.customer_phone}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{inv.payment_method}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">
                      {inv.created_at}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700">
                      {formatINR(inv.discount_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-sm tabular-nums font-semibold text-slate-900">
                      {formatINR(inv.final_amount)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <a
                          href={`/api/invoices/${inv.bill_ref}/pdf`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-mono text-sm font-semibold text-slate-900">
                {selected.bill_ref}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
                <span>
                  Customer: <strong className="text-slate-900">{selected.customer_name}</strong>
                </span>
                <span>
                  Payment: <strong className="text-slate-900">{selected.payment_method}</strong>
                </span>
                <span className="font-mono">{selected.created_at}</span>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.items.map((line) => (
                    <tr key={line.product_id}>
                      <td className="py-2">{line.product_name}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{line.quantity}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatINR(line.unit_price)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatINR(line.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pt-3 border-t border-slate-200 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatINR(selected.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    - {formatINR(selected.discount_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST (18%)</span>
                  <span className="font-mono tabular-nums">{formatINR(selected.gst_amount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold text-slate-900">
                  <span>Final Total</span>
                  <span className="font-mono tabular-nums">{formatINR(selected.final_amount)}</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <a
                href={`/api/invoices/${selected.bill_ref}/pdf`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </a>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
