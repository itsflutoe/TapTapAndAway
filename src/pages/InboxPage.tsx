import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Delivery, Profile } from '../types';
import { formatDistanceToNow } from 'date-fns';
import PageHeader from '../components/PageHeader';

interface InboxItem {
  message: Message;
  delivery: Delivery | null;
  other: Profile | null;
}

/** Receiver may only see a message after the pigeon has arrived. */
const RECEIVER_VISIBLE_STATUSES = new Set(['DELIVERED', 'READ']);

/** Sender always sees their own outbox (flying / failed / delivered). */
function isVisibleToUser(
  message: Message,
  delivery: Delivery | null,
  userId: string
): boolean {
  const isSender = message.sender_id === userId;
  if (isSender) return true;

  // Recipient: hide until delivered (FAILED = message never arrives)
  if (!delivery) return false;
  return RECEIVER_VISIBLE_STATUSES.has(delivery.status);
}

export default function InboxPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!messages) {
      setItems([]);
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

      const item: InboxItem = {
        message: m as Message,
        delivery: (delivery as Delivery | null) ?? null,
        other: (other as Profile | null) ?? null,
      };

      if (isVisibleToUser(item.message, item.delivery, user.id)) {
        enriched.push(item);
      }
    }

    setItems(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;

    const channel = supabase
      .channel(`inbox-${user.id}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const statusLabel = (d: Delivery | null, isSender: boolean) => {
    if (!d) return isSender ? '…' : '';
    if (d.status === 'FLYING' || d.status === 'DISPATCHED' || d.status === 'PREPARING') {
      return '🐦 Flying…';
    }
    if (d.status === 'ARRIVED') return '🐦 Arrived';
    if (d.status === 'DELIVERED') return '🐦 Delivered';
    if (d.status === 'READ') return '✓ Read';
    if (d.status === 'FAILED') return '❌ Failed';
    return d.status;
  };

  const unreadCount = items.filter(
    (i) =>
      i.message.receiver_id === user?.id &&
      !i.message.read_at &&
      i.delivery &&
      RECEIVER_VISIBLE_STATUSES.has(i.delivery.status)
  ).length;

  return (
    <div className="page">
      <PageHeader
        title="📬 Inbox"
        right={
          unreadCount > 0 ? (
            <span
              style={{
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                minWidth: 22,
                textAlign: 'center',
              }}
            >
              {unreadCount}
            </span>
          ) : null
        }
      />

      {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--text-secondary)' }}>No messages yet. Send a pigeon!</p>
          <Link to="/send" className="btn btn-primary" style={{ marginTop: 16 }}>
            Send
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(({ message, delivery, other }) => {
          const isSender = message.sender_id === user?.id;
          const isReceiver = message.receiver_id === user?.id;
          const isUnread = isReceiver && !message.read_at;
          const isNew =
            isUnread &&
            delivery &&
            RECEIVER_VISIBLE_STATUSES.has(delivery.status);

          return (
            <Link
              key={message.id}
              to={delivery ? `/delivery/${delivery.id}` : '#'}
              className="card"
              style={{
                display: 'block',
                borderLeft: isNew ? '4px solid var(--accent)' : '4px solid transparent',
                background: isNew ? '#f0f7ff' : undefined,
                fontWeight: isNew ? 600 : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {other?.display_name || 'Unknown'}
                  </strong>
                  {isNew && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                        color: '#fff',
                        background: 'var(--accent)',
                        padding: '2px 6px',
                        borderRadius: 6,
                      }}
                    >
                      NEW
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                </span>
              </div>

              <p
                style={{
                  fontSize: 14,
                  color: isNew ? 'var(--text)' : 'var(--text-secondary)',
                  marginBottom: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isSender ? 'You: ' : ''}
                {message.content}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {statusLabel(delivery, isSender)}
                </span>
                {isUnread && isNew && (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Unread</span>
                )}
                {isReceiver && message.read_at && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Read</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
