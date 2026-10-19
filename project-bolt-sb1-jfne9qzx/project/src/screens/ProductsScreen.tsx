import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Search, Loader2, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fcfa } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import type { Product, Category, ProductFormat, ProductCost } from '@/types/db';

const FORMATS: ProductFormat[] = ['bouteille', 'canette', 'sachet', 'verre', 'pack', 'casier', 'autre'];
const FORMAT_LABEL: Record<string, string> = {
  bouteille: 'Bouteille', canette: 'Canette', sachet: 'Sachet',
  verre: 'Verre', pack: 'Pack', casier: 'Casier', autre: 'Autre',
};

const EMPTY: Product & { buy_price?: number } = {
  id: '', name: '', brand: '', category_id: null, format: 'bouteille',
  sell_price: 0, stock: 0, alert_threshold: 0, icon: '', active: true,
  allow_consignment: false, consignment_amount: 0,
  created_at: '', updated_at: '', buy_price: 0,
};

export default function ProductsScreen() {
  const { show } = useToast();
  const [products, setProducts] = useState<(Product & { buy_price?: number })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<(Product & { buy_price?: number }) | null>(null);

  async function load() {
    setLoading(true);
    const [p, c, costs] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('product_costs').select('*'),
    ]);
    const costMap = new Map<string, number>();
    (costs.data as ProductCost[] || []).forEach((c) => costMap.set(c.product_id, c.buy_price));
    setProducts((p.data as Product[] || []).map((prod) => ({ ...prod, buy_price: costMap.get(prod.id) ?? 0 })));
    setCategories(c.data as Category[] || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { show('err', 'Le nom est obligatoire'); return; }
    const { buy_price, id, created_at, updated_at, ...rest } = editing;
    if (id) {
      const { error } = await supabase.from('products').update(rest).eq('id', id);
      if (error) { show('err', error.message); return; }
      await supabase.from('product_costs').upsert({ product_id: id, buy_price: buy_price || 0 }, { onConflict: 'product_id' });
      show('ok', 'Boisson modifiée');
    } else {
      const { data, error } = await supabase.from('products').insert(rest).select().single();
      if (error) { show('err', error.message); return; }
      await supabase.from('product_costs').insert({ product_id: data.id, buy_price: buy_price || 0 });
      show('ok', 'Boisson ajoutée');
    }
    setEditing(null);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Supprimer "${p.name}" ? Cette action est définitive.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) { show('err', error.message); return; }
    show('ok', 'Boisson supprimée');
    load();
  }

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-sky-100"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center gap-2">
          <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Ajouter</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-40" />
            Aucune boisson. Cliquez sur « Ajouter » pour commencer.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.category_id);
              const out = p.stock <= 0;
              const low = !out && p.stock <= p.alert_threshold;
              const margin = p.sell_price - (p.buy_price || 0);
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.icon ? <img src={p.icon} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      {cat?.name || 'Sans catégorie'} · {FORMAT_LABEL[p.format]} {p.brand && `· ${p.brand}`}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-sky-700 font-bold">{fcfa(p.sell_price)}</span>
                      <span className="text-slate-400">Achat: {fcfa(p.buy_price || 0)}</span>
                      <span className={margin > 0 ? 'text-emerald-600' : 'text-red-500'}>Marge: {fcfa(margin)}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-medium ${out ? 'text-red-500' : low ? 'text-amber-600' : 'text-slate-700'}`}>
                      {p.stock} en stock
                    </div>
                    {!p.active && <div className="text-xs text-slate-400">Inactif</div>}
                    {p.allow_consignment && <div className="text-xs text-sky-600">Consigne: {fcfa(p.consignment_amount)}</div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setEditing({ ...p })} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(p)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <ProductModal product={editing} categories={categories} onClose={() => setEditing(null)} onChange={setEditing} onSave={save} />}
    </div>
  );
}

function ProductModal({
  product, categories, onClose, onChange, onSave,
}: {
  product: Product & { buy_price?: number };
  categories: Category[];
  onClose: () => void;
  onChange: (p: Product & { buy_price?: number }) => void;
  onSave: () => void;
}) {
  function set<K extends keyof Product & { buy_price?: number }>(key: K, val: (Product & { buy_price?: number })[K]) {
    onChange({ ...product, [key]: val });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{product.id ? 'Modifier la boisson' : 'Nouvelle boisson'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <FieldText label="Nom *" value={product.name} onChange={(v) => set('name', v)} />
          <div className="grid grid-cols-2 gap-3">
            <FieldText label="Marque" value={product.brand} onChange={(v) => set('brand', v)} />
            <div>
              <label className="block text-sm text-slate-600 mb-1">Catégorie</label>
              <select value={product.category_id || ''} onChange={(e) => set('category_id', e.target.value || null)} className="pm-input">
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Format</label>
              <select value={product.format} onChange={(e) => set('format', e.target.value as ProductFormat)} className="pm-input">
                {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
              </select>
            </div>
            <FieldText label="Icône (URL image)" value={product.icon} onChange={(v) => set('icon', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldNum label="Prix de vente (F)" value={product.sell_price} onChange={(v) => set('sell_price', v)} />
            <FieldNum label="Prix d'achat (F)" value={product.buy_price || 0} onChange={(v) => onChange({ ...product, buy_price: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldNum label="Stock initial" value={product.stock} onChange={(v) => set('stock', v)} />
            <FieldNum label="Seuil d'alerte" value={product.alert_threshold} onChange={(v) => set('alert_threshold', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
              <input type="checkbox" checked={product.active} onChange={(e) => set('active', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-slate-700">Boisson active</span>
            </label>
            <label className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
              <input type="checkbox" checked={product.allow_consignment} onChange={(e) => set('allow_consignment', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-slate-700">Consigne</span>
            </label>
          </div>
          {product.allow_consignment && (
            <FieldNum label="Montant consigne (F)" value={product.consignment_amount} onChange={(v) => set('consignment_amount', v)} />
          )}
          <button onClick={onSave} className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch">
            {product.id ? 'Enregistrer' : 'Ajouter la boisson'}
          </button>
        </div>
      </div>
      <style>{`.pm-input{width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:12px;outline:none}.pm-input:focus{border-color:#0284c7;box-shadow:0 0 0 2px #e0f2fe}`}</style>
    </div>
  );
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="pm-input" />
    </div>
  );
}

function FieldNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      <input type="number" inputMode="numeric" value={value} onChange={(e) => onChange(parseInt(e.target.value || '0', 10) || 0)} className="pm-input" />
    </div>
  );
}
