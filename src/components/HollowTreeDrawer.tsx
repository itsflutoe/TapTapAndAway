import { useCallback, useEffect, useState } from 'react';
import PigeonAvatar from './PigeonAvatar';
import PigeonDetailModal from './PigeonDetailModal';
import { listMyPigeons } from '../services/pigeon';
import type { Pigeon } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onActiveChanged?: () => void;
}

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function HollowTreeDrawer({ open, onClose, onActiveChanged }: Props) {
  const [pigeons, setPigeons] = useState<Pigeon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listMyPigeons();
      setPigeons(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const active = pigeons.find((p) => p.is_active);
  const stored = pigeons.filter((p) => !p.is_active);

  return (
    <>
      <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="sheet-head">
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Hollow Tree</h2>
              <p className="caption">Your pigeon collection</p>
            </div>
            <button type="button" onClick={onClose} className="icon-chip" aria-label="Close">
              ×
            </button>
          </div>

          <div className="sheet-body">
            <div className="tree-stage">
              <div className="tree-canopy" />
              <div className="tree-trunk" />
              {pigeons.slice(0, 5).map((p, i) => {
                const spots = [
                  { left: '18%', top: '28%' },
                  { left: '58%', top: '18%' },
                  { left: '38%', top: '42%' },
                  { left: '12%', top: '52%' },
                  { left: '62%', top: '48%' },
                ];
                const pos = spots[i] || spots[0];
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`nest ${p.is_active ? 'active' : ''}`}
                    style={pos}
                    onClick={() => setDetailId(p.id)}
                    aria-label={p.name}
                  >
                    <PigeonAvatar spriteId={p.sprite_id} size={40} name={p.name} animate={false} />
                  </button>
                );
              })}
            </div>

            {loading && <p className="muted">Loading…</p>}
            {error && <p className="error-text">{error}</p>}
            {!loading && pigeons.length === 0 && (
              <p className="muted">No pigeons yet. Visit the Store to add companions to your tree.</p>
            )}
            {active && <p className="caption" style={{ marginBottom: 8 }}>Active: {active.name}</p>}
            {[active, ...stored].filter(Boolean).map((p) => (
              <button
                key={p!.id}
                type="button"
                className="list-row"
                onClick={() => setDetailId(p!.id)}
              >
                <PigeonAvatar spriteId={p!.sprite_id} size={52} name={p!.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{p!.name}</div>
                  <div className="caption">
                    {titleCase(String(p!.rarity || 'common'))} · Lv. {p!.level ?? 1}
                  </div>
                </div>
                {p!.is_active && <span className="status-pill new">ACTIVE</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PigeonDetailModal
        open={!!detailId}
        pigeonId={detailId}
        onClose={() => setDetailId(null)}
        title={pigeons.find((x) => x.id === detailId)?.name}
        showEquip
        isActive={!!pigeons.find((x) => x.id === detailId)?.is_active}
        onEquipped={async () => {
          setDetailId(null);
          await load();
          onActiveChanged?.();
        }}
      />
    </>
  );
}
