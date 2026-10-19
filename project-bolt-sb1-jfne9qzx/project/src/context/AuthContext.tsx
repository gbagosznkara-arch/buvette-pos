import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/db';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
  });

  async function loadProfile(uid: string): Promise<Profile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    return data as Profile | null;
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (session) {
        (async () => {
          const profile = await loadProfile(session.user.id);
          if (!mounted) return;
          setState({ session, profile, loading: false });
        })();
      } else {
        setState({ session: null, profile: null, loading: false });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) {
          const profile = await loadProfile(session.user.id);
          if (!mounted) return;
          setState({ session, profile, loading: false });
        } else {
          setState({ session: null, profile: null, loading: false });
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ session: null, profile: null, loading: false });
  };

  const refreshProfile = async () => {
    // Get the session fresh from supabase — don't rely on state.session
    // which may be stale (closure captures old value during signup flow).
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;

    // Retry a few times — the profile row is created by a DB trigger
    // that may run slightly after the auth session is established.
    let profile: Profile | null = null;
    for (let i = 0; i < 5; i++) {
      profile = await loadProfile(session.user.id);
      if (profile) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    setState({ session, profile, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
