import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp, Receipt, Banknote, Smartphone, Wallet, Download, Package, AlertTriangle, Users, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fcfa, formatDateTime } from '@/lib/format';
import type { Sale, Product, ProductCost, Profile, MobileOperator } from '@/types/db';

type Period = 'today' | 'week' | 'month' | 'all';

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>('today');
  const [sales, setSales] = useState<(Sale & { manager_name?: string })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [operators, setOperators] = useState<MobileOperator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [s, p, c, m, o] = await Promise.all([
        supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false }),
        supabase.from('products').select('*'),
        supabase.from('product_costs').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('mobile_operators').select('*'),
      ]);
      setSales((s.data as Sale[]) || []);
      setProducts((p.data as Product[]) || []);
      setCosts((c.data as ProductCost[]) || []);
      setManagers((m.data as Profile[]) || []);
      setOperators((o.data as MobileOperator[]) || []);
      setLoading(false);
    })();
  }, []);

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === 'today') { now.setHours(0, 0, 0, 0); return now.toISOString(); }
    if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); }
    if (period === 'month') { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    return '2000-01-01';
  }, [period]);

  const filtered = useMemo(() => {
    return sales.filter((s) => s.created_at >= periodStart && s.status === 'paid');
  }, [sales, periodStart]);

  const costMap = useMemo(() => new Map(costs.map((c) => [c.product_id, c.buy_price])), [costs]);

  const stats = useMemo(() => {
    const totalCA = filtered.reduce((s, x) => s + x.total, 0);
    const cashTotal = filtered.reduce((s, x) => s + x.cash_amount, 0);
    const mobileTotal = filtered.reduce((s, x) => s + x.mobile_amount, 0);
    let grossProfit = 0;
    const productQty: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
    filtered.forEach((sale) => {
      (sale as Sale & { sale_items?: { product_id: string; product_name: string; qty: number; unit_price: number }[] }).sale_items?.forEach((it) => {
        const buy = it.product_id ? (costMap.get(it.product_id) || 0) : 0;
        const profit = (it.unit_price - buy) * it.qty;
        grossProfit += profit;
        if (!productQty[it.product_id || it.product_name]) {
          productQty[it.product_id || it.product_name] = { name: it.product_name, qty: 0, revenue: 0, profit: 0 };
        }
        productQty[it.product_id || it.product_name].qty += it.qty;
        productQty[it.product_id || it.product_name].revenue += it.unit_price * it.qty;
        productQty[it.product_id || it.product_name].profit += profit;
      });
    });
    const topByQty = Object.values(productQty).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topByProfit = Object.values(productQty).sort((a, b) => b.profit - a.profit).slice(0, 5);

    const byManager: Record<string, { name: string; count: number; total: number }> = {};
    filtered.forEach((s) => {
      const m = managers.find((p) => p.id === s.manager_id);
      const key = s.manager_id || 'unknown';
      if (!byManager[key]) byManager[key] = { name: m?.full_name || 'Inconnu', count: 0, total: 0 };
      byManager[key].count++;
      byManager[key].total += s.total;
    });

    const byHour: number[] = new Array(24).fill(0);
    filtered.forEach((s) => { byHour[new Date(s.created_at).getHours()] += s.total; });

    const operatorBreakdown: Record<string, { name: string; total: number }> = {};
    filtered.forEach((s) => {
      if (s.operator_id) {
        const op = operators.find((o) => o.id === s.operator_id);
        const key = s.operator_id;
        if (!operatorBreakdown[key]) operatorBreakdown[key] = { name: op?.name || 'Inconnu', total: 0 };
        operatorBreakdown[key].total += s.mobile_amount;
      }
    });

    return { totalCA, cashTotal, mobileTotal, grossProfit, topByQty, topByProfit, byManager, byHour, operatorBreakdown, count: filtered.length };
  }, [filtered, costMap, managers, operators]);

  const lowStock = products.filter((p) => p.stock <= p.alert_threshold);
  const outStock = products.filter((p) => p.stock <= 0);

  function exportCsv() {
    const rows = [['Date', 'Total', 'Méthode', 'Espèces', 'Mobile', 'Client', 'Statut']];
    filtered.forEach((s) => {
      rows.push([formatDateTime(s.created_at), String(s.total), s.payment_method, String(s.cash_amount), String(s.mobile_amount), s.customer_name, s.status]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  const peakHour = stats.byHour.reduce((max, v, i) => (v > stats.byHour[max] ? i : max), 0);

  return (
    <div className="h-full overflow-y-auto">
      {/* Period selector */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['today', 'week', 'month', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium ${
                period === p ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {p === 'today' ? "Aujourd'hui" : p === 'week' ? '7 jours' : p === 'month' ? '30 jours' : 'Tout'}
            </button>
          ))}
          <button onClick={exportCsv} className="ml-auto whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-2">
          <KpiCard label="Chiffre d'affaires" value={fcfa(stats.totalCA)} icon={<Receipt className="w-5 h-5" />} color="sky" />
          <KpiCard label="Bénéfice brut" value={fcfa(stats.grossProfit)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" />
          <KpiCard label="Espèces" value={fcfa(stats.cashTotal)} icon={<Banknote className="w-5 h-5" />} color="amber" />
          <KpiCard label="Mobile Money" value={fcfa(stats.mobileTotal)} icon={<Smartphone className="w-5 h-5" />} color="violet" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">{stats.count} vente(s) sur la période</div>
          {/* Payment split bar */}
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mt-2">
            {stats.totalCA > 0 && (
              <>
                <div className="bg-amber-400" style={{ width: `${(stats.cashTotal / stats.totalCA) * 100}%` }} />
                <div className="bg-violet-500" style={{ width: `${(stats.mobileTotal / stats.totalCA) * 100}%` }} />
              </>
            )}
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-amber-700">Espèces {stats.totalCA > 0 ? Math.round((stats.cashTotal / stats.totalCA) * 100) : 0}%</span>
            <span className="text-violet-700">Mobile {stats.totalCA > 0 ? Math.round((stats.mobileTotal / stats.totalCA) * 100) : 0}%</span>
          </div>
        </div>

        {/* Mobile operators breakdown */}
        {Object.keys(stats.operatorBreakdown).length > 0 && (
          <Section title="Mobile Money par opérateur" icon={<Wallet className="w-4 h-4" />}>
            {Object.values(stats.operatorBreakdown).map((o) => (
              <div key={o.name} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{o.name}</span>
                <span className="text-sm font-semibold text-slate-800">{fcfa(o.total)}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Top products */}
        <Section title="Boissons les plus vendues" icon={<Package className="w-4 h-4" />}>
          {stats.topByQty.length === 0 ? <Empty /> : stats.topByQty.map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-700 truncate">{p.name}</span>
              <span className="text-sm font-medium text-slate-600">{p.qty} vendus</span>
              <span className="text-sm font-bold text-sky-700">{fcfa(p.revenue)}</span>
            </div>
          ))}
        </Section>

        <Section title="Boissons les plus rentables" icon={<TrendingUp className="w-4 h-4" />}>
          {stats.topByProfit.length === 0 ? <Empty /> : stats.topByProfit.map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-700 truncate">{p.name}</span>
              <span className="text-sm font-bold text-emerald-700">{fcfa(p.profit)}</span>
            </div>
          ))}
        </Section>

        {/* Sales by manager */}
        {Object.keys(stats.byManager).length > 0 && (
          <Section title="Ventes par gérante" icon={<Users className="w-4 h-4" />}>
            {Object.values(stats.byManager).map((m) => (
              <div key={m.name} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{m.name}</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-800">{fcfa(m.total)}</div>
                  <div className="text-xs text-slate-400">{m.count} vente(s)</div>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Sales by hour */}
        <Section title="Ventes par heure" icon={<Clock className="w-4 h-4" />}>
          <div className="flex items-end gap-1 h-24 mt-1">
            {stats.byHour.map((v, h) => (
              <div key={h} className="flex-1 flex flex-col items-center justify-end group">
                <div
                  className={`w-full rounded-t ${v > 0 ? 'bg-sky-400' : 'bg-slate-100'} ${h === peakHour ? 'bg-sky-600' : ''}`}
                  style={{ height: `${stats.byHour[peakHour] > 0 ? (v / stats.byHour[peakHour]) * 100 : 2}%`, minHeight: '2px' }}
                  title={`${h}h: ${fcfa(v)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">Pic à {peakHour}h</div>
        </Section>

        {/* Stock alerts */}
        {(outStock.length > 0 || lowStock.length > 0) && (
          <Section title="Alertes de stock" icon={<AlertTriangle className="w-4 h-4" />}>
            {outStock.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                <span className="text-xs text-red-500 font-medium">Rupture</span>
              </div>
            ))}
            {lowStock.filter((p) => p.stock > 0).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                <span className="text-xs text-amber-600 font-medium">{p.stock} restant</span>
              </div>
            ))}
          </Section>
        )}

        {/* Recent sales */}
        <Section title="Historique des ventes" icon={<Receipt className="w-4 h-4" />}>
          {filtered.slice(0, 30).map((s) => {
            const m = managers.find((p) => p.id === s.manager_id);
            const icon = s.payment_method === 'cash' ? <Banknote className="w-3.5 h-3.5" /> : s.payment_method === 'mobile' ? <Smartphone className="w-3.5 h-3.5" /> : s.payment_method === 'mixed' ? <Wallet className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />;
            return (
              <div key={s.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                {icon}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{fcfa(s.total)}</div>
                  <div className="text-xs text-slate-400 truncate">{formatDateTime(s.created_at)}{m && ` · ${m.full_name}`}</div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <Empty />}
        </Section>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    sky: 'from-sky-500 to-sky-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    violet: 'from-violet-500 to-violet-600',
  };
  return (
    <div className={`rounded-2xl p-4 bg-gradient-to-br ${colors[color]} text-white shadow-sm`}>
      <div className="flex items-center gap-2 opacity-90">{icon}<span className="text-xs">{label}</span></div>
      <div className="font-bold text-lg mt-1">{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-2">{icon}{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-center text-slate-400 text-sm py-4">Aucune donnée</div>;
}
