import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { listMyPigeons } from '../services/pigeon';
import { supabase } from '../lib/supabase';
import type { Pigeon } from '../types';

interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  item_type: string;
  bird_rarity: string | null;
  bird_sprite_id: string | null;
  price_stamps: number;
  stock: number | null;
  is_featured: boolean;
  randomize_stats?: boolean;
}

type StoreTab = 'pigeons' | 'upgrades' | 'items';

function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function StorePage() {
  const { profile, pigeon, refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [owned, setOwned] = useState<Pigeon[]>([]);
  const [tab, setTab] = useState<StoreTab>('pigeons');
  const [confirmItem, setConfirmItem] = useState<CatalogItem | null>(null);

  const loadCatalog = useCallback(async () => {
    const { data } = await supabase
      .from('store_items')
      .select(
        'id, sku, name, description, item_type, bird_rarity, bird_sprite_id, price_stamps, stock, is_featured, randomize_stats'
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setCatalog((data as CatalogItem[]) || []);
  }, []);

  const loadOwned = useCallback(async () => {
    try {
      setOwned(await listMyPigeons());
    } catch {
      setOwned([]);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadOwned();
  }, [loadCatalog, loadOwned]);

  const ownedCountByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of owned) {
      const k = (p.name || '').toLowerCase();
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [owned]);

  const pigeons = catalog.filter((c) => c.item_type === 'bird');
  const items = catalog.filter((c) =>
    ['item', 'consumable', 'cosmetic', 'bundle'].includes(c.item_type)
  );
  const upgrades = catalog.filter((c) =>
    ['upgrade', 'boost'].includes(c.item_type) || (c.is_featured && c.item_type !== 'bird')
  );

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!code.trim()) {
      setErr('Enter a code.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('redeem_stamp_code', {
      p_code: code.trim(),
    });
    setLoading(false);
    if (error) {
      setErr(error.message.replace(/^.*exception: /i, '') || error.message);
      return;
    }
    setMsg(`Success! New balance: ${data} Stamps`);
    setCode('');
    await refreshProfile();
  };

  const doBuy = async (item: CatalogItem) => {
    setMsg('');
    setErr('');
    setBuyingId(item.id);
    const { data, error } = await supabase.rpc('purchase_store_item', {
      p_item_id: item.id,
    });
    setBuyingId(null);
    setConfirmItem(null);

    if (error) {
      setErr(error.message.replace(/^.*exception: /i, '') || error.message);
      return;
    }

    const payload = data as { new_balance?: number };
    if (item.item_type === 'bird') {
      setMsg(`🐦 ${item.name} has joined your Hollow Tree!`);
    } else {
      setMsg(
        `Purchased ${item.name}.` +
          (payload?.new_balance != null ? ` Balance: ${payload.new_balance}` : '')
      );
    }
    await refreshProfile();
    await loadCatalog();
    await loadOwned();
  };

  const renderCard = (it: CatalogItem) => {
    const soldOut = it.stock !== null && it.stock <= 0;
    const canAfford = (profile?.stamp_balance ?? 0) >= it.price_stamps;
    const nameKey = (it.name || '').toLowerCase();
    const ownCount = ownedCountByName.get(nameKey) || 0;
    const isActiveMatch =
      it.item_type === 'bird' &&
      pigeon &&
      (pigeon.name || '').toLowerCase() === nameKey &&
      pigeon.is_active;

    return (
      <div
        key={it.id}
        className={`card store-item-card ${it.is_featured ? 'featured' : ''}`}
        style={{ opacity: soldOut ? 0.55 : 1 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 36 }}>{it.item_type === 'bird' ? '🐦' : '📦'}</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>{it.name}</div>
          {it.bird_rarity && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {titleCase(it.bird_rarity)}
              {it.randomize_stats ? ' · random stats' : ''}
            </div>
          )}
          {it.description && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              {it.description}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          {isActiveMatch && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: '#3b82f6',
                color: '#fff',
              }}
            >
              ACTIVE
            </span>
          )}
          {ownCount > 0 && !isActiveMatch && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: '#334155',
                color: '#e2e8f0',
              }}
            >
              {ownCount > 1 ? `OWNED ×${ownCount}` : 'OWNED'}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {soldOut ? 'Sold out' : `${it.price_stamps} 🪙`}
          </span>
          {it.stock !== null && it.stock !== undefined && !soldOut && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {it.stock} left
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={soldOut || buyingId === it.id || !profile}
          onClick={() => setConfirmItem(it)}
        >
          {it.item_type === 'bird'
            ? soldOut
              ? 'Sold out'
              : 'Add to Hollow Tree'
            : soldOut
              ? 'Sold out'
              : !canAfford
                ? `Need ${it.price_stamps} stamps`
                : `Buy · ${it.price_stamps} 🪙`}
        </button>
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Store" />

      <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Balance: <strong>{profile?.stamp_balance ?? 0} Stamps</strong>
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          New pigeons join your <strong>Hollow Tree</strong> — they do not replace your active
          bird.
        </p>
      </div>

      {err && <p className="error-text" style={{ marginBottom: 10 }}>{err}</p>}
      {msg && (
        <p style={{ color: 'var(--success)', fontSize: 14, marginBottom: 10 }}>{msg}</p>
      )}

      <div className="store-tabs segmented">
        {(
          [
            ['pigeons', 'Pigeons'],
            ['upgrades', 'Upgrades'],
            ['items', 'Items'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pigeons' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Pigeon shop</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
            Collect new companions for your journeys. Purchases go to your Hollow Tree.
          </p>
          {pigeons.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No pigeons listed right now.
            </p>
          )}
          {pigeons.map(renderCard)}
        </div>
      )}

      {tab === 'items' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Stamp items</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
            Redeem codes or browse stamp-related goods.
          </p>
          <form onSubmit={redeem} style={{ marginBottom: 16 }}>
            <div className="input-group">
              <label htmlFor="redeem-code">Redeem code</label>
              <input
                id="redeem-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                autoCapitalize="characters"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Redeeming…' : 'Redeem'}
            </button>
          </form>
          {items.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No items listed yet.
            </p>
          )}
          {items.map(renderCard)}
        </div>
      )}

      {tab === 'upgrades' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Upgrades</h2>
          <p className="muted">Boosts and featured extras. Stocked from Admin → Store.</p>
          {upgrades.length === 0 && (
            <p className="muted">No upgrades listed yet.</p>
          )}
          {upgrades.map(renderCard)}
        </div>
      )}

      {confirmItem && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setConfirmItem(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 360, margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', fontSize: 40 }}>
              {confirmItem.item_type === 'bird' ? '🐦' : '📦'}
            </div>
            <h2 style={{ textAlign: 'center', fontSize: 18, margin: '8px 0 4px' }}>
              {confirmItem.name}
            </h2>
            {confirmItem.bird_rarity && (
              <p
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                {titleCase(confirmItem.bird_rarity)}
              </p>
            )}
            <p style={{ fontSize: 14, textAlign: 'center', margin: '14px 0' }}>
              {confirmItem.item_type === 'bird'
                ? `Add ${confirmItem.name} to your Hollow Tree?`
                : `Buy ${confirmItem.name}?`}
            </p>
            <p style={{ fontSize: 13, margin: '0 0 4px' }}>
              Price: <strong>{confirmItem.price_stamps} Stamps</strong>
            </p>
            <p style={{ fontSize: 13, margin: '0 0 16px' }}>
              Your balance: <strong>{profile?.stamp_balance ?? 0} Stamps</strong>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setConfirmItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={buyingId === confirmItem.id}
                onClick={() => void doBuy(confirmItem)}
              >
                {buyingId === confirmItem.id
                  ? '…'
                  : confirmItem.item_type === 'bird'
                    ? 'Add to Tree'
                    : 'Buy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
