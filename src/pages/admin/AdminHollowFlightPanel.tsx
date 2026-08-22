import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const HF_KEYS: { key: string; label: string; section: string }[] = [
  { key: 'hf_enabled', label: 'Enabled', section: 'General' },
  { key: 'hf_title', label: 'Title', section: 'General' },
  { key: 'hf_description', label: 'Description', section: 'General' },
  { key: 'hf_maintenance_message', label: 'Maintenance message', section: 'General' },
  { key: 'hf_game_version', label: 'Game version', section: 'General' },
  { key: 'hf_gravity', label: 'Gravity', section: 'Gameplay' },
  { key: 'hf_flap_strength', label: 'Flap strength', section: 'Gameplay' },
  { key: 'hf_base_speed', label: 'Base speed', section: 'Gameplay' },
  { key: 'hf_start_difficulty', label: 'Starting difficulty', section: 'Gameplay' },
  { key: 'hf_difficulty_interval', label: 'Difficulty interval (score)', section: 'Gameplay' },
  { key: 'hf_difficulty_speed_mult', label: 'Speed mult per difficulty', section: 'Gameplay' },
  { key: 'hf_max_difficulty', label: 'Max difficulty', section: 'Gameplay' },
  { key: 'hf_spawn_interval', label: 'Spawn interval (sec)', section: 'Obstacles' },
  { key: 'hf_gap_min', label: 'Min gap (px)', section: 'Obstacles' },
  { key: 'hf_gap_max', label: 'Max gap (px)', section: 'Obstacles' },
  { key: 'hf_gap_reduce_per_diff', label: 'Gap reduce per difficulty', section: 'Obstacles' },
  { key: 'hf_obstacle_width', label: 'Obstacle width', section: 'Obstacles' },
  { key: 'hf_score_multiplier', label: 'Score → stamp multiplier', section: 'Rewards' },
  { key: 'hf_pickup_stamp_value', label: 'Stamps per pickup', section: 'Rewards' },
  { key: 'hf_rewards_enabled', label: 'Rewards enabled', section: 'Rewards' },
  { key: 'hf_max_reward_per_run', label: 'Max stamps per run (0=off)', section: 'Rewards' },
  { key: 'hf_stat_cap', label: 'Max usable pigeon stat', section: 'Pigeon stats' },
  { key: 'hf_leaderboard_enabled', label: 'Leaderboard enabled', section: 'Leaderboard' },
  { key: 'hf_leaderboard_global', label: 'Global board', section: 'Leaderboard' },
  { key: 'hf_leaderboard_friends', label: 'Friends board', section: 'Leaderboard' },
  { key: 'hf_leaderboard_personal', label: 'Personal history', section: 'Leaderboard' },
  { key: 'hf_asset_background', label: 'Background id (e.g. dusk)', section: 'Assets' },
  { key: 'hf_asset_obstacle', label: 'Obstacle id (e.g. wire)', section: 'Assets' },
  { key: 'hf_asset_pickup', label: 'Pickup id', section: 'Assets' },
  { key: 'hf_max_score_per_second', label: 'Anti-cheat max score/sec', section: 'Security' },
  { key: 'hf_min_run_ms', label: 'Min run ms for reward', section: 'Security' },
];

const sections = ['General', 'Gameplay', 'Obstacles', 'Rewards', 'Pigeon stats', 'Leaderboard', 'Assets', 'Security'];

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
  background: '#3b82f6',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

interface Props {
  flash: (msg: string, isError?: boolean) => void;
}

export default function AdminHollowFlightPanel({ flash }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('system_settings').select('key, value');
    if (error) {
      flash(error.message, true);
      return;
    }
    const map: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: unknown }) => {
      if (!row.key.startsWith('hf_')) return;
      let v = row.value;
      if (typeof v === 'object' && v !== null) {
        try {
          v = JSON.stringify(v);
        } catch {
          v = String(v);
        }
      }
      map[row.key] = String(v ?? '');
    });
    setSettings(map);
  }, [flash]);

  useEffect(() => {
    void load();
  }, [load]);

  const parseValue = (rawIn: string): unknown => {
    const raw = String(rawIn ?? '').trim();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw !== '' && /^-?\d+(\.\d+)?$/.test(raw) && !Number.isNaN(Number(raw))) {
      return Number(raw);
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Must use admin_set_setting RPC — direct upsert on system_settings is blocked by RLS (403).
      for (const { key } of HF_KEYS) {
        if (!(key in settings)) continue;
        const value = parseValue(String(settings[key] ?? ''));
        const { error } = await supabase.rpc('admin_set_setting', {
          p_key: key,
          p_value: value,
        });
        if (error) throw error;
      }
      flash('Hollow Flight settings saved');
      void load();
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : 'Save failed', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Hollow Flight</h1>
      <p style={{ fontSize: 12, color: '#a0a8b8', marginBottom: 12 }}>
        All balancing and economy for the Hollow Flight mini-game. Values are stored in{' '}
        <code>system_settings</code> (hf_* keys).
      </p>

      {sections.map((section) => (
        <div key={section} style={card}>
          <h2 style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>{section}</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {HF_KEYS.filter((k) => k.section === section).map(({ key, label }) => (
              <label key={key} style={{ fontSize: 12, color: '#a0a8b8' }}>
                {label}
                <span style={{ color: '#64748b', marginLeft: 6 }}>{key}</span>
                <input
                  style={inputStyle}
                  value={settings[key] ?? ''}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <button type="button" style={btn} disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save Hollow Flight settings'}
      </button>
    </div>
  );
}
