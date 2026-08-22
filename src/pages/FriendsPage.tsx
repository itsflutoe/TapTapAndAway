import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Profile, Friendship } from '../types';
import PageHeader from '../components/PageHeader';
import ReportModal from '../components/ReportModal';
import UserAvatar from '../components/UserAvatar';
import { formatPresence } from '../lib/presence';

export default function FriendsPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<(Friendship & { other: Profile })[]>([]);
  const [pending, setPending] = useState<(Friendship & { other: Profile })[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'all' | 'online' | 'requests'>('all');
  const [reportTarget, setReportTarget] = useState<{ id: string; username: string } | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: fs } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (!fs) return;
    const otherIds = [...new Set(fs.map((f) => (f.requester_id === user.id ? f.receiver_id : f.requester_id)))];
    const { data: profiles } = otherIds.length
      ? await supabase.from('profiles').select('*').in('id', otherIds)
      : { data: [] as Profile[] };
    const byId = new Map((profiles || []).map((p) => [p.id, p as Profile]));

    const accepted: typeof friends = [];
    const pend: typeof pending = [];
    for (const f of fs) {
      const otherId = f.requester_id === user.id ? f.receiver_id : f.requester_id;
      const other = byId.get(otherId);
      if (!other) continue;
      const item = { ...f, other } as Friendship & { other: Profile };
      if (f.status === 'accepted') accepted.push(item);
      else if (f.status === 'pending' && f.receiver_id === user.id) pend.push(item);
    }
    setFriends(accepted);
    setPending(pend);
  };

  useEffect(() => { load(); }, [user]);

  const search = async () => {
    if (!query.trim()) return;
    const q = query.trim();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,pigeon_id.ilike.%${q}%`)
      .neq('id', user?.id || '')
      .limit(10);
    setSearchResults((data as Profile[]) || []);
  };

  const sendRequest = async (receiverId: string) => {
    const { error } = await supabase.from('friendships').insert({
      requester_id: user!.id,
      receiver_id: receiverId,
      status: 'pending',
    });
    if (error) setMsg(error.message);
    else {
      setMsg('Friend request sent!');
      setSearchResults([]);
      setQuery('');
    }
  };

  const respond = async (id: string, status: 'accepted' | 'rejected') => {
    await supabase.from('friendships').update({ status }).eq('id', id);
    load();
  };

  const onlineFriends = friends.filter((f) => formatPresence(f.other.last_seen_at).online);
  const shown = tab === 'online' ? onlineFriends : friends;

  return (
    <div className="page">
      <PageHeader title="Friends" />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="input-group" style={{ marginBottom: 8 }}>
          <label>Search by username or Pigeon ID</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kai or PID-…" />
        </div>
        <button className="btn btn-primary" onClick={search}>Search</button>
        {msg && <p style={{ marginTop: 8, fontSize: 14, color: 'var(--accent)' }}>{msg}</p>}
        {searchResults.map((p) => (
          <div key={p.id} className="list-row" style={{ marginTop: 10, boxShadow: 'none', padding: '10px 0' }}>
            <UserAvatar name={p.display_name} src={p.avatar_url} size={40} />
            <div style={{ flex: 1 }}>
              <strong>{p.display_name}</strong>
              <div className="caption">@{p.username} · {p.pigeon_id}</div>
            </div>
            <button className="btn btn-secondary" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => sendRequest(p.id)}>
              Add
            </button>
          </div>
        ))}
      </div>

      <div className="segmented">
        <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button>
        <button type="button" className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Online</button>
        <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          Requests{pending.length ? ` (${pending.length})` : ''}
        </button>
      </div>

      {tab === 'requests' && (
        <>
          {pending.length === 0 && <p className="muted">No pending requests.</p>}
          {pending.map((f) => (
            <div key={f.id} className="list-row">
              <UserAvatar name={f.other.display_name} src={f.other.avatar_url} size={44} />
              <div style={{ flex: 1 }}>
                <strong>{f.other.display_name}</strong>
                <div className="caption">@{f.other.username}</div>
              </div>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 10px' }} onClick={() => respond(f.id, 'accepted')}>Accept</button>
            </div>
          ))}
        </>
      )}

      {tab !== 'requests' && (
        <>
          {shown.length === 0 && <p className="muted">{tab === 'online' ? 'Nobody is online right now.' : 'No friends yet. Search above to add someone.'}</p>}
          {shown.map((f) => {
            const presence = formatPresence(f.other.last_seen_at);
            return (
              <div key={f.id} style={{ marginBottom: 8 }}>
                <Link to={`/friend/${f.other.id}`} className="list-row">
                  <UserAvatar name={f.other.display_name} src={f.other.avatar_url} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{f.other.display_name}</strong>
                    <div className="caption">@{f.other.username}</div>
                    <div className="caption" style={{ color: presence.online ? '#16a34a' : undefined }}>
                      {presence.label}
                    </div>
                  </div>
                  <span className={`online-dot ${presence.online ? '' : 'off'}`} />
                </Link>
                <button
                  type="button"
                  className="caption"
                  style={{ marginLeft: 8 }}
                  onClick={() => setReportTarget({ id: f.other.id, username: f.other.username })}
                >
                  Report
                </button>
              </div>
            );
          })}
        </>
      )}

      {reportTarget && (
        <ReportModal
          reportedUserId={reportTarget.id}
          reportedUsername={reportTarget.username}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
