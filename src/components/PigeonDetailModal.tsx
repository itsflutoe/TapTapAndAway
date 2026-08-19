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

  const rarityColor = detail?.rarity_meta?.color || '#94a3b8';
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
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: 'min(88vh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card, #1a1f29)',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          color: 'var(--text-primary, #f1f5f9)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px 8px',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>{title || detail?.name || 'Pigeon'}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: 22,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          style={{
            overflowY: 'auto',
            padding: '4px 16px',
            paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {loading && (
            <p style={{ color: 'var(--text-secondary, #94a3b8)', marginTop: 12 }}>Loading…</p>
          )}
          {error && !loading && (
            <p style={{ color: '#fca5a5', marginTop: 12 }}>{error}</p>
          )}

          {detail && !loading && (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <PigeonAvatar spriteId={detail.sprite_id} size={88} name={detail.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.name}</div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: `${rarityColor}22`,
                      color: rarityColor,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span aria-hidden>{rarityIcon}</span>
                    {rarityLabel}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary, #94a3b8)',
                      marginTop: 6,
                    }}
                  >
                    Level {detail.level}
                    {isActive ? ' · Active' : ''}
                  </div>
                </div>
              </div>

              {showEquip && (
                <div style={{ marginTop: 14 }}>
                  {isActive ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%' }}
                      disabled
                    >
                      Active pigeon
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      disabled={equipping}
                      onClick={() => void equip()}
                    >
                      {equipping ? 'Switching…' : 'Use this pigeon'}
                    </button>
                  )}
                  {equipMsg && (
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{equipMsg}</p>
                  )}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--text-secondary, #94a3b8)',
                    marginBottom: 4,
                  }}
                >
                  <span>EXP</span>
                  <span>
                    {Number(detail.exp || 0).toLocaleString()} /{' '}
                    {Number(detail.exp_to_next || 0).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: '#2a2f3a',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(ratio * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>

              <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Stats</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {STAT_ORDER.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      background: '#12161e',
                      border: '1px solid #2a2f3a',
                      borderRadius: 10,
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {Math.round(Number(detail.stats[row.key]) || 0)}
                    </div>
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Abilities</h3>
              {abilities.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.45 }}>
                  No abilities equipped.
                  {(detail.rarity === 'basic' || detail.rarity === 'common') && (
                    <> Basic and Common pigeons cannot equip abilities.</>
                  )}
                </p>
              ) : (
                abilities.map((ab) => (
                  <div
                    key={`${ab.ability_id}-${ab.ability_level}`}
                    style={{
                      border: '1px solid #2a2f3a',
                      borderRadius: 10,
                      padding: '10px 12px',
                      marginBottom: 8,
                      background: '#12161e',
                    }}
                  >
                    <div style={{ fontWeight: 650, fontSize: 14 }}>
                      ⚡ {ab.name || ab.key || 'Ability'}{' '}
                      <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: 12 }}>
                        Lv {ab.ability_level}
                        {ab.max_level ? `/${ab.max_level}` : ''}
                      </span>
                    </div>
                    {ab.description && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        {ab.description}
                        {ab.effect_value != null ? ` (${ab.effect_value})` : ''}
                      </div>
                    )}
                  </div>
                ))
              )}

              {(detail.total_flights != null || detail.total_distance_km != null) && (
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 8 }}>
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
