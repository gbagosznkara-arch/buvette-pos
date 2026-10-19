import { useEffect, useState } from 'react';
import { Loader2, Receipt, Banknote, Smartphone, Wallet, Clock, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { listSales } from '@/lib/offline-db';
import { fcfa, formatTime } from '@/lib/format';
import type { Sale } from '@/types/db';

export default function TodayScreen() {
  const [onlineSales, setOnlineSales] = useState<Sale[]>([]);
  const [offlineSales, setOfflineSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();

    const [online, offline] = await Promise.all([
      supabase.from('sales').select('*, sale_items(*)').gte('created_at', iso).order('created_at', { ascending: false }),
      listSales(),
    ]);
    setOnlineSales((online.data as Sale[]) || []);
    const todayOff = (offline || []).filter((s) => s.created_at >= iso && s.status !== 'cancelled');
    setOfflineSales(todayOff);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Merge: prefer offline (more recent) for today's view
  const seenIds = new Set<string>();
  const all = [...offlineSales, ...onlineSales].filter((s) => {
    const key = s.device_id + ':' + s.device_sale_id;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return s.status !== 'cancelled' && s.status !== 'held';
  });

  const total = all.reduce((s, x) => s + x.total, 0);
  const cashTotal = all.reduce((s, x) => s + x.cash_amount, 0);
  const mobileTotal = all.reduce((s, x) => s + x.mobile_amount, 0);
  const count = all.length;
  const pendingCount = offlineSales.filter((s) => !s.synced_at).length;

  function exportCsv() {
    const rows = [['Date', 'Total', 'Méthode', 'Espèces', 'Mobile', 'Client', 'Statut']];
    all.forEach((s) => {
      rows.push([
        s.created_at,
        String(s.total),
        s.payment_method,
        String(s.cash_amount),
        String(s.mobile_amount),
        s.customer_name,
        s.status,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <h2 className="font-bold text-slate-800">Ventes du jour</h2>
        <p className="text-xs text-slate-400">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatCard label="Total" value={fcfa(total)} icon={<Receipt className="w-4 h-4" />} color="sky" />
          <StatCard label="Espèces" value={fcfa(cashTotal)} icon={<Banknote className="w-4 h-4" />} color="emerald" />
          <StatCard label="Mobile" value={fcfa(mobileTotal)} icon={<Smartphone className="w-4 h-4" />} color="violet" />
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-slate-500">{count} vente(s)</span>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{pendingCount} en attente</span>
            )}
            <button onClick={exportCsv} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-slate-200">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {all.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <Receipt className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune vente aujourd'hui.
          </div>
        ) : (
          <div className="space-y-2">
            {all.map((s) => {
              const sync = !s.synced_at;
              const icon = s.payment_method === 'cash' ? <Banknote className="w-4 h-4" /> : s.payment_method === 'mobile' ? <Smartphone className="w-4 h-4" /> : s.payment_method === 'mixed' ? <Wallet className="w-4 h-4" /> : <Receipt className="w-4 h-4" />;
              const label = s.payment_method === 'cash' ? 'Espèces' : s.payment_method === 'mobile' ? 'Mobile' : s.payment_method === 'mixed' ? 'Mixte' : 'Crédit';
              return (
                <div key={s.device_id + s.device_sale_id} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">{icon}</div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{fcfa(s.total)}</div>
                        <div className="text-xs text-slate-400">{label}{s.customer_name && ` · ${s.customer_name}`}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(s.created_at)}</div>
                      {sync && <div className="text-xs text-amber-600 mt-0.5">Non synchronisée</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className={`rounded-xl p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-80">{icon}{label}</div>
      <div className="font-bold text-sm mt-1">{value}</div>
    </div>
  );
}
