import { useEffect, useState } from 'react';
import { Loader2, PackageOpen, PackageCheck, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putConsignment, listPendingConsignments } from '@/lib/offline-db';
import { fcfa, formatDateTime } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Product, Consignment } from '@/types/db';

export default function ConsignmentsScreen() {
  const { show } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Consignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ product: Product; direction: 'out' | 'in'; qty: number } | null>(null);

  async function load() {
    setLoading(true);
    const [p, m] = await Promise.all([
      supabase.from('products').select('*').eq('allow_consignment', true).order('name'),
      supabase.from('consignments').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setProducts((p.data as Product[]) || []);
    setMovements((m.data as Consignment[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Compute balance per product: out - in
  const balances: Record<string, number> = {};
  movements.forEach((m) => {
    const key = m.product_id;
    balances[key] = (balances[key] || 0) + (m.direction === 'out' ? m.quantity : -m.quantity);
  });

  async function save() {
    if (!modal) return;
    if (modal.qty <= 0) { show('err', 'Quantité invalide'); return; }
    if (modal.direction === 'in' && (balances[modal.product.id] || 0) < modal.qty) {
      show('err', 'Plus de consignes à restituer que sorties');
      return;
    }
    const now = new Date().toISOString();
    const c: Consignment = {
      device_id: getDeviceId(),
      device_consignment_id: genDeviceEntityId('csn'),
      product_id: modal.product.id,
      direction: modal.direction,
      quantity: modal.qty,
      amount: modal.product.consignment_amount * modal.qty,
      created_at: now,
    };
    await putConsignment(c);
    // If online, push directly
    if (navigator.onLine) {
      await supabase.from('consignments').upsert(c, { onConflict: 'device_id,device_consignment_id' });
    }
    show('ok', modal.direction === 'out' ? `${modal.qty} consigne(s) sortie(s)` : `${modal.qty} consigne(s) restituée(s)`);
    setModal(null);
    load();
  }

  function exportCsv() {
    const rows = [['Date', 'Produit', 'Sens', 'Quantité', 'Montant']];
    movements.forEach((m) => {
      const p = products.find((x) => x.id === m.product_id);
      rows.push([formatDateTime(m.created_at), p?.name || '', m.direction, String(m.quantity), String(m.amount)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consignes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Consignes</h2>
        <button onClick={exportCsv} className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {products.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <PackageOpen className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune boisson avec consigne. Le propriétaire doit activer la consigne sur une boisson.
          </div>
        ) : (
          products.map((p) => {
            const bal = balances[p.id] || 0;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">Consigne: {fcfa(p.consignment_amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${bal > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{bal}</div>
                    <div className="text-xs text-slate-400">en circulation</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setModal({ product: p, direction: 'out', qty: 1 })} className="flex-1 bg-amber-50 text-amber-700 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
                    <PackageOpen className="w-4 h-4" /> Sortir consigne
                  </button>
                  <button onClick={() => setModal({ product: p, direction: 'in', qty: 1 })} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
                    <PackageCheck className="w-4 h-4" /> Restituer
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Recent movements */}
        {movements.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-3 mt-2">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Mouvements récents</h3>
            {movements.slice(0, 15).map((m) => {
              const p = products.find((x) => x.id === m.product_id);
              return (
                <div key={m.device_id + m.device_consignment_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    {m.direction === 'out' ? <PackageOpen className="w-4 h-4 text-amber-500" /> : <PackageCheck className="w-4 h-4 text-emerald-500" />}
                    <div>
                      <div className="text-sm text-slate-700">{p?.name || '?'}</div>
                      <div className="text-xs text-slate-400">{formatDateTime(m.created_at)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${m.direction === 'out' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {m.direction === 'out' ? '+' : '-'}{m.quantity}
                    </div>
                    <div className="text-xs text-slate-400">{fcfa(m.amount)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="font-bold text-slate-800">
                {modal.direction === 'out' ? 'Sortir consigne' : 'Restituer consigne'}
              </h3>
              <p className="text-xs text-slate-400">{modal.product.name} — {fcfa(modal.product.consignment_amount)}/unité</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Quantité</label>
                <input
                  type="number" inputMode="numeric" value={modal.qty}
                  onChange={(e) => setModal({ ...modal, qty: parseInt(e.target.value || '0', 10) || 0 })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between">
                <span className="text-sm text-slate-600">Montant total</span>
                <span className="font-bold text-slate-800">{fcfa(modal.product.consignment_amount * modal.qty)}</span>
              </div>
              <button onClick={save} className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
