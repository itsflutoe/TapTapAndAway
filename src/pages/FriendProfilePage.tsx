import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';
import PigeonAvatar from '../components/PigeonAvatar';
import { cityFromAddress, formatPresence, friendsSinceLabel } from '../lib/presence';
import type { Profile, Pigeon, Friendship } from '../types';

export default function FriendProfilePage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pigeon, setPigeon] = useState<Pigeon | null>(null);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userId) return;
    (async () => {
      setLoading(true);
      setError('');

      if (userId === user.id) {
        setError('That’s your own profile — use Profile tab.');
        setLoading(false);
        return;
      }

      const { data: fs } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(
          `and(requester_id.eq.${user.id},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${user.id})`
        )
        .maybeSingle();

      if (!fs) {
        setError('Only accepted friends can view this profile.');
        setLoading(false);
        return;
      }
      setFriendship(fs as Friendship);

      const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!p) {
        setError('User not found.');
        setLoading(false);
        return;
      }
      setProfile(p as Profile);

      const { data: pig } = await supabase
        .from('pigeons')
        .select('*')
        .eq('owner_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      setPigeon((pig as Pigeon) || null);
      setLoading(false);
    })();
  }, [user?.id, userId]);

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Friend" />
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page">
        <PageHeader title="Friend" />
        <div className="card">
          <p className="error-text">{error || 'Unavailable'}</p>
          <Link to="/friends" className="btn btn-secondary" style={{ marginTop: 12, display: 'block' }}>
            Back to Friends
          </Link>
        </div>
      </div>
    );
  }

  const presence = formatPresence(profile.last_seen_at);
  const city = cityFromAddress(profile.address);
  const since = friendsSinceLabel(friendship?.created_at);
  const km = Number(pigeon?.total_distance_km ?? 0);
  const flights = Number(pigeon?.total_flights ?? 0);

  return (
    <div className="page">
      <PageHeader title={profile.display_name} />

      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <PigeonAvatar spriteId={pigeon?.sprite_id} size={120} name={pigeon?.name} />
        </div>
        <h2 style={{ fontSize: 20, margin: 0 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: presence.online ? '#34c759' : '#c7c7cc',
              marginRight: 8,
              verticalAlign: 'middle',
            }}
          />
          {profile.display_name}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>@{profile.username}</p>
        <p style={{ fontSize: 13, color: presence.online ? '#34c759' : 'var(--text-secondary)', marginTop: 6 }}>
          {presence.label}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>📍 {city}</p>
        {since && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Friends since {since}
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Their pigeon</h3>
        {pigeon ? (
          <>
            <p style={{ fontWeight: 600, margin: 0 }}>{pigeon.name}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {pigeon.gender === 'female' ? 'Female' : 'Male'}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{km.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>km flown</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{flights}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>flights</div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No active pigeon.</p>
        )}
      </div>

      <Link to="/friends" className="btn btn-secondary" style={{ marginTop: 16, display: 'block' }}>
        Back to Friends
      </Link>
    </div>
  );
}
