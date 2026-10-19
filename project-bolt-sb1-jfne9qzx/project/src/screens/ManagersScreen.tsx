import { useEffect, useState } from 'react';
import { Loader2, UserPlus, UserX, UserCheck, Phone, Shield, KeyRound, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/types/db';

interface ManagerCode {
  id: string;
  code: string;
  profile_id: string;
  device_id: string | null;
  active: boolean;
  created_at: string;
}

export default function ManagersScreen() {
  const { show } = useToast();
  const { profile: me } = useAuth();
  const [managers, setManagers] = useState<Profile[]>([]);
  const [codes, setCodes] = useState<ManagerCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    const { data: p } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    const { data: c } = await supabase.from('manager_codes').select('*').order('created_at', { ascending: false });
    setManagers((p as Profile[]) || []);
    setCodes((c as ManagerCode[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(p: Profile) {
    if (p.id === me?.id) { show('err', 'Vous ne pouvez pas vous désactiver'); return; }
    const { error } = await supabase.from('profiles').update({ active: !p.active }).eq('id', p.id);
    if (error) { show('err', error.message); return; }
    show('ok', p.active ? 'Gérante désactivée' : 'Gérante activée');
    load();
  }

  async function toggleCodeActive(c: ManagerCode) {
    const { error } = await supabase.from('manager_codes').update({ active: !c.active }).eq('id', c.id);
    if (error) { show('err', error.message); return; }
    show('ok', c.active ? 'Code désactivé' : 'Code réactivé');
    load();
  }

  async function resetDevice(c: ManagerCode) {
    const { error } = await supabase.from('manager_codes').update({ device_id: null }).eq('id', c.id);
    if (error) { show('err', error.message); return; }
    show('ok', 'Appareil libéré — le code peut être utilisé sur un nouveau téléphone');
    load();
  }

  async function createManager() {
    if (!form.full_name.trim()) { show('err', 'Le nom est requis'); return; }
    setSaving(true);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-manager`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ full_name: form.full_name, phone: form.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }
      setNewCode(data.code);
      setForm({ full_name: '', phone: '' });
      setAdding(false);
      load();
    } catch (err) {
      show('err', err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function copyCode(c: string) {
    navigator.clipboard.writeText(c);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;
  }

  const owners = managers.filter((m) => m.role === 'owner');
  const gms = managers.filter((m) => m.role === 'manager');

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <button
        onClick={() => setAdding(true)}
        className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2"
      >
        <UserPlus className="w-5 h-5" /> Créer un code gérante
      </button>

      {/* Owners */}
      {owners.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-sky-600" /> Propriétaire
          </h3>
          <div className="space-y-2">
            {owners.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  {(p.full_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{p.full_name || 'Sans nom'}</div>
                  <div className="text-xs text-slate-400">Propriétaire · depuis {formatDate(p.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manager codes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-sky-600" /> Codes gérantes ({codes.length})
        </h3>
        {codes.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-6">
            Aucun code pour le moment. Créez un code pour qu'une gérante puisse se connecter.
          </div>
        ) : (
          <div className="space-y-2">
            {codes.map((c) => {
              const mgr = gms.find((m) => m.id === c.profile_id);
              return (
                <div key={c.id} className="py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {(mgr?.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{mgr?.full_name || 'Sans nom'}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        {mgr?.phone && <><Phone className="w-3 h-3" /> <span className="truncate">{mgr.phone}</span></>}
                      </div>
                    </div>
                    <button
                      onClick={() => copyCode(c.code)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 flex items-center gap-1.5"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {c.code}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 ml-13">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {c.active ? 'Actif' : 'Désactivé'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {c.device_id ? 'Lié à un appareil' : 'Pas encore utilisé'}
                    </span>
                    {c.active && (
                      <button onClick={() => toggleCodeActive(c)} className="text-xs text-red-500 hover:text-red-700 ml-auto">
                        Désactiver
                      </button>
                    )}
                    {!c.active && (
                      <button onClick={() => toggleCodeActive(c)} className="text-xs text-emerald-600 hover:text-emerald-700 ml-auto">
                        Réactiver
                      </button>
                    )}
                    {c.device_id && (
                      <button onClick={() => resetDevice(c)} className="text-xs text-amber-600 hover:text-amber-700">
                        Libérer l'appareil
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="font-bold text-slate-800">Créer un code gérante</h3>
              <p className="text-xs text-slate-400 mt-0.5">Un code à 6 chiffres sera généré. La gérante l'utilisera pour se connecter sur son téléphone.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Nom complet</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="Ex: Marie" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Téléphone (optionnel)</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+229 ..." className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setAdding(false)} className="flex-1 bg-slate-100 text-slate-700 btn-touch">Annuler</button>
                <button onClick={createManager} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />} Créer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New code display */}
      {newCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-1">Code créé !</h3>
            <p className="text-sm text-slate-500 mb-4">Donne ce code à la gérante. Elle l'utilisera pour se connecter sur son téléphone. Le code ne fonctionnera que sur un seul appareil.</p>
            <div className="bg-sky-50 rounded-2xl py-4 mb-4">
              <div className="text-4xl font-bold tracking-[0.3em] text-sky-700 font-mono">{newCode}</div>
            </div>
            <button
              onClick={() => { copyCode(newCode); }}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white btn-touch flex items-center justify-center gap-2 mb-2"
            >
              {copied ? <><Check className="w-5 h-5" /> Copié !</> : <><Copy className="w-5 h-5" /> Copier le code</>}
            </button>
            <button onClick={() => setNewCode(null)} className="w-full text-slate-500 py-2 text-sm">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
