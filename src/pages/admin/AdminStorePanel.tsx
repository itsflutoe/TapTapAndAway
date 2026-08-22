import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface StoreItemRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  item_type: string;
  bird_rarity: string | null;
  bird_sprite_id: string | null;
  bird_stat_template: Record<string, unknown> | null;
  price_stamps: number;
  stock: number | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  randomize_stats?: boolean;
}

const card: React.CSSProperties = {
  background: '#1a1f29',
  border: '1px solid #2a2f3a',
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #2a2f3a',
  background: '#12161e',
  color: '#e2e8f0',
  fontSize: 13,
};
const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #2a2f3a',
  background: '#243044',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 13,
};
const btnPrimary: React.CSSProperties = { ...btn, background: '#3b82f6', borderColor: '#3b82f6' };
const btnDanger: React.CSSProperties = { ...btn, background: '#7f1d1d', borderColor: '#7f1d1d' };

const RARITY_OPTIONS = ['basic', 'common', 'epic', 'legendary', 'mythical', 'custom'];

const emptyForm = {
  id: '' as string,
  sku: '',
  name: '',
  description: '',
  item_type: 'item',
  bird_rarity: 'epic',
  bird_sprite_id: '',
  price_stamps: 10,
  stock: '5' as string,
  is_active: true,
  is_featured: false,
  sort_order: 0,
  // optional preset stats for bird stock (simple numbers, not JSON)
  randomize_stats: true,
  use_stats: false,
  speed: 100,
  stamina: 50,
  reliability: 95,
  accuracy: 50,
  endurance: 50,
  luck: 50,
};

interface Props {
  flash: (msg: string, isError?: boolean) => void;
}

function numFromTemplate(t: Record<string, unknown> | null | undefined, key: string, fallback: number): number {
  if (!t || t[key] == null) return fallback;
  const n = Number(t[key]);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminStorePanel({ flash }: Props) {
  const [items, setItems] = useState<StoreItemRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<'all' | 'item' | 'bird'>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('store_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      flash(error.message, true);
      return;
    }
    setItems((data || []) as StoreItemRow[]);
  }, [flash]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      flash('SKU and name are required', true);
      return;
    }
    const stockVal =
      form.stock === '' || form.stock === null || form.stock === undefined
        ? null
        : Number(form.stock);

    let template: Record<string, number> | null = null;
    if (form.item_type === 'bird' && form.use_stats && !form.randomize_stats) {
      template = {
        speed: Number(form.speed) || 0,
        stamina: Number(form.stamina) || 0,
        reliability: Number(form.reliability) || 0,
        accuracy: Number(form.accuracy) || 0,
        endurance: Number(form.endurance) || 0,
        luck: Number(form.luck) || 0,
      };
    }

    const { data, error } = await supabase.rpc('admin_upsert_store_item', {
      p_id: form.id || null,
      p_sku: form.sku,
      p_name: form.name,
      p_description: form.description,
      p_item_type: form.item_type,
      p_bird_rarity: form.item_type === 'bird' ? form.bird_rarity || null : null,
      p_bird_sprite_id: form.item_type === 'bird' ? form.bird_sprite_id || null : null,
      p_bird_stat_template: template,
      p_price_stamps: Number(form.price_stamps) || 0,
      p_stock: Number.isFinite(stockVal as number) ? stockVal : null,
      p_is_active: form.is_active,
      p_is_featured: form.is_featured,
      p_sort_order: Number(form.sort_order) || 0,
      p_metadata: {},
      p_randomize_stats: form.item_type === 'bird' ? form.randomize_stats : false,
    });
    if (error) {
      flash(error.message, true);
      return;
    }
    flash(form.id ? 'Item updated' : `Item created`);
    setForm(emptyForm);
    void load();
    void data;
  };

  const adjustStock = async (id: string, delta: number) => {
    const { error } = await supabase.rpc('admin_adjust_store_stock', {
      p_id: id,
      p_delta: delta,
    });
    if (error) flash(error.message, true);
    else {
      flash(delta > 0 ? 'Stock +1' : 'Stock -1');
      void load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this store item?')) return;
    const { error } = await supabase.rpc('admin_delete_store_item', { p_id: id });
    if (error) flash(error.message, true);
    else {
      flash('Deleted');
      void load();
    }
  };

  const loadIntoForm = (it: StoreItemRow) => {
    const t = it.bird_stat_template;
    const hasStats = !!(t && typeof t === 'object' && Object.keys(t).length > 0);
    setForm({
      id: it.id,
      sku: it.sku,
      name: it.name,
      description: it.description,
      item_type: it.item_type,
      bird_rarity: it.bird_rarity || 'epic',
      bird_sprite_id: it.bird_sprite_id || '',
      price_stamps: it.price_stamps,
      stock: it.stock === null || it.stock === undefined ? '' : String(it.stock),
      is_active: it.is_active,
      is_featured: it.is_featured,
      sort_order: it.sort_order,
      randomize_stats: !!(it as StoreItemRow & { randomize_stats?: boolean }).randomize_stats,
      use_stats: hasStats && !(it as StoreItemRow & { randomize_stats?: boolean }).randomize_stats,
      speed: numFromTemplate(t, 'speed', 100),
      stamina: numFromTemplate(t, 'stamina', 50),
      reliability: numFromTemplate(t, 'reliability', 95),
      accuracy: numFromTemplate(t, 'accuracy', 50),
      endurance: numFromTemplate(t, 'endurance', 50),
      luck: numFromTemplate(t, 'luck', 50),
    });
  };

  const visible = items.filter(
    (i) =>
      filter === 'all' ||
      i.item_type === filter ||
      (filter === 'item' && i.item_type !== 'bird')
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Store stock</h1>
      <p style={{ fontSize: 12, color: '#a0a8b8', marginBottom: 12 }}>
        Add items or birds with simple fields. No JSON required. Purchase checkout can be wired later.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: 14, marginTop: 0 }}>{form.id ? 'Edit item' : 'Add item / bird'}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            Type
            <select
              style={inputStyle}
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value })}
            >
              <option value="item">Item</option>
              <option value="bird">Bird</option>
              <option value="cosmetic">Cosmetic</option>
              <option value="consumable">Consumable</option>
              <option value="bundle">Bundle</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            SKU (unique code)
            <input
              style={inputStyle}
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="epic-swift-01"
            />
          </label>
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            Name
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Swift Epic Pigeon"
            />
          </label>
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            Description
            <input
              style={inputStyle}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {form.item_type === 'bird' && (
            <div
              style={{
                border: '1px solid #2a2f3a',
                borderRadius: 10,
                padding: 10,
                background: '#12161e',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Bird options</div>
              <label style={{ fontSize: 12, color: '#a0a8b8', display: 'block', marginBottom: 8 }}>
                Rarity
                <select
                  style={inputStyle}
                  value={form.bird_rarity}
                  onChange={(e) => setForm({ ...form, bird_rarity: e.target.value })}
                >
                  {RARITY_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: '#a0a8b8', display: 'block', marginBottom: 8 }}>
                Sprite id (optional)
                <input
                  style={inputStyle}
                  value={form.bird_sprite_id}
                  onChange={(e) => setForm({ ...form, bird_sprite_id: e.target.value })}
                  placeholder="basic-07"
                />
              </label>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={form.randomize_stats}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      randomize_stats: e.target.checked,
                      use_stats: e.target.checked ? false : form.use_stats,
                    })
                  }
                />{' '}
                Randomize stats on purchase (ranges by rarity tier)
              </label>
              {form.randomize_stats && (
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                  Each buy rolls stats for this rarity (Basic → Mythical). No fixed numbers needed.
                </p>
              )}
              <label style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={form.use_stats}
                  disabled={form.randomize_stats}
                  onChange={(e) => setForm({ ...form, use_stats: e.target.checked })}
                />{' '}
                Use fixed preset stats instead
              </label>
              {form.use_stats && !form.randomize_stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(
                    [
                      ['speed', 'speed'],
                      ['stamina', 'stamina'],
                      ['reliability', 'reliability'],
                      ['accuracy', 'accuracy'],
                      ['endurance', 'endurance'],
                      ['luck', 'luck'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} style={{ fontSize: 12, color: '#a0a8b8' }}>
                      {label}
                      <input
                        style={inputStyle}
                        type="number"
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#a0a8b8' }}>
              Price (stamps)
              <input
                style={inputStyle}
                type="number"
                value={form.price_stamps}
                onChange={(e) => setForm({ ...form, price_stamps: Number(e.target.value) })}
              />
            </label>
            <label style={{ fontSize: 12, color: '#a0a8b8' }}>
              Stock (blank = ∞)
              <input
                style={inputStyle}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="unlimited"
              />
            </label>
            <label style={{ fontSize: 12, color: '#a0a8b8' }}>
              Sort order
              <input
                style={inputStyle}
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </label>
          </div>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />{' '}
            Active (visible in store)
          </label>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
            />{' '}
            Featured
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btnPrimary} onClick={() => void save()}>
              {form.id ? 'Save changes' : 'Add to stock'}
            </button>
            {form.id && (
              <button type="button" style={btn} onClick={() => setForm(emptyForm)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'bird', 'item'] as const).map((f) => (
          <button
            key={f}
            type="button"
            style={{
              ...btn,
              background: filter === f ? '#3b82f6' : '#243044',
              borderColor: filter === f ? '#3b82f6' : '#2a2f3a',
            }}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <button type="button" style={btn} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {visible.map((it) => (
        <div key={it.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <strong>
                {it.item_type === 'bird' ? '🐦 ' : '📦 '}
                {it.name}
              </strong>{' '}
              <span style={{ color: '#64748b', fontSize: 12 }}>
                {it.sku} · {it.item_type}
                {!it.is_active ? ' · inactive' : ''}
                {it.is_featured ? ' · featured' : ''}
              </span>
              <div style={{ fontSize: 12, color: '#a0a8b8', marginTop: 4 }}>{it.description}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                🪙 {it.price_stamps} · Stock:{' '}
                {it.stock === null || it.stock === undefined ? '∞' : it.stock}
                {it.bird_rarity ? ` · ${it.bird_rarity}` : ''}
                {it.randomize_stats ? ' · random stats' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button type="button" style={btn} onClick={() => loadIntoForm(it)}>
                Edit
              </button>
              {it.stock !== null && it.stock !== undefined && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={btn} onClick={() => void adjustStock(it.id, 1)}>
                    +1
                  </button>
                  <button type="button" style={btn} onClick={() => void adjustStock(it.id, -1)}>
                    -1
                  </button>
                </div>
              )}
              <button type="button" style={btnDanger} onClick={() => void remove(it.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <p style={{ color: '#64748b', fontSize: 13 }}>No stock yet. Add an item or bird above.</p>
      )}
    </div>
  );
}
