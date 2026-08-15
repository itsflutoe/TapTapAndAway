import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Profile, Friendship } from '../types';

export default function FriendsPage() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<(Friendship & { other: Profile })[]>([]);
  const [pending, setPending] = useState<(Friendship & { other: Profile })[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!user) return;
    const { data: fs } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (!fs) return;
    const accepted: typeof friends = [];
    const pend: typeof pending = [];

    for (const f of fs) {
      const otherId = f.requester_id === user.id ? f.receiver_id : f.requester_id;
      const { data: other } = await supabase.from('profiles').select('*').eq('id', otherId).single();
      if (!other) continue;
      const item = { ...f, other: other as Profile } as Friendship & { other: Profile };
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

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>👥 Friends</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="input-group" style={{ marginBottom: 8 }}>
          <label>Search by username or Pigeon ID</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kai or PID-…" />
        </div>
        <button className="btn btn-primary" onClick={search}>Search</button>
        {msg && <p style={{ marginTop: 8, fontSize: 14, color: 'var(--accent)' }}>{msg}</p>}
        {searchResults.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div>
              <strong>{p.display_name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{p.username} · {p.pigeon_id}</div>
            </div>
            <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => sendRequest(p.id)}>
              Add
            </button>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Requests</h2>
          {pending.map((f) => (
            <div key={f.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{f.other.display_name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{f.other.username}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: '8px 12px' }} onClick={() => respond(f.id, 'accepted')}>Accept</button>
                <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => respond(f.id, 'rejected')}>Reject</button>
              </div>
            </div>
          ))}
        </>
      )}

      <h2 style={{ fontSize: 16, margin: '16px 0 8px' }}>Your friends ({friends.length})</h2>
      {friends.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No friends yet. Search above to add someone.</p>}
      {friends.map((f) => (
        <div key={f.id} className="card" style={{ marginBottom: 8 }}>
          <strong>{f.other.display_name}</strong>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            @{f.other.username} · {f.other.pigeon_id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {f.other.address}
          </div>
        </div>
      ))}
    </div>
  );
}
