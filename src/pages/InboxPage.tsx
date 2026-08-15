import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Delivery, Profile } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface InboxItem {
  message: Message;
  delivery: Delivery | null;
  other: Profile | null;
}

export default function InboxPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!messages) {
      setLoading(false);
      return;
    }

    const enriched: InboxItem[] = [];
    for (const m of messages) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const { data: other } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherId)
        .single();
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('*')
        .eq('message_id', m.id)
        .maybeSingle();
      enriched.push({
        message: m as Message,
        delivery: delivery as Delivery | null,
        other: other as Profile | null,
      });
    }
    setItems(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel('inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries' },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const statusLabel = (d: Delivery | null) => {
    if (!d) return '…';
    if (d.status === 'FLYING' || d.status === 'DISPATCHED') return '🐦 Flying…';
    if (d.status === 'DELIVERED' || d.status === 'READ') return '🐦 Delivered';
    if (d.status === 'FAILED') return '❌ Failed';
    return d.status;
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>📬 Inbox</h1>
      {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-secondary)' }}>No messages yet. Send a pigeon!</p>
          <Link to="/send" className="btn btn-primary" style={{ marginTop: 16 }}>Send</Link>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(({ message, delivery, other }) => {
          const isUnread = message.receiver_id === user?.id && !message.read_at;
          const isSender = message.sender_id === user?.id;
          return (
            <Link
              key={message.id}
              to={delivery ? `/delivery/${delivery.id}` : '#'}
              className="card"
              style={{
                display: 'block',
                borderLeft: isUnread ? '4px solid var(--accent)' : undefined,
                background: isUnread ? '#f0f7ff' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>{other?.display_name || 'Unknown'}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                </span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isSender ? 'You: ' : ''}{message.content}
              </p>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {statusLabel(delivery)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
