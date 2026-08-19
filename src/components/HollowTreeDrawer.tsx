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

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
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
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>🌳 Hollow Tree</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Your pigeon collection
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
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
            {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}
            {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
            {!loading && pigeons.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>
                No pigeons yet. Visit the Store to add companions to your tree.
              </p>
            )}
            {pigeons.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetailId(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #2a2f3a',
                  borderRadius: 12,
                  padding: '12px',
                  marginBottom: 10,
                  background: p.is_active ? 'rgba(59,130,246,0.12)' : '#12161e',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <PigeonAvatar spriteId={p.sprite_id} size={52} name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {titleCase(String(p.rarity || 'common'))} · Lv. {p.level ?? 1}
                  </div>
                </div>
                {p.is_active && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: '#3b82f6',
                      color: '#fff',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
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
