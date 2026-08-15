import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const { profile, pigeon, claimDailyReward } = useAuth();
  const [rewardMsg, setRewardMsg] = useState('');

  useEffect(() => {
    // Try claim daily reward silently on home load
    claimDailyReward().then((amt) => {
      if (amt > 0) {
        setRewardMsg(`+${amt} Stamp daily reward!`);
        setTimeout(() => setRewardMsg(''), 4000);
      }
    });
  }, []);

  if (!profile) return null;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/profile" style={{ fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>
          {profile.display_name}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="stamp-badge">🪙 {profile.stamp_balance}</span>
          <Link to="/store" aria-label="Store">
            <ShoppingBag size={22} color="var(--text-secondary)" />
          </Link>
          <Link to="/profile" aria-label="Settings">
            <Settings size={22} color="var(--text-secondary)" />
          </Link>
        </div>
      </header>

      {rewardMsg && (
        <div style={{
          background: '#e8f8ee',
          color: '#1a7f37',
          textAlign: 'center',
          padding: '8px',
          borderRadius: 10,
          marginBottom: 12,
          fontWeight: 600,
          fontSize: 14,
        }}>
          {rewardMsg}
        </div>
      )}

      {/* Pigeon focus */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
      }}>
        <div className="pigeon-idle" style={{ fontSize: 120, lineHeight: 1, marginBottom: 8 }}>
          🐦
        </div>
        <div style={{
          width: 140,
          height: 12,
          background: 'linear-gradient(90deg, transparent, #8b5a2b44, transparent)',
          borderRadius: 8,
          marginBottom: 20,
        }} />
        <p style={{ fontWeight: 600, fontSize: 18 }}>
          {pigeon?.name || 'Your pigeon'} is ready.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          PID: {profile.pigeon_id}
        </p>
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
