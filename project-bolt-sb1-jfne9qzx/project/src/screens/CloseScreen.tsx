import { useEffect, useState } from 'react';
import { Loader2, Lock, Check, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putCashSession, listSales } from '@/lib/offline-db';
import { fcfa } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Sale, CashSession, MobileOperator } from '@/types/db';

export default function CloseScreen() {
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [operators, setOperators] = useState<MobileOperator[]>([]);
  const [expenses, setExpenses] = useState<{ amount: number; reason: string }[]>([]);
  const [countedCash, setCountedCash] = useState('');
  const [comment, setComment] = useState('');
  const [closing, setClosing] = useState(false);

  async function load() {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();

    const [online, offline, ops, exp] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', iso),
      listSales(),
      supabase.from('mobile_operators').select('*'),
      supabase.from('expenses').select('*').gte('created_at', iso),
    ]);
    const onlineSales = (online.data as Sale[]) || [];
    const offlineSales = offline.filter((s) => s.created_at >= iso);

    // Merge, dedupe
    const seen = new Set<string>();
    const merged = [...offlineSales, ...onlineSales].filter((s) => {
      const key = s.device_id + ':' + s.device_sale_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return s.status === 'paid';
    });
    setSales(merged);
    setOperators((ops.data as MobileOperator[]) || []);
    setExpenses(((exp.data as { amount: number; reason: string }[]) || []));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const totalCash = sales.reduce((s, x) => s + x.cash_amount, 0);
  const totalMobile = sales.reduce((s, x) => s + x.mobile_amount, 0);
  const salesCount = sales.length;
  const discounts = sales.reduce((s, x) => s + 0, 0); // placeholder for future discount tracking
  const refunds = 0;
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const operatorBreakdown: Record<string, number> = {};
  sales.forEach((s) => {
    if (s.operator_id) {
      const op = operators.find((o) => o.id === s.operator_id);
      const name = op?.name || 'Inconnu';
      operatorBreakdown[name] = (operatorBreakdown[name] || 0) + s.mobile_amount;
    }
  });

  const expectedCash = totalCash - expensesTotal;
  const countedNum = parseInt(countedCash || '0', 10) || 0;
  const difference = countedNum - expectedCash;

  async function closeSession() {
    setClosing(true);
    try {
      const now = new Date().toISOString();
      const session: CashSession = {
        device_id: getDeviceId(),
        device_session_id: genDeviceEntityId('csh'),
        total_sales: totalSales,
        total_cash: totalCash,
        total_mobile: totalMobile,
        operator_breakdown: operatorBreakdown,
        sales_count: salesCount,
        discounts,
        refunds,
        expenses_total: expensesTotal,
        expected_cash: expectedCash,
        counted_cash: countedNum,
        cash_difference: difference,
        consignment_out: 0,
        consignment_in: 0,
        comment,
        status: 'closed',
        created_at: now,
      };
      await putCashSession(session);
      show('ok', 'Clôture de caisse enregistrée. Synchronisez pour l\'envoyer au propriétaire.');
      setCountedCash('');
      setComment('');
    } catch (err) {
      show('err', err instanceof Error ? err.message : 'Erreur');
    } finally {
      setClosing(false);
    }
  }

  function exportCsv() {
    const lines = [
      ['CLÔTURE DE CAISSE', new Date().toLocaleDateString('fr-FR')],
      ['Total ventes', String(totalSales)],
      ['Espèces', String(totalCash)],
      ['Mobile Money', String(totalMobile)],
      ['Nombre de ventes', String(salesCount)],
      ['Dépenses', String(expensesTotal)],
      ['Espèces théoriques', String(expectedCash)],
      ['Espèces comptées', String(countedNum)],
      ['Écart', String(difference)],
      ...Object.entries(operatorBreakdown).map(([k, v]) => [k, String(v)]),
    ];
    const csv = lines.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloture_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h2 className="font-bold text-slate-800">Clôture de caisse</h2>
        <p className="text-xs text-slate-400">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <Row label="Total des ventes" value={fcfa(totalSales)} bold />
        <Row label="Total espèces" value={fcfa(totalCash)} />
        <Row label="Total Mobile Money" value={fcfa(totalMobile)} />
        {Object.entries(operatorBreakdown).map(([name, amt]) => (
          <Row key={name} label={`  ${name}`} value={fcfa(amt)} small />
        ))}
        <Row label="Nombre de ventes" value={String(salesCount)} />
        <Row label="Dépenses" value={fcfa(expensesTotal)} />
        <div className="border-t border-slate-100 pt-2">
          <Row label="Espèces théoriques en caisse" value={fcfa(expectedCash)} bold />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Espèces comptées réellement</label>
          <input
            type="number" inputMode="numeric"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>
        {countedCash && (
          <div className={`rounded-xl p-3 flex items-center justify-between ${difference === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <span className={`text-sm flex items-center gap-2 ${difference === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {difference === 0 ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {difference === 0 ? 'Caisse juste' : 'Écart de caisse'}
            </span>
            <span className={`font-bold ${difference === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {difference >= 0 ? '+' : ''}{fcfa(difference)}
            </span>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-600 mb-1">Commentaire (optionnel)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Remarques sur la journée..."
            className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={exportCsv} className="flex-1 bg-slate-100 text-slate-700 btn-touch flex items-center justify-center gap-2">
          <Download className="w-5 h-5" /> Export CSV
        </button>
        <button onClick={closeSession} disabled={closing} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2">
          {closing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />} Clôturer
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold, small }: { label: string; value: string; bold?: boolean; small?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={`${small ? 'text-xs' : 'text-sm'} text-slate-600 ${bold ? 'font-semibold text-slate-800' : ''}`}>{label}</span>
      <span className={`${small ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold text-sky-700' : 'font-medium text-slate-700'}`}>{value}</span>
    </div>
  );
}
