import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import PigeonAvatar from '../components/PigeonAvatar';
import type { Delivery } from '../types';
import {
  disableBrowserNotifications,
  enableBrowserNotifications,
  getNotificationPref,
  type NotificationPref,
} from '../lib/browserNotifications';
import { isStandalone, promptInstall, subscribeInstallAvailability } from '../lib/pwa';

interface HistoryItem {
  delivery: Delivery;
  peerName: string;
  isOutgoing: boolean;
}

export default function ProfilePage() {
  const { user, profile, pigeon, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [pigeonName, setPigeonName] = useState(pigeon?.name || '');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [browserPref, setBrowserPref] = useState<NotificationPref>(() => getNotificationPref());
  const [canInstall, setCanInstall] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => subscribeInstallAvailability(setCanInstall), []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!messages) return;
      const items: HistoryItem[] = [];
      for (const m of messages) {
        const { data: d } = await supabase
          .from('deliveries')
          .select('*')
          .eq('message_id', m.id)
          .maybeSingle();
        if (!d) continue;
        // Pigeon flight history: only trips YOU sent
        if (m.sender_id !== user.id) continue;
        if (!['DELIVERED', 'READ', 'FAILED'].includes(d.status)) continue;
        const peerId = m.receiver_id;
        const { data: peer } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', peerId)
          .maybeSingle();
        items.push({
          delivery: d as Delivery,
          peerName: peer?.display_name || 'Unknown',
          isOutgoing: m.sender_id === user.id,
        });
      }
      setHistory(items);
    })();
  }, [user]);

  if (!profile) return null;

  const save = async () => {
    setSaving(true);
    setMsg('');
    await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', profile.id);
    if (pigeon && pigeonName !== pigeon.name) {
      await supabase.from('pigeons').update({ name: pigeonName }).eq('id', pigeon.id);
    }
    await refreshProfile();
    setEditing(false);
    setMsg('Saved!');
    setSaving(false);
  };

  const km = Number(pigeon?.total_distance_km ?? 0);

  return (
    <div className="page">
      <PageHeader title="👤 Profile" />

      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <PigeonAvatar spriteId={pigeon?.sprite_id} size={88} name={pigeon?.name} />
        </div>
        <h2 style={{ fontSize: 20 }}>{profile.display_name}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>@{profile.username}</p>
        <p style={{ fontFamily: 'monospace', marginTop: 4 }}>{profile.pigeon_id}</p>
        <div className="stamp-badge" style={{ marginTop: 12 }}>
          🪙 {profile.stamp_balance} Stamps
        </div>
        {pigeon && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            {pigeon.name} · {km.toFixed(1)} km · {pigeon.total_flights ?? 0} flights
          </p>
        )}
      </div>

      {editing ? (
        <div className="card">
          <div className="input-group">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Pigeon name</label>
            <input value={pigeonName} onChange={(e) => setPigeonName(e.target.value)} />
          </div>
          {msg && <p className="error-text">{msg}</p>}
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="card">
          <p>
            <strong>Address:</strong> {profile.address}
          </p>
          <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            Location is set at signup and can only be changed by an admin.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Pigeon:</strong> {pigeon?.name} ({pigeon?.gender})
          </p>
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => setEditing(true)}
          >
            Edit profile
          </button>
        </div>
      )}

      {msg && !editing && (
        <p style={{ textAlign: 'center', marginTop: 8, color: 'var(--success)' }}>{msg}</p>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 10px' }}>Delivery history</h2>
      {history.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No completed deliveries yet.</p>
      )}
      {history.map(({ delivery, peerName }) => (
        <Link
          key={delivery.id}
          to={`/delivery/${delivery.id}`}
          className="card"
          style={{ display: 'block', marginBottom: 8, textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>To {peerName}</strong>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{delivery.distance_km} km</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {delivery.status === 'FAILED' ? 'Failed' : delivery.status === 'READ' ? 'Delivered · Read' : 'Delivered'}
            {delivery.weather ? ` · ${delivery.weather}` : ''}
          </p>
        </Link>
      ))}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Device</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.4 }}>
          Browser alerts are optional. Permission is only requested if you turn them on.
        </p>
        {browserPref === 'unsupported' ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>This browser does not support notifications.</p>
        ) : browserPref === 'enabled' ? (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => {
              disableBrowserNotifications();
              setBrowserPref(getNotificationPref());
            }}
          >
            Turn off browser alerts (in-app only)
          </button>
        ) : browserPref === 'denied' ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Alerts blocked in browser settings. Change site permissions to allow them again.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 8 }}
            disabled={notifBusy}
            onClick={async () => {
              setNotifBusy(true);
              const pref = await enableBrowserNotifications();
              setBrowserPref(pref);
              setNotifBusy(false);
            }}
          >
            Enable browser alerts
          </button>
        )}

        {!isStandalone() && canInstall && (
          <button
            type="button"
            className="btn"
            style={{ width: '100%' }}
            onClick={() => void promptInstall()}
          >
            Install app
          </button>
        )}
        {!isStandalone() && !canInstall && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            On iPhone: Share → Add to Home Screen for the app icon.
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 24, color: 'var(--danger)', fontWeight: 600 }}
        onClick={() => signOut()}
      >
        Sign out
      </button>
    </div>
  );
}
