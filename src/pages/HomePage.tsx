import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Tutorial from '../components/Tutorial';
import NotificationBell from '../components/NotificationBell';
import PigeonAvatar from '../components/PigeonAvatar';
import PigeonDetailModal from '../components/PigeonDetailModal';
import { resolveOverdueDeliveriesForUser } from '../services/messaging';
import { GAME_CATALOG } from '../games/registry';
import { getHollowFlightMyStats, loadHollowFlightConfig } from '../services/hollowFlight';

function rarityClass(r?: string | null) {
  const k = (r || 'basic').toLowerCase();
  if (['common', 'basic', 'epic', 'legendary', 'mythical', 'custom'].includes(k)) return k;
  return 'basic';
}

export default function HomePage() {
  const { user, profile, pigeon, claimDailyReward } = useAuth();
  const [rewardMsg, setRewardMsg] = useState('');
  const [bestByGame, setBestByGame] = useState<Record<string, number>>({});
  const [hfEnabled, setHfEnabled] = useState(true);
  const [hfTitle, setHfTitle] = useState('Hollow Flight');
  const [hfTagline, setHfTagline] = useState('Fly. Dodge. Collect.');
  const [pigeonOpen, setPigeonOpen] = useState(false);

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
          <p className="muted">
            Your account has been restricted by an administrator. You cannot send messages or use
            most features.
          </p>
        </div>
      </div>
    );
  }

  const level = pigeon?.level ?? 1;
  const exp = pigeon?.exp ?? 0;
  // Rough bar until detail modal loads exact next-level requirement
  const expPct = Math.min(100, Math.round((exp % 100) || (exp > 0 ? 30 : 5)));

  return (
    <div className="page">
      <Tutorial />

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <div className="caption">Welcome back</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.display_name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="stamp-chip">🪙 {profile.stamp_balance}</span>
          <NotificationBell />
          <Link to="/store" aria-label="Store" className="icon-btn-link">
            <ShoppingBag size={22} color="var(--text-secondary)" />
          </Link>
          <Link to="/profile" aria-label="Settings">
            <Settings size={22} color="var(--text-secondary)" />
          </Link>
        </div>
      </header>

      {rewardMsg && <div className="reward-toast">{rewardMsg}</div>}

      <button type="button" className="pigeon-card" onClick={() => setPigeonOpen(true)}>
        <PigeonAvatar spriteId={pigeon?.sprite_id} size={56} name={pigeon?.name} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <strong style={{ fontSize: 15 }}>{pigeon?.name || 'Your pigeon'}</strong>
            <span className={`rarity-chip ${rarityClass(pigeon?.rarity)}`}>
              {pigeon?.rarity || 'basic'}
            </span>
          </div>
          <div className="caption">
            Lv. {level} · {exp} EXP · PID {profile.pigeon_id}
          </div>
          <div className="exp-bar">
            <span style={{ width: `${expPct}%` }} />
          </div>
        </div>
        <span className="caption">›</span>
      </button>

      <h2 style={{ fontSize: 17, marginBottom: 10 }}>Games</h2>

      {GAME_CATALOG.map((game) => {
        const enabled = game.id === 'hollow-flight' ? hfEnabled : true;
        const title = game.id === 'hollow-flight' ? hfTitle : game.title;
        const tagline = game.id === 'hollow-flight' ? hfTagline : game.tagline;
        const best = bestByGame[game.id];

        return (
          <div key={game.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div className="game-card-emoji">{game.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
                <p className="muted" style={{ margin: '4px 0 8px' }}>
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
                    style={{ display: 'inline-flex', minWidth: 120, width: 'auto', padding: '10px 18px' }}
                  >
                    Play
                  </Link>
                ) : (
                  <button type="button" className="btn btn-secondary" disabled style={{ width: 'auto' }}>
                    Unavailable
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <p className="caption" style={{ textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
        More games coming soon.
      </p>

      <PigeonDetailModal
        open={pigeonOpen}
        pigeonId={pigeon?.id ?? null}
        onClose={() => setPigeonOpen(false)}
        title={pigeon?.name || 'Your pigeon'}
      />
    </div>
  );
}
