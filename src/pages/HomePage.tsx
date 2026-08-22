import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Tutorial from '../components/Tutorial';
import NotificationBell from '../components/NotificationBell';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';
import { GAME_CATALOG } from '../games/registry';
import { getHollowFlightMyStats, loadHollowFlightConfig } from '../services/hollowFlight';

export default function HomePage() {
  const { user, profile, claimDailyReward } = useAuth();
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
        <div className="card empty-state" style={{ marginTop: 40 }}>
          <div className="emoji">🚫</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Account banned</h1>
          <p className="muted">
            Your account has been restricted by an administrator. You cannot send messages or use
            most features.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Tutorial />

      <header className="home-hero">
        <div>
          <div className="caption">Welcome back</div>
          <h1>{profile.display_name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="stamp-chip">🪙 {profile.stamp_balance}</span>
          <NotificationBell />
          <Link to="/store" aria-label="Store" className="icon-chip">
            <ShoppingBag size={18} />
          </Link>
          <Link to="/profile" aria-label="Settings" className="icon-chip">
            <Settings size={18} />
          </Link>
        </div>
      </header>

      {rewardMsg && <div className="reward-toast">{rewardMsg}</div>}

      <div className="section-title">Mini Games</div>

      {GAME_CATALOG.map((game) => {
        const enabled = game.id === 'hollow-flight' ? hfEnabled : true;
        const title = game.id === 'hollow-flight' ? hfTitle : game.title;
        const tagline = game.id === 'hollow-flight' ? hfTagline : game.tagline;
        const best = bestByGame[game.id];

        return (
          <div key={game.id} className="card game-hero" style={{ marginBottom: 12 }}>
            <div className="game-card-emoji">{game.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2>{title}</h2>
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {tagline}
              </p>
              {typeof best === 'number' && (
                <p className="caption" style={{ marginBottom: 10 }}>
                  Best score: <strong style={{ color: 'var(--text)' }}>{best}</strong>
                </p>
              )}
              {enabled ? (
                <Link
                  to={game.path}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', minWidth: 120, width: 'auto', padding: '10px 22px' }}
                >
                  PLAY
                </Link>
              ) : (
                <button type="button" className="btn btn-secondary" disabled style={{ width: 'auto' }}>
                  Unavailable
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="coming-soon-grid">
        <div className="coming-soon-card">
          <div className="lock">🔒</div>
          <strong>Coming Soon</strong>
          <p className="caption">Pigeon Peck</p>
        </div>
        <div className="coming-soon-card">
          <div className="lock">🔒</div>
          <strong>Coming Soon</strong>
          <p className="caption">Sky Relay</p>
        </div>
      </div>
    </div>
  );
}
