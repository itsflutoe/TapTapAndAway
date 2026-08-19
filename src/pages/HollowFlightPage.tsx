import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HollowFlightCanvas, {
  type CanvasPhase,
  type RunResult,
} from '../games/hollowFlight/HollowFlightCanvas';
import {
  DEFAULT_HF_CONFIG,
  computeHfStatMods,
  type HollowFlightConfig,
} from '../games/hollowFlight/config';
import {
  getHollowFlightLeaderboard,
  getHollowFlightMyStats,
  loadHollowFlightConfig,
  startHollowFlightSession,
  submitHollowFlightRun,
  type LeaderboardRow,
} from '../services/hollowFlight';

export default function HollowFlightPage() {
  const { user, pigeon, refreshProfile } = useAuth();
  const [config, setConfig] = useState<HollowFlightConfig>(DEFAULT_HF_CONFIG);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [phase, setPhase] = useState<CanvasPhase>('ready');
  const [score, setScore] = useState(0);
  const [pickups, setPickups] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [result, setResult] = useState<{
    score: number;
    pickups: number;
    stamps_earned: number;
    best_score: number;
  } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [lbTab, setLbTab] = useState<'global' | 'friends' | 'personal'>('global');
  const [lbRows, setLbRows] = useState<LeaderboardRow[]>([]);
  const [showLb, setShowLb] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await loadHollowFlightConfig();
        setConfig(c);
      } catch {
        setConfig(DEFAULT_HF_CONFIG);
      } finally {
        setCfgLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    getHollowFlightMyStats()
      .then((s) => setBestScore(s.best_score || 0))
      .catch(() => undefined);
  }, []);

  const mods = useMemo(
    () =>
      computeHfStatMods(
        {
          speed: pigeon?.speed,
          stamina: pigeon?.stamina,
          reliability: pigeon?.reliability,
          accuracy: pigeon?.accuracy,
          endurance: pigeon?.endurance,
          luck: pigeon?.luck,
        },
        config.statCap
      ),
    [pigeon, config.statCap]
  );

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    setSessionError('');
    try {
      const s = await startHollowFlightSession();
      setSessionId(s.session_id);
      return s.session_id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not start session';
      setSessionError(msg);
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!user || !config.enabled) return;
    void ensureSession();
  }, [user, config.enabled, ensureSession]);

  const onScore = (s: number, p: number) => {
    setScore(s);
    setPickups(p);
  };

  const onRunEnd = async (run: RunResult) => {
    setSubmitting(true);
    setSubmitError('');
    setResult(null);
    try {
      let sid = sessionId;
      if (!sid) {
        sid = await ensureSession();
      }
      if (!sid) {
        setSubmitError('No game session — rewards not saved.');
        setSubmitting(false);
        return;
      }
      const res = await submitHollowFlightRun({
        sessionId: sid,
        score: run.score,
        pickups: run.pickups,
        durationMs: run.durationMs,
      });
      setResult({
        score: res.score,
        pickups: res.pickups,
        stamps_earned: res.stamps_earned,
        best_score: res.best_score,
      });
      setBestScore(res.best_score);
      setSessionId(null); // next run needs new session
      await refreshProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Reward submit failed';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const playAgain = async () => {
    setResult(null);
    setSubmitError('');
    setScore(0);
    setPickups(0);
    setSessionId(null);
    setPhase('ready');
    setResetToken((t) => t + 1);
    try {
      const s = await startHollowFlightSession();
      setSessionId(s.session_id);
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : 'Session failed');
    }
  };

  const loadLb = async (scope: 'global' | 'friends' | 'personal') => {
    setLbTab(scope);
    try {
      const rows = await getHollowFlightLeaderboard(scope, 20);
      setLbRows(rows);
    } catch {
      setLbRows([]);
    }
  };

  if (cfgLoading) {
    return (
      <div className="page">
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</p>
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <div className="page">
        <Link to="/" style={{ fontSize: 14 }}>
          ← Back
        </Link>
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20 }}>{config.title}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            {config.maintenanceMessage || 'Temporarily unavailable.'}
          </p>
        </div>
      </div>
    );
  }

  if (!pigeon) {
    return (
      <div className="page">
        <Link to="/" style={{ fontSize: 14 }}>
          ← Back
        </Link>
        <div className="card" style={{ marginTop: 16, textAlign: 'center' }}>
          <p>You need an active pigeon to play.</p>
          <Link to="/profile" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-block' }}>
            Go to Profile
          </Link>
        </div>
      </div>
    );
  }

  const showResults = phase === 'dead' && (result || submitError || submitting);

  return (
    <div
      className="page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxHeight: '100dvh',
        paddingBottom: 12,
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <Link to="/" style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
          ← Back
        </Link>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{config.title}</div>
        <div style={{ fontSize: 14, fontWeight: 700, minWidth: 64, textAlign: 'right' }}>
          {score}
        </div>
      </header>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {pigeon.name} · Best {bestScore} · 🪙 {pickups}
      </div>

      {sessionError && (
        <p className="error-text" style={{ marginBottom: 6 }}>
          {sessionError}
        </p>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <HollowFlightCanvas
          config={config}
          mods={mods}
          spriteId={pigeon.sprite_id}
          pigeonName={pigeon.name}
          phase={phase}
          onPhaseChange={setPhase}
          onScore={onScore}
          onRunEnd={(r) => void onRunEnd(r)}
          resetToken={resetToken}
        />

        {phase === 'ready' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                borderRadius: 12,
                padding: '16px 20px',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700 }}>{config.title}</div>
              <div style={{ marginTop: 6 }}>🐦 {pigeon.name}</div>
              <div style={{ marginTop: 10, fontSize: 14 }}>Tap to flap · Space on desktop</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>TAP TO START</div>
            </div>
          </div>
        )}

        {showResults && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,18,24,0.82)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 5,
            }}
          >
            <div className="card" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
              <h2 style={{ fontSize: 22, marginBottom: 12 }}>Game Over</h2>
              {submitting && <p style={{ color: 'var(--text-secondary)' }}>Saving…</p>}
              {submitError && <p className="error-text">{submitError}</p>}
              {result && (
                <>
                  <p style={{ fontSize: 28, fontWeight: 800 }}>{result.score}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Score</p>
                  <p style={{ marginTop: 8, fontSize: 14 }}>Best: {result.best_score}</p>
                  <p style={{ fontSize: 14 }}>🪙 Pickups: {result.pickups}</p>
                  <p style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>
                    Stamps earned: {result.stamps_earned}
                  </p>
                </>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16 }}
                onClick={() => void playAgain()}
                disabled={submitting}
              >
                Play again
              </button>
              <Link
                to="/"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 8, display: 'block', textAlign: 'center' }}
              >
                Exit
              </Link>
              {config.leaderboardEnabled && (
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => {
                    setShowLb(true);
                    void loadLb(lbTab);
                  }}
                >
                  Leaderboard
                </button>
              )}
            </div>
          </div>
        )}

        {showLb && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,18,24,0.9)',
              zIndex: 6,
              padding: 12,
              overflow: 'auto',
            }}
          >
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Leaderboard</strong>
                <button type="button" className="btn" onClick={() => setShowLb(false)}>
                  Close
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['global', 'friends', 'personal'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="btn"
                    style={{
                      flex: 1,
                      background: lbTab === t ? 'var(--primary, #3b82f6)' : undefined,
                      color: lbTab === t ? '#fff' : undefined,
                    }}
                    onClick={() => void loadLb(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {lbRows.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No scores yet.</p>
              )}
              {lbRows.map((row, i) => (
                <div
                  key={`${row.user_id || row.created_at}-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border, #2a2f3a)',
                    fontSize: 13,
                  }}
                >
                  <span>
                    #{i + 1} {row.display_name || row.username || 'Player'}
                    {row.pigeon_name ? ` · ${row.pigeon_name}` : ''}
                  </span>
                  <strong>{row.score}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
