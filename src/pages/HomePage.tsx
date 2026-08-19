import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Tutorial from '../components/Tutorial';
import NotificationBell from '../components/NotificationBell';
import PigeonAvatar from '../components/PigeonAvatar';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';
import { GAME_CATALOG } from '../games/registry';
import { getHollowFlightMyStats } from '../services/hollowFlight';
import { loadHollowFlightConfig } from '../services/hollowFlight';

export default function HomePage() {
  const { user, profile, pigeon, claimDailyReward } = useAuth();
  const [rewardMsg, setRewardMsg] = useState('');
  const [bestByGame, setBestByGame] = useState<Record<string, number>>({});
  const [hfEnabled, setHfEnabled] = useState(true);
  const [hfTitle, setHfTitle] = useState('Hollow Flight');
  const [hfTagline, setHfTagline] = useState('Fly. Dodge. Collect.');

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

  useEffect(() => {
    (async () => {
      try {
        const stats = await getHollowFlightMyStats();
        setBestByGame((m) => ({ ...m, 'hollow-flight': stats.best_score || 0 }));
      } catch {
        /* ignore */
      }
      try {
        const cfg = await loadHollowFlightConfig();
        setHfEnabled(cfg.enabled);
        setHfTitle(cfg.title || 'Hollow Flight');
        setHfTagline(cfg.description || 'Fly. Dodge. Collect.');
      } catch {
        /* ignore */
      }
    })();
  }, []);

  if (!profile) return null;

  if (profile.is_banned) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: 32, marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Account banned</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
            Your account has been restricted by an administrator. You cannot send messages or use
            most features.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <Tutorial />

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
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

      {/* Compact active pigeon strip — not the game */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          marginBottom: 16,
        }}
      >
        <PigeonAvatar spriteId={pigeon?.sprite_id} size={48} name={pigeon?.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{pigeon?.name || 'Your pigeon'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Ready for games · PID {profile.pigeon_id}
          </div>
        </div>
      </div>

      <h1 style={{ fontSize: 18, marginBottom: 12 }}>Games</h1>

      {GAME_CATALOG.map((game) => {
        const enabled = game.id === 'hollow-flight' ? hfEnabled : true;
        const title = game.id === 'hollow-flight' ? hfTitle : game.title;
        const tagline = game.id === 'hollow-flight' ? hfTagline : game.tagline;
        const best = bestByGame[game.id];

        return (
          <div key={game.id} className="card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 36, lineHeight: 1 }}>{game.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                  {tagline}
                </p>
                {typeof best === 'number' && (
                  <p style={{ fontSize: 13, marginBottom: 10 }}>
                    Best Score: <strong>{best}</strong>
                  </p>
                )}
                {enabled ? (
                  <Link
                    to={game.path}
                    className="btn btn-primary"
                    style={{ display: 'inline-block', minWidth: 120, textAlign: 'center' }}
                  >
                    Play
                  </Link>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled>
                    Unavailable
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <p
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 8,
          marginBottom: 24,
        }}
      >
        More games coming soon.
      </p>
    </div>
  );
}
