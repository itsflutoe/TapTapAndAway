import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, Pigeon } from '../types';
import { geocodeAddress } from '../lib/geo';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  pigeon: Pigeon | null;
  loading: boolean;
  isAdminMode: boolean;
  setIsAdminMode: (v: boolean) => void;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  claimDailyReward: () => Promise<number>;
}

interface SignUpData {
  username: string;
  password: string;
  displayName: string;
  gender: string;
  address: string;
  pigeonName?: string;
  /** Optional GPS coordinates from signup (skips re-geocoding) */
  latitude?: number;
  longitude?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Map username → internal email for Supabase Auth (email-based under the hood).
 * Use a syntactically valid domain. Users never see or type this email.
 * Avoid reserved/special-use domains like .internal which GoTrue may reject (HTTP 500).
 */
function usernameToEmail(username: string): string {
  const safe = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  return `${safe}@taptap.app`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pigeon, setPigeon] = useState<Pigeon | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(true); // admins start in admin mode

  const fetchProfileAndPigeon = async (userId: string) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (prof) setProfile(prof as Profile);

    const { data: pig } = await supabase
      .from('pigeons')
      .select('*')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pig) setPigeon(pig as Pigeon);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndPigeon(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndPigeon(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfileAndPigeon(session.user.id);
        } else {
          setProfile(null);
          setPigeon(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (data: SignUpData): Promise<{ error: string | null }> => {
    const username = data.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return { error: 'Username must be 3-20 characters (letters, numbers, underscore).' };
    }

    // Check uniqueness first
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (existing) return { error: 'Username already taken.' };

    // Prefer GPS coords from signup; otherwise geocode the typed address
    let lat = data.latitude;
    let lon = data.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geo = await geocodeAddress(data.address);
      if (!geo) {
        return {
          error:
            'Could not find that address. Try "Use my current location" or a more specific place (city, country).',
        };
      }
      lat = geo.lat;
      lon = geo.lon;
    }

    const email = usernameToEmail(username);
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          username,
          display_name: data.displayName.trim(),
          gender: data.gender,
          address: data.address.trim(),
          latitude: String(lat),
          longitude: String(lon),
          pigeon_name: data.pigeonName?.trim() || 'Mochi',
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        return { error: 'Username already taken.' };
      }
      return { error: error.message };
    }

    if (authData.user) {
      // Profile + pigeon created by database trigger
      await fetchProfileAndPigeon(authData.user.id);
    }
    return { error: null };
  };

  const signIn = async (
    username: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const email = usernameToEmail(username.trim());
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: 'Invalid username or password.' };
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPigeon(null);
    setIsAdminMode(true);
  };

  const claimDailyReward = async (): Promise<number> => {
    if (!user) return 0;
    const { data, error } = await supabase.rpc('claim_daily_reward', {
      p_user_id: user.id,
    });
    if (error) {
      console.error('Daily reward error:', error);
      return 0;
    }
    await refreshProfile();
    return data as number;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        pigeon,
        loading,
        isAdminMode,
        setIsAdminMode,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        claimDailyReward,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
