import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/geo';

export default function ProfilePage() {
  const { profile, pigeon, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [pigeonName, setPigeonName] = useState(pigeon?.name || '');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const save = async () => {
    setSaving(true);
    setMsg('');
    let lat = profile.latitude;
    let lng = profile.longitude;
    if (address !== profile.address) {
      const geo = await geocodeAddress(address);
      if (!geo) {
        setMsg('Could not geocode the new address.');
        setSaving(false);
        return;
      }
      lat = geo.lat;
      lng = geo.lon;
    }
    await supabase
      .from('profiles')
      .update({ display_name: displayName, address, latitude: lat, longitude: lng })
      .eq('id', profile.id);
    if (pigeon && pigeonName !== pigeon.name) {
      await supabase.from('pigeons').update({ name: pigeonName }).eq('id', pigeon.id);
    }
    await refreshProfile();
    setEditing(false);
    setMsg('Saved!');
    setSaving(false);
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>👤 Profile</h1>

      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🐦</div>
        <h2 style={{ fontSize: 20 }}>{profile.display_name}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>@{profile.username}</p>
        <p style={{ fontFamily: 'monospace', marginTop: 4 }}>{profile.pigeon_id}</p>
        <div className="stamp-badge" style={{ marginTop: 12 }}>🪙 {profile.stamp_balance} Stamps</div>
      </div>

      {editing ? (
        <div className="card">
          <div className="input-group">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Pigeon name</label>
            <input value={pigeonName} onChange={(e) => setPigeonName(e.target.value)} />
          </div>
          {msg && <p className="error-text">{msg}</p>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="card">
          <p><strong>Address:</strong> {profile.address}</p>
          <p style={{ marginTop: 8 }}><strong>Pigeon:</strong> {pigeon?.name} ({pigeon?.gender})</p>
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            Joined {new Date(profile.created_at).toLocaleDateString()}
          </p>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }} onClick={() => setEditing(true)}>
            Edit profile
          </button>
        </div>
      )}

      {msg && !editing && <p style={{ textAlign: 'center', marginTop: 8, color: 'var(--success)' }}>{msg}</p>}

      <button
        className="btn"
        style={{ width: '100%', marginTop: 24, color: 'var(--danger)', fontWeight: 600 }}
        onClick={() => signOut()}
      >
        Sign out
      </button>
    </div>
  );
}
