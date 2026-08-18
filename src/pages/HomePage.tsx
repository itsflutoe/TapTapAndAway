import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Tutorial from '../components/Tutorial';
import NotificationBell from '../components/NotificationBell';
import PigeonAvatar from '../components/PigeonAvatar';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';

export default function HomePage() {
  const { user, profile, pigeon, claimDailyReward } = useAuth();
  const [rewardMsg, setRewardMsg] = useState('');

  useEffect(() => {
    claimDailyReward().then((amt) => {
      if (amt > 0) {
        setRewardMsg(`+${amt} Stamp daily reward!`);
        setTimeout(() => setRewardMsg(''), 4000);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    void resolveOverdueDeliveriesForUser(user.id).catch(() => undefined);
  }, [user?.id]);

  if (!profile) return null;

  if (profile.is_banned) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 32, marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Account banned</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
            Your account has been restricted by an administrator. You cannot send messages or use most features.
          </p>
        </div>
      </div>
    );
  }

  const km = Number(pigeon?.total_distance_km ?? 0);
  const flights = Number(pigeon?.total_flights ?? 0);
  const success = Number(pigeon?.successful_flights ?? 0);

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <Tutorial />

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/profile" style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>
          {profile.display_name}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="stamp-badge">🪙 {profile.stamp_balance}</span>
          <NotificationBell />
          <Link to="/store" aria-label="Store">
            <ShoppingBag size={22} color="var(--text-secondary)" />
          </Link>
          <Link to="/profile" aria-label="Settings">
            <Settings size={22} color="var(--text-secondary)" />
          </Link>
        </div>
      </header>

      {rewardMsg && (
        <div
          style={{
            background: '#e8f8ee',
            color: '#1a7f37',
            textAlign: 'center',
            padding: 8,
            borderRadius: 10,
            marginBottom: 12,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {rewardMsg}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 280,
        }}
      >
        <PigeonAvatar
          spriteId={pigeon?.sprite_id}
          size={140}
          name={pigeon?.name}
          className="pigeon-idle"
          style={{ marginBottom: 8 }}
        />
        <div
          style={{
            width: 140,
            height: 12,
            background: 'linear-gradient(90deg, transparent, #8b5a2b44, transparent)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        />
        <p style={{ fontWeight: 600, fontSize: 18 }}>
          {pigeon?.name || 'Your pigeon'} is ready.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          PID: {profile.pigeon_id}
        </p>

        <div
          className="card"
          style={{
            marginTop: 20,
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            textAlign: 'center',
            padding: '14px 10px',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{km.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>km flown</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{flights}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>flights</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{success}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>delivered</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
          Messages travel by pigeon. Longer journeys cost more Stamps.
        </p>
        <Link to="/send" className="btn btn-primary">
          🐦 Send a pigeon
        </Link>
      </div>
    </div>
  );
}
