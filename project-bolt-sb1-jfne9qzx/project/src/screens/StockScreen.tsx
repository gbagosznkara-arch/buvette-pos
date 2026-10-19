import { useEffect, useState } from 'react';
import { Search, Plus, AlertTriangle, Loader2, Package, ArrowDownUp, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putStockMovement } from '@/lib/offline-db';
import { useToast } from '@/context/ToastContext';
import type { Product, StockMovement } from '@/types/db';

export default function StockScreen({ manager = false }: { manager?: boolean }) {
  const { show } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<{ product: Product; qty: number; reason: string; type: 'entry' | 'breakage' | 'correction' } | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts((data as Product[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
  });

  const alerts = products.filter((p) => p.stock <= p.alert_threshold || p.stock <= 0);

  async function saveEntry() {
    if (!entry) return;
    if (entry.qty <= 0) { show('err', 'Quantité invalide'); return; }
    const deviceId = getDeviceId();
    const now = new Date().toISOString();
    const signedQty = entry.type === 'entry' ? entry.qty : entry.type === 'breakage' ? -entry.qty : entry.qty;
    const mvmt: StockMovement = {
      device_id: deviceId,
      device_mvmt_id: genDeviceEntityId('stk'),
      product_id: entry.product.id,
      type: entry.type,
      quantity: signedQty,
      reason: entry.reason || (entry.type === 'entry' ? 'Approvisionnement' : entry.type === 'breakage' ? 'Casse' : 'Correction'),
      created_at: now,
    };
    await putStockMovement(mvmt);

    // Update product stock directly (owner is online)
    const newStock = Math.max(0, entry.product.stock + signedQty);
    const { error } = await supabase.from('products').update({ stock: newStock, updated_at: now }).eq('id', entry.product.id);
    if (error) { show('err', error.message); return; }

    show('ok', entry.type === 'entry' ? `Entrée de ${entry.qty} enregistrée` : entry.type === 'breakage' ? `${entry.qty} bouteille(s) signalée(s)` : 'Stock corrigé');
    setEntry(null);
    load();
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-sky-100"
            placeholder="Rechercher une boisson..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {alerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-amber-700 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {alerts.length} boisson(s) en alerte de stock
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune boisson.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const out = p.stock <= 0;
              const low = !out && p.stock <= p.alert_threshold;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.icon ? <img src={p.icon} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                    <div className={`text-sm font-medium ${out ? 'text-red-500' : low ? 'text-amber-600' : 'text-slate-600'}`}>
                      {p.stock} en stock
                    </div>
                    {low && <div className="text-xs text-amber-600">Seuil d'alerte: {p.alert_threshold}</div>}
                  </div>
                  {!manager && (
                    <button onClick={() => setEntry({ product: p, qty: 0, reason: '', type: 'entry' })} className="bg-sky-100 text-sky-700 p-2 rounded-lg hover:bg-sky-200">
                      <ArrowDownUp className="w-4 h-4" />
                    </button>
                  )}
                  {manager && (
                    <button onClick={() => setEntry({ product: p, qty: 0, reason: '', type: 'breakage' })} className="bg-amber-100 text-amber-700 p-2 rounded-lg hover:bg-amber-200" title="Signaler casse / erreur">
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {entry && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">
                {manager ? 'Signaler un problème' : entry.type === 'entry' ? 'Entrée de stock' : entry.type === 'breakage' ? 'Signaler casse' : 'Correction'}
              </h3>
              <button onClick={() => setEntry(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="font-semibold text-slate-800">{entry.product.name}</div>
                <div className="text-sm text-slate-500">Stock actuel: {entry.product.stock}</div>
              </div>

              {!manager && (
                <div className="flex gap-2">
                  <TypeBtn active={entry.type === 'entry'} onClick={() => setEntry({ ...entry, type: 'entry' })} label="Entrée (+)" color="emerald" />
                  <TypeBtn active={entry.type === 'breakage'} onClick={() => setEntry({ ...entry, type: 'breakage' })} label="Casse (-)" color="red" />
                  <TypeBtn active={entry.type === 'correction'} onClick={() => setEntry({ ...entry, type: 'correction' })} label="Correction" color="sky" />
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-600 mb-1">{entry.type === 'correction' ? 'Nouveau stock total' : 'Quantité'}</label>
                <input
                  type="number" inputMode="numeric"
                  value={entry.qty}
                  onChange={(e) => setEntry({ ...entry, qty: parseInt(e.target.value || '0', 10) || 0 })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Motif (optionnel)</label>
                <input
                  value={entry.reason}
                  onChange={(e) => setEntry({ ...entry, reason: e.target.value })}
                  placeholder="Ex: achat casier, bouteille cassée..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <button onClick={saveEntry} className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBtn({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: active ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700',
    red: active ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700',
    sky: active ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700',
  };
  return (
    <button onClick={onClick} className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${colors[color]}`}>
      {label}
    </button>
  );
}
