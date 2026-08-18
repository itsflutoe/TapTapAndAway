import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import {
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Bell,
  UserRound,
  Shield,
  Info,
  LogOut,
  Pencil,
} from 'lucide-react';

interface HistoryItem {
  delivery: Delivery;
  peerName: string;
  isOutgoing: boolean;
}

type SectionId = 'account' | 'notifications' | 'app' | 'history' | 'admin' | 'about';

export default function ProfilePage() {
  const { user, profile, pigeon, signOut, refreshProfile, isAdminMode, setIsAdminMode } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [pigeonName, setPigeonName] = useState(pigeon?.name || '');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [browserPref, setBrowserPref] = useState<NotificationPref>(() => getNotificationPref());
  const [canInstall, setCanInstall] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [openSection, setOpenSection] = useState<SectionId | null>('account');

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
        if (m.sender_id !== user.id) continue;
        if (!['DELIVERED', 'READ', 'FAILED'].includes(d.status)) continue;
        const { data: peer } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', m.receiver_id)
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

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
  }, [profile?.display_name]);

  useEffect(() => {
    setPigeonName(pigeon?.name || '');
  }, [pigeon?.name]);

  if (!profile) return null;

  const save = async () => {
    setSaving(true);
    setMsg('');
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', profile.id);
    if (pigeon && pigeonName !== pigeon.name) {
      await supabase.from('pigeons').update({ name: pigeonName }).eq('id', pigeon.id);
    }
    await refreshProfile();
    setEditing(false);
    setMsg('Saved!');
    setSaving(false);
  };

  const km = Number(pigeon?.total_distance_km ?? 0);
  const toggle = (id: SectionId) => setOpenSection((current) => (current === id ? null : id));

  const sectionStyle: CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
    background: 'var(--card)',
    marginBottom: 10,
  };

  const sectionButtonStyle: CSSProperties = {
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 15px',
    textAlign: 'left',
    cursor: 'pointer',
  };

  const rowStyle: CSSProperties = {
    padding: '0 15px 15px',
  };

  return (
    <div className="page">
      <PageHeader title="⚙️ Settings" />

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

      {msg && (
        <p style={{ textAlign: 'center', margin: '0 0 10px', color: 'var(--success)' }}>{msg}</p>
      )}

      <div style={sectionStyle}>
        <button type="button" style={sectionButtonStyle} onClick={() => toggle('account')}>
          <UserRound size={19} />
          <span style={{ flex: 1 }}>
            <strong>Account & Profile</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Your profile and pigeon details
            </span>
          </span>
          {openSection === 'account' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openSection === 'account' && (
          <div style={rowStyle}>
            {editing ? (
              <div>
                <div className="input-group">
                  <label>Display name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Pigeon name</label>
                  <input value={pigeonName} onChange={(e) => setPigeonName(e.target.value)} />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <p><strong>Address:</strong> {profile.address}</p>
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Location is set at signup and can only be changed by an admin.
                </p>
                <p style={{ marginTop: 8 }}><strong>Pigeon:</strong> {pigeon?.name} ({pigeon?.gender})</p>
                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </p>
                <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => setEditing(true)}>
                  <Pencil size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Edit profile
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionButtonStyle} onClick={() => toggle('notifications')}>
          <Bell size={19} />
          <span style={{ flex: 1 }}>
            <strong>Notifications</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Browser alerts and notification preferences
            </span>
          </span>
          {openSection === 'notifications' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openSection === 'notifications' && (
          <div style={rowStyle}>
            {browserPref === 'unsupported' ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>This browser does not support notifications.</p>
            ) : browserPref === 'enabled' ? (
              <button type="button" className="btn" style={{ width: '100%' }} onClick={() => {
                disableBrowserNotifications();
                setBrowserPref(getNotificationPref());
              }}>
                Turn off browser alerts
              </button>
            ) : browserPref === 'denied' ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Alerts are blocked in browser settings. Change the site permission to allow them again.
              </p>
            ) : (
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={notifBusy} onClick={async () => {
                setNotifBusy(true);
                const pref = await enableBrowserNotifications();
                setBrowserPref(pref);
                setNotifBusy(false);
              }}>
                {notifBusy ? 'Enabling…' : 'Enable browser alerts'}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionButtonStyle} onClick={() => toggle('app')}>
          <Download size={19} />
          <span style={{ flex: 1 }}>
            <strong>App</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Install Tap Tap & Away on your device
            </span>
          </span>
          {openSection === 'app' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openSection === 'app' && (
          <div style={rowStyle}>
            {isStandalone() ? (
              <p style={{ fontSize: 13, color: 'var(--success)' }}>✓ Tap Tap & Away is already installed.</p>
            ) : canInstall ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 10 }}>
                  Install the app for a cleaner, full-screen experience.
                </p>
                <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={installBusy} onClick={async () => {
                  setInstallBusy(true);
                  await promptInstall();
                  setInstallBusy(false);
                }}>
                  {installBusy ? 'Opening install…' : 'Install app'}
                </button>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Your browser does not currently offer automatic installation. On iPhone/iPad, use Share → Add to Home Screen.
              </p>
            )}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <button type="button" style={sectionButtonStyle} onClick={() => toggle('history')}>
          <History size={19} />
          <span style={{ flex: 1 }}>
            <strong>Delivery History</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {history.length} completed trip{history.length === 1 ? '' : 's'}
            </span>
          </span>
          {openSection === 'history' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openSection === 'history' && (
          <div style={rowStyle}>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No completed deliveries yet.</p>
            ) : (
              history.map(({ delivery, peerName }) => (
                <Link key={delivery.id} to={`/delivery/${delivery.id}`} className="card" style={{ display: 'block', marginBottom: 8, textDecoration: 'none', color: 'inherit', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>To {peerName}</strong>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{delivery.distance_km} km</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {delivery.status === 'FAILED' ? 'Failed' : delivery.status === 'READ' ? 'Delivered · Read' : 'Delivered'}
                    {delivery.weather ? ` · ${delivery.weather}` : ''}
                  </p>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {profile.is_admin && !isAdminMode && (
        <div style={sectionStyle}>
          <button type="button" style={sectionButtonStyle} onClick={() => toggle('admin')}>
            <Shield size={19} />
            <span style={{ flex: 1 }}>
              <strong>Administration</strong>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Admin-only tools
              </span>
            </span>
            {openSection === 'admin' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {openSection === 'admin' && (
            <div style={rowStyle}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Open the admin panel from here. Your admin permissions are unchanged.
              </p>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
                setIsAdminMode(true);
                navigate('/admin');
              }}>
                Open Admin Panel
              </button>
            </div>
          )}
        </div>
      )}

      <div style={sectionStyle}>
        <button type="button" style={sectionButtonStyle} onClick={() => toggle('about')}>
          <Info size={19} />
          <span style={{ flex: 1 }}>
            <strong>About</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              App information
            </span>
          </span>
          {openSection === 'about' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openSection === 'about' && (
          <div style={rowStyle}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Tap Tap & Away · Your messages travel by pigeon.
            </p>
          </div>
        )}
      </div>

      <button type="button" className="btn" style={{ width: '100%', marginTop: 18, color: 'var(--danger)', fontWeight: 600 }} onClick={() => void signOut()}>
        <LogOut size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Sign out
      </button>
    </div>
  );
}
