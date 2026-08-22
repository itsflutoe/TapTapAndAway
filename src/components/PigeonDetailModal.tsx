import { useEffect, useState } from 'react';
import PigeonAvatar from './PigeonAvatar';
import { expProgressRatio, getPigeonPublicDetail, setActivePigeon } from '../services/pigeon';
import type { PigeonAbilityInstance, PigeonPublicDetail, PigeonStats } from '../types';

interface Props {
  pigeonId: string | null;
  open: boolean;
  onClose: () => void;
  title?: string;
  showEquip?: boolean;
  isActive?: boolean;
  onEquipped?: () => void | Promise<void>;
}

type StatKey = keyof PigeonStats;

const STAT_ORDER: { key: StatKey; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'luck', label: 'Luck' },
];

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function PigeonDetailModal({
  pigeonId,
  open,
  onClose,
  title,
  showEquip = false,
  isActive = false,
  onEquipped,
}: Props) {
  const [detail, setDetail] = useState<PigeonPublicDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [equipMsg, setEquipMsg] = useState('');

  useEffect(() => {
    if (!open || !pigeonId) {
      setDetail(null);
      setError('');
      setEquipMsg('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const d = await getPigeonPublicDetail(pigeonId);
        if (!cancelled) {
          setDetail(d);
          if (!d) setError('Pigeon not found.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load pigeon.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pigeonId]);

  if (!open) return null;

  const rarityLabel = detail?.rarity_meta?.name || titleCase(detail?.rarity || 'Unknown');
  const rarityIcon = detail?.rarity_meta?.icon || '🐦';
  const ratio = detail ? expProgressRatio(detail.exp, detail.exp_to_next) : 0;
  const abilities: PigeonAbilityInstance[] = detail?.abilities ?? [];

  const equip = async () => {
    if (!pigeonId || isActive) return;
    setEquipping(true);
    setEquipMsg('');
    try {
      await setActivePigeon(pigeonId);
      setEquipMsg('This pigeon is now active.');
      await onEquipped?.();
    } catch (e) {
      setEquipMsg(e instanceof Error ? e.message : 'Could not equip');
    } finally {
      setEquipping(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 style={{ margin: 0, fontSize: 18 }}>{title || detail?.name || 'Pigeon'}</h2>
          <button type="button" onClick={onClose} className="icon-chip" aria-label="Close">
            ×
          </button>
        </div>

        <div className="sheet-body">
          {loading && <p className="muted">Loading…</p>}
          {error && !loading && <p className="error-text">{error}</p>}

          {detail && !loading && (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <PigeonAvatar spriteId={detail.sprite_id} size={88} name={detail.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{detail.name}</div>
                  <div className={`rarity-chip ${String(detail.rarity || 'basic').toLowerCase()}`} style={{ marginTop: 6 }}>
                    {rarityIcon} {rarityLabel}
                  </div>
                  <div className="caption" style={{ marginTop: 6 }}>
                    Level {detail.level}
                    {isActive ? ' · Active' : ''}
                  </div>
                </div>
              </div>

              {showEquip && (
                <div style={{ marginTop: 14 }}>
                  {isActive ? (
                    <button type="button" className="btn btn-secondary" disabled>
                      Active pigeon
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={equipping} onClick={() => void equip()}>
                      {equipping ? 'Switching…' : 'Use this pigeon'}
                    </button>
                  )}
                  {equipMsg && <p className="caption" style={{ marginTop: 8 }}>{equipMsg}</p>}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }} className="caption">
                  <span>EXP</span>
                  <span>
                    {Number(detail.exp || 0).toLocaleString()} / {Number(detail.exp_to_next || 0).toLocaleString()}
                  </span>
                </div>
                <div className="exp-bar">
                  <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
              </div>

              <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Stats</h3>
              <div className="stat-grid">
                {STAT_ORDER.map((row) => (
                  <div key={row.key} className="stat-cell">
                    <div className="lbl">{row.label}</div>
                    <div className="val">{Math.round(Number(detail.stats[row.key]) || 0)}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Abilities</h3>
              {abilities.length === 0 ? (
                <p className="muted">
                  No abilities equipped.
                  {(detail.rarity === 'basic' || detail.rarity === 'common') && (
                    <> Basic and Common pigeons cannot equip abilities.</>
                  )}
                </p>
              ) : (
                abilities.map((ab) => (
                  <div key={`${ab.ability_id}-${ab.ability_level}`} className="card" style={{ marginBottom: 8, padding: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      ⚡ {ab.name || ab.key || 'Ability'}{' '}
                      <span className="caption">
                        Lv {ab.ability_level}
                        {ab.max_level ? `/${ab.max_level}` : ''}
                      </span>
                    </div>
                    {ab.description && (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {ab.description}
                        {ab.effect_value != null ? ` (${ab.effect_value})` : ''}
                      </div>
                    )}
                  </div>
                ))
              )}

              {(detail.total_flights != null || detail.total_distance_km != null) && (
                <p className="caption" style={{ marginTop: 12 }}>
                  {detail.successful_flights ?? 0}/{detail.total_flights ?? 0} successful flights
                  {detail.total_distance_km != null
                    ? ` · ${Number(detail.total_distance_km).toFixed(1)} km`
                    : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
