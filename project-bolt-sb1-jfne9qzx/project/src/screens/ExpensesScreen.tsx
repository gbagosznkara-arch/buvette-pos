import { useEffect, useState } from 'react';
import { Loader2, Plus, Wallet, Download, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putExpense, listExpenses } from '@/lib/offline-db';
import { fcfa, formatDateTime } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Expense } from '@/types/db';

export default function ExpensesScreen() {
  const { show } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', reason: '', category: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString();
    const [online, offline] = await Promise.all([
      supabase.from('expenses').select('*').gte('created_at', iso).order('created_at', { ascending: false }),
      listExpenses(),
    ]);
    const onlineExp = (online.data as Expense[]) || [];
    const offlineExp = offline.filter((e) => e.created_at >= iso);
    const seen = new Set<string>();
    const merged = [...offlineExp, ...onlineExp].filter((e) => {
      const key = e.device_id + ':' + e.device_expense_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setExpenses(merged);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    const amount = parseInt(form.amount || '0', 10) || 0;
    if (amount <= 0) { show('err', 'Montant invalide'); return; }
    if (!form.reason.trim()) { show('err', 'Motif obligatoire'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const expense: Expense = {
        device_id: getDeviceId(),
        device_expense_id: genDeviceEntityId('exp'),
        amount,
        reason: form.reason,
        category: form.category,
        created_at: now,
      };
      await putExpense(expense);
      show('ok', 'Dépense enregistrée');
      setForm({ amount: '', reason: '', category: '' });
      setAdding(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function exportCsv() {
    const rows = [['Date', 'Montant', 'Motif', 'Catégorie']];
    expenses.forEach((e) => rows.push([formatDateTime(e.created_at), String(e.amount), e.reason, e.category]));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-2">
        <div className="flex-1">
          <h2 className="font-bold text-slate-800">Dépenses du jour</h2>
          <p className="text-sm text-slate-500">Total: {fcfa(total)}</p>
        </div>
        <button onClick={exportCsv} className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm">
          <Download className="w-4 h-4" /> CSV
        </button>
        <button onClick={() => setAdding(true)} className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm font-medium">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {expenses.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <Wallet className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune dépense aujourd'hui.
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => (
              <div key={e.device_id + e.device_expense_id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{e.reason}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(e.created_at)}{e.category && ` · ${e.category}`}</div>
                </div>
                <div className="font-bold text-amber-700">{fcfa(e.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Nouvelle dépense</h3>
              <button onClick={() => setAdding(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Montant (F)</label>
                <input type="number" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Motif *</label>
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex: achat de glace, transport..." className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Catégorie (optionnel)</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
                  <option value="">—</option>
                  <option value="Achat stock">Achat stock</option>
                  <option value="Transport">Transport</option>
                  <option value="Électricité">Électricité</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <button onClick={save} disabled={saving} className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
