import { useState, type FormEvent } from 'react';
import { Loader2, LogIn, Shield, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getDeviceId } from '@/lib/device';

export default function AuthScreen() {
  const { refreshProfile } = useAuth();
  const [tab, setTab] = useState<'owner' | 'manager'>('owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'owner') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refreshProfile();
      } else {
        // Manager code login — call the edge function
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manager-login`;
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ code, device_id: getDeviceId() }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Code invalide');
        }
        // Set the session from the server response
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw sessionError;
        await refreshProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-700 via-sky-800 to-slate-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-sky-600 flex items-center justify-center mb-3 shadow-lg">
            <LogIn className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Buvette Pro</h1>
          <p className="text-sm text-slate-500 mt-1">Connexion</p>
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 mb-5">
          <button
            type="button"
            onClick={() => { setTab('owner'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5 ${
              tab === 'owner' ? 'bg-white shadow text-sky-700' : 'text-slate-500'
            }`}
          >
            <Shield className="w-4 h-4" /> Propriétaire
          </button>
          <button
            type="button"
            onClick={() => { setTab('manager'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5 ${
              tab === 'manager' ? 'bg-white shadow text-sky-700' : 'text-slate-500'
            }`}
          >
            <KeyRound className="w-4 h-4" /> Gérante
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === 'owner' ? (
            <>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          ) : (
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="w-full border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 text-center text-2xl tracking-[0.5em] font-bold"
              placeholder="• • • • • •"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white btn-touch flex items-center justify-center gap-2 py-3.5 text-base font-bold"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {tab === 'owner' ? 'Se connecter' : 'Entrer'}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5 leading-relaxed">
          {tab === 'owner'
            ? "Le propriétaire se connecte avec son e-mail et son mot de passe."
            : "La gérante entre son code à 6 chiffres. Le code ne fonctionne que sur un seul téléphone."}
        </p>
      </div>
    </div>
  );
}
