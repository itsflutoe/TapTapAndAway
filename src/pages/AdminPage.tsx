import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Profile, Delivery } from '../types';

type Tab = 'dashboard' | 'users' | 'deliveries' | 'codes' | 'settings';

interface RedeemCode {
  id: string;
  code: string;
  stamp_amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminPage() {
  const { profile, setIsAdminMode, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState({
    users: 0,
    messages: 0,
    flying: 0,
    delivered: 0,
    failed: 0,
    stamps: 0,
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [deliveries, setDeliveries] = useState<(Delivery & { sender?: string; receiver?: string })[]>([]);
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [newCode, setNewCode] = useState({ code: '', amount: 10, maxUses: '', expires: '' });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const flash = (m: string, isErr = false) => {
    setMsg(isErr ? '' : m);
    setErr(isErr ? m : '');
    setTimeout(() => {
      setMsg('');
      setErr('');
    }, 3500);
  };

  const loadStats = useCallback(async () => {
    const { count: users } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: messages } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: flying } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DISPATCHED', 'FLYING']);
    const { count: delivered } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DELIVERED', 'READ']);
    const { count: failed } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'FAILED');
    const { data: balances } = await supabase.from('profiles').select('stamp_balance');
    const stamps = (balances || []).reduce((s, row) => s + (row.stamp_balance || 0), 0);
    setStats({
      users: users || 0,
      messages: messages || 0,
      flying: flying || 0,
      delivered: delivered || 0,
      failed: failed || 0,
      stamps,
    });
  }, []);

  const loadUsers = useCallback(async () => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
    if (userQuery.trim()) {
      const t = userQuery.trim();
      q = supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${t}%,display_name.ilike.%${t}%,pigeon_id.ilike.%${t}%`)
        .limit(50);
    }
    const { data } = await q;
    setUsers((data as Profile[]) || []);
  }, [userQuery]);

  const loadDeliveries = useCallback(async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    if (!data) {
      setDeliveries([]);
      return;
    }
    const rows: (Delivery & { sender?: string; receiver?: string })[] = [];
    for (const d of data as Delivery[]) {
      const { data: m } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .eq('id', d.message_id)
        .maybeSingle();
      let sender = '';
      let receiver = '';
      if (m) {
        const { data: s } = await supabase.from('profiles').select('username').eq('id', m.sender_id).maybeSingle();
        const { data: r } = await supabase.from('profiles').select('username').eq('id', m.receiver_id).maybeSingle();
        sender = s?.username || '';
        receiver = r?.username || '';
      }
      rows.push({ ...d, sender, receiver });
    }
    setDeliveries(rows);
  }, []);

  const loadCodes = useCallback(async () => {
    const { data } = await supabase
      .from('redeem_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setCodes((data as RedeemCode[]) || []);
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('key, value');
    const map: Record<string, string> = {};
    (data || []).forEach((row: { key: string; value: unknown }) => {
      map[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    });
    setSettings(map);
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') void loadStats();
    if (tab === 'users') void loadUsers();
    if (tab === 'deliveries') void loadDeliveries();
    if (tab === 'codes') void loadCodes();
    if (tab === 'settings') void loadSettings();
  }, [tab, loadStats, loadUsers, loadDeliveries, loadCodes, loadSettings]);

  if (!profile?.is_admin) {
    return (
      <div style={{ padding: 24 }}>
        <p>Access denied.</p>
      </div>
    );
  }

  const ban = async (id: string, banned: boolean) => {
    const { error } = await supabase.rpc('admin_set_banned', { p_user_id: id, p_banned: banned });
    if (error) flash(error.message, true);
    else {
      flash(banned ? 'User banned' : 'User unbanned');
      void loadUsers();
    }
  };

  const adjustStamps = async (id: string, delta: number) => {
    const { error } = await supabase.rpc('admin_adjust_stamps', {
      p_user_id: id,
      p_delta: delta,
      p_description: `Admin ${delta > 0 ? 'added' : 'removed'} stamps`,
    });
    if (error) flash(error.message, true);
    else {
      flash(`Stamps adjusted by ${delta}`);
      void loadUsers();
      void loadStats();
    }
  };

  const forceDeliver = async (id: string) => {
    const { error } = await supabase.rpc('admin_force_deliver', { p_delivery_id: id });
    if (error) flash(error.message, true);
    else {
      flash('Delivery forced');
      void loadDeliveries();
      void loadStats();
    }
  };

  const cancelDelivery = async (id: string) => {
    const { error } = await supabase.rpc('admin_cancel_delivery', {
      p_delivery_id: id,
      p_refund: true,
    });
    if (error) flash(error.message, true);
    else {
      flash('Delivery cancelled + refunded');
      void loadDeliveries();
      void loadStats();
    }
  };

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('admin_create_redeem_code', {
      p_code: newCode.code.trim(),
      p_stamp_amount: Number(newCode.amount),
      p_max_uses: newCode.maxUses ? Number(newCode.maxUses) : null,
      p_expires_at: newCode.expires ? new Date(newCode.expires).toISOString() : null,
    });
    if (error) flash(error.message, true);
    else {
      flash('Code created');
      setNewCode({ code: '', amount: 10, maxUses: '', expires: '' });
      void loadCodes();
    }
  };

  const toggleCode = async (c: RedeemCode) => {
    const { error } = await supabase
      .from('redeem_codes')
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (error) flash(error.message, true);
    else {
      flash(c.is_active ? 'Code disabled' : 'Code enabled');
      void loadCodes();
    }
  };

  const saveSetting = async (key: string) => {
    let value: unknown = settings[key];
    try {
      value = JSON.parse(settings[key]);
    } catch {
      value = settings[key];
    }
    const { error } = await supabase.rpc('admin_set_setting', {
      p_key: key,
      p_value: value,
    });
    if (error) flash(error.message, true);
    else flash(`Saved ${key}`);
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 13,
        background: tab === id ? '#0071e3' : '#eee',
        color: tab === id ? '#fff' : '#333',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, paddingBottom: 40 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Admin Panel</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            onClick={() => setIsAdminMode(false)}
          >
            Enter User Mode
          </button>
          <button
            type="button"
            className="btn"
            style={{ padding: '8px 12px', color: 'var(--danger)' }}
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabBtn('dashboard', 'Dashboard')}
        {tabBtn('users', 'Users')}
        {tabBtn('deliveries', 'Deliveries')}
        {tabBtn('codes', 'Redeem codes')}
        {tabBtn('settings', 'Settings')}
      </div>

      {(msg || err) && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            background: err ? '#fff5f5' : '#e8f8ee',
            color: err ? 'var(--danger)' : '#1a7f37',
            fontSize: 14,
          }}
        >
          {err || msg}
        </div>
      )}

      {tab === 'dashboard' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Messages" value={stats.messages} />
          <StatCard label="Flying" value={stats.flying} />
          <StatCard label="Delivered" value={stats.delivered} />
          <StatCard label="Failed" value={stats.failed} />
          <StatCard label="Stamps in circ." value={stats.stamps} />
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search username, display name, PID"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '10px 16px' }}
              onClick={() => void loadUsers()}
            >
              Search
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {users.map((u) => (
              <div key={u.id} className="card" style={{ fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{u.display_name}</strong> @{u.username}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {u.pigeon_id} · 🪙 {u.stamp_balance}
                      {u.is_banned ? ' · BANNED' : ''}
                      {u.is_admin ? ' · ADMIN' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.address}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', width: 'auto' }}
                      onClick={() => void adjustStamps(u.id, 10)}
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', width: 'auto' }}
                      onClick={() => void adjustStamps(u.id, -10)}
                    >
                      −10
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', width: 'auto' }}
                      onClick={() => void ban(u.id, !u.is_banned)}
                    >
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'deliveries' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {deliveries.map((d) => (
            <div key={d.id} className="card" style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>
                {d.sender} → {d.receiver} · {d.status}
              </div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                {d.distance_km} km · {d.weather} · {d.estimated_duration_seconds}s
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {d.status !== 'DELIVERED' && d.status !== 'READ' && d.status !== 'FAILED' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '6px 10px', width: 'auto' }}
                    onClick={() => void forceDeliver(d.id)}
                  >
                    Force deliver
                  </button>
                )}
                {d.status !== 'FAILED' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', width: 'auto' }}
                    onClick={() => void cancelDelivery(d.id)}
                  >
                    Cancel + refund
                  </button>
                )}
              </div>
            </div>
          ))}
          {deliveries.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>No deliveries yet.</p>
          )}
        </div>
      )}

      {tab === 'codes' && (
        <div>
          <form onSubmit={(e) => void createCode(e)} className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>Create redeem code</h2>
            <div className="input-group">
              <label>Code</label>
              <input
                value={newCode.code}
                onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                required
                placeholder="WELCOME10"
              />
            </div>
            <div className="input-group">
              <label>Stamp amount</label>
              <input
                type="number"
                min={1}
                value={newCode.amount}
                onChange={(e) => setNewCode({ ...newCode, amount: Number(e.target.value) })}
                required
              />
            </div>
            <div className="input-group">
              <label>Max uses (empty = unlimited)</label>
              <input
                type="number"
                min={1}
                value={newCode.maxUses}
                onChange={(e) => setNewCode({ ...newCode, maxUses: e.target.value })}
                placeholder="Unlimited"
              />
            </div>
            <div className="input-group">
              <label>Expires (optional)</label>
              <input
                type="datetime-local"
                value={newCode.expires}
                onChange={(e) => setNewCode({ ...newCode, expires: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Create code
            </button>
          </form>

          {codes.map((c) => (
            <div key={c.id} className="card" style={{ marginBottom: 8, fontSize: 14 }}>
              <strong style={{ fontFamily: 'monospace' }}>{c.code}</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                +{c.stamp_amount} stamps · used {c.used_count}
                {c.max_uses != null ? `/${c.max_uses}` : ''}
                {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleString()}` : ''}
                {c.is_active ? '' : ' · INACTIVE'}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 8, padding: '6px 12px', width: 'auto' }}
                onClick={() => void toggleCode(c)}
              >
                {c.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>System settings</h2>
          {['time_multiplier', 'failure_probability', 'daily_stamp_reward', 'pigeon_base_speed_mph', 'signup_stamp_bonus'].map(
            (key) => (
              <div key={key} className="input-group">
                <label>{key}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={settings[key] ?? ''}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '10px 14px' }}
                    onClick={() => void saveSetting(key)}
                  >
                    Save
                  </button>
                </div>
              </div>
            )
          )}
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            time_multiplier: 3600 = fast testing. Set to 1 for real time.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
}
