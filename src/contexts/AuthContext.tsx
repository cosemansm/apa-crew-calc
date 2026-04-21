import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { detectSignupCountry } from '@/lib/detectSignupCountry';
import { getEngineForCountry } from '@/engines/index';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  onboardingCompleted: boolean | null;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session) {
        supabase.from('user_settings')
          .select('onboarding_completed')
          .eq('user_id', session.user.id)
          .maybeSingle()
          .then(({ data, error }) => {
            setOnboardingCompleted(error ? false : (data?.onboarding_completed ?? false))
          })
      } else {
        setOnboardingCompleted(null)
      }
    }).catch((error) => {
      Sentry.captureException(error, { extra: { context: 'AuthContext getSession network failure' } });
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        Sentry.setUser({ email: session.user.email, id: session.user.id });
      } else {
        Sentry.setUser(null);
      }

      if (_event === 'SIGNED_IN' && session) {
        const { full_name } = session.user.user_metadata ?? {};
        if (full_name) {
          supabase.from('user_settings').upsert(
            { user_id: session.user.id, display_name: full_name },
            { onConflict: 'user_id', ignoreDuplicates: true }
          ).then(({ error }) => {
            if (error) Sentry.captureException(new Error(error.message), { extra: { context: 'AuthContext user_settings upsert', supabaseError: error } });
          });
        }
        // Fetch onboarding status
        supabase.from('user_settings')
          .select('onboarding_completed')
          .eq('user_id', session.user.id)
          .maybeSingle()
          .then(({ data, error }) => {
            setOnboardingCompleted(error ? false : (data?.onboarding_completed ?? false))
          })
      }
      if (_event === 'SIGNED_OUT') {
        setOnboardingCompleted(null)
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    })

    if (!error && data.user) {
      // Fire-and-forget country detection — failure is silent, defaults remain safe for UK users
      ;(async () => {
        try {
          const country = await detectSignupCountry()
          const engineId = getEngineForCountry(country)
          await supabase.from('profiles').upsert({
            id: data.user!.id,
            signup_country: country,
            default_engine: engineId,
            multi_engine_enabled: country !== 'GB',
            authorized_engines: country !== 'GB'
              ? ['apa-uk', engineId]
              : ['apa-uk'],
          }, { onConflict: 'id', ignoreDuplicates: false })
        } catch {
          // Silent fallback — profile keeps safe defaults (apa-uk, multi_engine_enabled: false)
        }
      })()
    }

    return { error: error as Error | null }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, onboardingCompleted, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
