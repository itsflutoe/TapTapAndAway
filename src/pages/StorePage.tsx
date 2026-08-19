import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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
}

export default function StorePage() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('store_items')
        .select(
          'id, sku, name, description, item_type, bird_rarity, bird_sprite_id, price_stamps, stock, is_featured'
        )
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      setCatalog((data as CatalogItem[]) || []);
    })();
  }, []);

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

  return (
    <div className="page">
      <PageHeader title="Store" />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Redeem code</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Enter a code from an event or admin to receive Stamps.
        </p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          Balance: <strong>{profile?.stamp_balance ?? 0} Stamps</strong>
        </p>
        <form onSubmit={redeem}>
          <div className="input-group">
            <label htmlFor="redeem-code">Code</label>
            <input
              id="redeem-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              autoCapitalize="characters"
            />
          </div>
          {err && <p className="error-text">{err}</p>}
          {msg && (
            <p style={{ color: 'var(--success)', fontSize: 14, marginBottom: 8 }}>{msg}</p>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Redeeming…' : 'Redeem'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Catalog</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Items and birds listed by admin. Purchase checkout coming soon — stock is managed in
          Admin → Store.
        </p>
        {catalog.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            No items listed yet.
          </p>
        )}
        {catalog.map((it) => {
          const soldOut = it.stock !== null && it.stock <= 0;
          return (
            <div
              key={it.id}
              style={{
                border: '1px solid var(--border, #2a2f3a)',
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
                opacity: soldOut ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong>
                    {it.item_type === 'bird' ? '🐦 ' : '📦 '}
                    {it.name}
                  </strong>
                  {it.is_featured && (
                    <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--primary, #3b82f6)' }}>
                      Featured
                    </span>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    {it.description || it.sku}
                    {it.bird_rarity ? ` · ${it.bird_rarity}` : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{it.price_stamps} 🪙</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {soldOut
                      ? 'Sold out'
                      : it.stock === null
                        ? 'In stock'
                        : `${it.stock} left`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 10 }}
                disabled
                title="Checkout coming soon"
              >
                Buy (soon)
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
