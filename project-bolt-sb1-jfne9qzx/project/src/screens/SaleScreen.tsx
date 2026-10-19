import { useEffect, useMemo, useState } from 'react';
import {
  Search, X, Banknote, Smartphone, Wallet,
  Receipt, Pause, Loader2, ShoppingCart, AlertTriangle, Minus, Plus, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId, genDeviceEntityId } from '@/lib/device';
import { putSale, putStockMovement, pendingCount } from '@/lib/offline-db';
import { fcfa } from '@/lib/format';
import { haptic } from '@/lib/haptic';
import { useAuth } from '@/context/AuthContext';
import ReceiptModal from '@/components/ReceiptModal';
import type { Product, Category, MobileOperator, SaleItem, Sale, PaymentMethod } from '@/types/db';

interface CartItem extends SaleItem {
  product_id: string;
  maxStock: number;
}

const FORMAT_LABEL: Record<string, string> = {
  bouteille: 'Bouteille', canette: 'Canette', sachet: 'Sachet',
  verre: 'Verre', pack: 'Pack', casier: 'Casier', autre: 'Autre',
};

export default function SaleScreen({ onPendingChange }: { onPendingChange: (n: number) => void }) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [operators, setOperators] = useState<MobileOperator[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [receiptSale, setReceiptSale] = useState<(Sale & { sale_items?: { product_name: string; qty: number; unit_price: number; discount: number }[] }) | null>(null);

  useEffect(() => {
    (async () => {
      const [p, c, o] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('mobile_operators').select('*').eq('active', true).order('name'),
      ]);
      setProducts((p.data as Product[]) || []);
      setCategories((c.data as Category[]) || []);
      setOperators((o.data as MobileOperator[]) || []);
      setLoading(false);
      refreshPending();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPending() {
    onPendingChange(await pendingCount());
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCat !== 'all' && p.category_id !== activeCat) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, activeCat, search]);

  const total = useMemo(() => cart.reduce((s, it) => s + it.qty * it.unit_price - it.discount, 0), [cart]);

  function addToCart(p: Product) {
    if (p.stock <= 0) {
      haptic('error');
      setToast({ type: 'err', msg: `${p.name} est en rupture de stock` });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    haptic('light');
    setCart((prev) => {
      const existing = prev.find((it) => it.product_id === p.id);
      if (existing) {
        if (existing.qty >= p.stock) return prev;
        return prev.map((it) => it.product_id === p.id ? { ...it, qty: it.qty + 1 } : it);
      }
      return [...prev, { product_id: p.id, product_name: p.name, qty: 1, unit_price: p.sell_price, discount: 0, maxStock: p.stock }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.map((it) => {
      if (it.product_id !== id) return it;
      const next = it.qty + delta;
      if (next <= 0) return it;
      if (next > it.maxStock) return it;
      return { ...it, qty: next };
    }));
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((it) => it.product_id !== id));
  }

  async function finalizeSale(payment: PaymentMethod, cash: number, mobile: number, operatorId: string | null, mobileNumber: string, customerName: string, changeGiven: number) {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const deviceSaleId = genDeviceEntityId('sale');

      const sale: Sale = {
        device_id: deviceId,
        device_sale_id: deviceSaleId,
        total,
        payment_method: payment,
        cash_amount: cash,
        mobile_amount: mobile,
        operator_id: operatorId,
        mobile_number: mobileNumber,
        change_given: changeGiven,
        customer_name: customerName,
        status: 'paid',
        cancel_reason: '',
        created_at: now,
        items: cart.map(({ product_id, product_name, qty, unit_price, discount }) => ({
          product_id, product_name, qty, unit_price, discount,
        })),
      };
      await putSale(sale);

      // Stock movements (sale)
      for (const it of cart) {
        const mvmt = {
          device_id: deviceId,
          device_mvmt_id: genDeviceEntityId('stk'),
          product_id: it.product_id,
          type: 'sale' as const,
          quantity: -it.qty,
          reason: 'Vente',
          created_at: now,
        };
        await putStockMovement(mvmt);
      }

      // Decrement local stock
      setProducts((prev) => prev.map((p) => {
        const it = cart.find((c) => c.product_id === p.id);
        if (!it) return p;
        return { ...p, stock: Math.max(0, p.stock - it.qty) };
      }));

      setCart([]);
      setPayOpen(false);
      haptic('success');
      setToast({ type: 'ok', msg: `Vente enregistrée — ${fcfa(total)}` });
      setTimeout(() => setToast(null), 3000);
      setReceiptSale(sale);
      refreshPending();
    } catch (err) {
      haptic('error');
      setToast({ type: 'err', msg: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  async function holdSale() {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const sale: Sale = {
        device_id: getDeviceId(),
        device_sale_id: genDeviceEntityId('sale'),
        total,
        payment_method: 'cash',
        cash_amount: 0, mobile_amount: 0, operator_id: null, mobile_number: '',
        change_given: 0, customer_name: '',
        status: 'held',
        cancel_reason: '',
        created_at: now,
        items: cart.map(({ product_id, product_name, qty, unit_price, discount }) => ({
          product_id, product_name, qty, unit_price, discount,
        })),
      };
      await putSale(sale);
      setCart([]);
      setToast({ type: 'ok', msg: 'Vente mise en attente' });
      setTimeout(() => setToast(null), 2500);
      refreshPending();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-sky-100"
              placeholder="Rechercher une boisson..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {cart.length > 0 && (
            <button onClick={holdSale} disabled={saving} title="Mettre en attente"
              className="bg-amber-100 text-amber-700 p-2.5 rounded-xl hover:bg-amber-200 disabled:opacity-50">
              <Pause className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <CatChip active={activeCat === 'all'} onClick={() => setActiveCat('all')} label="Toutes" />
          {categories.map((c) => (
            <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} />
          ))}
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-12">Aucune boisson trouvée</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((p) => {
              const out = p.stock <= 0;
              const low = !out && p.stock <= p.alert_threshold;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={out}
                  className={`relative bg-white rounded-2xl p-3 text-left border transition active:scale-95 ${
                    out ? 'opacity-40 border-slate-200' : 'border-slate-200 hover:border-sky-400 hover:shadow-md'
                  }`}
                >
                  <div className="aspect-square rounded-xl bg-gradient-to-br from-sky-50 to-slate-100 flex items-center justify-center mb-2 overflow-hidden">
                    {p.icon ? (
                      <img src={p.icon} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-sky-200">{p.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 line-clamp-1">{p.name}</div>
                  <div className="text-xs text-slate-400">{FORMAT_LABEL[p.format]}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sky-700 font-bold text-sm">{fcfa(p.sell_price)}</span>
                    {low && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className={`text-xs mt-0.5 ${out ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                    Stock: {p.stock}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="bg-white border-t border-slate-200 px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">{cart.length} article(s) — <button onClick={() => setCart([])} className="text-red-500 text-xs">Vider</button></span>
            <span className="text-xl font-bold text-slate-800">{fcfa(total)}</span>
          </div>
          <div className="max-h-40 overflow-y-auto mb-2 divide-y divide-slate-100">
            {cart.map((it) => (
              <div key={it.product_id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-sm text-slate-700 line-clamp-1">{it.product_name}</span>
                <button onClick={() => changeQty(it.product_id, -1)} disabled={it.qty <= 1} aria-label="Diminuer"
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-6 text-center text-sm font-semibold">{it.qty}</span>
                <button onClick={() => changeQty(it.product_id, 1)} disabled={it.qty >= it.maxStock} aria-label="Augmenter"
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40">
                  <Plus className="w-4 h-4" />
                </button>
                <span className="w-20 text-right text-sm text-slate-600">{fcfa(it.qty * it.unit_price - it.discount)}</span>
                <button onClick={() => removeItem(it.product_id)} aria-label="Retirer"
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setPayOpen(true)}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2 text-base"
          >
            <Receipt className="w-5 h-5" /> Encaisser
          </button>
        </div>
      )}

      {/* Pay modal */}
      {payOpen && (
        <PayModal
          total={total}
          operators={operators}
          saving={saving}
          onClose={() => setPayOpen(false)}
          onConfirm={finalizeSale}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Receipt */}
      {receiptSale && (
        <ReceiptModal
          sale={receiptSale}
          operator={operators.find((o) => o.id === receiptSale.operator_id)}
          managerName={profile?.full_name || ''}
          onClose={() => setReceiptSale(null)}
        />
      )}
    </div>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition ${
        active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function PayModal({
  total, operators, saving, onClose, onConfirm,
}: {
  total: number;
  operators: MobileOperator[];
  saving: boolean;
  onClose: () => void;
  onConfirm: (p: PaymentMethod, cash: number, mobile: number, op: string | null, num: string, cust: string, change: number) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [mobileAmount, setMobileAmount] = useState('');
  const [cashPart, setCashPart] = useState('');
  const [operatorId, setOperatorId] = useState(operators[0]?.id || '');
  const [mobileNumber, setMobileNumber] = useState('');
  const [customerName, setCustomerName] = useState('');

  const cashNum = parseInt(cashReceived || '0', 10) || 0;
  const mobileNum = parseInt(mobileAmount || '0', 10) || 0;
  const cashPartNum = parseInt(cashPart || '0', 10) || 0;
  const change = method === 'cash' ? Math.max(0, cashNum - total) : method === 'mixed' ? Math.max(0, cashPartNum - (total - mobileNum)) : 0;

  function confirm() {
    if (method === 'cash') {
      if (cashNum < total) return;
      onConfirm('cash', cashNum, 0, null, '', customerName, change);
    } else if (method === 'mobile') {
      onConfirm('mobile', 0, total, operatorId || null, mobileNumber, customerName, 0);
    } else if (method === 'mixed') {
      if (mobileNum + cashPartNum < total) return;
      onConfirm('mixed', cashPartNum, mobileNum, operatorId || null, mobileNumber, customerName, change);
    } else {
      onConfirm('credit', 0, 0, null, '', customerName, 0);
    }
  }

  const valid = method === 'cash' ? cashNum >= total : method === 'mobile' ? !!operatorId : method === 'mixed' ? (mobileNum + cashPartNum >= total && !!operatorId) : !!customerName.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Encaisser la vente</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <span className="text-slate-500 text-sm">Total à payer</span>
            <div className="text-2xl font-bold text-sky-700">{fcfa(total)}</div>
          </div>

          {/* Method selector */}
          <div className="grid grid-cols-4 gap-2">
            <MethodBtn active={method === 'cash'} onClick={() => setMethod('cash')} icon={<Banknote className="w-5 h-5" />} label="Espèces" />
            <MethodBtn active={method === 'mobile'} onClick={() => setMethod('mobile')} icon={<Smartphone className="w-5 h-5" />} label="Mobile" />
            <MethodBtn active={method === 'mixed'} onClick={() => setMethod('mixed')} icon={<Wallet className="w-5 h-5" />} label="Mixte" />
            <MethodBtn active={method === 'credit'} onClick={() => setMethod('credit')} icon={<Receipt className="w-5 h-5" />} label="Crédit" />
          </div>

          {method === 'cash' && (
            <>
              <Field label="Montant reçu (espèces)">
                <input type="number" inputMode="numeric" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder={String(total)} className="pay-input" />
              </Field>
              {cashNum >= total && (
                <div className="bg-emerald-50 rounded-xl p-3 flex justify-between">
                  <span className="text-emerald-700 text-sm">Monnaie à rendre</span>
                  <span className="text-emerald-700 font-bold">{fcfa(change)}</span>
                </div>
              )}
            </>
          )}

          {method === 'mobile' && (
            <>
              <Field label="Opérateur Mobile Money">
                <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="pay-input">
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Numéro Mobile Money">
                <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="Ex: 01 ..." className="pay-input" />
              </Field>
            </>
          )}

          {method === 'mixed' && (
            <>
              <Field label="Opérateur Mobile Money">
                <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="pay-input">
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="Part Mobile Money">
                <input type="number" value={mobileAmount} onChange={(e) => setMobileAmount(e.target.value)} placeholder="0" className="pay-input" />
              </Field>
              <Field label="Part espèces">
                <input type="number" value={cashPart} onChange={(e) => setCashPart(e.target.value)} placeholder="0" className="pay-input" />
              </Field>
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between">
                <span className="text-slate-600 text-sm">Monnaie à rendre</span>
                <span className="font-bold text-slate-800">{fcfa(change)}</span>
              </div>
            </>
          )}

          {method === 'credit' && (
            <Field label="Nom du client (crédit)">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom du client" className="pay-input" />
            </Field>
          )}

          {(method === 'cash' || method === 'mobile' || method === 'mixed') && (
            <Field label="Client (optionnel)">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom du client" className="pay-input" />
            </Field>
          )}

          <button
            onClick={confirm}
            disabled={!valid || saving}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white btn-touch flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
            Valider la vente
          </button>
        </div>
      </div>
      <style>{`.pay-input{width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:12px;outline:none}.pay-input:focus{border-color:#0284c7;box-shadow:0 0 0 2px #e0f2fe}`}</style>
    </div>
  );
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition ${
        active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

