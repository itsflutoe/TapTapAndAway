import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  adminSearchPigeons,
  adminSetPigeonAbilities,
  adminSetPigeonProgression,
  adminUpsertAbilityDef,
  adminUpsertRarity,
  fetchAbilityDefs,
  fetchPigeonRarities,
} from '../../services/pigeon';
import type { Pigeon, PigeonAbilityDef, PigeonRarity } from '../../types';

type SubTab = 'settings' | 'rarities' | 'abilities' | 'stats' | 'exp' | 'manage';

const SUBS: { id: SubTab; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'rarities', label: 'Rarities' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'stats', label: 'Stats' },
  { id: 'exp', label: 'EXP / Level' },
  { id: 'manage', label: 'Manage' },
];

const SETTING_KEYS = [
  'pigeon_max_level',
  'pigeon_exp_base',
  'pigeon_exp_growth',
  'pigeon_exp_per_delivery',
  'pigeon_exp_per_km',
  'pigeon_stat_speed_weight',
  'pigeon_stat_reliability_weight',
  'pigeon_stat_endurance_weight',
] as const;

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
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#3b82f6',
  borderColor: '#3b82f6',
};

interface Props {
  flash: (msg: string, isError?: boolean) => void;
}

export default function AdminPigeonsPanel({ flash }: Props) {
  const [sub, setSub] = useState<SubTab>('settings');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [rarities, setRarities] = useState<PigeonRarity[]>([]);
  const [abilities, setAbilities] = useState<PigeonAbilityDef[]>([]);
  const [pigeons, setPigeons] = useState<Pigeon[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Pigeon | null>(null);
  const [abilityDraft, setAbilityDraft] = useState<{ ability_id: string; ability_level: number }[]>([]);
  const [rarityForm, setRarityForm] = useState({
    key: '', name: '', description: '', color: '#94a3b8', icon: '🐦', ability_limit: 0, stat_potential: 100,
  });
  const [abilityForm, setAbilityForm] = useState({
    id: '', key: '', name: '', description: '', ability_type: 'delivery', effect_key: 'delivery_speed_pct',
    effect_values: '5,8,12', max_level: 3, allowed_rarities: 'epic,legendary,mythical,custom',
    applies_to_delivery: true, applies_to_minigame: false, is_active: true,
  });

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('key, value');
    const map: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: unknown }) => {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      }
    });
    setSettings(map);
  }, []);

  const loadCatalogs = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([fetchPigeonRarities(), fetchAbilityDefs(true)]);
      setRarities(r);
      setAbilities(a);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to load catalogs', true);
    }
  }, [flash]);

  const loadPigeons = useCallback(async () => {
    try {
      setPigeons(await adminSearchPigeons(search));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Search failed', true);
    }
  }, [search, flash]);

  useEffect(() => {
    if (sub === 'settings' || sub === 'stats' || sub === 'exp') void loadSettings();
    if (sub === 'rarities' || sub === 'abilities' || sub === 'manage') void loadCatalogs();
    if (sub === 'manage') void loadPigeons();
  }, [sub, loadSettings, loadCatalogs, loadPigeons]);

  const saveSetting = async (key: string) => {
    let value: unknown = settings[key];
    try { value = JSON.parse(String(settings[key])); } catch { value = settings[key]; }
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) flash(error.message, true);
    else flash('Saved ' + key);
  };

  const saveRarity = async () => {
    try {
      await adminUpsertRarity({
        key: rarityForm.key, name: rarityForm.name, description: rarityForm.description,
        color: rarityForm.color, icon: rarityForm.icon,
        ability_limit: Number(rarityForm.ability_limit) || 0,
        stat_potential: Number(rarityForm.stat_potential) || 100,
      });
      flash('Rarity saved');
      void loadCatalogs();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed', true);
    }
  };

  const saveAbility = async () => {
    try {
      const values = abilityForm.effect_values.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      await adminUpsertAbilityDef({
        id: abilityForm.id || undefined,
        key: abilityForm.key, name: abilityForm.name, description: abilityForm.description,
        ability_type: abilityForm.ability_type, effect_key: abilityForm.effect_key,
        effect_values: values.length ? values : [5, 8, 12],
        max_level: Number(abilityForm.max_level) || 3,
        allowed_rarities: abilityForm.allowed_rarities.split(',').map((s) => s.trim()).filter(Boolean),
        applies_to_delivery: abilityForm.applies_to_delivery,
        applies_to_minigame: abilityForm.applies_to_minigame,
        is_active: abilityForm.is_active,
      });
      flash('Ability saved');
      setAbilityForm((f) => ({ ...f, id: '', key: '', name: '', description: '' }));
      void loadCatalogs();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed', true);
    }
  };

  const openPigeon = async (p: Pigeon) => {
    setSelected(p);
    const { data } = await supabase.from('pigeon_abilities').select('ability_id, ability_level').eq('pigeon_id', p.id);
    setAbilityDraft((data || []).map((r: { ability_id: string; ability_level: number }) => ({
      ability_id: r.ability_id, ability_level: r.ability_level,
    })));
  };

  const savePigeon = async () => {
    if (!selected) return;
    try {
      await adminSetPigeonProgression(selected.id, {
        name: selected.name, rarity: selected.rarity, level: selected.level, exp: selected.exp,
        speed: selected.speed, stamina: selected.stamina, reliability: selected.reliability,
        accuracy: selected.accuracy, endurance: selected.endurance, luck: selected.luck,
        sprite_id: selected.sprite_id || undefined,
      });
      await adminSetPigeonAbilities(selected.id, abilityDraft);
      flash('Pigeon updated');
      void loadPigeons();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Update failed', true);
    }
  };

  const keysForSub =
    sub === 'stats'
      ? (['pigeon_stat_speed_weight', 'pigeon_stat_reliability_weight', 'pigeon_stat_endurance_weight'] as const)
      : sub === 'exp'
        ? (['pigeon_max_level', 'pigeon_exp_base', 'pigeon_exp_growth', 'pigeon_exp_per_delivery', 'pigeon_exp_per_km'] as const)
        : SETTING_KEYS;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>{'🐦'} Pigeons</h1>
      <p style={{ fontSize: 12, color: '#a0a8b8', marginBottom: 12 }}>
        All pigeon gameplay configuration lives here: settings, rarities, abilities, stats, EXP, and individual management.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {SUBS.map((s) => (
          <button key={s.id} type="button" style={{ ...btn, background: sub === s.id ? '#3b82f6' : '#243044', borderColor: sub === s.id ? '#3b82f6' : '#2a2f3a' }} onClick={() => setSub(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {(sub === 'settings' || sub === 'stats' || sub === 'exp') && (
        <div style={card}>
          <h2 style={{ fontSize: 14, marginTop: 0 }}>
            {sub === 'settings' ? 'General pigeon settings' : sub === 'stats' ? 'Stat influence on delivery' : 'EXP / leveling'}
          </h2>
          {keysForSub.map((key) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>{key}</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input style={inputStyle} value={settings[key] ?? ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
                <button type="button" style={btnPrimary} onClick={() => void saveSetting(key)}>Save</button>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: '#64748b', marginBottom: 0 }}>
            Basic and Common always have 0 ability slots (server-enforced). Stat weights are soft factors.
          </p>
        </div>
      )}

      {sub === 'rarities' && (
        <>
          <div style={card}>
            <h2 style={{ fontSize: 14, marginTop: 0 }}>Create / edit rarity</h2>
            {(['key', 'name', 'description', 'color', 'icon'] as const).map((f) => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>{f}</label>
                <input style={inputStyle} value={rarityForm[f]} onChange={(e) => setRarityForm({ ...rarityForm, [f]: e.target.value })} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>ability_limit</label>
                <input style={inputStyle} type="number" value={rarityForm.ability_limit} onChange={(e) => setRarityForm({ ...rarityForm, ability_limit: Number(e.target.value) })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>stat_potential</label>
                <input style={inputStyle} type="number" value={rarityForm.stat_potential} onChange={(e) => setRarityForm({ ...rarityForm, stat_potential: Number(e.target.value) })} />
              </div>
            </div>
            <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={() => void saveRarity()}>Save rarity</button>
          </div>
          {rarities.map((r) => (
            <div key={r.key} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong style={{ color: r.color }}>{r.icon} {r.name}</strong>{' '}
                  <span style={{ color: '#64748b', fontSize: 12 }}>({r.key})</span>
                  <div style={{ fontSize: 12, color: '#a0a8b8' }}>{r.description}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Ability limit: {r.ability_limit} · Potential: {r.stat_potential}</div>
                </div>
                <button type="button" style={btn} onClick={() => setRarityForm({ key: r.key, name: r.name, description: r.description, color: r.color, icon: r.icon, ability_limit: r.ability_limit, stat_potential: r.stat_potential })}>Edit</button>
              </div>
            </div>
          ))}
        </>
      )}

      {sub === 'abilities' && (
        <>
          <div style={card}>
            <h2 style={{ fontSize: 14, marginTop: 0 }}>Create / edit ability</h2>
            {(['key', 'name', 'description', 'ability_type', 'effect_key', 'effect_values', 'allowed_rarities'] as const).map((f) => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: '#a0a8b8' }}>{f}</label>
                <input style={inputStyle} value={String(abilityForm[f])} onChange={(e) => setAbilityForm({ ...abilityForm, [f]: e.target.value })} />
              </div>
            ))}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: '#a0a8b8' }}>max_level</label>
              <input style={inputStyle} type="number" value={abilityForm.max_level} onChange={(e) => setAbilityForm({ ...abilityForm, max_level: Number(e.target.value) })} />
            </div>
            <label style={{ fontSize: 12, display: 'block' }}><input type="checkbox" checked={abilityForm.applies_to_delivery} onChange={(e) => setAbilityForm({ ...abilityForm, applies_to_delivery: e.target.checked })} /> Delivery</label>
            <label style={{ fontSize: 12, display: 'block' }}><input type="checkbox" checked={abilityForm.applies_to_minigame} onChange={(e) => setAbilityForm({ ...abilityForm, applies_to_minigame: e.target.checked })} /> Mini-game</label>
            <label style={{ fontSize: 12, display: 'block' }}><input type="checkbox" checked={abilityForm.is_active} onChange={(e) => setAbilityForm({ ...abilityForm, is_active: e.target.checked })} /> Active</label>
            <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={() => void saveAbility()}>Save ability</button>
          </div>
          {abilities.map((a) => (
            <div key={a.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{a.name}</strong> <span style={{ color: '#64748b', fontSize: 12 }}>({a.key})</span>
                  <div style={{ fontSize: 12, color: '#a0a8b8' }}>{a.description}</div>
                </div>
                <button type="button" style={btn} onClick={() => setAbilityForm({
                  id: a.id, key: a.key, name: a.name, description: a.description, ability_type: a.ability_type,
                  effect_key: a.effect_key, effect_values: (a.effect_values || []).join(','), max_level: a.max_level,
                  allowed_rarities: (a.allowed_rarities || []).join(','), applies_to_delivery: a.applies_to_delivery,
                  applies_to_minigame: a.applies_to_minigame, is_active: a.is_active,
                })}>Edit</button>
              </div>
            </div>
          ))}
        </>
      )}

      {sub === 'manage' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={inputStyle} placeholder="Search name or rarity" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" style={btnPrimary} onClick={() => void loadPigeons()}>Search</button>
          </div>
          {pigeons.map((p) => (
            <div key={p.id} style={{ ...card, cursor: 'pointer' }} onClick={() => void openPigeon(p)}>
              <strong>{p.name}</strong>{' '}
              <span style={{ color: '#64748b', fontSize: 12 }}>{p.rarity} · Lv {p.level ?? 1} · {p.sprite_id ?? ''}</span>
            </div>
          ))}
          {selected && (
            <div style={card}>
              <h2 style={{ fontSize: 14, marginTop: 0 }}>Edit: {selected.name}</h2>
              {(['name', 'rarity', 'sprite_id'] as const).map((f) => (
                <div key={f} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>{f}</label>
                  <input style={inputStyle} value={String(selected[f] ?? '')} onChange={(e) => setSelected({ ...selected, [f]: e.target.value })} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>level</label>
                  <input style={inputStyle} type="number" value={Number(selected.level ?? 1)} onChange={(e) => setSelected({ ...selected, level: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>exp</label>
                  <input style={inputStyle} type="number" value={Number(selected.exp ?? 0)} onChange={(e) => setSelected({ ...selected, exp: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>speed</label>
                  <input style={inputStyle} type="number" value={Number(selected.speed ?? 0)} onChange={(e) => setSelected({ ...selected, speed: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>stamina</label>
                  <input style={inputStyle} type="number" value={Number(selected.stamina ?? 0)} onChange={(e) => setSelected({ ...selected, stamina: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>reliability</label>
                  <input style={inputStyle} type="number" value={Number(selected.reliability ?? 0)} onChange={(e) => setSelected({ ...selected, reliability: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>accuracy</label>
                  <input style={inputStyle} type="number" value={Number(selected.accuracy ?? 0)} onChange={(e) => setSelected({ ...selected, accuracy: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>endurance</label>
                  <input style={inputStyle} type="number" value={Number(selected.endurance ?? 0)} onChange={(e) => setSelected({ ...selected, endurance: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#a0a8b8' }}>luck</label>
                  <input style={inputStyle} type="number" value={Number(selected.luck ?? 0)} onChange={(e) => setSelected({ ...selected, luck: Number(e.target.value) })} />
                </div>
              </div>
              <h3 style={{ fontSize: 13, marginTop: 14 }}>Abilities</h3>
              {abilities.filter((a) => a.is_active).map((a) => {
                const slot = abilityDraft.find((x) => x.ability_id === a.id);
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={!!slot} onChange={(e) => {
                      if (e.target.checked) setAbilityDraft([...abilityDraft, { ability_id: a.id, ability_level: 1 }]);
                      else setAbilityDraft(abilityDraft.filter((x) => x.ability_id !== a.id));
                    }} />
                    <span style={{ flex: 1 }}>{a.name}</span>
                    <input style={{ ...inputStyle, width: 64 }} type="number" min={1} max={a.max_level} disabled={!slot}
                      value={slot?.ability_level ?? 1}
                      onChange={(e) => setAbilityDraft(abilityDraft.map((x) => x.ability_id === a.id ? { ...x, ability_level: Number(e.target.value) || 1 } : x))} />
                  </div>
                );
              })}
              <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={() => void savePigeon()}>Save pigeon</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
