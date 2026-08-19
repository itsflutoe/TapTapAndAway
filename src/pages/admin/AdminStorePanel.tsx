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

const emptyForm = {
  id: '' as string,
  sku: '',
  name: '',
  description: '',
  item_type: 'item',
  bird_rarity: '',
  bird_sprite_id: '',
  bird_stat_template: '',
  price_stamps: 0,
  stock: '' as string | number,
  is_active: true,
  is_featured: false,
  sort_order: 0,
};

interface Props {
  flash: (msg: string, isError?: boolean) => void;
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
    let template: unknown = null;
    if (form.bird_stat_template.trim()) {
      try {
        template = JSON.parse(form.bird_stat_template);
      } catch {
        flash('bird_stat_template must be valid JSON or empty', true);
        return;
      }
    }
    const stockVal =
      form.stock === '' || form.stock === null || form.stock === undefined
        ? null
        : Number(form.stock);

    const { data, error } = await supabase.rpc('admin_upsert_store_item', {
      p_id: form.id || null,
      p_sku: form.sku,
      p_name: form.name,
      p_description: form.description,
      p_item_type: form.item_type,
      p_bird_rarity: form.bird_rarity || null,
      p_bird_sprite_id: form.bird_sprite_id || null,
      p_bird_stat_template: template,
      p_price_stamps: Number(form.price_stamps) || 0,
      p_stock: stockVal,
      p_is_active: form.is_active,
      p_is_featured: form.is_featured,
      p_sort_order: Number(form.sort_order) || 0,
      p_metadata: {},
    });
    if (error) {
      flash(error.message, true);
      return;
    }
    flash(form.id ? 'Item updated' : `Item created (${data})`);
    setForm(emptyForm);
    void load();
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

  const visible = items.filter((i) => filter === 'all' || i.item_type === filter || (filter === 'item' && i.item_type !== 'bird'));

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Store stock</h1>
      <p style={{ fontSize: 12, color: '#a0a8b8', marginBottom: 12 }}>
        Prepare catalog items and bird stock for the player Store. Purchase checkout can be wired
        later; this panel manages inventory and pricing now.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: 14, marginTop: 0 }}>{form.id ? 'Edit item' : 'Add item / bird'}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            SKU
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
          <label style={{ fontSize: 12, color: '#a0a8b8' }}>
            Type
            <select
              style={inputStyle}
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value })}
            >
              <option value="item">item</option>
              <option value="bird">bird</option>
              <option value="cosmetic">cosmetic</option>
              <option value="consumable">consumable</option>
              <option value="bundle">bundle</option>
            </select>
          </label>
          {form.item_type === 'bird' && (
            <>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>
                Bird rarity (e.g. epic, legendary)
                <input
                  style={inputStyle}
                  value={form.bird_rarity}
                  onChange={(e) => setForm({ ...form, bird_rarity: e.target.value })}
                />
              </label>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>
                Bird sprite_id (optional)
                <input
                  style={inputStyle}
                  value={form.bird_sprite_id}
                  onChange={(e) => setForm({ ...form, bird_sprite_id: e.target.value })}
                  placeholder="basic-07"
                />
              </label>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>
                Bird stat template JSON (optional)
                <input
                  style={inputStyle}
                  value={form.bird_stat_template}
                  onChange={(e) => setForm({ ...form, bird_stat_template: e.target.value })}
                  placeholder='{"speed":100,"stamina":60}'
                />
              </label>
            </>
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
              Stock (empty = unlimited)
              <input
                style={inputStyle}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="unlimited"
              />
            </label>
            <label style={{ fontSize: 12, color: '#a0a8b8' }}>
              Sort
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
            Active
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
                Cancel edit
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
                {it.bird_rarity ? ` · rarity ${it.bird_rarity}` : ''}
                {it.bird_sprite_id ? ` · ${it.bird_sprite_id}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                style={btn}
                onClick={() =>
                  setForm({
                    id: it.id,
                    sku: it.sku,
                    name: it.name,
                    description: it.description,
                    item_type: it.item_type,
                    bird_rarity: it.bird_rarity || '',
                    bird_sprite_id: it.bird_sprite_id || '',
                    bird_stat_template: it.bird_stat_template
                      ? JSON.stringify(it.bird_stat_template)
                      : '',
                    price_stamps: it.price_stamps,
                    stock: it.stock === null || it.stock === undefined ? '' : it.stock,
                    is_active: it.is_active,
                    is_featured: it.is_featured,
                    sort_order: it.sort_order,
                  })
                }
              >
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
