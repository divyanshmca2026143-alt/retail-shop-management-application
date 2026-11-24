import { useCallback, useEffect, useState } from 'react';
import { BarChart3, FileText, ShieldCheck, Store } from 'lucide-react';
import { callRetailApi, formatINR } from './api';
import { AdminView } from './components/AdminView';
import { AnalyticsView } from './components/AnalyticsView';
import { InvoicesView } from './components/InvoicesView';
import { PosView } from './components/PosView';
import type { OverviewData } from './types';

type ActiveTab = 'pos' | 'invoices' | 'analytics' | 'admin';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof Store }> = [
  { id: 'pos', label: 'POS & Checkout', icon: Store },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
  { id: 'admin', label: 'Admin Panel', icon: ShieldCheck },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [overview, setOverview] = useState<OverviewData | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await callRetailApi<OverviewData>({ action: 'overview' });
      setOverview(data);
    } catch {
      // Handled inside individual views
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const currentNav = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar (240px on desktop) */}
      <aside className="w-full lg:w-60 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="h-14 px-5 border-b border-slate-200 flex items-center">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Retail Management
            </span>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {overview && (
          <div className="hidden lg:block p-4 border-t border-slate-200 space-y-2 text-xs text-slate-500">
            <div className="font-medium text-slate-800">Store Snapshot</div>
            <div className="flex justify-between">
              <span>Active Products</span>
              <span className="font-mono tabular-nums text-slate-900">
                {overview.totalProducts.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Low Stock Alerts</span>
              <span className="font-mono tabular-nums text-amber-700">
                {overview.lowStockCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Revenue</span>
              <span className="font-mono tabular-nums text-slate-900">
                {formatINR(overview.salesSummary.total_revenue)}
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Store</span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-slate-900 whitespace-nowrap">
              {currentNav.label}
            </span>
          </div>

          {overview && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
              <span>{overview.totalProducts.toLocaleString('en-IN')} products</span>
              <span aria-hidden="true">·</span>
              <span>5 categories</span>
              <span aria-hidden="true">·</span>
              <span>18% GST</span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
          {activeTab === 'pos' && (
            <PosView promoCodes={overview?.promoCodes ?? []} onOrderCompleted={loadOverview} />
          )}
          {activeTab === 'invoices' && <InvoicesView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'admin' && <AdminView onInventoryChanged={loadOverview} />}
        </main>
      </div>
    </div>
  );
}
