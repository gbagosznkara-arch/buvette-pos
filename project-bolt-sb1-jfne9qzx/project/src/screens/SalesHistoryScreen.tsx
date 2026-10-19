import { useEffect, useState } from 'react';
import { Loader2, Search, X, Ban, RotateCcw, Receipt as ReceiptIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putSale } from '@/lib/offline-db';
import { fcfa, formatDateTime } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Sale, Profile, MobileOperator } from '@/types/db';

export default function SalesHistoryScreen() {
  const { show } = useToast();
  const [sales, setSales] = useState<(Sale & { sale_items?: { product_name: string; qty: number; unit_price: number; discount: number }[] })[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [operators, setOperators] = useState<MobileOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    setLoading(true);
    const [s, m, o] = await Promise.all([
      supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('*'),
      supabase.from('mobile_operators').select('*'),
    ]);
    setSales((s.data as Sale[]) || []);
    setManagers((m.data as Profile[]) || []);
    setOperators((o.data as MobileOperator[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = sales.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const m = managers.find((p) => p.id === s.manager_id);
    return (m?.full_name || '').toLowerCase().includes(q) || s.customer_name.toLowerCase().includes(q) || s.device_sale_id.includes(q);
  });

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { show('err', 'Motif obligatoire'); return; }
    setCancelling(true);
    try {
      const updated = { ...cancelTarget, status: 'cancelled' as const, cancel_reason: cancelReason };
      // Update online
      const { error } = await supabase.from('sales').update({ status: 'cancelled', cancel_reason: cancelReason }).eq('id', cancelTarget.id);
      if (error) { show('err', error.message); return; }
      // Also store in offline db for consistency
      await putSale(updated);
      // Restore stock
      if (cancelTarget.sale_items) {
        for (const it of cancelTarget.sale_items) {
          if (it.product_id) {
            const { data: prod } = await supabase.from('products').select('stock').eq('id', it.product_id).maybeSingle();
            if (prod) {
              await supabase.from('products').update({ stock: (prod as { stock: number }).stock + it.qty }).eq('id', it.product_id);
            }
            const mvmt = {
              device_id: getDeviceId(),
              device_mvmt_id: genDeviceEntityId('stk'),
              product_id: it.product_id,
              type: 'correction' as const,
              quantity: it.qty,
              reason: `Annulation vente ${cancelTarget.device_sale_id.slice(-6)}`,
              created_at: new Date().toISOString(),
            };
            await supabase.from('stock_movements').insert(mvmt);
          }
        }
      }
      show('ok', 'Vente annulée, stock restitué');
      setCancelTarget(null);
      setCancelReason('');
      load();
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <h2 className="font-bold text-slate-800 mb-2">Historique des ventes</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-sky-100"
            placeholder="Rechercher par gérante, client, n°..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <ReceiptIcon className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune vente.
          </div>
        ) : (
          filtered.map((s) => {
            const m = managers.find((p) => p.id === s.manager_id);
            const op = operators.find((o) => o.id === s.operator_id);
            const cancelled = s.status === 'cancelled';
            return (
              <div key={s.id} className={`bg-white rounded-xl border p-3 ${cancelled ? 'border-red-200 opacity-60' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${cancelled ? 'text-red-500 line-through' : 'text-slate-800'}`}>{fcfa(s.total)}</span>
                      {cancelled && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Annulée</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatDateTime(s.created_at)} · {m?.full_name || '?'}
                    </div>
                    {s.customer_name && <div className="text-xs text-slate-500">Client: {s.customer_name}</div>}
                    {op && <div className="text-xs text-slate-500">{op.name}: {fcfa(s.mobile_amount)}</div>}
                    {cancelled && s.cancel_reason && <div className="text-xs text-red-500 mt-1">Motif: {s.cancel_reason}</div>}
                  </div>
                  {!cancelled && (
                    <button
                      onClick={() => setCancelTarget(s)}
                      className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 flex-shrink-0"
                      title="Annuler / rembourser"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {s.sale_items && s.sale_items.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    {s.sale_items.map((it, i) => (
                      <span key={i}>{i > 0 && ' · '}{it.qty}x {it.product_name}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-red-600 flex items-center gap-2"><RotateCcw className="w-5 h-5" /> Annuler la vente</h3>
              <button onClick={() => setCancelTarget(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="font-bold text-slate-800">{fcfa(cancelTarget.total)}</div>
                <div className="text-xs text-slate-400">{formatDateTime(cancelTarget.created_at)}</div>
                {cancelTarget.sale_items?.map((it, i) => (
                  <div key={i} className="text-sm text-slate-600">{it.qty}x {it.product_name}</div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Le stock sera automatiquement restitué. Cette action est irréversible.
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Motif de l'annulation *</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  placeholder="Ex: erreur de saisie, remboursement client..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <button onClick={confirmCancel} disabled={cancelling} className="w-full bg-red-600 hover:bg-red-700 text-white btn-touch flex items-center justify-center gap-2">
                {cancelling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ban className="w-5 h-5" />}
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
